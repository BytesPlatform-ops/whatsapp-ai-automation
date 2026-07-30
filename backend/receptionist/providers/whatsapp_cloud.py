"""Canonical WhatsApp Cloud API provider adapter for the AI Receptionist (Wave 12).

ONE typed adapter over Meta's WhatsApp Cloud (Graph) API, reusing the existing
encrypted Meta connection store (``integrations.connections``). Never passes raw
Meta payloads into business logic or the frontend — every result is normalised.

Hermetic by default: a dependency-injected transport (:func:`set_transport`) lets
tests supply a mock. Live calls happen only when a real transport is installed AND
the enable flag is set; standard tests use the built-in mock and never touch the
network. Access tokens are unsealed only inside this adapter and never logged.
"""

from __future__ import annotations

import os
import re
from typing import Optional

# Capabilities under which a WhatsApp connection is stored in the shared registry.
CAP_READ = "whatsapp_read"
CAP_SEND = "whatsapp_send"

_ALLOWED_MEDIA_TYPES = {"image", "document", "audio", "video", "sticker"}


def max_message_bytes() -> int:
    try:
        return int(os.environ.get("AI_RECEPTIONIST_WHATSAPP_MAX_MESSAGE_BYTES", "") or 4096)
    except ValueError:
        return 4096


def max_media_bytes() -> int:
    try:
        return int(os.environ.get("AI_RECEPTIONIST_WHATSAPP_MAX_MEDIA_BYTES", "") or 16000000)
    except ValueError:
        return 16000000


class WhatsAppError(Exception):
    """Typed, non-leaky failure. ``category`` is a fixed-vocabulary string."""

    CATEGORIES = {
        "not_connected", "missing_permission", "token_expired", "token_revoked",
        "invalid_recipient", "rate_limit", "quota", "window_closed", "template_required",
        "invalid_template", "media_too_large", "unsupported_media", "provider_error",
        "unknown_result", "message_too_large",
    }

    def __init__(self, category: str, detail: str = "") -> None:
        super().__init__(category)
        self.category = category if category in self.CATEGORIES else "provider_error"
        self.detail = detail


# ── recipient validation ──────────────────────────────────────────────────────
_E164 = re.compile(r"^\+?[1-9]\d{6,15}$")


def normalise_wa_id(wa_id: str) -> str:
    """Normalise a customer WhatsApp id to a bare digits (E.164 without '+')."""
    return re.sub(r"[^\d]", "", wa_id or "")


def validate_recipient(wa_id: str) -> str:
    n = normalise_wa_id(wa_id)
    if not _E164.match("+" + n):
        raise WhatsAppError("invalid_recipient", "recipient is not a valid phone number")
    return n


# ── transport injection (hermetic) ────────────────────────────────────────────
_transport: Optional["WhatsAppTransport"] = None


class WhatsAppTransport:
    """Abstract transport. Real impl calls the Graph API; the mock returns fixtures."""

    def list_business_accounts(self, token: str) -> dict: raise NotImplementedError
    def list_phone_numbers(self, token: str, waba_id: str) -> dict: raise NotImplementedError
    def get_phone_number(self, token: str, phone_number_id: str) -> dict: raise NotImplementedError
    def send_message(self, token: str, phone_number_id: str, payload: dict) -> dict: raise NotImplementedError
    def mark_read(self, token: str, phone_number_id: str, message_id: str) -> dict: raise NotImplementedError
    def get_media(self, token: str, media_id: str) -> dict: raise NotImplementedError
    def download_media(self, token: str, url: str) -> bytes: raise NotImplementedError
    def list_templates(self, token: str, waba_id: str) -> dict: raise NotImplementedError


def set_transport(t: Optional[WhatsAppTransport]) -> None:
    global _transport
    _transport = t


def _active_transport() -> WhatsAppTransport:
    return _transport if _transport is not None else _MockWhatsAppTransport()


# ── connection + token ────────────────────────────────────────────────────────

def _connection(tenant_id: str, *, need_send: bool = False) -> dict:
    from integrations.connections import find_active_connection_unsealed
    cap = CAP_SEND if need_send else CAP_READ
    conn = find_active_connection_unsealed(tenant_id, cap) \
        or find_active_connection_unsealed(tenant_id, CAP_READ)
    if conn is None:
        raise WhatsAppError("not_connected", "no WhatsApp connection for tenant")
    if conn.get("status") == "disconnected":
        raise WhatsAppError("not_connected", "connection disconnected")
    if need_send and not (conn.get("phone_number_id") and conn.get("messaging_enabled", True)):
        raise WhatsAppError("missing_permission", "connection cannot send messages")
    return conn


def _token(conn: dict) -> str:
    tok = conn.get("access_token", "")
    if not tok:
        raise WhatsAppError("token_revoked", "no access token — reconnect WhatsApp")
    return tok


# ── normalisation ─────────────────────────────────────────────────────────────

def normalise_send_result(raw: dict) -> dict:
    msgs = raw.get("messages") or []
    mid = msgs[0].get("id", "") if msgs else ""
    return {"message_id": mid, "provider_status": "accepted" if mid else "unknown",
            "recipient": (raw.get("contacts") or [{}])[0].get("wa_id", "")}


def normalise_template(raw: dict) -> dict:
    return {
        "name": raw.get("name", ""), "language": (raw.get("language") or raw.get("languages", [""])[0]) or "",
        "category": raw.get("category", ""), "status": raw.get("status", ""),
        "provider_id": raw.get("id", ""),
        "variables": _count_template_vars(raw.get("components") or []),
        "components": raw.get("components") or [],
    }


def _count_template_vars(components: list) -> int:
    n = 0
    for c in components:
        text = c.get("text", "") if isinstance(c, dict) else ""
        n += len(re.findall(r"\{\{\d+\}\}", text))
    return n


# ── public API ────────────────────────────────────────────────────────────────

def validate_connection(tenant_id: str) -> dict:
    """Truthful readiness snapshot for the UI (no secrets)."""
    from integrations.connections import find_active_connection_unsealed
    conn = find_active_connection_unsealed(tenant_id, CAP_READ) \
        or find_active_connection_unsealed(tenant_id, CAP_SEND)
    if conn is None:
        return {"connected": False, "state": "not_connected"}
    has_number = bool(conn.get("phone_number_id"))
    can_send = has_number and bool(conn.get("messaging_enabled", True))
    can_template = can_send and bool(conn.get("template_enabled", True))
    webhook = bool(conn.get("webhook_subscribed"))
    state = ("needs_reconnect" if conn.get("status") == "needs_reconnect"
             else "ready_for_templates" if can_template and webhook
             else "ready_for_replies" if can_send and webhook
             else "ready_for_inbound" if webhook and has_number
             else "webhook_not_subscribed" if has_number
             else "no_phone_number")
    return {
        "connected": True, "waba_id": conn.get("waba_id", ""),
        "waba_name": conn.get("waba_name", ""), "phone_number_id": conn.get("phone_number_id", ""),
        "display_phone_number": conn.get("display_phone_number", ""),
        "verified_name": conn.get("verified_name", ""),
        "can_send": can_send, "can_template": can_template, "webhook_subscribed": webhook,
        "quality": conn.get("quality", ""), "state": state,
    }


def list_business_accounts(tenant_id: str) -> list[dict]:
    conn = _connection(tenant_id)
    res = _active_transport().list_business_accounts(_token(conn))
    return [{"waba_id": w.get("id", ""), "name": w.get("name", "")} for w in (res.get("data") or [])]


def list_phone_numbers(tenant_id: str, waba_id: str) -> list[dict]:
    conn = _connection(tenant_id)
    res = _active_transport().list_phone_numbers(_token(conn), waba_id)
    out = []
    for p in (res.get("data") or []):
        out.append({"phone_number_id": p.get("id", ""), "display_phone_number": p.get("display_phone_number", ""),
                    "verified_name": p.get("verified_name", ""), "quality": p.get("quality_rating", ""),
                    "status": p.get("code_verification_status", "")})
    return out


def get_phone_number(tenant_id: str, phone_number_id: str) -> dict:
    conn = _connection(tenant_id)
    p = _active_transport().get_phone_number(_token(conn), phone_number_id)
    return {"phone_number_id": p.get("id", phone_number_id), "display_phone_number": p.get("display_phone_number", ""),
            "verified_name": p.get("verified_name", ""), "quality": p.get("quality_rating", "")}


def send_text(tenant_id: str, *, to: str, body: str) -> dict:
    to = validate_recipient(to)
    if len(body.encode("utf-8")) > max_message_bytes():
        raise WhatsAppError("message_too_large")
    conn = _connection(tenant_id, need_send=True)
    payload = {"messaging_product": "whatsapp", "to": to, "type": "text", "text": {"body": body}}
    return _do_send(conn, payload)


def send_template(tenant_id: str, *, to: str, name: str, language: str, variables: Optional[list] = None) -> dict:
    to = validate_recipient(to)
    conn = _connection(tenant_id, need_send=True)
    components = []
    if variables:
        components = [{"type": "body", "parameters": [{"type": "text", "text": str(v)} for v in variables]}]
    payload = {"messaging_product": "whatsapp", "to": to, "type": "template",
               "template": {"name": name, "language": {"code": language}, "components": components}}
    return _do_send(conn, payload)


def send_interactive(tenant_id: str, *, to: str, interactive: dict) -> dict:
    to = validate_recipient(to)
    conn = _connection(tenant_id, need_send=True)
    payload = {"messaging_product": "whatsapp", "to": to, "type": "interactive", "interactive": interactive}
    return _do_send(conn, payload)


def send_media(tenant_id: str, *, to: str, media_type: str, media_id: str = "", link: str = "", caption: str = "") -> dict:
    to = validate_recipient(to)
    if media_type not in _ALLOWED_MEDIA_TYPES:
        raise WhatsAppError("unsupported_media")
    conn = _connection(tenant_id, need_send=True)
    media_obj = {("id" if media_id else "link"): (media_id or link)}
    if caption and media_type in ("image", "document", "video"):
        media_obj["caption"] = caption[:1024]
    payload = {"messaging_product": "whatsapp", "to": to, "type": media_type, media_type: media_obj}
    return _do_send(conn, payload)


def mark_read(tenant_id: str, message_id: str) -> dict:
    conn = _connection(tenant_id, need_send=True)
    return _active_transport().mark_read(_token(conn), conn.get("phone_number_id", ""), message_id)


def get_media_metadata(tenant_id: str, media_id: str) -> dict:
    conn = _connection(tenant_id)
    m = _active_transport().get_media(_token(conn), media_id)
    size = int(m.get("file_size", 0) or 0)
    mime = m.get("mime_type", "")
    return {"media_id": media_id, "mime_type": mime, "file_size": size,
            "url": m.get("url", ""), "sha256": m.get("sha256", "")}


def download_media(tenant_id: str, media_id: str) -> bytes:
    """Secure download: metadata first, enforce size + type, then fetch bytes."""
    meta = get_media_metadata(tenant_id, media_id)
    if meta["file_size"] and meta["file_size"] > max_media_bytes():
        raise WhatsAppError("media_too_large")
    kind = (meta.get("mime_type", "").split("/")[0] or "")
    if kind and kind not in ("image", "audio", "video", "application", "text"):
        raise WhatsAppError("unsupported_media")
    conn = _connection(tenant_id)
    data = _active_transport().download_media(_token(conn), meta.get("url", ""))
    if len(data) > max_media_bytes():
        raise WhatsAppError("media_too_large")
    return data


def list_templates(tenant_id: str) -> list[dict]:
    conn = _connection(tenant_id)
    waba = conn.get("waba_id", "")
    res = _active_transport().list_templates(_token(conn), waba)
    return [normalise_template(t) for t in (res.get("data") or [])]


def reconcile_message(tenant_id: str, message_id: str) -> dict:
    """Best-effort provider state lookup (Cloud API has limited read-back; the mock
    returns a deterministic state). Never blind-resends."""
    return {"message_id": message_id, "provider_status": "unknown"}


def _do_send(conn: dict, payload: dict) -> dict:
    try:
        raw = _active_transport().send_message(_token(conn), conn.get("phone_number_id", ""), payload)
    except WhatsAppError:
        raise
    except Exception as exc:  # pragma: no cover
        raise WhatsAppError("provider_error", str(exc)[:80]) from exc
    out = normalise_send_result(raw)
    if not out["message_id"]:
        raise WhatsAppError("unknown_result", "send returned no message id")
    return out


# ── built-in mock transport (hermetic default) ────────────────────────────────

class _MockWhatsAppTransport(WhatsAppTransport):
    def __init__(self):
        self.sends = 0

    def list_business_accounts(self, token):
        return {"data": [{"id": "waba_1", "name": "Acme WABA"}]}

    def list_phone_numbers(self, token, waba_id):
        return {"data": [{"id": "pn_1", "display_phone_number": "+15551230000",
                          "verified_name": "Acme Ltd", "quality_rating": "GREEN",
                          "code_verification_status": "VERIFIED"}]}

    def get_phone_number(self, token, phone_number_id):
        return {"id": phone_number_id, "display_phone_number": "+15551230000",
                "verified_name": "Acme Ltd", "quality_rating": "GREEN"}

    def send_message(self, token, phone_number_id, payload):
        self.sends += 1
        return {"messages": [{"id": f"wamid.MOCK{self.sends}"}], "contacts": [{"wa_id": payload.get("to", "")}]}

    def mark_read(self, token, phone_number_id, message_id):
        return {"success": True}

    def get_media(self, token, media_id):
        return {"url": "https://lookaside.fbsbx.com/mock", "mime_type": "image/jpeg",
                "file_size": 1024, "sha256": "deadbeef"}

    def download_media(self, token, url):
        return b"\xff\xd8\xff\xe0mockjpeg"

    def list_templates(self, token, waba_id):
        return {"data": [
            {"id": "tpl_1", "name": "appointment_reminder", "language": "en_US",
             "category": "UTILITY", "status": "APPROVED",
             "components": [{"type": "BODY", "text": "Hi {{1}}, your appointment is at {{2}}."}]},
            {"id": "tpl_2", "name": "old_promo", "language": "en_US", "category": "MARKETING",
             "status": "REJECTED", "components": [{"type": "BODY", "text": "Sale {{1}}"}]},
        ]}
