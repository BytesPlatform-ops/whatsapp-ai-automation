"""Social connection resolution for publishing — REUSES the existing Meta OAuth /
token storage (``meta.token_service`` + ``integrations.connections``). No second
OAuth or token store is created here.

A publishing "connection" is a single destination (a Facebook Page or an Instagram
business account) derived from the tenant's Meta connection descriptor. Tokens are
resolved SERVER-SIDE only (``token_for``) and never returned to the browser.
"""

from __future__ import annotations

from typing import List, Optional

from .capabilities import account_capabilities
from .enums import Platform

_META_CAPABILITY = "meta_content_publish"


def _meta_connection(tenant_id: str) -> Optional[dict]:
    try:
        from integrations import connections
        return connections.find_active_connection(tenant_id, _META_CAPABILITY)
    except Exception:
        return None


def list_accounts(tenant_id: str) -> List[dict]:
    """Frontend-safe list of connected publishing destinations (NO tokens)."""
    conn = _meta_connection(tenant_id)
    if not conn:
        return []
    scopes = conn.get("scopes", []) or []
    out: List[dict] = []
    for p in conn.get("pages", []) or []:
        pid = p.get("id", "")
        if pid:
            out.append(_account("facebook", pid, page_id=pid, display_name=p.get("name", ""), scopes=scopes))
        ig = p.get("linked_instagram") or {}
        if ig.get("id"):
            out.append(_account("instagram", ig["id"], page_id=pid,
                                display_name=ig.get("username") or p.get("name", ""), scopes=scopes))
    return out


def _account(platform: str, account_id: str, *, page_id: str, display_name: str, scopes: list) -> dict:
    caps = account_capabilities(Platform(platform), scopes)
    return {
        "connection_id": f"{platform}:{account_id}",
        "platform": platform,
        "account_id": account_id,
        "page_id": page_id,
        "display_name": display_name,
        "scopes": scopes,
        "capabilities": caps,
        "publishing_authorized": caps["publishing_authorized"],
        "reconnection_required": caps["reconnection_required"],
    }


def get_account(tenant_id: str, connection_id: str) -> Optional[dict]:
    for acc in list_accounts(tenant_id):
        if acc["connection_id"] == connection_id:
            return acc
    return None


def token_for(tenant_id: str, connection_id: str) -> Optional[str]:
    """SERVER-SIDE token for a Graph call. Never exposed to the frontend."""
    try:
        platform, _, account_id = connection_id.partition(":")
        from meta.token_service import get_token_for_server_call
        return get_token_for_server_call(tenant_id, account_id, by_instagram=(platform == "instagram"))
    except Exception:
        return None
