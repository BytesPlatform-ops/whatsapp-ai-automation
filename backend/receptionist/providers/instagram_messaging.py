"""Instagram Direct Messaging provider adapter for the AI Receptionist.

ONE typed adapter over Meta's Instagram Messaging (Graph) API, behind the shared
Meta messaging domain (:mod:`meta_messaging_common`). Reuses the existing encrypted
Meta connection store; never passes raw Graph payloads into business logic or the
frontend. Hermetic by default: a dependency-injected transport (:func:`set_transport`)
supplies a mock in tests; live calls happen only with a real transport installed.

Instagram supports a narrower set of reply structures than Messenger — this adapter
exposes ONLY provider-supported operations and never fabricates Messenger-only
interactive structures.
"""

from __future__ import annotations

from typing import Optional

from . import meta_messaging_common as common
from .meta_messaging_common import MetaMessagingError

CAP_READ = "instagram_read"
CAP_SEND = "instagram_send"
CHANNEL = "instagram"

_ALLOWED_MEDIA_TYPES = {"image", "video", "audio"}


# ── transport injection (hermetic) ────────────────────────────────────────────
_transport: Optional["InstagramTransport"] = None


class InstagramTransport:
    """Abstract transport. Real impl calls the Graph API; the mock returns fixtures."""

    def list_accounts(self, token: str) -> dict: raise NotImplementedError
    def get_account(self, token: str, ig_account_id: str) -> dict: raise NotImplementedError
    def send_message(self, token: str, ig_account_id: str, payload: dict) -> dict: raise NotImplementedError
    def mark_seen(self, token: str, ig_account_id: str, recipient_id: str) -> dict: raise NotImplementedError
    def get_media(self, token: str, media_id: str) -> dict: raise NotImplementedError
    def download_media(self, token: str, url: str) -> bytes: raise NotImplementedError


def set_transport(t: Optional["InstagramTransport"]) -> None:
    global _transport
    _transport = t


def _active_transport() -> "InstagramTransport":
    return _transport if _transport is not None else _MockInstagramTransport()


def _conn(tenant_id: str, *, need_send: bool = False) -> dict:
    conn = common.connection(tenant_id, CAP_READ, CAP_SEND, need_send=need_send)
    if need_send and not conn.get("instagram_account_id"):
        raise MetaMessagingError("missing_permission", "no instagram account selected")
    return conn


# ── public API ────────────────────────────────────────────────────────────────

def validate_connection(tenant_id: str) -> dict:
    """Truthful readiness snapshot for the UI (no secrets)."""
    from integrations.connections import find_active_connection_unsealed
    conn = find_active_connection_unsealed(tenant_id, CAP_READ) \
        or find_active_connection_unsealed(tenant_id, CAP_SEND)
    if conn is None:
        return {"connected": False, "state": "not_connected"}
    if conn.get("status") == "needs_reconnect":
        return {"connected": True, "state": "needs_reconnect"}
    has_account = bool(conn.get("instagram_account_id"))
    perm_ok = bool(conn.get("messaging_permission", True))
    can_send = has_account and perm_ok and bool(conn.get("messaging_enabled", True))
    webhook = bool(conn.get("webhook_subscribed"))
    state = ("permission_missing" if not perm_ok
             else "no_instagram_account" if not has_account
             else "webhook_not_subscribed" if not webhook
             else "ready_for_replies" if can_send
             else "ready_for_inbound")
    return {
        "connected": True, "channel": CHANNEL,
        "instagram_account_id": conn.get("instagram_account_id", ""),
        "username": conn.get("username", ""), "linked_page_id": conn.get("linked_page_id", ""),
        "account_type": conn.get("account_type", ""),
        "can_send": can_send, "webhook_subscribed": webhook,
        "last_inbound_at": conn.get("last_inbound_at", ""),
        "last_send_at": conn.get("last_send_at", ""),
        "last_error": conn.get("last_error", ""), "state": state,
    }


def list_accounts(tenant_id: str) -> list[dict]:
    conn = _conn(tenant_id)
    res = _active_transport().list_accounts(common.token(conn))
    out = []
    for a in (res.get("data") or []):
        out.append({"instagram_account_id": a.get("id", ""), "username": a.get("username", ""),
                    "account_type": a.get("account_type", ""), "linked_page_id": a.get("page_id", ""),
                    "messaging_capability": bool(a.get("messaging_capability", True))})
    return out


def get_account(tenant_id: str, ig_account_id: str) -> dict:
    conn = _conn(tenant_id)
    a = _active_transport().get_account(common.token(conn), ig_account_id)
    return {"instagram_account_id": a.get("id", ig_account_id), "username": a.get("username", ""),
            "account_type": a.get("account_type", ""), "linked_page_id": a.get("page_id", "")}


def send_text(tenant_id: str, *, to: str, body: str) -> dict:
    to = common.validate_recipient(to)
    if len(body.encode("utf-8")) > common.max_message_bytes():
        raise MetaMessagingError("message_too_large")
    conn = _conn(tenant_id, need_send=True)
    payload = {"recipient": {"id": to}, "message": {"text": body}}
    return _do_send(conn, payload)


def send_media(tenant_id: str, *, to: str, media_type: str, url: str) -> dict:
    to = common.validate_recipient(to)
    if media_type not in _ALLOWED_MEDIA_TYPES:
        raise MetaMessagingError("unsupported_media")
    conn = _conn(tenant_id, need_send=True)
    payload = {"recipient": {"id": to},
               "message": {"attachment": {"type": media_type, "payload": {"url": url}}}}
    return _do_send(conn, payload)


def mark_seen(tenant_id: str, recipient_id: str) -> dict:
    conn = _conn(tenant_id, need_send=True)
    return _active_transport().mark_seen(common.token(conn),
                                         conn.get("instagram_account_id", ""),
                                         common.normalise_psid(recipient_id))


def get_media_metadata(tenant_id: str, media_id: str) -> dict:
    conn = _conn(tenant_id)
    m = _active_transport().get_media(common.token(conn), media_id)
    return {"media_id": media_id, "mime_type": m.get("mime_type", ""),
            "file_size": int(m.get("file_size", 0) or 0), "url": m.get("url", "")}


def download_media(tenant_id: str, media_id: str) -> bytes:
    meta = get_media_metadata(tenant_id, media_id)
    if meta["file_size"] and meta["file_size"] > common.max_media_bytes():
        raise MetaMessagingError("media_too_large")
    kind = (meta.get("mime_type", "").split("/")[0] or "")
    if kind and kind not in ("image", "audio", "video", "application", "text"):
        raise MetaMessagingError("unsupported_media")
    conn = _conn(tenant_id)
    data = _active_transport().download_media(common.token(conn), meta.get("url", ""))
    if len(data) > common.max_media_bytes():
        raise MetaMessagingError("media_too_large")
    return data


def reconcile_message(tenant_id: str, message_id: str) -> dict:
    """Best-effort provider state lookup (Graph has limited read-back). Never
    blind-resends."""
    return {"message_id": message_id, "provider_status": "unknown"}


def _do_send(conn: dict, payload: dict) -> dict:
    try:
        raw = _active_transport().send_message(common.token(conn),
                                               conn.get("instagram_account_id", ""), payload)
    except MetaMessagingError:
        raise
    except Exception as exc:  # pragma: no cover
        raise MetaMessagingError("provider_error", str(exc)[:80]) from exc
    out = common.normalise_send_result(raw)
    if not out["message_id"]:
        raise MetaMessagingError("unknown_result", "send returned no message id")
    return out


# ── built-in mock transport (hermetic default) ────────────────────────────────

class _MockInstagramTransport(InstagramTransport):
    def __init__(self):
        self.sends = 0

    def list_accounts(self, token):
        return {"data": [{"id": "ig_1", "username": "acme.co", "account_type": "BUSINESS",
                          "page_id": "page_1", "messaging_capability": True}]}

    def get_account(self, token, ig_account_id):
        return {"id": ig_account_id, "username": "acme.co", "account_type": "BUSINESS", "page_id": "page_1"}

    def send_message(self, token, ig_account_id, payload):
        self.sends += 1
        return {"message_id": f"ig.MOCK{self.sends}", "recipient_id": (payload.get("recipient") or {}).get("id", "")}

    def mark_seen(self, token, ig_account_id, recipient_id):
        return {"success": True}

    def get_media(self, token, media_id):
        return {"url": "https://lookaside.fbsbx.com/ig-mock", "mime_type": "image/jpeg", "file_size": 2048}

    def download_media(self, token, url):
        return b"\xff\xd8\xff\xe0mockig"
