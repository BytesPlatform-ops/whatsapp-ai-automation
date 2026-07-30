"""Voice compliance policy (Parts 13/15/16). Server-authoritative, versioned.

ONE service decides whether a voice call may be placed and how it must behave:
inbound/outbound enablement, consent, DNC + suppression, quiet hours (reuses the
SMS quiet-hours engine), recording-consent policy (OFF by default), and verified
transfer destinations. The model and frontend can never override it.
"""

from __future__ import annotations

import os
from datetime import datetime
from typing import Optional

RECORDING_MODES = ("no_recording", "consent_required", "explicit_verbal", "stay_on_line", "prohibited")
PURPOSES = ("inbound", "callback", "reminder", "follow_up", "promotional")


def policy_version() -> str:
    return os.environ.get("AI_RECEPTIONIST_VOICE_POLICY_VERSION", "voice-policy-1") or "voice-policy-1"


def _conn(tenant_id: str) -> dict:
    from integrations.connections import find_active_connection_unsealed
    return find_active_connection_unsealed(tenant_id, "voice_read") \
        or find_active_connection_unsealed(tenant_id, "voice_send") or {}


def inbound_enabled(tenant_id: str) -> bool:
    if os.environ.get("AI_RECEPTIONIST_VOICE_INBOUND_ENABLED", "").strip().lower() in ("0", "false", "no", "off"):
        return False
    return bool(_conn(tenant_id).get("inbound_enabled", True))


def outbound_enabled(tenant_id: str) -> bool:
    if os.environ.get("AI_RECEPTIONIST_VOICE_OUTBOUND_ENABLED", "").strip().lower() not in ("1", "true", "yes", "on"):
        # outbound is opt-in at the env level AND the workspace level
        env_gate = os.environ.get("AI_RECEPTIONIST_VOICE_OUTBOUND_ENABLED", "")
        if env_gate and env_gate.strip().lower() in ("0", "false", "no", "off"):
            return False
    return bool(_conn(tenant_id).get("outbound_enabled", False))


def recording_policy(tenant_id: str) -> dict:
    from . import config_repo
    cfg = config_repo.get_active(tenant_id) or {}
    pol = cfg.get("voice_recording_policy") or {}
    env_on = os.environ.get("AI_RECEPTIONIST_VOICE_RECORDING_ENABLED", "").strip().lower() in ("1", "true", "yes", "on")
    mode = pol.get("mode", "no_recording")
    if mode not in RECORDING_MODES:
        mode = "no_recording"
    # recording is OFF by default: requires BOTH an env enable and a non-"no_recording" policy
    enabled = env_on and mode not in ("no_recording", "prohibited")
    return {"mode": mode, "enabled": enabled, "consent_version": pol.get("consent_version", "rec-consent-1"),
            "consent_wording": pol.get("consent_wording", "")}


def transfer_destinations(tenant_id: str) -> list[dict]:
    from . import config_repo
    cfg = config_repo.get_active(tenant_id) or {}
    return [d for d in (cfg.get("voice_transfer_destinations") or []) if d.get("verified")]


def resolve_transfer_destination(tenant_id: str, department: str = "") -> Optional[dict]:
    dests = transfer_destinations(tenant_id)
    if not dests:
        return None
    if department:
        for d in dests:
            if (d.get("department") or "").lower() == department.lower():
                return d
    return dests[0]


def is_suppressed(tenant_id: str, number: str) -> bool:
    from . import stores
    from ..providers.sms_adapter import normalise_e164
    n = normalise_e164(number)
    for row in stores.optouts().list(tenant_id):
        if row.get("status") == "revoked":
            continue
        if normalise_e164(row.get("phone", "")) == n and (row.get("channel") in ("voice", None) or row.get("scope") == "all"):
            return True
    for row in stores.suppression().list(tenant_id):
        if normalise_e164(row.get("phone", "")) == n:
            return True
    # DNC repository (shared)
    try:
        for row in stores.dnc().list(tenant_id):
            if normalise_e164(row.get("phone", "")) == n:
                return True
    except Exception:
        pass
    return False


def evaluate_outbound_call(tenant_id: str, *, to: str, purpose: str = "callback",
                           responding_to_request: bool = False, now: Optional[datetime] = None) -> dict:
    """Decide whether an outbound call to ``to`` may be placed now, and why."""
    base = {"policy_version": policy_version(), "purpose": purpose if purpose in PURPOSES else "callback"}

    if not outbound_enabled(tenant_id):
        return {**base, "allowed": False, "blocked_reason": "outbound_disabled",
                "quiet_hours_active": False, "delayed_until": ""}
    if is_suppressed(tenant_id, to):
        return {**base, "allowed": False, "blocked_reason": "suppression_dnc",
                "quiet_hours_active": False, "delayed_until": ""}
    # inbound-caller consent does not permit promotional outbound calls
    if base["purpose"] == "promotional":
        return {**base, "allowed": False, "blocked_reason": "promotional_not_permitted",
                "quiet_hours_active": False, "delayed_until": ""}
    # reuse the SMS quiet-hours engine (customer-requested callbacks bypass quiet hours)
    from . import sms_policy
    qh = sms_policy.evaluate_send(tenant_id, to_number=to, purpose="support",
                                  responding_to_inbound=responding_to_request, now=now)
    if not qh.get("allowed") and qh.get("blocked_reason") == "quiet_hours":
        return {**base, "allowed": False, "blocked_reason": "quiet_hours",
                "quiet_hours_active": True, "delayed_until": qh.get("delayed_until", "")}
    return {**base, "allowed": True, "blocked_reason": "", "quiet_hours_active": False, "delayed_until": ""}
