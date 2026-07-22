"""Meta connection diagnostics — a health check clients run after connecting.

Probes the live connection the SAME way the real product paths do (reusing ads.py,
the asset store, and the actually-granted OAuth scopes from /me/permissions) and
returns a structured, client-friendly report: what passed, what failed, and exactly
what to fix in Meta Business Suite.

Read-only — it never changes anything. Tokens are never read here directly (ads.py
and the granted-scope probe go through token_service) and never returned to the UI.

Demo mode returns an all-green report (assets are seeded, scopes simulated) so the
whole wizard is explorable with no Meta app / App Review.
"""

from __future__ import annotations

from typing import Optional

import httpx

from . import ads
from . import oauth as m
from . import token_service as ts
from .store import get_meta_store

# The scopes the marketing product needs, with a plain-English "why" for the UI
# and the App Review checklist. Order matters — shown top-to-bottom.
REQUIRED_SCOPES: list[dict] = [
    {"scope": "pages_show_list", "label": "List your Facebook Pages",
     "why": "See which Pages your profile manages."},
    {"scope": "pages_read_engagement", "label": "Read Page posts & insights",
     "why": "Analyze how your organic Page content performs."},
    {"scope": "ads_read", "label": "Read ad accounts & insights",
     "why": "Show spend, reach, clicks, CTR and CPC for your campaigns."},
    {"scope": "ads_management", "label": "Prepare campaigns (paused)",
     "why": "Draft new campaigns — always created PAUSED, never live."},
    {"scope": "business_management", "label": "Access Business Portfolio assets",
     "why": "Reach the Pages and ad accounts inside your Business Portfolio."},
]

_REVIEW_SCOPES = {"ads_management", "business_management"}


def _check(cid: str, label: str, status: str, detail: str, remediation: str = "") -> dict:
    """One diagnostic row. status ∈ {ok, warning, error, skipped}."""
    return {"id": cid, "label": label, "status": status, "detail": detail,
            "remediation": remediation}


def _from_ads_error(cid: str, label: str, res: dict) -> dict:
    """Map an ads.py structured error into a client-friendly diagnostic row."""
    err = res.get("error")
    if res.get("needs_reconnect") or err == "expired_token":
        return _check(cid, label, "error", "Connection expired — reconnect required.",
                      "Your Meta token expired or was revoked. Click Reconnect and approve the "
                      "permissions again.")
    if err == "missing_permission":
        return _check(cid, label, "error", "Permission not granted yet.",
                      "ads_read / ads_management / business_management need Meta App Review before "
                      "Meta will grant them on a live app. Until then this stays blocked — which we "
                      "show honestly rather than faking numbers.")
    if err == "no_ad_account":
        return _check(cid, label, "warning", "No ad account selected.",
                      "Pick an ad account in the Ads tab first.")
    if err == "network_error":
        return _check(cid, label, "error", "Could not reach Meta.",
                      "This is usually a temporary network issue — run diagnostics again in a moment.")
    return _check(cid, label, "error", res.get("message") or "Meta returned an error.", "")


def _granted_scopes(tenant_id: str, mode: str) -> tuple[set[str], bool]:
    """(granted_scope_set, could_verify).

    Demo → the full MVP set (simulated). Live → the REAL granted scopes from
    GET /me/permissions, so "missing ads_read" reflects what Meta actually granted
    (not merely what we requested). could_verify=False when the call failed.
    """
    if mode != "live":
        return set(m.MVP_SCOPES), True
    token = ts.get_user_token(tenant_id)
    if not token:
        return set(), False
    try:
        with httpx.Client(timeout=12) as http:
            resp = http.get(f"{m.graph_base()}/me/permissions", params={"access_token": token})
        if resp.status_code >= 300:
            return set(), False
        granted = {row.get("permission") for row in (resp.json().get("data", []) or [])
                   if row.get("status") == "granted"}
        return granted, True
    except httpx.HTTPError:
        return set(), False


def _permission_view(granted: set[str], mode: str, verified: bool) -> dict:
    """Per-capability availability for the UI. When we couldn't verify granted
    scopes on a live connection, we don't claim 'missing' — we say 'unknown'."""
    def state(any_of: list[str]) -> str:
        if not verified and mode == "live":
            return "unknown"
        if any(s in granted for s in any_of):
            return "available"
        return "app_review_needed" if mode == "live" else "missing"

    return {
        "pages_list": state(["pages_show_list"]),
        "page_insights": state(["pages_read_engagement"]),
        "ads_read": state(["ads_read"]),
        "ads_management": state(["ads_management"]),
        "business_management": state(["business_management"]),
        "publishing": state(["pages_manage_posts", "instagram_content_publish"]),
        "instagram": state(["instagram_basic"]),
    }


def _rollup(checks: list[dict]) -> str:
    statuses = {c["status"] for c in checks}
    if "error" in statuses:
        return "error"
    if "warning" in statuses:
        return "warning"
    return "ok"


def run_diagnostics(tenant_id: str) -> dict:
    """Run the full connection health check for a tenant. Read-only."""
    store = get_meta_store()
    mode = store.mode(tenant_id)

    if mode is None:
        return {
            "connected": False, "mode": None, "demo": False, "overall": "disconnected",
            "checks": [_check(
                "connected", "Meta connected", "error",
                "No Meta account is connected for this workspace.",
                "Click “Connect Facebook / Instagram”, approve the permissions, and run "
                "diagnostics again.")],
            "permissions": {}, "missing_permissions": [], "required_scopes": REQUIRED_SCOPES,
        }

    demo = mode == "demo"
    assets = store.get_assets(tenant_id)
    defaults = store.defaults(tenant_id)
    checks: list[dict] = []

    # 1) Connected
    checks.append(_check("connected", "Meta connected", "ok",
                         f"Connected in {mode} mode." + (" (seeded demo data)" if demo else "")))

    # 2) Facebook Page
    pages = assets.get("facebook_pages", [])
    if pages:
        checks.append(_check("pages", "Facebook Page", "ok",
                             f"{len(pages)} Page(s) available."))
    else:
        checks.append(_check("pages", "Facebook Page", "error", "No Facebook Page found.",
                             "In Meta Business Suite → Settings → Accounts → Pages, add your Page "
                             "and confirm your profile has a role on it."))

    # 3) Instagram business account
    igs = assets.get("instagram_accounts", [])
    if igs:
        checks.append(_check("instagram", "Instagram business account", "ok",
                             f"{len(igs)} linked Instagram account(s)."))
    else:
        checks.append(_check("instagram", "Instagram business account", "warning",
                             "No Instagram business account is linked.",
                             "Convert Instagram to a Professional/Business account, then link it to "
                             "your Facebook Page in Business Suite → Settings → Instagram accounts."))

    # 4) Ad account (real Graph call in live mode via ads.py)
    acct = ads.list_ad_accounts(tenant_id)
    ad_list = acct.get("ad_accounts") or []
    if acct.get("error"):
        checks.append(_from_ads_error("ad_accounts", "Ad account", acct))
    elif ad_list:
        checks.append(_check("ad_accounts", "Ad account", "ok",
                             f"{len(ad_list)} ad account(s) available."))
    else:
        checks.append(_check("ad_accounts", "Ad account", "warning", "No ad account found.",
                             "In Meta Business Suite → Settings → Accounts → Ad accounts, add or "
                             "request access to your ad account."))

    # Resolve an ad account to probe campaigns/insights with.
    ad_id = defaults.get("ad_account_id") or (ad_list[0]["id"] if ad_list else "")

    # 5) Campaigns access
    if ad_id:
        camp = ads.list_campaigns(tenant_id, ad_id)
        if camp.get("error"):
            checks.append(_from_ads_error("campaigns", "Campaigns access", camp))
        else:
            n = len(camp.get("campaigns", []))
            checks.append(_check("campaigns", "Campaigns access", "ok",
                                 f"Campaigns are readable ({n} found)."))
    else:
        checks.append(_check("campaigns", "Campaigns access", "skipped",
                             "No ad account available to read campaigns from."))

    # 6) Insights access
    if ad_id:
        ins = ads.ad_insights(tenant_id, ad_id)
        if ins.get("error"):
            checks.append(_from_ads_error("insights", "Insights access", ins))
        else:
            checks.append(_check("insights", "Insights access", "ok",
                                 "Ad insights (spend / reach / clicks) are readable."))
    else:
        checks.append(_check("insights", "Insights access", "skipped",
                             "No ad account available to read insights from."))

    # 7) Permissions (real granted scopes on live; simulated on demo)
    granted, verified = _granted_scopes(tenant_id, mode)
    perms = _permission_view(granted, mode, verified)
    missing = [s["scope"] for s in REQUIRED_SCOPES if s["scope"] not in granted] if verified else []

    if demo:
        checks.append(_check("permissions", "Permissions", "ok",
                             "Demo mode — all capabilities simulated."))
    elif not verified:
        checks.append(_check("permissions", "Permissions", "warning",
                             "Couldn’t verify granted permissions.",
                             "This usually means the token expired — reconnect and approve again."))
    elif missing:
        review = [s for s in missing if s in _REVIEW_SCOPES]
        rest = [s for s in missing if s not in _REVIEW_SCOPES]
        detail = "Missing: " + ", ".join(missing) + "."
        remediation = ("Reconnect and approve every requested permission.")
        if review:
            remediation += (f" {', '.join(review)} additionally require Meta App Review before Meta "
                            "will grant them on a live app.")
        if rest:
            remediation += f" {', '.join(rest)} should be grantable on reconnect."
        checks.append(_check("permissions", "Permissions", "error", detail, remediation))
    else:
        checks.append(_check("permissions", "Permissions", "ok",
                             "All required permissions are granted."))

    return {
        "connected": True, "mode": mode, "demo": demo, "overall": _rollup(checks),
        "checks": checks, "permissions": perms, "missing_permissions": missing,
        "required_scopes": REQUIRED_SCOPES,
    }
