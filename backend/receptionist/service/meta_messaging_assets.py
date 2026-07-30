"""Meta messaging asset selection + ownership validation (Instagram + Messenger).

Selecting an Instagram account or Facebook Page persists the choice onto the
existing encrypted Meta connection descriptor (never a second connection store) and
records it in a durable assets table. Ownership is verified against the authenticated
Meta connection: a selected asset MUST appear in the account/page list the connection
can see, else the selection is refused. One asset cannot be active under conflicting
workspaces (enforced by the webhook's server-side resolution + unique indexes).
"""

from __future__ import annotations

from typing import Optional

from . import stores
from .ids import now_iso


def _record_asset(tenant_id: str, channel: str, asset_id: str, meta: dict) -> None:
    stores.meta_assets().put(tenant_id, {
        "id": f"asset::{tenant_id}::{channel}", "tenant_id": tenant_id, "channel": channel,
        "asset_id": asset_id, "selected_at": now_iso(), **meta})


def _update_connection(tenant_id: str, caps: list[str], patch: dict) -> None:
    from integrations import connections
    base = connections.find_active_connection_unsealed(tenant_id, caps[0]) or {"status": "active"}
    base = dict(base)
    base.update(patch)
    connections.register_many(tenant_id, caps, base)


def select_instagram_account(tenant_id: str, ig_account_id: str) -> dict:
    from ..providers import instagram_messaging as ig
    from ..providers.meta_messaging_common import MetaMessagingError
    try:
        accounts = ig.list_accounts(tenant_id)
    except MetaMessagingError as exc:
        return {"status": "failed", "reason": exc.category}
    match = next((a for a in accounts if a["instagram_account_id"] == ig_account_id), None)
    if match is None:
        return {"status": "asset_ownership_failed", "reason": "account_not_owned"}
    _update_connection(tenant_id, ["instagram_read", "instagram_send"], {
        "instagram_account_id": ig_account_id, "username": match.get("username", ""),
        "linked_page_id": match.get("linked_page_id", ""), "account_type": match.get("account_type", ""),
        "messaging_enabled": bool(match.get("messaging_capability", True))})
    _record_asset(tenant_id, "instagram", ig_account_id, {"username": match.get("username", "")})
    return {"status": "selected", "connection": ig.validate_connection(tenant_id)}


def select_page(tenant_id: str, page_id: str) -> dict:
    from ..providers import messenger as fb
    from ..providers.meta_messaging_common import MetaMessagingError
    try:
        pages = fb.list_pages(tenant_id)
    except MetaMessagingError as exc:
        return {"status": "failed", "reason": exc.category}
    match = next((p for p in pages if p["page_id"] == page_id), None)
    if match is None:
        return {"status": "asset_ownership_failed", "reason": "page_not_owned"}
    _update_connection(tenant_id, ["messenger_read", "messenger_send"], {
        "page_id": page_id, "page_name": match.get("page_name", ""),
        "messaging_enabled": bool(match.get("messaging_capability", True))})
    _record_asset(tenant_id, "messenger", page_id, {"page_name": match.get("page_name", "")})
    return {"status": "selected", "connection": fb.validate_connection(tenant_id)}


def disconnect(tenant_id: str, channel: str) -> dict:
    """Disable new provider actions without deleting historical conversations."""
    from integrations import connections
    if channel == "instagram":
        connections.disconnect(tenant_id, ["instagram_read", "instagram_send"])
    elif channel == "messenger":
        connections.disconnect(tenant_id, ["messenger_read", "messenger_send"])
    else:
        return {"status": "failed", "reason": "unknown_channel"}
    return {"status": "disconnected", "channel": channel}


def status(tenant_id: str) -> dict:
    from ..providers import instagram_messaging as ig, messenger as fb
    from . import meta_messaging_sync
    return {
        "instagram": {
            "connection": ig.validate_connection(tenant_id),
            "reply_mode": meta_messaging_sync.reply_mode(tenant_id, "instagram"),
        },
        "messenger": {
            "connection": fb.validate_connection(tenant_id),
            "reply_mode": meta_messaging_sync.reply_mode(tenant_id, "messenger"),
        },
    }
