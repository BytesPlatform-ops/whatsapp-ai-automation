"""Voice/telephony provider adapter for the AI Receptionist (Vapi-initial).

ONE typed, replaceable adapter over a real-time voice-orchestration provider. Vapi
is the initial implementation; Vapi-specific payloads stay inside this module and
every result is normalised. The canonical Pixie engine is never bound to Vapi
schemas — Vapi handles transport/telephony/ASR/TTS/turn-taking only; all business
side effects go through the canonical action registry.

Reuses the existing encrypted connection store (capabilities ``voice_read``/
``voice_send``). The Vapi private API key is unsealed only inside this adapter and
never logged. The server-callback secret is stored SEPARATELY from the API key.
Hermetic by default via :func:`set_transport`.
"""

from __future__ import annotations

import os
from typing import Optional

CAP_READ = "voice_read"
CAP_SEND = "voice_send"
PROVIDER = "vapi"

_NUMBER_SOURCES = {"vapi", "twilio", "sip", "byo_sip"}


def max_call_seconds() -> int:
    try:
        return int(os.environ.get("AI_RECEPTIONIST_VOICE_MAX_CALL_SECONDS", "") or 900)
    except ValueError:
        return 900


def max_event_bytes() -> int:
    try:
        return int(os.environ.get("AI_RECEPTIONIST_VAPI_MAX_EVENT_BYTES", "") or 512000)
    except ValueError:
        return 512000


class VoiceError(Exception):
    """Typed, non-leaky failure. ``category`` is a fixed-vocabulary string."""

    CATEGORIES = {
        "not_connected", "credentials_invalid", "missing_permission", "no_number",
        "inbound_unavailable", "outbound_unavailable", "sip_registration_failed",
        "assistant_missing", "invalid_recipient", "rate_limit", "quota",
        "provider_error", "unknown_result", "call_too_long",
    }

    def __init__(self, category: str, detail: str = "") -> None:
        super().__init__(category)
        self.category = category if category in self.CATEGORIES else "provider_error"
        self.detail = detail


# ── transport injection (hermetic) ────────────────────────────────────────────
_transport: Optional["VoiceTransport"] = None


class VoiceTransport:
    """Abstract transport. Real impl calls the Vapi API; the mock returns fixtures."""

    def get_account(self, key: str) -> dict: raise NotImplementedError
    def list_phone_numbers(self, key: str) -> dict: raise NotImplementedError
    def get_phone_number(self, key: str, number_id: str) -> dict: raise NotImplementedError
    def import_phone_number(self, key: str, payload: dict) -> dict: raise NotImplementedError
    def configure_phone_number(self, key: str, number_id: str, payload: dict) -> dict: raise NotImplementedError
    def create_assistant(self, key: str, payload: dict) -> dict: raise NotImplementedError
    def update_assistant(self, key: str, assistant_id: str, payload: dict) -> dict: raise NotImplementedError
    def get_assistant(self, key: str, assistant_id: str) -> dict: raise NotImplementedError
    def start_call(self, key: str, payload: dict) -> dict: raise NotImplementedError
    def get_call(self, key: str, call_id: str) -> dict: raise NotImplementedError
    def end_call(self, key: str, call_id: str) -> dict: raise NotImplementedError
    def transfer_call(self, key: str, call_id: str, destination: str) -> dict: raise NotImplementedError
    def say(self, key: str, call_id: str, text: str) -> dict: raise NotImplementedError
    def get_call_artifacts(self, key: str, call_id: str) -> dict: raise NotImplementedError
    def get_recording_metadata(self, key: str, call_id: str) -> dict: raise NotImplementedError


def set_transport(t: Optional["VoiceTransport"]) -> None:
    global _transport
    _transport = t


def _active_transport() -> "VoiceTransport":
    return _transport if _transport is not None else _MockVapiTransport()


# ── connection + key ──────────────────────────────────────────────────────────

def _connection(tenant_id: str, *, need_send: bool = False) -> dict:
    from integrations.connections import find_active_connection_unsealed
    cap = CAP_SEND if need_send else CAP_READ
    conn = find_active_connection_unsealed(tenant_id, cap) \
        or find_active_connection_unsealed(tenant_id, CAP_READ)
    if conn is None:
        raise VoiceError("not_connected", "no voice connection for tenant")
    if conn.get("status") == "disconnected":
        raise VoiceError("not_connected", "connection disconnected")
    if conn.get("status") == "needs_reconnect":
        raise VoiceError("credentials_invalid", "connection needs reconnect")
    if need_send and not conn.get("outbound_enabled", False):
        raise VoiceError("outbound_unavailable", "outbound calling disabled")
    return conn


def _api_key(conn: dict) -> str:
    key = conn.get("vapi_api_key", "")
    if not key:
        raise VoiceError("credentials_invalid", "no Vapi API key — reconnect voice")
    return key


# ── normalisation ─────────────────────────────────────────────────────────────

_ENDED_REASON_MAP = {
    "customer-ended-call": "completed", "assistant-ended-call": "completed",
    "customer-did-not-answer": "no_answer", "customer-busy": "busy",
    "voicemail": "voicemail", "assistant-forwarded-call": "transferred",
    "pipeline-error": "failed", "no-answer": "no_answer",
}


def normalise_call(raw: dict) -> dict:
    """Normalise a Vapi call object into the internal call shape."""
    status = (raw.get("status") or "").lower()
    ended = (raw.get("endedReason") or raw.get("ended_reason") or "").lower()
    internal_status = {"queued": "queued", "ringing": "ringing", "in-progress": "in_progress",
                       "forwarding": "transferring", "ended": "completed"}.get(status, status or "requested")
    if ended and internal_status == "completed":
        internal_status = _ENDED_REASON_MAP.get(ended, "completed")
    cost = raw.get("cost") or {}
    return {
        "provider": PROVIDER, "call_id": raw.get("id", ""), "assistant_id": raw.get("assistantId", ""),
        "phone_number_id": raw.get("phoneNumberId", ""),
        "direction": "outbound" if raw.get("type") == "outboundPhoneCall" else "inbound",
        "caller_number": (raw.get("customer") or {}).get("number", ""),
        "recipient_number": raw.get("phoneNumber", "") or "",
        "status": internal_status, "ended_reason": ended,
        "started_at": raw.get("startedAt", ""), "ended_at": raw.get("endedAt", ""),
        "duration_seconds": int(raw.get("durationSeconds", 0) or 0),
        "provider_cost": cost.get("total", 0), "telephony_cost": cost.get("transport", 0),
        "model_cost": cost.get("llm", 0), "voice_cost": cost.get("tts", 0),
        "transcript_cost": cost.get("stt", 0),
    }


def normalise_number(raw: dict) -> dict:
    return {"phone_number_id": raw.get("id", ""), "number": raw.get("number", ""),
            "source": raw.get("provider", "vapi"), "country": raw.get("country", ""),
            "inbound_capable": bool(raw.get("inbound", True)),
            "outbound_capable": bool(raw.get("outbound", True)),
            "assistant_id": raw.get("assistantId", ""), "sip": bool(raw.get("sipUri"))}


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
    key_ok = bool(conn.get("vapi_api_key"))
    server_auth_ok = bool(conn.get("server_secret"))
    has_number = bool(conn.get("default_number_id"))
    has_assistant = bool(conn.get("default_assistant_id") or conn.get("dynamic_assistant", True))
    inbound = key_ok and has_number and has_assistant and bool(conn.get("inbound_enabled", True))
    outbound = key_ok and has_number and bool(conn.get("outbound_enabled", False))
    state = ("credentials_invalid" if not key_ok
             else "no_number" if not has_number
             else "server_auth_missing" if not server_auth_ok
             else "assistant_missing" if not has_assistant
             else "ready_inbound_outbound" if inbound and outbound
             else "ready_for_outbound" if outbound
             else "ready_for_inbound" if inbound
             else "inbound_unavailable")
    return {
        "connected": True, "provider": conn.get("provider", PROVIDER),
        "account_id": conn.get("vapi_account_id", ""), "default_number_id": conn.get("default_number_id", ""),
        "inbound_enabled": bool(conn.get("inbound_enabled", True)),
        "outbound_enabled": bool(conn.get("outbound_enabled", False)),
        "server_auth": bool(server_auth_ok), "recording_enabled": bool(conn.get("recording_enabled", False)),
        "last_call_at": conn.get("last_call_at", ""), "last_error": conn.get("last_error", ""),
        "state": state,
    }


def get_account(tenant_id: str) -> dict:
    conn = _connection(tenant_id)
    a = _active_transport().get_account(_api_key(conn))
    return {"account_id": a.get("id", ""), "name": a.get("name", "")}


def list_phone_numbers(tenant_id: str) -> list[dict]:
    conn = _connection(tenant_id)
    res = _active_transport().list_phone_numbers(_api_key(conn))
    return [normalise_number(n) for n in (res.get("data") or res if isinstance(res, list) else res.get("data", []))]


def get_phone_number(tenant_id: str, number_id: str) -> dict:
    conn = _connection(tenant_id)
    return normalise_number(_active_transport().get_phone_number(_api_key(conn), number_id))


def import_phone_number(tenant_id: str, *, source: str, number: str, credentials: Optional[dict] = None) -> dict:
    if source not in _NUMBER_SOURCES:
        raise VoiceError("provider_error", "unsupported number source")
    conn = _connection(tenant_id)
    payload = {"provider": source, "number": number, **(credentials or {})}
    return normalise_number(_active_transport().import_phone_number(_api_key(conn), payload))


def configure_phone_number(tenant_id: str, number_id: str, *, assistant_id: str = "", server_url: str = "") -> dict:
    conn = _connection(tenant_id)
    payload = {}
    if assistant_id:
        payload["assistantId"] = assistant_id
    if server_url:
        payload["serverUrl"] = server_url
    return normalise_number(_active_transport().configure_phone_number(_api_key(conn), number_id, payload))


def create_assistant(tenant_id: str, config: dict) -> dict:
    conn = _connection(tenant_id)
    a = _active_transport().create_assistant(_api_key(conn), config)
    return {"assistant_id": a.get("id", ""), "name": a.get("name", "")}


def update_assistant(tenant_id: str, assistant_id: str, config: dict) -> dict:
    conn = _connection(tenant_id)
    a = _active_transport().update_assistant(_api_key(conn), assistant_id, config)
    return {"assistant_id": a.get("id", assistant_id)}


def get_assistant(tenant_id: str, assistant_id: str) -> dict:
    conn = _connection(tenant_id)
    return _active_transport().get_assistant(_api_key(conn), assistant_id)


def start_outbound_call(tenant_id: str, *, to: str, number_id: str, assistant_id: str = "",
                        metadata: Optional[dict] = None) -> dict:
    conn = _connection(tenant_id, need_send=True)
    payload = {"type": "outboundPhoneCall", "phoneNumberId": number_id,
               "customer": {"number": to}, "assistantId": assistant_id,
               "metadata": metadata or {}, "maxDurationSeconds": max_call_seconds()}
    try:
        raw = _active_transport().start_call(_api_key(conn), payload)
    except VoiceError:
        raise
    except Exception as exc:  # pragma: no cover
        raise VoiceError("provider_error", str(exc)[:80]) from exc
    out = normalise_call(raw)
    if not out["call_id"]:
        raise VoiceError("unknown_result", "call create returned no id")
    return out


def get_call(tenant_id: str, call_id: str) -> dict:
    conn = _connection(tenant_id)
    return normalise_call(_active_transport().get_call(_api_key(conn), call_id))


def end_call(tenant_id: str, call_id: str) -> dict:
    conn = _connection(tenant_id, need_send=True)
    return {"ok": bool(_active_transport().end_call(_api_key(conn), call_id).get("ok", True))}


def transfer_call(tenant_id: str, call_id: str, destination: str) -> dict:
    conn = _connection(tenant_id, need_send=True)
    res = _active_transport().transfer_call(_api_key(conn), call_id, destination)
    return {"ok": bool(res.get("ok", True)), "status": res.get("status", "transferring")}


def send_say_instruction(tenant_id: str, call_id: str, text: str) -> dict:
    conn = _connection(tenant_id, need_send=True)
    return {"ok": bool(_active_transport().say(_api_key(conn), call_id, text).get("ok", True))}


def get_call_artifacts(tenant_id: str, call_id: str) -> dict:
    conn = _connection(tenant_id)
    return _active_transport().get_call_artifacts(_api_key(conn), call_id)


def get_recording_metadata(tenant_id: str, call_id: str) -> dict:
    conn = _connection(tenant_id)
    m = _active_transport().get_recording_metadata(_api_key(conn), call_id)
    # presigned URL is sensitive + transient — never persisted as a permanent id
    return {"call_id": call_id, "has_recording": bool(m.get("recordingUrl")),
            "duration_seconds": int(m.get("durationSeconds", 0) or 0),
            "expires_at": m.get("expiresAt", "")}


def reconcile_call(tenant_id: str, call_id: str) -> dict:
    try:
        return get_call(tenant_id, call_id)
    except VoiceError as exc:
        return {"call_id": call_id, "status": "provider_unknown", "ended_reason": exc.category}


def health_check(tenant_id: str) -> dict:
    return validate_connection(tenant_id)


# ── built-in mock transport (hermetic default) ────────────────────────────────

class _MockVapiTransport(VoiceTransport):
    def __init__(self):
        self.calls = 0

    def get_account(self, key): return {"id": "org_mock", "name": "Acme Voice"}
    def list_phone_numbers(self, key):
        return {"data": [{"id": "pn_v1", "number": "+15550009999", "provider": "vapi",
                          "country": "US", "inbound": True, "outbound": True, "assistantId": ""}]}
    def get_phone_number(self, key, number_id):
        return {"id": number_id, "number": "+15550009999", "provider": "vapi", "inbound": True, "outbound": True}
    def import_phone_number(self, key, payload):
        return {"id": "pn_imp", "number": payload.get("number", ""), "provider": payload.get("provider", "twilio"),
                "inbound": True, "outbound": True}
    def configure_phone_number(self, key, number_id, payload):
        return {"id": number_id, "number": "+15550009999", "assistantId": payload.get("assistantId", "")}
    def create_assistant(self, key, payload): return {"id": "asst_mock", "name": payload.get("name", "Pixie")}
    def update_assistant(self, key, assistant_id, payload): return {"id": assistant_id}
    def get_assistant(self, key, assistant_id): return {"id": assistant_id, "name": "Pixie"}
    def start_call(self, key, payload):
        self.calls += 1
        return {"id": f"call_MOCK{self.calls}", "status": "queued", "type": "outboundPhoneCall",
                "phoneNumberId": payload.get("phoneNumberId", ""), "assistantId": payload.get("assistantId", ""),
                "customer": {"number": (payload.get("customer") or {}).get("number", "")}}
    def get_call(self, key, call_id):
        return {"id": call_id, "status": "ended", "endedReason": "customer-ended-call",
                "durationSeconds": 42, "cost": {"total": 0.12, "transport": 0.04, "llm": 0.05, "tts": 0.02, "stt": 0.01}}
    def end_call(self, key, call_id): return {"ok": True}
    def transfer_call(self, key, call_id, destination): return {"ok": True, "status": "transferring"}
    def say(self, key, call_id, text): return {"ok": True}
    def get_call_artifacts(self, key, call_id): return {"transcript": "", "messages": []}
    def get_recording_metadata(self, key, call_id):
        return {"recordingUrl": "https://vapi/rec/mock", "durationSeconds": 42, "expiresAt": ""}
