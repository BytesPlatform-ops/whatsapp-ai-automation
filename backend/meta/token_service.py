"""TokenService — the ONLY place Meta tokens are read/written.

Tokens live in the server-side connections store (durable, gitignored file,
owner-only). They are NEVER returned to the frontend, logged, or placed in the
display asset store. Callers that need to hit the Graph API on the server ask
this service for a token; callers that render UI ask `safe_status()`.

    save_token_ref(tenant, descriptor)     # store tokens after OAuth
    get_token_for_server_call(...)         # server-side token for a Graph call
    page_token(connection, asset_id)       # extract the right page token
    refresh_token_if_needed(tenant)        # (Meta long-lived ~60d; hook for refresh)
    delete_token(tenant)                   # on disconnect
    safe_status(tenant)                    # frontend-safe, NO tokens
"""

from __future__ import annotations

from typing import Optional

from integrations import connections

from .oauth import META_CAPABILITIES


def save_token_ref(tenant_id: str, descriptor: dict) -> None:
    connections.register_many(tenant_id, META_CAPABILITIES, descriptor)


def _connection(tenant_id: str) -> Optional[dict]:
    return connections.find_active_connection(tenant_id, "meta_content_publish")


def page_token(connection: dict, asset_id: str = "", *, by_instagram: bool = False) -> Optional[str]:
    """Extract the page access token for a target asset from a bound connection."""
    pages = connection.get("pages", [])
    for p in pages:
        if by_instagram:
            if (p.get("linked_instagram") or {}).get("id") == asset_id:
                return p.get("page_access_token")
        elif p.get("id") == asset_id:
            return p.get("page_access_token")
    # fall back to the first page / user token
    if pages:
        return pages[0].get("page_access_token")
    return connection.get("user_token")


def get_token_for_server_call(tenant_id: str, asset_id: str = "", *, by_instagram: bool = False) -> Optional[str]:
    conn = _connection(tenant_id)
    if not conn:
        return None
    return page_token(conn, asset_id, by_instagram=by_instagram)


def refresh_token_if_needed(tenant_id: str) -> None:
    """Meta long-lived user tokens last ~60 days. Hook for a background refresh
    (fb_exchange_token). No-op today; kept so callers have a stable seam."""
    return None


def delete_token(tenant_id: str) -> None:
    connections.disconnect(tenant_id, META_CAPABILITIES)


def safe_status(tenant_id: str) -> dict:
    """Frontend-safe connection view — never includes any token."""
    conn = _connection(tenant_id)
    if not conn:
        return {"connected": False}
    return {
        "connected": True,
        "provider": conn.get("provider", "meta"),
        "mode": conn.get("mode", "live"),
        "scopes": conn.get("scopes", []),
        "display_name": conn.get("display_name") or conn.get("email"),
    }
