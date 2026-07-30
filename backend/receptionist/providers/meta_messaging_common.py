"""Shared Meta Messaging services for the AI Receptionist (Instagram + Messenger).

ONE shared domain behind two typed, replaceable adapters
(``instagram_messaging``/``messenger``). This module holds only what BOTH channels
share: token unsealing, connection lookup + health, typed error vocabulary, size
guards, and result normalisation. It reuses the existing encrypted Meta connection
store (``integrations.connections``) — no second connection or token architecture.

Access tokens are unsealed only inside the trusted adapter path and never logged.
Raw Graph API payloads never leave the adapter layer.
"""

from __future__ import annotations

import os
import re
from typing import Optional


class MetaMessagingError(Exception):
    """Typed, non-leaky failure. ``category`` is a fixed-vocabulary string shared
    by both Instagram and Messenger adapters."""

    CATEGORIES = {
        "not_connected", "missing_permission", "token_expired", "token_revoked",
        "invalid_recipient", "rate_limit", "quota", "window_closed", "tag_required",
        "invalid_tag", "media_too_large", "unsupported_media", "unsupported_action",
        "provider_error", "unknown_result", "message_too_large", "asset_ownership_failed",
    }

    def __init__(self, category: str, detail: str = "") -> None:
        super().__init__(category)
        self.category = category if category in self.CATEGORIES else "provider_error"
        self.detail = detail


def max_message_bytes() -> int:
    try:
        return int(os.environ.get("AI_RECEPTIONIST_META_MESSAGING_MAX_MESSAGE_BYTES", "") or 4096)
    except ValueError:
        return 4096


def max_media_bytes() -> int:
    try:
        return int(os.environ.get("AI_RECEPTIONIST_META_MESSAGING_MAX_MEDIA_BYTES", "") or 26000000)
    except ValueError:
        return 26000000


# Provider-scoped user IDs are opaque numeric strings (PSIDs / IGSIDs).
_PSID = re.compile(r"^\d{1,32}$")


def normalise_psid(psid: str) -> str:
    return re.sub(r"[^\d]", "", psid or "")


def validate_recipient(psid: str) -> str:
    n = normalise_psid(psid)
    if not _PSID.match(n):
        raise MetaMessagingError("invalid_recipient", "recipient is not a valid provider-scoped id")
    return n


def connection(tenant_id: str, read_cap: str, send_cap: str, *, need_send: bool = False) -> dict:
    """Return the unsealed connection descriptor for a channel, or raise typed."""
    from integrations.connections import find_active_connection_unsealed
    cap = send_cap if need_send else read_cap
    conn = find_active_connection_unsealed(tenant_id, cap) \
        or find_active_connection_unsealed(tenant_id, read_cap)
    if conn is None:
        raise MetaMessagingError("not_connected", "no meta messaging connection for tenant")
    if conn.get("status") == "disconnected":
        raise MetaMessagingError("not_connected", "connection disconnected")
    if conn.get("status") == "needs_reconnect":
        raise MetaMessagingError("token_revoked", "connection needs reconnect")
    if need_send and not conn.get("messaging_enabled", True):
        raise MetaMessagingError("missing_permission", "connection cannot send messages")
    return conn


def token(conn: dict) -> str:
    """Prefer a Page/asset access token, fall back to the user token. Never logged."""
    tok = conn.get("page_access_token") or conn.get("access_token", "")
    if not tok:
        raise MetaMessagingError("token_revoked", "no access token — reconnect Meta")
    return tok


def normalise_send_result(raw: dict) -> dict:
    """Normalise a Graph Send API response into an internal shape."""
    mid = raw.get("message_id") or raw.get("mid") or ""
    return {
        "message_id": mid,
        "recipient": raw.get("recipient_id", "") or (raw.get("recipient") or {}).get("id", ""),
        "provider_status": "accepted" if mid else "unknown",
    }
