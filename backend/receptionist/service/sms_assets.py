"""SMS number selection, quiet-hours settings and status (Parts 2/3/23).

Selecting a sender number persists the choice onto the existing encrypted SMS
connection descriptor (never a second connection store) and records it durably.
Ownership is verified against the provider's number list. Disconnect disables new
sends without deleting history.
"""

from __future__ import annotations

from typing import Optional

from . import stores
from .ids import now_iso


def _update_connection(tenant_id: str, patch: dict) -> None:
    from integrations import connections
    base = connections.find_active_connection_unsealed(tenant_id, "sms_read") \
        or connections.find_active_connection_unsealed(tenant_id, "sms_send") or {"status": "active"}
    base = dict(base)
    base.update(patch)
    connections.register_many(tenant_id, ["sms_read", "sms_send"], base)


def select_number(tenant_id: str, sender_number: str) -> dict:
    from ..providers import sms_adapter as sms
    try:
        numbers = sms.list_numbers(tenant_id)
    except sms.SMSError as exc:
        return {"status": "failed", "reason": exc.category}
    match = next((n for n in numbers if n["sender_number"] == sender_number), None)
    if match is None:
        return {"status": "number_not_owned"}
    if not match.get("sms_capable", True):
        return {"status": "number_not_sms_capable"}
    _update_connection(tenant_id, {
        "sender_number": sender_number, "country": match.get("country", ""),
        "sms_capable": True, "mms_capable": bool(match.get("mms_capable", False)),
        "messaging_enabled": True})
    stores.sms_number_map().put(tenant_id, {
        "id": f"smsnum::{tenant_id}", "tenant_id": tenant_id, "sender_number": sender_number,
        "country": match.get("country", ""), "selected_at": now_iso()})
    return {"status": "selected", "connection": sms.validate_connection(tenant_id)}


def set_quiet_hours(tenant_id: str, quiet_hours: dict) -> dict:
    from . import config_repo, sms_policy
    config_repo.save(tenant_id, {"sms_quiet_hours": quiet_hours}, updated_by="settings")
    return {"quiet_hours": sms_policy.quiet_hours_config(tenant_id)}


def disconnect(tenant_id: str) -> dict:
    from integrations import connections
    connections.disconnect(tenant_id, ["sms_read", "sms_send"])
    return {"status": "disconnected"}


def status(tenant_id: str) -> dict:
    from ..providers import sms_adapter as sms
    from . import sms_policy
    return {
        "connection": sms.validate_connection(tenant_id),
        "reply_mode": sms_policy.reply_mode(tenant_id),
        "quiet_hours": sms_policy.quiet_hours_config(tenant_id),
    }
