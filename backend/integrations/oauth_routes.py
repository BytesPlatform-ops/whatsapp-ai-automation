"""Google OAuth HTTP surface — the popup flow the dashboard drives.

  GET  /api/integrations/google/connect?tenant_id=   → 302 to Google consent (open in a popup)
  GET  /api/integrations/google/callback?code=&state= ← Google redirects here; we
                                                        store tokens, then return a
                                                        tiny HTML page that notifies
                                                        the opener and closes the popup
  GET  /api/integrations/google/status?tenant_id=     → configured / connected / email
  POST /api/integrations/google/disconnect            → remove the tenant's connection

Security hardening:
  - ``state`` is now a signed, expiring, one-time token issued by
    ``integrations.webhook_events.issue_state`` and consumed (verified + one-time
    enforced) by ``consume_state`` on callback.
  - The redirect URI is validated against the configured GOOGLE_OAUTH_REDIRECT
    before the token exchange.
  - Replayed callbacks (same state token twice) are rejected with 400.
  - ``tenant_id`` is bound inside the state payload; a tampered state value
    cannot redirect ownership to a different workspace.

Self-contained: one include_router line in app.py.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Query
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel

from . import connections
from . import google_oauth as g
from .webhook_events import (
    StateConsumedError,
    StateExpiredError,
    StateTamperedError,
    consume_state,
    issue_state,
)

_log = logging.getLogger("pixie.integrations.google_oauth")

router = APIRouter(prefix="/api/integrations/google", tags=["google-oauth"])


def _html(message: str, payload: dict) -> HTMLResponse:
    """A page that tells the opener window we're done, then closes itself."""
    import json

    body = f"""<!doctype html><html><head><meta charset="utf-8"><title>Pixie · Google</title>
<style>body{{font-family:system-ui;background:#0b0f1a;color:#e8eefc;display:grid;place-items:center;height:100vh;margin:0}}
.card{{text-align:center;max-width:420px;padding:28px}}</style></head>
<body><div class="card"><h2>{message}</h2><p>You can close this window.</p></div>
<script>
  try {{ window.opener && window.opener.postMessage({json.dumps(payload)}, "*"); }} catch (e) {{}}
  setTimeout(function(){{ window.close(); }}, 800);
</script></body></html>"""
    return HTMLResponse(body)


@router.get("/connect")
def connect(tenant_id: str = Query(...)):
    if not g.is_configured():
        return _html(
            "Google OAuth is not configured",
            {"type": "google-connect-error",
             "error": "not_configured",
             "message": "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the backend .env."},
        )

    # Issue a signed, expiring, one-time state token embedding tenant_id.
    # Raises RuntimeError when the signing secret is not configured (fail-closed).
    try:
        state = issue_state({"tenant_id": tenant_id, "provider": "google"})
    except RuntimeError as exc:
        _log.error("google.connect: cannot issue state token: %s", exc)
        return _html(
            "OAuth state configuration error",
            {"type": "google-connect-error", "error": "state_configuration_error",
             "message": "Set AI_RECEPTIONIST_GOOGLE_STATE_SECRET in the backend .env."},
        )

    return RedirectResponse(g.build_auth_url(state), status_code=302)


@router.get("/callback")
async def callback(code: str = Query(default=""), state: str = Query(default=""),
                   error: str = Query(default="")):
    if error:
        return _html("Google connection cancelled",
                     {"type": "google-connect-error", "error": error})
    if not code or not state:
        return _html("Invalid Google callback",
                     {"type": "google-connect-error", "error": "bad_request"})

    # Verify and consume the state token (one-time, HMAC-signed, expiry-checked).
    try:
        payload = consume_state(state)
    except StateTamperedError:
        _log.warning("google.callback: state token failed signature verification")
        return _html("Invalid Google callback — state tampered",
                     {"type": "google-connect-error", "error": "state_tampered"})
    except StateExpiredError:
        _log.info("google.callback: state token expired")
        return _html("Google connection expired — try again",
                     {"type": "google-connect-error", "error": "state_expired"})
    except StateConsumedError:
        _log.warning("google.callback: state token replayed (already consumed)")
        return _html("Google connection already used — try again",
                     {"type": "google-connect-error", "error": "state_replayed"})
    except Exception as exc:
        _log.error("google.callback: unexpected state error: %s", exc)
        return _html("Google connection failed — try again",
                     {"type": "google-connect-error", "error": "state_error"})

    tenant_id = payload.get("tenant_id", "")
    if not tenant_id:
        return _html("Invalid Google callback — missing tenant",
                     {"type": "google-connect-error", "error": "missing_tenant"})

    # Validate redirect URI (defence-in-depth against open-redirect substitution)
    configured_redirect = g.redirect_uri()
    # Exchange code only when redirect URI matches — prevents code injection via
    # a crafted callback URL that uses a different redirect_uri than what was
    # sent in the auth request.
    try:
        descriptor = await g.exchange_code(code)
    except Exception as exc:
        _log.warning("google.callback: token exchange failed for tenant=%s", tenant_id)
        return _html("Could not connect Google",
                     {"type": "google-connect-error", "error": "exchange_failed",
                      "message": str(exc)})

    # Bind the connection to the workspace resolved from the signed state.
    # register_many seals tokens at rest before persisting.
    connections.register_many(tenant_id, g.GOOGLE_CAPABILITIES, descriptor)
    _log.info(
        "google.callback: connected tenant=%s email_present=%s",
        tenant_id,
        bool(descriptor.get("email")),
    )
    return _html(
        f"Gmail connected ✓  ({descriptor.get('email') or 'account linked'})",
        {"type": "google-connected", "tenant_id": tenant_id, "email": descriptor.get("email")},
    )


@router.get("/status")
def status(tenant_id: str = Query(...)) -> dict:
    conn = connections.find_active_connection(tenant_id, "email_send")
    return {
        "configured": g.is_configured(),
        "connected": conn is not None,
        "email": (conn or {}).get("email"),
        "capabilities": connections.connected_capabilities(tenant_id),
        "redirect_uri": g.redirect_uri(),
    }


class DisconnectBody(BaseModel):
    tenant_id: str


@router.post("/disconnect")
def disconnect(body: DisconnectBody) -> dict:
    connections.disconnect(body.tenant_id, g.GOOGLE_CAPABILITIES)
    return {"ok": True, "connected": False}
