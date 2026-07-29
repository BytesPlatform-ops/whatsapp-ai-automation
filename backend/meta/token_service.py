"""TokenService — the ONLY place Meta tokens are read/written.

Tokens live in the server-side connections store (durable, gitignored file,
owner-only). They are NEVER returned to the frontend, logged, or placed in the
display asset store. Callers that need to hit the Graph API on the server ask
this service for a token; callers that render UI ask `safe_status()`.

    save_token_ref(tenant, descriptor)     # store tokens after OAuth (seals at rest)
    get_token_for_server_call(...)         # server-side token for a Graph call (unsealed)
    page_token(connection, asset_id)       # extract the right page token from a sealed descriptor
    refresh_token_if_needed(tenant)        # (Meta long-lived ~60d; hook for refresh)
    delete_token(tenant)                   # on disconnect
    safe_status(tenant)                    # frontend-safe, NO tokens

Token sealing
-------------
save_token_ref delegates to connections.register_many which seals sensitive fields
(user_token, page_access_token, …) before storing. Callers that need the real token
receive it via find_active_connection_unsealed so the sealed descriptor never leaves
this module unsealed toward the frontend. safe_status() never touches tokens.
"""

from __future__ import annotations

from typing import Optional

from integrations import connections
from integrations.token_crypto import unseal_descriptor

from .oauth import META_CAPABILITIES


def save_token_ref(tenant_id: str, descriptor: dict) -> None:
    """Persist Meta OAuth descriptor, sealing sensitive fields at rest."""
    # register_many seals the descriptor before storing — no explicit seal call needed here.
    connections.register_many(tenant_id, META_CAPABILITIES, descriptor)


def _connection_sealed(tenant_id: str) -> Optional[dict]:
    """Return the sealed descriptor (for status/capability checks — no tokens)."""
    return connections.find_active_connection(tenant_id, "meta_content_publish")


def _connection_unsealed(tenant_id: str) -> Optional[dict]:
    """Return the unsealed descriptor for server-side token extraction."""
    return connections.find_active_connection_unsealed(tenant_id, "meta_content_publish")


def page_token(connection: dict, asset_id: str = "", *, by_instagram: bool = False) -> Optional[str]:
    """Extract the page access token for a target asset from an UNSEALED connection.

    The caller is responsible for passing an unsealed descriptor (returned by
    _connection_unsealed or find_active_connection_unsealed). The sealed form of
    page_access_token starts with fer:/obf: and is not a valid Graph API token.
    """
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
    """Return a plaintext page/user token for a server-side Graph API call.

    Unseals the stored descriptor — never returns a sealed value to a caller
    that would send it to the Meta API.
    """
    conn = _connection_unsealed(tenant_id)
    if not conn:
        return None
    return page_token(conn, asset_id, by_instagram=by_instagram)


def get_user_token(tenant_id: str) -> Optional[str]:
    """The long-lived USER access token — used for account-level Marketing API
    calls (ad accounts, campaigns, ads insights) that page tokens can't serve.
    Server-side only; never returned to the frontend."""
    conn = _connection_unsealed(tenant_id)
    if not conn:
        return None
    return conn.get("user_token")


def refresh_token_if_needed(tenant_id: str) -> None:
    """Meta long-lived user tokens last ~60 days. Hook for a background refresh
    (fb_exchange_token). No-op today; kept so callers have a stable seam."""
    return None


def delete_token(tenant_id: str) -> None:
    connections.disconnect(tenant_id, META_CAPABILITIES)


def safe_status(tenant_id: str) -> dict:
    """Frontend-safe connection view — never includes any token."""
    conn = _connection_sealed(tenant_id)
    if not conn:
        return {"connected": False}
    return {
        "connected": True,
        "provider": conn.get("provider", "meta"),
        "mode": conn.get("mode", "live"),
        "scopes": conn.get("scopes", []),
        "display_name": conn.get("display_name") or conn.get("email"),
    }
