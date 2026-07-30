"""Generic SMS provider adapter for the AI Receptionist.

ONE typed, replaceable adapter over an SMS provider (Twilio is the initial
implementation). The canonical engine never sees Twilio-specific payloads — every
result is normalised. Reuses the existing encrypted connection store (capabilities
``sms_read``/``sms_send``). Hermetic by default: a dependency-injected transport
(:func:`set_transport`) supplies a mock; live calls happen only with a real
transport installed AND the enable flag set. Credentials are unsealed only inside
this adapter and never logged.

Swapping providers = a new SMSTransport implementation; nothing above this module
changes.
"""

from __future__ import annotations

import os
import re
from typing import Optional

CAP_READ = "sms_read"
CAP_SEND = "sms_send"
PROVIDER = "twilio"

_ALLOWED_MEDIA_TYPES = {"image", "video", "audio", "application", "text"}


def max_message_chars() -> int:
    try:
        return int(os.environ.get("AI_RECEPTIONIST_SMS_MAX_MESSAGE_CHARS", "") or 1600)
    except ValueError:
        return 1600


def max_mms_bytes() -> int:
    try:
        return int(os.environ.get("AI_RECEPTIONIST_SMS_MAX_MMS_BYTES", "") or 5000000)
    except ValueError:
        return 5000000


class SMSError(Exception):
    """Typed, non-leaky failure. ``category`` is a fixed-vocabulary string."""

    CATEGORIES = {
        "not_connected", "missing_permission", "credentials_invalid", "invalid_recipient",
        "rate_limit", "quota", "media_too_large", "unsupported_media", "provider_error",
        "unknown_result", "message_too_large",
    }

    def __init__(self, category: str, detail: str = "") -> None:
        super().__init__(category)
        self.category = category if category in self.CATEGORIES else "provider_error"
        self.detail = detail


_E164 = re.compile(r"^\+[1-9]\d{6,15}$")


def normalise_e164(number: str) -> str:
    n = re.sub(r"[^\d+]", "", number or "")
    if n and not n.startswith("+"):
        n = "+" + n
    return n


def validate_recipient(number: str) -> str:
    n = normalise_e164(number)
    if not _E164.match(n):
        raise SMSError("invalid_recipient", "recipient is not a valid E.164 number")
    return n


# ── transport injection (hermetic) ────────────────────────────────────────────
_transport: Optional["SMSTransport"] = None


class SMSTransport:
    """Abstract transport. Real impl calls the provider API; the mock returns fixtures."""

    def list_numbers(self, creds: dict) -> dict: raise NotImplementedError
    def get_number(self, creds: dict, number: str) -> dict: raise NotImplementedError
    def send_message(self, creds: dict, payload: dict) -> dict: raise NotImplementedError
    def get_message_status(self, creds: dict, message_id: str) -> dict: raise NotImplementedError
    def download_media(self, creds: dict, url: str) -> bytes: raise NotImplementedError


def set_transport(t: Optional["SMSTransport"]) -> None:
    global _transport
    _transport = t


def _active_transport() -> "SMSTransport":
    return _transport if _transport is not None else _MockSMSTransport()


# ── connection + credentials ──────────────────────────────────────────────────

def _connection(tenant_id: str, *, need_send: bool = False) -> dict:
    from integrations.connections import find_active_connection_unsealed
    cap = CAP_SEND if need_send else CAP_READ
    conn = find_active_connection_unsealed(tenant_id, cap) \
        or find_active_connection_unsealed(tenant_id, CAP_READ)
    if conn is None:
        raise SMSError("not_connected", "no SMS connection for tenant")
    if conn.get("status") == "disconnected":
        raise SMSError("not_connected", "connection disconnected")
    if conn.get("status") == "needs_reconnect":
        raise SMSError("credentials_invalid", "connection needs reconnect")
    if need_send and not (conn.get("sender_number") and conn.get("messaging_enabled", True)):
        raise SMSError("missing_permission", "connection cannot send messages")
    return conn


def _creds(conn: dict) -> dict:
    sid = conn.get("account_sid", "")
    tok = conn.get("auth_token", "")
    if not (sid and tok):
        raise SMSError("credentials_invalid", "no credentials — reconnect SMS")
    return {"account_sid": sid, "auth_token": tok, "sender_number": conn.get("sender_number", "")}


# ── normalisation ─────────────────────────────────────────────────────────────

def normalise_send_result(raw: dict) -> dict:
    mid = raw.get("sid") or raw.get("message_id") or ""
    return {"message_id": mid, "provider_status": raw.get("status", "accepted") if mid else "unknown",
            "segments": int(raw.get("num_segments", 0) or 0), "recipient": raw.get("to", "")}


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
    creds_ok = bool(conn.get("account_sid") and conn.get("auth_token"))
    has_number = bool(conn.get("sender_number"))
    sms_cap = has_number and bool(conn.get("sms_capable", True))
    can_send = creds_ok and sms_cap and bool(conn.get("messaging_enabled", True))
    inbound_wh = bool(conn.get("inbound_webhook_subscribed"))
    delivery_wh = bool(conn.get("delivery_webhook_subscribed"))
    state = ("credentials_invalid" if not creds_ok
             else "no_numbers" if not has_number
             else "number_not_sms_capable" if not sms_cap
             else "inbound_webhook_missing" if not inbound_wh
             else "delivery_webhook_missing" if not delivery_wh
             else "ready_to_send" if can_send
             else "ready_for_inbound")
    return {
        "connected": True, "provider": conn.get("provider", PROVIDER),
        "sender_number": conn.get("sender_number", ""), "country": conn.get("country", ""),
        "sms_capable": sms_cap, "mms_capable": bool(conn.get("mms_capable", False)),
        "can_send": can_send, "inbound_webhook_subscribed": inbound_wh,
        "delivery_webhook_subscribed": delivery_wh, "last_inbound_at": conn.get("last_inbound_at", ""),
        "last_send_at": conn.get("last_send_at", ""), "last_error": conn.get("last_error", ""),
        "state": state,
    }


def list_numbers(tenant_id: str) -> list[dict]:
    conn = _connection(tenant_id)
    res = _active_transport().list_numbers(_creds(conn))
    out = []
    for n in (res.get("incoming_phone_numbers") or res.get("data") or []):
        caps = n.get("capabilities") or {}
        out.append({"sender_number": n.get("phone_number", ""), "friendly_name": n.get("friendly_name", ""),
                    "country": n.get("iso_country", ""), "sms_capable": bool(caps.get("sms", True)),
                    "mms_capable": bool(caps.get("mms", False))})
    return out


def get_number(tenant_id: str, number: str) -> dict:
    conn = _connection(tenant_id)
    n = _active_transport().get_number(_creds(conn), number)
    caps = n.get("capabilities") or {}
    return {"sender_number": n.get("phone_number", number), "country": n.get("iso_country", ""),
            "sms_capable": bool(caps.get("sms", True)), "mms_capable": bool(caps.get("mms", False))}


def send_sms(tenant_id: str, *, to: str, body: str, status_callback: str = "") -> dict:
    to = validate_recipient(to)
    if len(body) > max_message_chars():
        raise SMSError("message_too_large")
    conn = _connection(tenant_id, need_send=True)
    creds = _creds(conn)
    payload = {"From": creds["sender_number"], "To": to, "Body": body}
    if status_callback:
        payload["StatusCallback"] = status_callback
    return _do_send(creds, payload)


def send_mms(tenant_id: str, *, to: str, body: str, media_urls: list) -> dict:
    to = validate_recipient(to)
    conn = _connection(tenant_id, need_send=True)
    if not conn.get("mms_capable", False):
        raise SMSError("unsupported_media", "sender number is not MMS-capable")
    creds = _creds(conn)
    payload = {"From": creds["sender_number"], "To": to, "Body": body, "MediaUrl": media_urls}
    return _do_send(creds, payload)


def get_message_status(tenant_id: str, message_id: str) -> dict:
    conn = _connection(tenant_id)
    s = _active_transport().get_message_status(_creds(conn), message_id)
    return {"message_id": message_id, "status": s.get("status", "unknown"),
            "error_code": s.get("error_code", ""), "segments": int(s.get("num_segments", 0) or 0)}


def get_media_metadata(tenant_id: str, media_url: str, content_type: str = "") -> dict:
    kind = (content_type.split("/")[0] or "") if content_type else ""
    return {"media_url": media_url, "content_type": content_type, "kind": kind}


def download_media(tenant_id: str, media_url: str, content_type: str = "") -> bytes:
    kind = (content_type.split("/")[0] or "")
    if kind and kind not in _ALLOWED_MEDIA_TYPES:
        raise SMSError("unsupported_media")
    conn = _connection(tenant_id)
    data = _active_transport().download_media(_creds(conn), media_url)
    if len(data) > max_mms_bytes():
        raise SMSError("media_too_large")
    return data


def reconcile_message(tenant_id: str, message_id: str) -> dict:
    try:
        return get_message_status(tenant_id, message_id)
    except SMSError as exc:
        return {"message_id": message_id, "status": "unknown", "error_code": exc.category}


def health_check(tenant_id: str) -> dict:
    return validate_connection(tenant_id)


def _do_send(creds: dict, payload: dict) -> dict:
    try:
        raw = _active_transport().send_message(creds, payload)
    except SMSError:
        raise
    except Exception as exc:  # pragma: no cover
        raise SMSError("provider_error", str(exc)[:80]) from exc
    out = normalise_send_result(raw)
    if not out["message_id"]:
        raise SMSError("unknown_result", "send returned no message id")
    return out


# ── built-in mock transport (hermetic default) ────────────────────────────────

class _MockSMSTransport(SMSTransport):
    def __init__(self):
        self.sends = 0

    def list_numbers(self, creds):
        return {"incoming_phone_numbers": [
            {"phone_number": "+15550001111", "friendly_name": "Pixie Main", "iso_country": "US",
             "capabilities": {"sms": True, "mms": True}}]}

    def get_number(self, creds, number):
        return {"phone_number": number, "iso_country": "US", "capabilities": {"sms": True, "mms": True}}

    def send_message(self, creds, payload):
        self.sends += 1
        return {"sid": f"SM_MOCK{self.sends}", "status": "queued",
                "num_segments": 1, "to": payload.get("To", "")}

    def get_message_status(self, creds, message_id):
        return {"status": "delivered", "num_segments": 1}

    def download_media(self, creds, url):
        return b"\xff\xd8\xff\xe0mocksms"
