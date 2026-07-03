"""Connectors — mock (safe) + REAL Google (Gmail/Calendar) side-effects.

Mock connectors are deterministic and clearly labelled "no real ... delivered".
Real connectors use a stored Google OAuth connection (access token auto-refreshed)
to ACTUALLY send email / create calendar events. Real connectors take the bound
`connection` descriptor; the integration router binds it when a tenant has
connected Google. Real connectors NEVER fake success — a failed API call returns
an error result.

Calls are synchronous (httpx.Client) because the approvals executor runs in a
sync FastAPI endpoint (threadpool); no event loop juggling needed.
"""

from __future__ import annotations

import base64
import itertools
import time
from email.mime.text import MIMEText

import httpx

from . import connections
from . import google_oauth as g

_seq = itertools.count(1)


def _mid(prefix: str) -> str:
    return f"{prefix}_{next(_seq)}"


# ── Mock connectors ───────────────────────────────────────────────────────────

def mock_email_send(payload: dict) -> dict:
    return {
        "status": "success",
        "provider": "mock_email",
        "message": "Mock email sent. No real email was delivered.",
        "mock_message_id": _mid("mock_email"),
        "to": payload.get("to"),
        "subject": payload.get("subject"),
    }


def mock_calendar_create(payload: dict) -> dict:
    return {
        "status": "success",
        "provider": "mock_calendar",
        "message": "Mock calendar event created. No real calendar was updated.",
        "mock_event_id": _mid("mock_event"),
        "title": payload.get("event_title") or payload.get("title"),
    }


def mock_crm_store(payload: dict) -> dict:
    return {
        "status": "success",
        "provider": "internal_crm",
        "message": "Lead saved to internal CRM.",
        "lead_ref": payload.get("lead_id") or _mid("lead"),
    }


def mock_follow_up(_payload: dict) -> dict:
    return {
        "status": "success",
        "provider": "mock_follow_up",
        "message": "Mock follow-up scheduled. No real reminder was created.",
        "mock_task_id": _mid("mock_task"),
    }


# ── Real Google connectors ────────────────────────────────────────────────────

def _sync_access_token(connection: dict) -> str:
    """Return a valid access token, refreshing synchronously if expired."""
    if connection.get("access_token") and time.time() < connection.get("expires_at", 0):
        return connection["access_token"]
    refresh = connection.get("refresh_token")
    if not refresh:
        raise RuntimeError("Google connection has no refresh token — reconnect Gmail.")
    with httpx.Client(timeout=20) as http:
        resp = http.post(g.TOKEN_ENDPOINT, data={
            "refresh_token": refresh,
            "client_id": g.client_id(),
            "client_secret": g.client_secret(),
            "grant_type": "refresh_token",
        })
        resp.raise_for_status()
        tok = resp.json()
    connection["access_token"] = tok["access_token"]
    connection["expires_at"] = time.time() + int(tok.get("expires_in", 3600)) - 60
    connections.persist()  # save the refreshed token
    return connection["access_token"]


def real_gmail_send(payload: dict, connection: dict) -> dict:
    """Send a REAL email via the Gmail API (users/me/messages/send)."""
    to = payload.get("to")
    if not to:
        return {"status": "error", "provider": "gmail", "error": "no_recipient",
                "message": "No recipient address on the prepared action."}
    try:
        token = _sync_access_token(connection)
        msg = MIMEText(payload.get("body", ""), _charset="utf-8")
        msg["To"] = to
        msg["Subject"] = payload.get("subject", "")
        if connection.get("email"):
            msg["From"] = connection["email"]
        raw = base64.urlsafe_b64encode(msg.as_bytes()).decode("ascii")
        with httpx.Client(timeout=20) as http:
            resp = http.post(
                "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
                headers={"Authorization": f"Bearer {token}"},
                json={"raw": raw},
            )
        if resp.status_code >= 300:
            return {"status": "error", "provider": "gmail", "error": "api_error",
                    "http_status": resp.status_code, "message": resp.text[:400]}
        data = resp.json()
        return {
            "status": "success", "provider": "gmail",
            "message": f"Real email sent to {to} via Gmail.",
            "gmail_message_id": data.get("id"), "to": to,
            "subject": payload.get("subject"),
        }
    except Exception as exc:  # never fake success
        return {"status": "error", "provider": "gmail", "error": "exception",
                "message": str(exc)}


def real_calendar_create(payload: dict, connection: dict) -> dict:
    """Create a REAL calendar event via the Calendar API (events.insert)."""
    try:
        token = _sync_access_token(connection)
        slots = payload.get("suggested_slots") or []
        event: dict = {
            "summary": payload.get("event_title") or "Appointment",
            "description": payload.get("event_description", ""),
        }
        # If a concrete ISO start/end is provided use it; else create a tentative
        # all-context event note (the reviewer picks the real time downstream).
        start = payload.get("start")
        end = payload.get("end")
        if start and end:
            event["start"] = {"dateTime": start}
            event["end"] = {"dateTime": end}
        else:
            return {"status": "error", "provider": "google_calendar", "error": "no_time",
                    "message": f"No concrete start/end time. Suggested slots: {slots}. "
                               "Pick a slot before approving to create a real event."}
        attendee = payload.get("attendee")
        if attendee:
            event["attendees"] = [{"email": attendee}]
        with httpx.Client(timeout=20) as http:
            resp = http.post(
                "https://www.googleapis.com/calendar/v3/calendars/primary/events",
                headers={"Authorization": f"Bearer {token}"},
                json=event,
            )
        if resp.status_code >= 300:
            return {"status": "error", "provider": "google_calendar", "error": "api_error",
                    "http_status": resp.status_code, "message": resp.text[:400]}
        data = resp.json()
        return {"status": "success", "provider": "google_calendar",
                "message": "Real calendar event created.",
                "event_id": data.get("id"), "html_link": data.get("htmlLink")}
    except Exception as exc:
        return {"status": "error", "provider": "google_calendar", "error": "exception",
                "message": str(exc)}
