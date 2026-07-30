"""Canonical Google Calendar provider adapter for the AI Receptionist (Wave 7).

ONE typed adapter over the Calendar API, reusing the existing Google OAuth +
encrypted connection infrastructure. Never returns raw Google responses to business
logic or the frontend. Hermetic by default via an injectable transport
(:func:`set_transport`); live calls happen only when a real transport is installed.
"""

from __future__ import annotations

import os
from typing import Optional

SCOPE_READONLY = "https://www.googleapis.com/auth/calendar.readonly"
SCOPE_EVENTS = "https://www.googleapis.com/auth/calendar.events"
SCOPE_FREEBUSY = "https://www.googleapis.com/auth/calendar.freebusy"


class CalendarError(Exception):
    CATEGORIES = {
        "not_connected", "missing_scope", "token_expired", "token_revoked",
        "calendar_not_found", "read_only", "conflict", "rate_limit", "quota",
        "provider_error", "unknown_result",
    }

    def __init__(self, category: str, detail: str = "") -> None:
        super().__init__(category)
        self.category = category if category in self.CATEGORIES else "provider_error"
        self.detail = detail


_transport: Optional["CalendarTransport"] = None


class CalendarTransport:
    def list_calendars(self, token: str) -> dict: raise NotImplementedError
    def free_busy(self, token: str, calendar_ids: list, time_min: str, time_max: str) -> dict: raise NotImplementedError
    def create_event(self, token: str, calendar_id: str, event: dict) -> dict: raise NotImplementedError
    def update_event(self, token: str, calendar_id: str, event_id: str, patch: dict) -> dict: raise NotImplementedError
    def cancel_event(self, token: str, calendar_id: str, event_id: str) -> dict: raise NotImplementedError
    def get_event(self, token: str, calendar_id: str, event_id: str) -> dict: raise NotImplementedError


def set_transport(t: Optional[CalendarTransport]) -> None:
    global _transport
    _transport = t


def _active_transport() -> CalendarTransport:
    return _transport if _transport is not None else _MockCalendarTransport()


def _connection(tenant_id: str, *, need_write: bool = False) -> dict:
    from integrations.connections import find_active_connection_unsealed
    conn = find_active_connection_unsealed(tenant_id, "calendar_create_event" if need_write else "calendar_read") \
        or find_active_connection_unsealed(tenant_id, "calendar_read") \
        or find_active_connection_unsealed(tenant_id, "email_read")
    if conn is None:
        raise CalendarError("not_connected", "no Google connection for tenant")
    scopes = conn.get("scope") or ""
    if need_write and (SCOPE_EVENTS not in scopes and "calendar.events" not in scopes and "calendar" not in scopes):
        raise CalendarError("missing_scope", "connection lacks calendar.events")
    return conn


async def _token(conn: dict) -> str:
    from integrations import google_oauth, connections
    try:
        tok = await google_oauth.valid_access_token(conn)
    except RuntimeError as exc:
        raise CalendarError("token_revoked", str(exc)[:80]) from exc
    try:
        connections.register_connection(conn.get("tenant_id", ""), "calendar_read", conn)
    except Exception:
        pass
    return tok


# ── normalisation ─────────────────────────────────────────────────────────────

def normalise_calendar(raw: dict) -> dict:
    return {
        "calendar_id": raw.get("id", ""),
        "name": raw.get("summary", "")[:200],
        "access_role": raw.get("accessRole", ""),
        "timezone": raw.get("timeZone", "UTC"),
        "primary": bool(raw.get("primary", False)),
    }


def normalise_event(raw: dict) -> dict:
    start = raw.get("start", {}) or {}
    end = raw.get("end", {}) or {}
    return {
        "event_id": raw.get("id", ""),
        "status": raw.get("status", ""),
        "start": start.get("dateTime") or start.get("date", ""),
        "end": end.get("dateTime") or end.get("date", ""),
        "timezone": start.get("timeZone", "UTC"),
        "html_link": raw.get("htmlLink", ""),
        "attendees": [a.get("email", "") for a in (raw.get("attendees") or [])],
        "updated": raw.get("updated", ""),
    }


# ── public API ────────────────────────────────────────────────────────────────

async def list_calendars(tenant_id: str) -> list[dict]:
    conn = _connection(tenant_id)
    tok = await _token(conn)
    res = _active_transport().list_calendars(tok)
    return [normalise_calendar(c) for c in (res.get("items") or [])]


async def get_free_busy(tenant_id: str, calendar_ids: list, time_min: str, time_max: str) -> dict:
    conn = _connection(tenant_id)
    tok = await _token(conn)
    res = _active_transport().free_busy(tok, calendar_ids, time_min, time_max)
    busy: dict[str, list] = {}
    for cid, val in (res.get("calendars") or {}).items():
        busy[cid] = [{"start": b.get("start", ""), "end": b.get("end", "")} for b in (val.get("busy") or [])]
    return {"busy": busy}


async def create_event(tenant_id: str, calendar_id: str, event: dict) -> dict:
    conn = _connection(tenant_id, need_write=True)
    tok = await _token(conn)
    res = _active_transport().create_event(tok, calendar_id, event)
    out = normalise_event(res)
    if not out["event_id"]:
        raise CalendarError("unknown_result", "create returned no event id")
    return out


async def update_event(tenant_id: str, calendar_id: str, event_id: str, patch: dict) -> dict:
    conn = _connection(tenant_id, need_write=True)
    tok = await _token(conn)
    return normalise_event(_active_transport().update_event(tok, calendar_id, event_id, patch))


async def cancel_event(tenant_id: str, calendar_id: str, event_id: str) -> dict:
    conn = _connection(tenant_id, need_write=True)
    tok = await _token(conn)
    res = _active_transport().cancel_event(tok, calendar_id, event_id)
    return {"event_id": event_id, "status": "cancelled", "provider": res.get("status", "cancelled")}


async def validate_connection(tenant_id: str) -> dict:
    from integrations.connections import find_active_connection_unsealed
    conn = find_active_connection_unsealed(tenant_id, "calendar_read") \
        or find_active_connection_unsealed(tenant_id, "calendar_create_event") \
        or find_active_connection_unsealed(tenant_id, "email_read")
    if conn is None:
        return {"connected": False, "state": "not_connected"}
    scopes = conn.get("scope") or ""
    return {
        "connected": True, "email": conn.get("email", ""),
        "can_read_freebusy": SCOPE_READONLY in scopes or "calendar.readonly" in scopes or "calendar.events" in scopes or "calendar" in scopes,
        "can_write_events": SCOPE_EVENTS in scopes or "calendar.events" in scopes or "calendar" in scopes,
        "state": "connected",
    }


# ── built-in mock transport (hermetic default) ────────────────────────────────

class _MockCalendarTransport(CalendarTransport):
    def __init__(self):
        self.creates = 0

    def list_calendars(self, token: str) -> dict:
        return {"items": [{"id": "primary", "summary": "Business Calendar", "accessRole": "owner",
                           "timeZone": "UTC", "primary": True}]}

    def free_busy(self, token: str, calendar_ids: list, time_min: str, time_max: str) -> dict:
        return {"calendars": {cid: {"busy": []} for cid in calendar_ids}}

    def create_event(self, token: str, calendar_id: str, event: dict) -> dict:
        self.creates += 1
        return {"id": f"evt_mock_{self.creates}", "status": "confirmed",
                "start": event.get("start", {}), "end": event.get("end", {}),
                "htmlLink": "https://calendar.google.com/event?eid=mock",
                "attendees": event.get("attendees", []), "updated": "2026-08-02T00:00:00Z"}

    def update_event(self, token: str, calendar_id: str, event_id: str, patch: dict) -> dict:
        return {"id": event_id, "status": "confirmed", "start": patch.get("start", {}),
                "end": patch.get("end", {}), "updated": "2026-08-02T01:00:00Z"}

    def cancel_event(self, token: str, calendar_id: str, event_id: str) -> dict:
        return {"id": event_id, "status": "cancelled"}

    def get_event(self, token: str, calendar_id: str, event_id: str) -> dict:
        return {"id": event_id, "status": "confirmed"}
