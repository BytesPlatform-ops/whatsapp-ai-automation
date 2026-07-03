"""Google OAuth HTTP surface — the popup flow the dashboard drives.

  GET  /api/integrations/google/connect?tenant_id=   → 302 to Google consent (open in a popup)
  GET  /api/integrations/google/callback?code=&state= ← Google redirects here; we
                                                        store tokens, then return a
                                                        tiny HTML page that notifies
                                                        the opener and closes the popup
  GET  /api/integrations/google/status?tenant_id=     → configured / connected / email
  POST /api/integrations/google/disconnect            → remove the tenant's connection

Self-contained: one include_router line in app.py.
"""

from __future__ import annotations

import secrets

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel

from . import connections
from . import google_oauth as g

router = APIRouter(prefix="/api/integrations/google", tags=["google-oauth"])

# nonce -> tenant_id, so the callback can trust which tenant a code belongs to.
_PENDING: dict[str, str] = {}


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
    nonce = secrets.token_urlsafe(16)
    _PENDING[nonce] = tenant_id
    state = f"{tenant_id}:{nonce}"
    return RedirectResponse(g.build_auth_url(state), status_code=302)


@router.get("/callback")
async def callback(code: str = Query(default=""), state: str = Query(default=""),
                   error: str = Query(default="")):
    if error:
        return _html("Google connection cancelled",
                     {"type": "google-connect-error", "error": error})
    if not code or ":" not in state:
        return _html("Invalid Google callback",
                     {"type": "google-connect-error", "error": "bad_request"})

    tenant_id, nonce = state.split(":", 1)
    if _PENDING.pop(nonce, None) != tenant_id:
        return _html("Google connection expired — try again",
                     {"type": "google-connect-error", "error": "state_mismatch"})

    try:
        descriptor = await g.exchange_code(code)
    except Exception as exc:  # surface a clear error into the popup
        return _html("Could not connect Google",
                     {"type": "google-connect-error", "error": "exchange_failed",
                      "message": str(exc)})

    connections.register_many(tenant_id, g.GOOGLE_CAPABILITIES, descriptor)
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
