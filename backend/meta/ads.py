"""Meta Marketing API — ad accounts, campaigns, insights, and (paused) create.

The read side of this module mirrors insights.py: demo mode returns seeded data
(source="demo"); live mode does a real Graph call with the tenant's stored USER
token and, on failure, returns a structured error instead of faking numbers.

Safety rules baked in here:
  * Tokens are NEVER read directly — only via token_service (the single seam).
  * Campaign CREATE always forces status=PAUSED. There is no way to create an
    active campaign through this module, even if the caller asks for one.
  * Graph errors are classified so the frontend can tell "reconnect needed"
    (expired/invalid token) from "missing permission" from a generic API error.

Graph Marketing API reference used for fields/date_preset:
  ad accounts : GET /me/adaccounts
  campaigns   : GET /act_<id>/campaigns
  insights    : GET /act_<id>/insights?date_preset=last_30d
  create      : POST /act_<id>/campaigns  (status=PAUSED, special_ad_categories=[])
"""

from __future__ import annotations

from typing import Optional

import httpx

from . import oauth as m
from . import seed
from . import token_service as ts
from .store import get_meta_store

# Meta date_preset values we accept from the frontend (default last_30d).
_ALLOWED_PRESETS = {
    "today", "yesterday", "last_7d", "last_14d", "last_30d", "last_90d",
    "this_month", "last_month", "maximum",
}

AD_ACCOUNT_FIELDS = "id,name,account_id,account_status,currency,timezone_name"
CAMPAIGN_FIELDS = "id,name,status,effective_status,objective"
INSIGHT_FIELDS = "spend,impressions,clicks,ctr,cpc"

# account_status is an int in the Graph API — map to a readable label for the UI.
_ACCOUNT_STATUS = {
    1: "ACTIVE", 2: "DISABLED", 3: "UNSETTLED", 7: "PENDING_RISK_REVIEW",
    8: "PENDING_SETTLEMENT", 9: "IN_GRACE_PERIOD", 100: "PENDING_CLOSURE",
    101: "CLOSED", 201: "ANY_ACTIVE", 202: "ANY_CLOSED",
}


def _preset(date_range: str) -> str:
    return date_range if date_range in _ALLOWED_PRESETS else "last_30d"


def _mode(tenant_id: str) -> Optional[str]:
    """'live' | 'demo' | None (not connected)."""
    return get_meta_store().mode(tenant_id)


def _not_connected() -> dict:
    return {"error": "not_connected", "needs_reconnect": False,
            "message": "No Meta account is connected for this workspace. Click Connect Meta."}


def _classify_graph_error(resp: httpx.Response) -> dict:
    """Turn a Graph error response into a structured, frontend-safe error dict.

    Meta returns { "error": { message, type, code, error_subcode, fbtrace_id } }.
    code 190 (+ subcodes) = expired/invalid token → the user must reconnect.
    codes 10 / 200 / 294 or 'permission' in the message = missing permission
    (usually App Review not yet granted for the scope).
    """
    try:
        err = (resp.json() or {}).get("error", {}) or {}
    except Exception:
        err = {}
    code = err.get("code")
    msg = err.get("message") or resp.text[:300]
    is_oauth = err.get("type") == "OAuthException"
    if code == 190 or (is_oauth and code in (102, 463, 467)):
        return {"error": "expired_token", "needs_reconnect": True,
                "message": "Your Meta connection expired or was revoked. Please reconnect.",
                "graph_message": msg}
    if code in (10, 200, 294) or "permission" in str(msg).lower():
        return {"error": "missing_permission", "needs_reconnect": False,
                "message": "Meta hasn't granted the permission this needs yet "
                           "(ads_read / ads_management / business_management may require App Review).",
                "graph_message": msg}
    return {"error": "api_error", "needs_reconnect": False,
            "message": "Meta API returned an error.", "graph_message": msg, "http_status": resp.status_code}


# ── Ad accounts ───────────────────────────────────────────────────────────────

def list_ad_accounts(tenant_id: str) -> dict:
    mode = _mode(tenant_id)
    if mode is None:
        return _not_connected()
    if mode != "live":
        return {"source": "demo", "ad_accounts": seed.demo_ad_accounts()}

    token = ts.get_user_token(tenant_id)
    if not token:
        return _not_connected()
    try:
        with httpx.Client(timeout=20) as http:
            resp = http.get(f"{m.graph_base()}/me/adaccounts",
                            params={"fields": AD_ACCOUNT_FIELDS, "limit": 100, "access_token": token})
        if resp.status_code >= 300:
            return {"source": "live", **_classify_graph_error(resp)}
        rows = resp.json().get("data", [])
        accounts = [{
            "id": a.get("id"),
            "name": a.get("name") or a.get("id"),
            "account_id": a.get("account_id"),
            "account_status": a.get("account_status"),
            "account_status_label": _ACCOUNT_STATUS.get(a.get("account_status"), "UNKNOWN"),
            "currency": a.get("currency"),
            "timezone_name": a.get("timezone_name"),
        } for a in rows]
        return {"source": "live", "ad_accounts": accounts,
                "empty": len(accounts) == 0,
                "note": None if accounts else "This Meta user manages no ad accounts."}
    except httpx.HTTPError as exc:
        return {"source": "live", "error": "network_error", "needs_reconnect": False,
                "message": f"Could not reach Meta: {exc}"}


# ── Campaigns ─────────────────────────────────────────────────────────────────

def list_campaigns(tenant_id: str, ad_account_id: str) -> dict:
    mode = _mode(tenant_id)
    if mode is None:
        return _not_connected()
    ad_account_id = ad_account_id or get_meta_store().defaults(tenant_id).get("ad_account_id", "")
    if not ad_account_id:
        return {"error": "no_ad_account", "needs_reconnect": False,
                "message": "Select an ad account first."}
    if mode != "live":
        return {"source": "demo", "ad_account_id": ad_account_id,
                "campaigns": seed.demo_campaigns(ad_account_id)}

    token = ts.get_user_token(tenant_id)
    if not token:
        return _not_connected()
    try:
        with httpx.Client(timeout=20) as http:
            resp = http.get(f"{m.graph_base()}/{ad_account_id}/campaigns",
                            params={"fields": CAMPAIGN_FIELDS, "limit": 200, "access_token": token})
        if resp.status_code >= 300:
            return {"source": "live", "ad_account_id": ad_account_id, **_classify_graph_error(resp)}
        rows = resp.json().get("data", [])
        campaigns = [{
            "id": c.get("id"), "name": c.get("name"),
            "status": c.get("status"), "effective_status": c.get("effective_status"),
            "objective": c.get("objective"),
        } for c in rows]
        return {"source": "live", "ad_account_id": ad_account_id, "campaigns": campaigns,
                "empty": len(campaigns) == 0,
                "note": None if campaigns else "No campaigns in this ad account yet."}
    except httpx.HTTPError as exc:
        return {"source": "live", "ad_account_id": ad_account_id, "error": "network_error",
                "needs_reconnect": False, "message": f"Could not reach Meta: {exc}"}


# ── Insights ──────────────────────────────────────────────────────────────────

def ad_insights(tenant_id: str, ad_account_id: str, date_range: str = "last_30d") -> dict:
    mode = _mode(tenant_id)
    if mode is None:
        return _not_connected()
    preset = _preset(date_range)
    ad_account_id = ad_account_id or get_meta_store().defaults(tenant_id).get("ad_account_id", "")
    if not ad_account_id:
        return {"error": "no_ad_account", "needs_reconnect": False,
                "message": "Select an ad account first."}
    if mode != "live":
        return {"source": "demo", "ad_account_id": ad_account_id, "date_range": preset,
                "insights": seed.demo_ad_insights()}

    token = ts.get_user_token(tenant_id)
    if not token:
        return _not_connected()
    try:
        with httpx.Client(timeout=20) as http:
            resp = http.get(f"{m.graph_base()}/{ad_account_id}/insights",
                            params={"fields": INSIGHT_FIELDS, "date_preset": preset,
                                    "level": "account", "access_token": token})
        if resp.status_code >= 300:
            return {"source": "live", "ad_account_id": ad_account_id, "date_range": preset,
                    **_classify_graph_error(resp)}
        rows = resp.json().get("data", [])
        if not rows:
            return {"source": "live", "ad_account_id": ad_account_id, "date_range": preset,
                    "insights": _zero_insights(), "empty": True,
                    "note": "No ad delivery in this date range."}
        r = rows[0]
        insights = {
            "spend": _num(r.get("spend")),
            "impressions": _num(r.get("impressions")),
            "clicks": _num(r.get("clicks")),
            "ctr": _num(r.get("ctr")),
            "cpc": _num(r.get("cpc")),
        }
        return {"source": "live", "ad_account_id": ad_account_id, "date_range": preset,
                "insights": insights}
    except httpx.HTTPError as exc:
        return {"source": "live", "ad_account_id": ad_account_id, "date_range": preset,
                "error": "network_error", "needs_reconnect": False,
                "message": f"Could not reach Meta: {exc}"}


def _num(v) -> float:
    try:
        return round(float(v), 4)
    except (TypeError, ValueError):
        return 0.0


def _zero_insights() -> dict:
    return {"spend": 0.0, "impressions": 0.0, "clicks": 0.0, "ctr": 0.0, "cpc": 0.0}


# ── Create campaign (ALWAYS paused) ───────────────────────────────────────────

# Outcome-Driven Ad Experience objectives (current Marketing API).
_VALID_OBJECTIVES = {
    "OUTCOME_TRAFFIC", "OUTCOME_LEADS", "OUTCOME_ENGAGEMENT", "OUTCOME_AWARENESS",
    "OUTCOME_SALES", "OUTCOME_APP_PROMOTION",
}


def create_campaign(tenant_id: str, ad_account_id: str, name: str,
                    objective: str = "OUTCOME_TRAFFIC") -> dict:
    """Create a PAUSED campaign. Status is forced to PAUSED regardless of input —
    this module never creates an active/live campaign."""
    mode = _mode(tenant_id)
    if mode is None:
        return _not_connected()
    ad_account_id = ad_account_id or get_meta_store().defaults(tenant_id).get("ad_account_id", "")
    if not ad_account_id:
        return {"error": "no_ad_account", "needs_reconnect": False,
                "message": "Select an ad account first."}
    if not (name or "").strip():
        return {"error": "no_name", "needs_reconnect": False, "message": "Campaign name is required."}
    objective = objective if objective in _VALID_OBJECTIVES else "OUTCOME_TRAFFIC"

    if mode != "live":
        return {"source": "demo", "ok": True, "status": "PAUSED", "ad_account_id": ad_account_id,
                "campaign": {"id": "camp_demo_new", "name": name, "status": "PAUSED",
                             "effective_status": "PAUSED", "objective": objective},
                "note": "Demo mode — no real campaign was created on Meta."}

    token = ts.get_user_token(tenant_id)
    if not token:
        return _not_connected()
    try:
        with httpx.Client(timeout=30) as http:
            resp = http.post(f"{m.graph_base()}/{ad_account_id}/campaigns", data={
                "name": name.strip(),
                "objective": objective,
                "status": "PAUSED",              # HARD rule — never ACTIVE
                "special_ad_categories": "[]",
                "access_token": token,
            })
        if resp.status_code >= 300:
            return {"source": "live", "ad_account_id": ad_account_id, **_classify_graph_error(resp)}
        cid = resp.json().get("id")
        return {"source": "live", "ok": True, "status": "PAUSED", "ad_account_id": ad_account_id,
                "campaign": {"id": cid, "name": name.strip(), "status": "PAUSED",
                             "effective_status": "PAUSED", "objective": objective},
                "note": "Campaign created PAUSED. Activate it inside Meta Ads Manager when ready."}
    except httpx.HTTPError as exc:
        return {"source": "live", "ad_account_id": ad_account_id, "error": "network_error",
                "needs_reconnect": False, "message": f"Could not reach Meta: {exc}"}
