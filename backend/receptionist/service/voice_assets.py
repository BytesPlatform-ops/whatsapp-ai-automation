"""Voice connection connect/validate/numbers + settings + status (Parts 2/3/27).

Connecting a Vapi account persists the encrypted API key + a SEPARATE server-callback
secret onto the connection descriptor (never a second connection store). Numbers are
discovered/imported and mirrored onto the descriptor so the webhook can resolve the
workspace from a verified number. Disconnect disables calls without deleting call
history.
"""

from __future__ import annotations

from typing import Optional

from .ids import new_id, now_iso


def _base(tenant_id: str) -> dict:
    from integrations import connections
    return dict(connections.find_active_connection_unsealed(tenant_id, "voice_read")
                or connections.find_active_connection_unsealed(tenant_id, "voice_send")
                or {"status": "active"})


def _save(tenant_id: str, descriptor: dict) -> None:
    from integrations import connections
    connections.register_many(tenant_id, ["voice_read", "voice_send"], descriptor)


def connect(tenant_id: str, *, vapi_api_key: str, server_secret: str = "") -> dict:
    """Validate the Vapi key and persist it + a separate server-callback secret."""
    from ..providers import voice_adapter as voice
    base = _base(tenant_id)
    base["vapi_api_key"] = vapi_api_key
    base.setdefault("status", "active")
    base.setdefault("inbound_enabled", True)
    base.setdefault("outbound_enabled", False)   # outbound OFF by default
    base.setdefault("recording_enabled", False)  # recording OFF by default
    base["server_secret"] = server_secret or base.get("server_secret") or new_id("vapisec")
    base.setdefault("dynamic_assistant", True)
    _save(tenant_id, base)
    try:
        acct = voice.get_account(tenant_id)
    except voice.VoiceError as exc:
        return {"status": "failed", "reason": exc.category}
    base = _base(tenant_id)
    base.update({"vapi_account_id": acct.get("account_id", ""), "connected_at": now_iso()})
    _save(tenant_id, base)
    return {"status": "connected", "account_id": acct.get("account_id", "")}


def discover_numbers(tenant_id: str) -> dict:
    from ..providers import voice_adapter as voice
    from . import stores
    try:
        numbers = voice.list_phone_numbers(tenant_id)
    except voice.VoiceError as exc:
        return {"status": "failed", "reason": exc.category}
    base = _base(tenant_id)
    base["numbers"] = numbers
    if numbers and not base.get("default_number_id"):
        base["default_number_id"] = numbers[0]["phone_number_id"]
    _save(tenant_id, base)
    for n in numbers:
        stores.voice_numbers().put(tenant_id, {
            "id": f"vnum::{tenant_id}::{n['phone_number_id']}", "tenant_id": tenant_id,
            "phone_number_id": n["phone_number_id"], "number": n["number"], "source": n.get("source", "vapi"),
            "inbound_capable": n.get("inbound_capable", True), "outbound_capable": n.get("outbound_capable", True),
            "active": True, "updated_at": now_iso()})
    return {"status": "ok", "numbers": numbers}


def import_number(tenant_id: str, *, source: str, number: str, credentials: Optional[dict] = None) -> dict:
    from ..providers import voice_adapter as voice
    try:
        n = voice.import_phone_number(tenant_id, source=source, number=number, credentials=credentials)
    except voice.VoiceError as exc:
        return {"status": "failed", "reason": exc.category}
    from . import stores
    stores.voice_numbers().put(tenant_id, {
        "id": f"vnum::{tenant_id}::{n['phone_number_id']}", "tenant_id": tenant_id,
        "phone_number_id": n["phone_number_id"], "number": n["number"], "source": source,
        "active": True, "updated_at": now_iso()})
    base = _base(tenant_id)
    base["numbers"] = (base.get("numbers") or []) + [n]
    _save(tenant_id, base)
    return {"status": "imported", "number": n}


def set_settings(tenant_id: str, *, inbound: Optional[bool] = None, outbound: Optional[bool] = None,
                 recording: Optional[bool] = None, default_number_id: str = "",
                 default_assistant_id: str = "") -> dict:
    base = _base(tenant_id)
    if inbound is not None:
        base["inbound_enabled"] = bool(inbound)
    if outbound is not None:
        base["outbound_enabled"] = bool(outbound)
    if recording is not None:
        base["recording_enabled"] = bool(recording)
    if default_number_id:
        base["default_number_id"] = default_number_id
    if default_assistant_id:
        base["default_assistant_id"] = default_assistant_id
    _save(tenant_id, base)
    from ..providers import voice_adapter as voice
    return {"status": "updated", "connection": voice.validate_connection(tenant_id)}


def disconnect(tenant_id: str) -> dict:
    from integrations import connections
    connections.disconnect(tenant_id, ["voice_read", "voice_send"])
    return {"status": "disconnected"}


def status(tenant_id: str) -> dict:
    from ..providers import voice_adapter as voice
    from . import voice_policy
    return {
        "connection": voice.validate_connection(tenant_id),
        "recording_policy": voice_policy.recording_policy(tenant_id),
        "transfer_destinations": [{"department": d.get("department", ""), "label": d.get("label", ""),
                                   "verified": d.get("verified", False)}
                                  for d in voice_policy.transfer_destinations(tenant_id)],
        "inbound_enabled": voice_policy.inbound_enabled(tenant_id),
        "outbound_enabled": voice_policy.outbound_enabled(tenant_id),
    }
