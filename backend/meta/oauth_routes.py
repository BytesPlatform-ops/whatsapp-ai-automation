"""Meta connect HTTP surface.

  GET  /api/meta/connect/start?tenant_id=&feature=   → 302 to Facebook consent (popup)
  GET  /api/meta/connect/callback                    ← Facebook redirect: exchange +
                                                       discover assets + store; popup closes
  POST /api/meta/connect/demo                         → seed demo assets (no Meta app needed)
  GET  /api/meta/assets?tenant_id=                     → discovered/demo assets + defaults + mode
  POST /api/meta/assets/defaults                       → choose default page/IG/ad account
  GET  /api/meta/status?tenant_id=                      → configured/connected/demo
  POST /api/meta/disconnect                             → remove connection + assets

Demo mode registers NO integrations connection, so execution stays mock; a REAL
connect registers the connection (tokens) so publishing routes to the real
connector. Tokens live only in the server-side connections store.
"""

from __future__ import annotations

import json
import secrets

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel

from activity.router import log_activity
from integrations import connections

from . import oauth as m
from . import seed
from .store import get_meta_store

router = APIRouter(prefix="/api/meta", tags=["meta"])

_PENDING: dict[str, tuple[str, str]] = {}  # nonce -> (tenant_id, feature)


def _popup_html(message: str, payload: dict) -> HTMLResponse:
    body = f"""<!doctype html><html><head><meta charset="utf-8"><title>Pixie · Meta</title>
<style>body{{font-family:system-ui;background:#0b0f1a;color:#e8eefc;display:grid;place-items:center;height:100vh;margin:0}}
.card{{text-align:center;max-width:440px;padding:28px}}</style></head>
<body><div class="card"><h2>{message}</h2><p>You can close this window.</p></div>
<script>try{{window.opener&&window.opener.postMessage({json.dumps(payload)},"*");}}catch(e){{}}
setTimeout(function(){{window.close();}},900);</script></body></html>"""
    return HTMLResponse(body)


@router.get("/connect/start")
def connect_start(tenant_id: str = Query(...), feature: str = Query("analytics")):
    if not m.is_configured():
        return _popup_html("Meta is not configured",
                           {"type": "meta-connect-error", "error": "not_configured",
                            "message": "Set META_APP_ID and META_APP_SECRET in the backend .env."})
    nonce = secrets.token_urlsafe(16)
    _PENDING[nonce] = (tenant_id, feature)
    return RedirectResponse(m.build_auth_url(f"{tenant_id}:{nonce}", feature), status_code=302)


@router.get("/connect/callback")
async def connect_callback(code: str = Query(default=""), state: str = Query(default=""),
                           error: str = Query(default="")):
    if error:
        return _popup_html("Meta connection cancelled", {"type": "meta-connect-error", "error": error})
    if not code or ":" not in state:
        return _popup_html("Invalid Meta callback", {"type": "meta-connect-error", "error": "bad_request"})
    tenant_id, nonce = state.split(":", 1)
    pending = _PENDING.pop(nonce, None)
    if not pending or pending[0] != tenant_id:
        return _popup_html("Connection expired — try again", {"type": "meta-connect-error", "error": "state_mismatch"})

    try:
        short = await m.exchange_code(code)
        long = await m.long_lived_token(short)
        assets = await m.discover_assets(long["access_token"])
    except Exception as exc:
        return _popup_html("Could not connect Meta",
                           {"type": "meta-connect-error", "error": "exchange_failed", "message": str(exc)})

    descriptor = {
        "provider": "meta", "status": "active", "mode": "live",
        "user_token": long["access_token"], "scopes": m.scopes_for(pending[1]),
        "pages": assets.get("facebook_pages", []),
    }
    connections.register_many(tenant_id, m.META_CAPABILITIES, descriptor)
    get_meta_store().set_assets(tenant_id, assets, mode="live")
    log_activity(tenant_id, "meta_connected", title="Meta business assets connected",
                 agent="marketing-agent")
    return _popup_html("Meta connected ✓",
                       {"type": "meta-connected", "tenant_id": tenant_id,
                        "pages": len(assets.get("facebook_pages", []))})


class DemoBody(BaseModel):
    tenant_id: str


@router.post("/connect/demo")
def connect_demo(body: DemoBody) -> dict:
    """Seed demo assets so the flow is explorable with no Meta app. Execution stays
    mock because NO integrations connection is registered."""
    assets = seed.demo_assets()
    get_meta_store().set_assets(body.tenant_id, assets, mode="demo")
    log_activity(body.tenant_id, "meta_demo_connected", title="Meta demo assets loaded",
                 agent="marketing-agent")
    return {"ok": True, "mode": "demo", "assets": assets}


@router.get("/assets")
def get_assets(tenant_id: str = Query(...)) -> dict:
    store = get_meta_store()
    assets = store.get_assets(tenant_id)
    return {
        "mode": store.mode(tenant_id),
        "connected": store.mode(tenant_id) is not None,
        "facebook_pages": assets.get("facebook_pages", []),
        "instagram_accounts": assets.get("instagram_accounts", []),
        "ad_accounts": assets.get("ad_accounts", []),
        "defaults": store.defaults(tenant_id),
    }


class DefaultsBody(BaseModel):
    tenant_id: str
    page_id: str = ""
    instagram_id: str = ""
    ad_account_id: str = ""


@router.post("/assets/defaults")
def set_defaults(body: DefaultsBody) -> dict:
    d = get_meta_store().set_defaults(body.tenant_id, page_id=body.page_id,
                                      instagram_id=body.instagram_id, ad_account_id=body.ad_account_id)
    return {"ok": True, "defaults": d}


@router.get("/status")
def status(tenant_id: str = Query(...)) -> dict:
    store = get_meta_store()
    mode = store.mode(tenant_id)
    live_conn = connections.find_active_connection(tenant_id, "meta_content_publish")
    assets = store.get_assets(tenant_id)
    return {
        "configured": m.is_configured(),
        "connected": mode is not None,
        "mode": mode,  # "live" | "demo" | None
        "live": live_conn is not None,
        "pages": len(assets.get("facebook_pages", [])),
        "instagram": len(assets.get("instagram_accounts", [])),
        "ad_accounts": len(assets.get("ad_accounts", [])),
        "redirect_uri": m.redirect_uri(),
    }


class DisconnectBody(BaseModel):
    tenant_id: str


@router.post("/disconnect")
def disconnect(body: DisconnectBody) -> dict:
    connections.disconnect(body.tenant_id, m.META_CAPABILITIES)
    get_meta_store().clear(body.tenant_id)
    return {"ok": True, "connected": False}
