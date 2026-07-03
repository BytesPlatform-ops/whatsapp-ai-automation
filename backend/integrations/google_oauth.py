"""Google OAuth — the real 'Connect Gmail' flow (server-side, popup-driven).

The dashboard opens a popup at /api/integrations/google/connect; that redirects
to Google's consent screen ("Allow"); Google redirects back to /callback with a
code; we exchange it for tokens and store them per tenant. From then on the
receptionist's approved actions send REAL email / create REAL calendar events
using these tokens (access token auto-refreshed).

Requires a Google OAuth client (created once in Google Cloud Console):
    GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_OAUTH_REDIRECT
All read from the backend environment ONLY — never exposed to the frontend.
"""

from __future__ import annotations

import os
import time
import urllib.parse

import httpx

AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v2/userinfo"

# gmail.send = send mail as the user; calendar.events = create/edit events;
# userinfo.email = know which account connected (shown in the UI).
SCOPES = [
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/userinfo.email",
    "openid",
]

# Which agent capabilities a Google connection satisfies.
GOOGLE_CAPABILITIES = ["email_send", "calendar_create_event", "email_read", "calendar_read"]


class OAuthNotConfigured(RuntimeError):
    pass


def client_id() -> str:
    return os.getenv("GOOGLE_CLIENT_ID", "")


def client_secret() -> str:
    return os.getenv("GOOGLE_CLIENT_SECRET", "")


def redirect_uri() -> str:
    return os.getenv("GOOGLE_OAUTH_REDIRECT", "http://localhost:8000/api/integrations/google/callback")


def is_configured() -> bool:
    return bool(client_id() and client_secret())


def _require_configured() -> None:
    if not is_configured():
        raise OAuthNotConfigured(
            "Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET "
            "in backend environment variables (create an OAuth client in Google Cloud Console)."
        )


def build_auth_url(state: str) -> str:
    """The Google consent URL the popup navigates to."""
    _require_configured()
    params = {
        "client_id": client_id(),
        "redirect_uri": redirect_uri(),
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "access_type": "offline",   # ask for a refresh token
        "prompt": "consent",        # force refresh_token on every connect
        "include_granted_scopes": "true",
        "state": state,
    }
    return f"{AUTH_ENDPOINT}?{urllib.parse.urlencode(params)}"


async def exchange_code(code: str) -> dict:
    """Swap the auth code for tokens; returns a connection descriptor."""
    _require_configured()
    async with httpx.AsyncClient(timeout=20) as http:
        resp = await http.post(TOKEN_ENDPOINT, data={
            "code": code,
            "client_id": client_id(),
            "client_secret": client_secret(),
            "redirect_uri": redirect_uri(),
            "grant_type": "authorization_code",
        })
        resp.raise_for_status()
        tok = resp.json()

        email = None
        try:
            info = await http.get(
                USERINFO_ENDPOINT,
                headers={"Authorization": f"Bearer {tok['access_token']}"},
            )
            if info.status_code == 200:
                email = info.json().get("email")
        except httpx.HTTPError:
            pass

    return {
        "provider": "google",
        "status": "active",
        "email": email,
        "access_token": tok.get("access_token"),
        "refresh_token": tok.get("refresh_token"),
        "scope": tok.get("scope", ""),
        "expires_at": time.time() + int(tok.get("expires_in", 3600)) - 60,  # 60s safety margin
    }


async def valid_access_token(connection: dict) -> str:
    """Return a non-expired access token, refreshing via refresh_token if needed.

    Mutates `connection` in place with the refreshed token/expiry so the caller
    can persist it. Raises if there is no way to obtain a token.
    """
    if connection.get("access_token") and time.time() < connection.get("expires_at", 0):
        return connection["access_token"]

    refresh = connection.get("refresh_token")
    if not refresh:
        raise RuntimeError("Google connection has no refresh token — reconnect Gmail.")
    _require_configured()

    async with httpx.AsyncClient(timeout=20) as http:
        resp = await http.post(TOKEN_ENDPOINT, data={
            "refresh_token": refresh,
            "client_id": client_id(),
            "client_secret": client_secret(),
            "grant_type": "refresh_token",
        })
        resp.raise_for_status()
        tok = resp.json()

    connection["access_token"] = tok["access_token"]
    connection["expires_at"] = time.time() + int(tok.get("expires_in", 3600)) - 60
    return connection["access_token"]
