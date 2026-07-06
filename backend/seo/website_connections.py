"""Website connections for one-tap SEO optimization — per-platform requirements,
status, and (for WordPress) a real credential store.

Connections live in the shared server-side connections store (never returned to
the frontend). Each platform advertises what Pixie can audit vs optimize, the
access it requires, and its risk — so the UI never promises one-tap unless the
connector actually supports it.
"""

from __future__ import annotations

from typing import Optional

from integrations import connections

# platform -> which SEO issue categories it can actually apply (one-tap). Others
# fall back to copy-ready / manual. Priority order = real-world CMS share.
SUPPORT: dict[str, set[str]] = {
    "wordpress": {"meta", "social", "images", "schema", "headings"},
    "shopify": {"meta", "social", "images"},
    "webflow": {"meta", "social"},
    "wix": {"meta"},
    "squarespace": set(),          # audit + copy-ready only
    "custom": {"meta", "social", "images", "schema", "headings"},  # via GitHub PR
    "unknown": set(),
}

PLATFORMS = [
    {"platform": "wordpress", "name": "WordPress / WooCommerce", "support": "Full audit + one-tap optimize",
     "can_optimize": ["titles", "meta descriptions", "headings", "image alt text", "schema"],
     "required": "Site URL + admin application password", "risk": "low", "connect": "credentials"},
    {"platform": "shopify", "name": "Shopify", "support": "Ecommerce SEO — product/collection/blog",
     "can_optimize": ["product SEO", "collection SEO", "blog SEO", "image alt text"],
     "required": "Shopify custom app install + Admin API token", "risk": "low", "connect": "token"},
    {"platform": "webflow", "name": "Webflow", "support": "Page + CMS SEO metadata",
     "can_optimize": ["page SEO title/description", "Open Graph", "CMS item SEO"],
     "required": "Webflow OAuth / site token (pages:write, cms:write)", "risk": "low", "connect": "token"},
    {"platform": "wix", "name": "Wix", "support": "SEO settings where API allows",
     "can_optimize": ["meta title/description", "structured data (limited)"],
     "required": "Wix app / API permissions", "risk": "medium", "connect": "token"},
    {"platform": "squarespace", "name": "Squarespace", "support": "Audit + copy-ready (one-tap limited)",
     "can_optimize": ["mostly copy-ready / manual", "commerce SEO where API allows"],
     "required": "API key if supported", "risk": "medium", "connect": "manual"},
    {"platform": "custom", "name": "Custom / Next.js / React", "support": "GitHub PR-based optimization",
     "can_optimize": ["metadata files", "JSON/MD/MDX content (via pull request)"],
     "required": "GitHub repo access", "risk": "medium", "connect": "github"},
]

_CAP = "seo_optimize"  # capability key used in the connections store


def _key(platform: str) -> str:
    return f"seo:{platform}"


def is_connected(tenant_id: str, platform: str) -> bool:
    return connections.find_active_connection(tenant_id, _key(platform)) is not None


def get_connection(tenant_id: str, platform: str) -> Optional[dict]:
    return connections.find_active_connection(tenant_id, _key(platform))


def platform_supports(platform: str, category: str) -> bool:
    return category in SUPPORT.get(platform, set())


def connect_wordpress(tenant_id: str, site_url: str, username: str, application_password: str) -> dict:
    """Store WordPress credentials (server-side only) after a live auth check."""
    from .wp_connector import verify_wordpress
    check = verify_wordpress(site_url, username, application_password)
    if check.get("status") != "ok":
        return check
    connections.register_connection(tenant_id, _key("wordpress"), {
        "provider": "wordpress", "status": "active", "site_url": site_url.rstrip("/"),
        "username": username, "application_password": application_password,  # server-side only
        "connected_as": check.get("connected_as"), "capabilities": sorted(SUPPORT["wordpress"]),
    })
    return {"status": "connected", "platform": "wordpress", "connected_as": check.get("connected_as")}


def connect_token(tenant_id: str, platform: str, token: str, site_id: str = "", extra: Optional[dict] = None) -> dict:
    """Generic token connect for Shopify/Webflow/Wix (interface — stores the token
    server-side; the concrete connectors land per platform)."""
    if platform not in SUPPORT:
        return {"status": "unsupported_platform", "platform": platform}
    if not token:
        return {"status": "missing_credentials",
                "message": f"A {platform} API token is required. See the connection card for what to provide."}
    connections.register_connection(tenant_id, _key(platform), {
        "provider": platform, "status": "active", "token": token, "site_id": site_id,
        "capabilities": sorted(SUPPORT.get(platform, set())), **(extra or {})})
    return {"status": "connected", "platform": platform}


def disconnect(tenant_id: str, platform: str) -> dict:
    connections.disconnect(tenant_id, [_key(platform)])
    return {"status": "disconnected", "platform": platform}


def status(tenant_id: str) -> dict:
    """Per-platform connection cards + connected flag (token-safe)."""
    cards = []
    for p in PLATFORMS:
        conn = get_connection(tenant_id, p["platform"])
        cards.append({**p, "connected": conn is not None,
                      "connected_as": (conn or {}).get("connected_as") or (conn or {}).get("site_url")})
    return {"platforms": cards}
