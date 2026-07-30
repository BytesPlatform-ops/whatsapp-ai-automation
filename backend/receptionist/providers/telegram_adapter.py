"""Telegram provider adapter for the AI Receptionist (Bot + Business).

ONE typed, replaceable adapter over the official Telegram Bot API, covering both
standard Bot conversations and Telegram Business connected-bot conversations behind
a single shared domain. The canonical engine never sees raw Telegram payloads —
every result is normalised. Reuses the existing encrypted connection store
(capabilities ``telegram_read``/``telegram_send``); the bot token is unsealed only
inside this adapter and never logged. Hermetic by default via :func:`set_transport`.

Standard vs Business mode is a stored flag + a business_connection_id on sends, not
a second adapter.
"""

from __future__ import annotations

import os
from typing import Optional

CAP_READ = "telegram_read"
CAP_SEND = "telegram_send"
PROVIDER = "telegram"

_ALLOWED_MEDIA_TYPES = {"photo", "document", "audio", "voice", "video", "sticker", "animation"}


def max_message_bytes() -> int:
    try:
        return int(os.environ.get("AI_RECEPTIONIST_TELEGRAM_MAX_MESSAGE_BYTES", "") or 4096)
    except ValueError:
        return 4096


def max_media_bytes() -> int:
    try:
        return int(os.environ.get("AI_RECEPTIONIST_TELEGRAM_MAX_MEDIA_BYTES", "") or 20000000)
    except ValueError:
        return 20000000


class TelegramError(Exception):
    """Typed, non-leaky failure. ``category`` is a fixed-vocabulary string."""

    CATEGORIES = {
        "not_connected", "invalid_token", "missing_permission", "business_rights_missing",
        "business_paused", "forbidden_chat", "chat_not_found", "rate_limit", "quota",
        "media_too_large", "unsupported_media", "unsupported_action", "provider_error",
        "unknown_result", "message_too_large",
    }

    def __init__(self, category: str, detail: str = "") -> None:
        super().__init__(category)
        self.category = category if category in self.CATEGORIES else "provider_error"
        self.detail = detail


# ── transport injection (hermetic) ────────────────────────────────────────────
_transport: Optional["TelegramTransport"] = None


class TelegramTransport:
    """Abstract transport. Real impl calls the Bot API; the mock returns fixtures."""

    def get_me(self, token: str) -> dict: raise NotImplementedError
    def set_webhook(self, token: str, url: str, secret: str, allowed_updates: list) -> dict: raise NotImplementedError
    def get_webhook_info(self, token: str) -> dict: raise NotImplementedError
    def delete_webhook(self, token: str) -> dict: raise NotImplementedError
    def send_message(self, token: str, payload: dict) -> dict: raise NotImplementedError
    def edit_message(self, token: str, payload: dict) -> dict: raise NotImplementedError
    def delete_message(self, token: str, chat_id: str, message_id: str) -> dict: raise NotImplementedError
    def answer_callback_query(self, token: str, callback_query_id: str, text: str) -> dict: raise NotImplementedError
    def send_chat_action(self, token: str, chat_id: str, action: str) -> dict: raise NotImplementedError
    def send_media(self, token: str, method: str, payload: dict) -> dict: raise NotImplementedError
    def get_file(self, token: str, file_id: str) -> dict: raise NotImplementedError
    def download_file(self, token: str, file_path: str) -> bytes: raise NotImplementedError
    def get_business_connection(self, token: str, business_connection_id: str) -> dict: raise NotImplementedError


def set_transport(t: Optional["TelegramTransport"]) -> None:
    global _transport
    _transport = t


def _active_transport() -> "TelegramTransport":
    return _transport if _transport is not None else _MockTelegramTransport()


# ── connection + token ────────────────────────────────────────────────────────

def _connection(tenant_id: str, *, need_send: bool = False, business: bool = False) -> dict:
    from integrations.connections import find_active_connection_unsealed
    cap = CAP_SEND if need_send else CAP_READ
    conn = find_active_connection_unsealed(tenant_id, cap) \
        or find_active_connection_unsealed(tenant_id, CAP_READ)
    if conn is None:
        raise TelegramError("not_connected", "no telegram connection for tenant")
    if conn.get("status") == "disconnected":
        raise TelegramError("not_connected", "connection disconnected")
    if need_send and not conn.get("messaging_enabled", True):
        raise TelegramError("missing_permission", "connection cannot send messages")
    if business:
        if not conn.get("business_enabled"):
            raise TelegramError("missing_permission", "business mode not enabled")
        if conn.get("business_paused"):
            raise TelegramError("business_paused", "business connection paused")
        if not conn.get("business_can_reply", True):
            raise TelegramError("business_rights_missing", "business connection cannot reply")
    return conn


def _token(conn: dict) -> str:
    tok = conn.get("bot_token", "")
    if not tok:
        raise TelegramError("invalid_token", "no bot token — reconnect Telegram")
    return tok


# ── normalisation ─────────────────────────────────────────────────────────────

def normalise_send_result(raw: dict, *, mode: str = "bot") -> dict:
    result = raw.get("result") or raw
    mid = str(result.get("message_id", "")) if result.get("message_id") is not None else ""
    return {"message_id": mid, "provider_status": "provider_confirmed" if mid else "unknown",
            "mode": mode, "chat_id": str((result.get("chat") or {}).get("id", ""))}


# ── public API ────────────────────────────────────────────────────────────────

def validate_connection(tenant_id: str) -> dict:
    """Truthful readiness snapshot for the UI (no secrets)."""
    from integrations.connections import find_active_connection_unsealed
    conn = find_active_connection_unsealed(tenant_id, CAP_READ) \
        or find_active_connection_unsealed(tenant_id, CAP_SEND)
    if conn is None:
        return {"connected": False, "state": "not_connected", "business": {"state": "not_connected"}}
    if conn.get("status") == "needs_reconnect":
        return {"connected": True, "state": "needs_reconnect", "business": {"state": "needs_reconnect"}}
    token_ok = bool(conn.get("bot_token"))
    verified = bool(conn.get("bot_id"))
    webhook = bool(conn.get("webhook_subscribed"))
    std_enabled = bool(conn.get("standard_enabled", True))
    bot_state = ("invalid_token" if not token_ok
                 else "bot_identity_unverified" if not verified
                 else "webhook_missing" if not webhook
                 else "webhook_unhealthy" if conn.get("webhook_unhealthy")
                 else "standard_bot_ready" if std_enabled
                 else "needs_reconnect")
    # business
    if not conn.get("business_enabled"):
        biz_state = "business_mode_unavailable"
    elif not conn.get("business_connection_id"):
        biz_state = "business_connection_missing"
    elif not conn.get("business_can_reply", True):
        biz_state = "business_connection_permission_missing"
    elif conn.get("business_paused"):
        biz_state = "business_connection_paused"
    else:
        biz_state = "ready_for_business_messages"
    return {
        "connected": True, "provider": PROVIDER, "bot_id": conn.get("bot_id", ""),
        "bot_username": conn.get("bot_username", ""), "standard_enabled": std_enabled,
        "business_enabled": bool(conn.get("business_enabled")),
        "webhook_subscribed": webhook, "allowed_updates": conn.get("allowed_updates", []),
        "last_inbound_at": conn.get("last_inbound_at", ""), "last_send_at": conn.get("last_send_at", ""),
        "last_error": conn.get("last_error", ""), "state": bot_state,
        "business": {
            "state": biz_state, "business_connection_id": conn.get("business_connection_id", ""),
            "business_user_id": conn.get("business_user_id", ""),
            "can_reply": bool(conn.get("business_can_reply", True)),
            "paused": bool(conn.get("business_paused")),
            "last_inbound_at": conn.get("business_last_inbound_at", ""),
            "last_send_at": conn.get("business_last_send_at", ""),
        },
    }


def validate_bot(tenant_id: str) -> dict:
    conn = _connection(tenant_id)
    me = _active_transport().get_me(_token(conn)).get("result", {})
    return {"bot_id": str(me.get("id", "")), "bot_username": me.get("username", ""),
            "first_name": me.get("first_name", ""), "can_join_groups": me.get("can_join_groups", False)}


def get_bot_profile(tenant_id: str) -> dict:
    return validate_bot(tenant_id)


def configure_webhook(tenant_id: str, *, url: str, secret: str, allowed_updates: Optional[list] = None) -> dict:
    conn = _connection(tenant_id)
    res = _active_transport().set_webhook(_token(conn), url, secret, allowed_updates or [])
    return {"ok": bool(res.get("ok", res.get("result", False)))}


def get_webhook_info(tenant_id: str) -> dict:
    conn = _connection(tenant_id)
    info = _active_transport().get_webhook_info(_token(conn)).get("result", {})
    return {"url_set": bool(info.get("url")), "pending_update_count": info.get("pending_update_count", 0),
            "last_error_message": info.get("last_error_message", ""),
            "allowed_updates": info.get("allowed_updates", [])}


def remove_webhook(tenant_id: str) -> dict:
    conn = _connection(tenant_id)
    res = _active_transport().delete_webhook(_token(conn))
    return {"ok": bool(res.get("ok", res.get("result", False)))}


def get_business_connection(tenant_id: str, business_connection_id: str) -> dict:
    conn = _connection(tenant_id)
    bc = _active_transport().get_business_connection(_token(conn), business_connection_id).get("result", {})
    rights = bc.get("rights") or {}
    return {"business_connection_id": bc.get("id", business_connection_id),
            "user_id": str((bc.get("user") or {}).get("id", "")), "is_enabled": bool(bc.get("is_enabled", True)),
            "can_reply": bool(rights.get("can_reply", bc.get("can_reply", True)))}


def _text_payload(chat_id: str, text: str, *, reply_to: str = "", reply_markup: Optional[dict] = None,
                  business_connection_id: str = "") -> dict:
    payload = {"chat_id": chat_id, "text": text}
    if reply_to:
        payload["reply_to_message_id"] = reply_to
    if reply_markup:
        payload["reply_markup"] = reply_markup
    if business_connection_id:
        payload["business_connection_id"] = business_connection_id
    return payload


def send_message(tenant_id: str, *, chat_id: str, text: str, reply_to: str = "",
                 reply_markup: Optional[dict] = None) -> dict:
    if len(text.encode("utf-8")) > max_message_bytes():
        raise TelegramError("message_too_large")
    conn = _connection(tenant_id, need_send=True)
    payload = _text_payload(chat_id, text, reply_to=reply_to, reply_markup=reply_markup)
    return _do("send_message", conn, payload, mode="bot")


def send_business_message(tenant_id: str, *, chat_id: str, text: str, business_connection_id: str,
                          reply_to: str = "", reply_markup: Optional[dict] = None) -> dict:
    if len(text.encode("utf-8")) > max_message_bytes():
        raise TelegramError("message_too_large")
    conn = _connection(tenant_id, need_send=True, business=True)
    bcid = business_connection_id or conn.get("business_connection_id", "")
    payload = _text_payload(chat_id, text, reply_to=reply_to, reply_markup=reply_markup, business_connection_id=bcid)
    return _do("send_message", conn, payload, mode="business")


def edit_message(tenant_id: str, *, chat_id: str, message_id: str, text: str,
                 business_connection_id: str = "") -> dict:
    conn = _connection(tenant_id, need_send=True, business=bool(business_connection_id))
    payload = {"chat_id": chat_id, "message_id": message_id, "text": text}
    if business_connection_id:
        payload["business_connection_id"] = business_connection_id
    raw = _active_transport().edit_message(_token(conn), payload)
    return normalise_send_result(raw, mode="business" if business_connection_id else "bot")


def delete_message(tenant_id: str, *, chat_id: str, message_id: str) -> dict:
    conn = _connection(tenant_id, need_send=True)
    res = _active_transport().delete_message(_token(conn), chat_id, message_id)
    return {"ok": bool(res.get("ok", res.get("result", False)))}


def answer_callback_query(tenant_id: str, *, callback_query_id: str, text: str = "") -> dict:
    conn = _connection(tenant_id, need_send=True)
    res = _active_transport().answer_callback_query(_token(conn), callback_query_id, text)
    return {"ok": bool(res.get("ok", res.get("result", False)))}


def send_chat_action(tenant_id: str, *, chat_id: str, action: str = "typing") -> dict:
    conn = _connection(tenant_id, need_send=True)
    return _active_transport().send_chat_action(_token(conn), chat_id, action)


def send_media(tenant_id: str, *, chat_id: str, media_type: str, file_ref: str, caption: str = "",
               business_connection_id: str = "") -> dict:
    if media_type not in _ALLOWED_MEDIA_TYPES:
        raise TelegramError("unsupported_media")
    conn = _connection(tenant_id, need_send=True, business=bool(business_connection_id))
    method = {"photo": "send_photo", "document": "send_document", "audio": "send_audio",
              "voice": "send_voice", "video": "send_video"}.get(media_type, "send_document")
    payload = {"chat_id": chat_id, media_type: file_ref}
    if caption:
        payload["caption"] = caption[:1024]
    if business_connection_id:
        payload["business_connection_id"] = business_connection_id
    raw = _active_transport().send_media(_token(conn), method, payload)
    return normalise_send_result(raw, mode="business" if business_connection_id else "bot")


def get_file_metadata(tenant_id: str, file_id: str) -> dict:
    conn = _connection(tenant_id)
    f = _active_transport().get_file(_token(conn), file_id).get("result", {})
    return {"file_id": file_id, "file_unique_id": f.get("file_unique_id", ""),
            "file_path": f.get("file_path", ""), "file_size": int(f.get("file_size", 0) or 0)}


def download_file(tenant_id: str, file_id: str) -> bytes:
    meta = get_file_metadata(tenant_id, file_id)
    if meta["file_size"] and meta["file_size"] > max_media_bytes():
        raise TelegramError("media_too_large")
    conn = _connection(tenant_id)
    data = _active_transport().download_file(_token(conn), meta.get("file_path", ""))
    if len(data) > max_media_bytes():
        raise TelegramError("media_too_large")
    return data


def reconcile_message(tenant_id: str, message_id: str) -> dict:
    """Telegram has no delivery/read read-back; a confirmed send stays confirmed."""
    return {"message_id": message_id, "provider_status": "unknown"}


def health_check(tenant_id: str) -> dict:
    return validate_connection(tenant_id)


def _do(method: str, conn: dict, payload: dict, *, mode: str) -> dict:
    try:
        raw = _active_transport().send_message(_token(conn), payload)
    except TelegramError:
        raise
    except Exception as exc:  # pragma: no cover
        raise TelegramError("provider_error", str(exc)[:80]) from exc
    out = normalise_send_result(raw, mode=mode)
    if not out["message_id"]:
        raise TelegramError("unknown_result", "send returned no message id")
    return out


# ── built-in mock transport (hermetic default) ────────────────────────────────

class _MockTelegramTransport(TelegramTransport):
    def __init__(self):
        self.sends = 0

    def get_me(self, token):
        return {"ok": True, "result": {"id": 987654321, "username": "acme_pixie_bot",
                                       "first_name": "Acme", "can_join_groups": False}}

    def set_webhook(self, token, url, secret, allowed_updates): return {"ok": True, "result": True}
    def get_webhook_info(self, token):
        return {"ok": True, "result": {"url": "https://pixie/telegram", "pending_update_count": 0,
                                       "allowed_updates": ["message", "callback_query", "business_message"]}}
    def delete_webhook(self, token): return {"ok": True, "result": True}

    def send_message(self, token, payload):
        self.sends += 1
        return {"ok": True, "result": {"message_id": 1000 + self.sends,
                                       "chat": {"id": payload.get("chat_id", "")}}}

    def edit_message(self, token, payload):
        return {"ok": True, "result": {"message_id": payload.get("message_id", ""),
                                       "chat": {"id": payload.get("chat_id", "")}}}

    def delete_message(self, token, chat_id, message_id): return {"ok": True, "result": True}
    def answer_callback_query(self, token, callback_query_id, text): return {"ok": True, "result": True}
    def send_chat_action(self, token, chat_id, action): return {"ok": True, "result": True}
    def send_media(self, token, method, payload):
        self.sends += 1
        return {"ok": True, "result": {"message_id": 2000 + self.sends, "chat": {"id": payload.get("chat_id", "")}}}
    def get_file(self, token, file_id):
        return {"ok": True, "result": {"file_id": file_id, "file_unique_id": "uniq",
                                       "file_path": "photos/mock.jpg", "file_size": 1024}}
    def download_file(self, token, file_path): return b"\xff\xd8\xff\xe0mocktg"
    def get_business_connection(self, token, business_connection_id):
        return {"ok": True, "result": {"id": business_connection_id, "user": {"id": 555},
                                       "is_enabled": True, "rights": {"can_reply": True}}}
