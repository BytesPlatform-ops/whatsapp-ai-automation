"""Facebook Messenger provider adapter for the AI Receptionist.

ONE typed adapter over Meta's Messenger Platform (Graph) Send API, behind the
shared Meta messaging domain (:mod:`meta_messaging_common`). Reuses the existing
encrypted Meta connection store; never passes raw Graph payloads into business
logic or the frontend. Hermetic by default via :func:`set_transport`.

Messenger supports richer interactive structures than Instagram (quick replies,
button templates, sender actions). Every interactive payload is typed and validated
here; option IDs are kept separate from labels and the model can never send raw
Graph JSON.
"""

from __future__ import annotations

from typing import Optional

from . import meta_messaging_common as common
from .meta_messaging_common import MetaMessagingError

CAP_READ = "messenger_read"
CAP_SEND = "messenger_send"
CHANNEL = "messenger"

_ALLOWED_ATTACHMENT_TYPES = {"image", "video", "audio", "file"}
# Standard messaging tags Meta still supports for outside-window sends.
_ALLOWED_TAGS = {"CONFIRMED_EVENT_UPDATE", "POST_PURCHASE_UPDATE", "ACCOUNT_UPDATE", "HUMAN_AGENT"}
_MAX_QUICK_REPLIES = 13
_MAX_BUTTONS = 3


# ── transport injection (hermetic) ────────────────────────────────────────────
_transport: Optional["MessengerTransport"] = None


class MessengerTransport:
    def list_pages(self, token: str) -> dict: raise NotImplementedError
    def get_page(self, token: str, page_id: str) -> dict: raise NotImplementedError
    def send_message(self, token: str, page_id: str, payload: dict) -> dict: raise NotImplementedError
    def send_sender_action(self, token: str, page_id: str, recipient_id: str, action: str) -> dict: raise NotImplementedError
    def get_media(self, token: str, media_id: str) -> dict: raise NotImplementedError
    def download_media(self, token: str, url: str) -> bytes: raise NotImplementedError


def set_transport(t: Optional["MessengerTransport"]) -> None:
    global _transport
    _transport = t


def _active_transport() -> "MessengerTransport":
    return _transport if _transport is not None else _MockMessengerTransport()


def _conn(tenant_id: str, *, need_send: bool = False) -> dict:
    conn = common.connection(tenant_id, CAP_READ, CAP_SEND, need_send=need_send)
    if need_send and not conn.get("page_id"):
        raise MetaMessagingError("missing_permission", "no facebook page selected")
    return conn


def validate_tag(tag: str) -> str:
    """Reject unsupported/obsolete tags centrally (never send one Meta removed)."""
    if not tag:
        return ""
    if tag not in _ALLOWED_TAGS:
        raise MetaMessagingError("invalid_tag", f"tag '{tag}' is not supported")
    return tag


# ── public API ────────────────────────────────────────────────────────────────

def validate_connection(tenant_id: str) -> dict:
    from integrations.connections import find_active_connection_unsealed
    conn = find_active_connection_unsealed(tenant_id, CAP_READ) \
        or find_active_connection_unsealed(tenant_id, CAP_SEND)
    if conn is None:
        return {"connected": False, "state": "not_connected"}
    if conn.get("status") == "needs_reconnect":
        return {"connected": True, "state": "needs_reconnect"}
    has_page = bool(conn.get("page_id"))
    perm_ok = bool(conn.get("messaging_permission", True))
    token_ok = bool(conn.get("page_access_token") or conn.get("access_token"))
    can_send = has_page and perm_ok and token_ok and bool(conn.get("messaging_enabled", True))
    webhook = bool(conn.get("webhook_subscribed"))
    state = ("permission_missing" if not perm_ok
             else "no_facebook_page" if not has_page
             else "needs_reconnect" if not token_ok
             else "webhook_not_subscribed" if not webhook
             else "ready_for_replies" if can_send
             else "ready_for_inbound")
    return {
        "connected": True, "channel": CHANNEL, "page_id": conn.get("page_id", ""),
        "page_name": conn.get("page_name", ""), "can_send": can_send,
        "webhook_subscribed": webhook, "last_inbound_at": conn.get("last_inbound_at", ""),
        "last_send_at": conn.get("last_send_at", ""), "last_error": conn.get("last_error", ""),
        "state": state,
    }


def list_pages(tenant_id: str) -> list[dict]:
    conn = _conn(tenant_id)
    res = _active_transport().list_pages(common.token(conn))
    out = []
    for p in (res.get("data") or []):
        out.append({"page_id": p.get("id", ""), "page_name": p.get("name", ""),
                    "category": p.get("category", ""),
                    "messaging_capability": bool(p.get("messaging_capability", True)),
                    "has_token": bool(p.get("access_token"))})
    return out


def get_page(tenant_id: str, page_id: str) -> dict:
    conn = _conn(tenant_id)
    p = _active_transport().get_page(common.token(conn), page_id)
    return {"page_id": p.get("id", page_id), "page_name": p.get("name", ""),
            "category": p.get("category", "")}


def send_text(tenant_id: str, *, to: str, body: str, tag: str = "") -> dict:
    to = common.validate_recipient(to)
    if len(body.encode("utf-8")) > common.max_message_bytes():
        raise MetaMessagingError("message_too_large")
    conn = _conn(tenant_id, need_send=True)
    payload = {"recipient": {"id": to}, "message": {"text": body},
               "messaging_type": "MESSAGE_TAG" if tag else "RESPONSE"}
    if tag:
        payload["tag"] = validate_tag(tag)
    return _do_send(conn, payload)


def send_attachment(tenant_id: str, *, to: str, attachment_type: str, url: str) -> dict:
    to = common.validate_recipient(to)
    if attachment_type not in _ALLOWED_ATTACHMENT_TYPES:
        raise MetaMessagingError("unsupported_media")
    conn = _conn(tenant_id, need_send=True)
    payload = {"recipient": {"id": to},
               "message": {"attachment": {"type": attachment_type, "payload": {"url": url, "is_reusable": False}}}}
    return _do_send(conn, payload)


def send_quick_replies(tenant_id: str, *, to: str, text: str, quick_replies: list) -> dict:
    to = common.validate_recipient(to)
    conn = _conn(tenant_id, need_send=True)
    if not quick_replies or len(quick_replies) > _MAX_QUICK_REPLIES:
        raise MetaMessagingError("unsupported_action", "invalid quick-reply count")
    qrs = []
    for qr in quick_replies:
        title = str(qr.get("title", ""))[:20]
        payload_id = str(qr.get("payload", ""))
        if not title or not payload_id:
            raise MetaMessagingError("unsupported_action", "quick reply needs title and payload id")
        qrs.append({"content_type": "text", "title": title, "payload": payload_id})
    payload = {"recipient": {"id": to}, "messaging_type": "RESPONSE",
               "message": {"text": text[:2000], "quick_replies": qrs}}
    return _do_send(conn, payload)


def send_buttons(tenant_id: str, *, to: str, text: str, buttons: list) -> dict:
    to = common.validate_recipient(to)
    conn = _conn(tenant_id, need_send=True)
    if not buttons or len(buttons) > _MAX_BUTTONS:
        raise MetaMessagingError("unsupported_action", "invalid button count")
    btns = []
    for b in buttons:
        title = str(b.get("title", ""))[:20]
        payload_id = str(b.get("payload", ""))
        if not title or not payload_id:
            raise MetaMessagingError("unsupported_action", "button needs title and payload id")
        btns.append({"type": "postback", "title": title, "payload": payload_id})
    payload = {"recipient": {"id": to}, "messaging_type": "RESPONSE",
               "message": {"attachment": {"type": "template", "payload": {
                   "template_type": "button", "text": text[:640], "buttons": btns}}}}
    return _do_send(conn, payload)


def send_sender_action(tenant_id: str, *, to: str, action: str = "typing_on") -> dict:
    to = common.validate_recipient(to)
    if action not in ("typing_on", "typing_off", "mark_seen"):
        raise MetaMessagingError("unsupported_action")
    conn = _conn(tenant_id, need_send=True)
    return _active_transport().send_sender_action(common.token(conn), conn.get("page_id", ""), to, action)


def mark_seen(tenant_id: str, recipient_id: str) -> dict:
    return send_sender_action(tenant_id, to=recipient_id, action="mark_seen")


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
    return {"message_id": message_id, "provider_status": "unknown"}


def _do_send(conn: dict, payload: dict) -> dict:
    try:
        raw = _active_transport().send_message(common.token(conn), conn.get("page_id", ""), payload)
    except MetaMessagingError:
        raise
    except Exception as exc:  # pragma: no cover
        raise MetaMessagingError("provider_error", str(exc)[:80]) from exc
    out = common.normalise_send_result(raw)
    if not out["message_id"]:
        raise MetaMessagingError("unknown_result", "send returned no message id")
    return out


# ── built-in mock transport (hermetic default) ────────────────────────────────

class _MockMessengerTransport(MessengerTransport):
    def __init__(self):
        self.sends = 0

    def list_pages(self, token):
        return {"data": [{"id": "page_1", "name": "Acme Ltd", "category": "Local business",
                          "messaging_capability": True, "access_token": "pat_mock"}]}

    def get_page(self, token, page_id):
        return {"id": page_id, "name": "Acme Ltd", "category": "Local business"}

    def send_message(self, token, page_id, payload):
        self.sends += 1
        return {"message_id": f"mid.MOCK{self.sends}", "recipient_id": (payload.get("recipient") or {}).get("id", "")}

    def send_sender_action(self, token, page_id, recipient_id, action):
        return {"recipient_id": recipient_id}

    def get_media(self, token, media_id):
        return {"url": "https://lookaside.fbsbx.com/fb-mock", "mime_type": "image/png", "file_size": 4096}

    def download_media(self, token, url):
        return b"\x89PNGmockfb"
