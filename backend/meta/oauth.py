"""Meta (Facebook Login for Business) OAuth + Graph API asset discovery.

Mirrors meta/../integrations/google_oauth.py: build a consent URL, exchange the
code for a token, upgrade to a long-lived token, then discover the business
assets (Facebook Pages, their linked Instagram professional accounts, and ad
accounts). All server-side; requires a Meta App:

    META_APP_ID, META_APP_SECRET, META_REDIRECT_URI, META_GRAPH_VERSION

NOTE on going live: most publishing/messaging permissions require Meta App Review.
Until the app is reviewed, real calls will fail with a permission error — which we
surface honestly rather than faking success.
"""

from __future__ import annotations

import os

import httpx

# The capabilities a connected Meta account can satisfy (subject to granted scopes).
META_CAPABILITIES = [
    "meta_asset_read",
    "meta_page_insights_read",
    "meta_instagram_insights_read",
    "meta_media_read",
    "meta_content_publish",
    "meta_reel_publish",
    "meta_comment_read",
    "meta_comment_reply",
    "meta_ads_insights_read",
]

# MVP, least-privilege scope set (feature-based; do NOT request ads_management).
MVP_SCOPES = [
    "pages_show_list",
    "pages_read_engagement",
    "pages_manage_posts",
    "pages_manage_engagement",
    "instagram_basic",
    "instagram_content_publish",
    "ads_read",
]

# Extra scopes per feature (requested only when that feature is asked for).
FEATURE_SCOPES = {
    "analytics": ["pages_show_list", "pages_read_engagement", "instagram_basic"],
    "publishing": ["pages_manage_posts", "instagram_content_publish"],
    "messaging": ["instagram_manage_messages", "pages_messaging"],
    "comments": ["pages_manage_engagement", "instagram_manage_comments"],
    "ads": ["ads_read"],
}


class MetaNotConfigured(RuntimeError):
    pass


def app_id() -> str:
    return os.getenv("META_APP_ID", "")


def app_secret() -> str:
    return os.getenv("META_APP_SECRET", "")


def redirect_uri() -> str:
    return os.getenv("META_REDIRECT_URI", "http://localhost:8000/api/meta/connect/callback")


def graph_version() -> str:
    return os.getenv("META_GRAPH_VERSION", "v23.0")


def graph_base() -> str:
    return f"https://graph.facebook.com/{graph_version()}"


def is_configured() -> bool:
    return bool(app_id() and app_secret())


def _require_configured() -> None:
    if not is_configured():
        raise MetaNotConfigured(
            "Meta is not configured. Set META_APP_ID and META_APP_SECRET in the backend "
            "environment (create an app at developers.facebook.com)."
        )


def scopes_for(feature: str) -> list[str]:
    """Least-privilege scope list for a requested feature (defaults to MVP set)."""
    base = list(MVP_SCOPES)
    for s in FEATURE_SCOPES.get(feature, []):
        if s not in base:
            base.append(s)
    return base


def build_auth_url(state: str, feature: str = "analytics") -> str:
    _require_configured()
    import urllib.parse

    params = {
        "client_id": app_id(),
        "redirect_uri": redirect_uri(),
        "response_type": "code",
        "state": state,
        "scope": ",".join(scopes_for(feature)),
    }
    return f"https://www.facebook.com/{graph_version()}/dialog/oauth?{urllib.parse.urlencode(params)}"


async def exchange_code(code: str) -> str:
    """Auth code → short-lived user access token."""
    _require_configured()
    async with httpx.AsyncClient(timeout=20) as http:
        resp = await http.get(f"{graph_base()}/oauth/access_token", params={
            "client_id": app_id(),
            "client_secret": app_secret(),
            "redirect_uri": redirect_uri(),
            "code": code,
        })
        resp.raise_for_status()
        return resp.json()["access_token"]


async def long_lived_token(short_token: str) -> dict:
    """Upgrade to a long-lived user token (≈60 days)."""
    _require_configured()
    async with httpx.AsyncClient(timeout=20) as http:
        resp = await http.get(f"{graph_base()}/oauth/access_token", params={
            "grant_type": "fb_exchange_token",
            "client_id": app_id(),
            "client_secret": app_secret(),
            "fb_exchange_token": short_token,
        })
        resp.raise_for_status()
        return resp.json()  # {access_token, token_type, expires_in?}


async def discover_assets(user_token: str) -> dict:
    """Fetch Pages (with page tokens + linked IG) and ad accounts the user manages."""
    _require_configured()
    out = {"facebook_pages": [], "instagram_accounts": [], "ad_accounts": []}
    async with httpx.AsyncClient(timeout=20) as http:
        pages = await http.get(f"{graph_base()}/me/accounts", params={
            "fields": "id,name,access_token,tasks,instagram_business_account{id,username}",
            "access_token": user_token,
        })
        if pages.status_code == 200:
            for p in pages.json().get("data", []):
                ig = p.get("instagram_business_account")
                out["facebook_pages"].append({
                    "id": p["id"], "name": p.get("name"), "status": "connected",
                    "tasks": p.get("tasks", []), "page_access_token": p.get("access_token"),
                    "linked_instagram": {"id": ig["id"], "username": ig.get("username")} if ig else None,
                })
                if ig:
                    out["instagram_accounts"].append({"id": ig["id"], "username": ig.get("username"),
                                                      "page_id": p["id"]})
        try:
            ads = await http.get(f"{graph_base()}/me/adaccounts", params={
                "fields": "id,name,account_status", "access_token": user_token,
            })
            if ads.status_code == 200:
                for a in ads.json().get("data", []):
                    out["ad_accounts"].append({"id": a["id"], "name": a.get("name")})
        except httpx.HTTPError:
            pass  # ads scope may be absent — not fatal
    return out
