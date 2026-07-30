"""Advanced outbound campaign domain (Parts 1-3/8/11/14/33).

An ORCHESTRATION layer over the existing AI Receptionist channels. It never talks to
provider HTTP APIs — every send is dispatched through the existing channel registry
actions (see :mod:`campaign_execution`), so provider policy, consent, approvals and
billing are all enforced by the channel handlers. This module owns the campaign
lifecycle, versions, steps, channel-typed content, approvals and the audit trail.

Safety defaults: the feature is env-gated OFF, sending is OFF, promotional purpose is
OFF, voice campaigns are OFF and dynamic enrolment is OFF unless explicitly enabled.
"""

from __future__ import annotations

import os
from typing import Optional

from . import stores
from .ids import new_id, now_iso

PURPOSES = ("support", "transactional", "booking", "follow_up", "re_engagement", "promotional")
TYPES = ("one_time", "follow_up", "drip", "booking_reminder", "re_engagement",
         "transactional", "manual_callback")
STATUSES = ("draft", "pending_approval", "approved", "scheduled", "preparing", "active",
            "paused", "partially_completed", "completed", "cancelled", "failed",
            "blocked_policy", "archived")
STEP_CHANNELS = ("email", "whatsapp", "instagram", "messenger", "sms", "telegram",
                 "voice_callback", "voice_call", "wait", "condition", "task", "human_review", "stop")


def feature_enabled() -> bool:
    return os.environ.get("AI_RECEPTIONIST_CAMPAIGNS_ENABLED", "").strip().lower() in ("1", "true", "yes", "on")


def send_enabled() -> bool:
    return os.environ.get("AI_RECEPTIONIST_CAMPAIGN_SEND_ENABLED", "").strip().lower() in ("1", "true", "yes", "on")


def promotional_enabled(tenant_id: str) -> bool:
    if os.environ.get("AI_RECEPTIONIST_CAMPAIGN_PROMOTIONAL_ENABLED", "").strip().lower() not in ("1", "true", "yes", "on"):
        return False
    from . import config_repo
    return bool((config_repo.get_active(tenant_id) or {}).get("campaign_promotional_enabled", False))


def voice_campaigns_enabled() -> bool:
    return os.environ.get("AI_RECEPTIONIST_CAMPAIGN_VOICE_ENABLED", "").strip().lower() in ("1", "true", "yes", "on")


def dynamic_enrolment_enabled(tenant_id: str) -> bool:
    if os.environ.get("AI_RECEPTIONIST_CAMPAIGN_DYNAMIC_ENROLMENT_ENABLED", "").strip().lower() not in ("1", "true", "yes", "on"):
        return False
    from . import config_repo
    return bool((config_repo.get_active(tenant_id) or {}).get("campaign_dynamic_enrolment_enabled", False))


def max_sequence_steps() -> int:
    try:
        return int(os.environ.get("AI_RECEPTIONIST_CAMPAIGN_MAX_SEQUENCE_STEPS", "") or 10)
    except ValueError:
        return 10


def policy_version() -> str:
    return os.environ.get("AI_RECEPTIONIST_CAMPAIGN_POLICY_VERSION", "campaign-policy-1") or "campaign-policy-1"


# ── audit ─────────────────────────────────────────────────────────────────────

def audit(tenant_id: str, campaign_id: str, action: str, *, actor: str = "system", detail: Optional[dict] = None) -> None:
    stores.cmp_audit().put(tenant_id, {
        "id": new_id("cmpaud"), "tenant_id": tenant_id, "campaign_id": campaign_id, "action": action,
        "actor": actor, "detail": detail or {}, "created_at": now_iso()})


def list_audit(tenant_id: str, campaign_id: str) -> list[dict]:
    return sorted([a for a in stores.cmp_audit().list(tenant_id) if a.get("campaign_id") == campaign_id],
                  key=lambda a: a.get("created_at", ""))


# ── campaign CRUD + lifecycle ─────────────────────────────────────────────────

def create(tenant_id: str, *, name: str, purpose: str, campaign_type: str = "one_time",
           strategy: str = "single", channels: Optional[list] = None, created_by: str = "operator") -> dict:
    purpose = purpose if purpose in PURPOSES else "support"
    rec = {
        "id": new_id("cmp"), "tenant_id": tenant_id, "name": name[:200], "purpose": purpose,
        "campaign_type": campaign_type if campaign_type in TYPES else "one_time",
        "strategy": strategy, "channels": channels or [], "status": "draft", "version": 1,
        "audience_rule": {}, "exclusions": [], "frequency_caps": {}, "schedule": {},
        "dynamic_enrolment": False, "created_by": created_by, "created_at": now_iso(), "updated_at": now_iso()}
    saved = stores.cmp_campaigns().put(tenant_id, rec)
    _snapshot_version(tenant_id, saved)
    audit(tenant_id, saved["id"], "campaign_created", actor=created_by, detail={"purpose": purpose})
    return saved


def get(tenant_id: str, campaign_id: str) -> Optional[dict]:
    return stores.cmp_campaigns().get(tenant_id, campaign_id)


def list_campaigns(tenant_id: str) -> list[dict]:
    return sorted(stores.cmp_campaigns().list(tenant_id), key=lambda c: c.get("created_at", ""), reverse=True)


def _snapshot_version(tenant_id: str, campaign: dict) -> None:
    stores.cmp_versions().put(tenant_id, {
        "id": f"cmpver::{tenant_id}::{campaign['id']}::{campaign['version']}", "tenant_id": tenant_id,
        "campaign_id": campaign["id"], "version": campaign["version"],
        "snapshot": {k: campaign.get(k) for k in ("name", "purpose", "campaign_type", "strategy",
                                                  "channels", "audience_rule", "exclusions",
                                                  "frequency_caps", "schedule")},
        "created_at": now_iso()})


# fields whose change invalidates an existing approval
_APPROVAL_SENSITIVE = {"audience_rule", "exclusions", "channels", "strategy", "purpose", "schedule"}


def update(tenant_id: str, campaign_id: str, patch: dict, *, actor: str = "operator") -> Optional[dict]:
    c = get(tenant_id, campaign_id)
    if c is None:
        return None
    if c["status"] == "archived":
        return {"status": "archived"}
    sensitive_changed = any(k in _APPROVAL_SENSITIVE and patch.get(k) != c.get(k) for k in patch)
    for k, v in patch.items():
        if k in ("name", "purpose", "campaign_type", "strategy", "channels", "audience_rule",
                 "exclusions", "frequency_caps", "schedule", "dynamic_enrolment"):
            c[k] = v
    if sensitive_changed and c["status"] in ("pending_approval", "approved", "scheduled"):
        _invalidate_approval(tenant_id, campaign_id, reason="audience_or_schedule_changed")
        c["status"] = "draft"
        c["version"] = int(c.get("version", 1)) + 1
        audit(tenant_id, campaign_id, "approval_invalidated", actor=actor, detail={"reason": "sensitive_change"})
    c["updated_at"] = now_iso()
    saved = stores.cmp_campaigns().put(tenant_id, c)
    _snapshot_version(tenant_id, saved)
    audit(tenant_id, campaign_id, "campaign_edited", actor=actor)
    return saved


# ── steps ─────────────────────────────────────────────────────────────────────

def add_step(tenant_id: str, campaign_id: str, *, name: str, channel: str, order: int,
             delay_seconds: int = 0, content_ref: str = "", fallback_channel: str = "",
             max_attempts: int = 3, stop_conditions: Optional[list] = None,
             actor: str = "operator") -> dict:
    c = get(tenant_id, campaign_id)
    if c is None:
        raise ValueError("campaign not found")
    if channel not in STEP_CHANNELS:
        raise ValueError("unsupported step channel")
    existing = list_steps(tenant_id, campaign_id)
    if len(existing) >= max_sequence_steps():
        raise ValueError("sequence step limit reached")
    rec = {
        "id": new_id("cmpstep"), "tenant_id": tenant_id, "campaign_id": campaign_id, "name": name[:120],
        "channel": channel, "order": order, "delay_seconds": max(0, int(delay_seconds)),
        "content_ref": content_ref, "fallback_channel": fallback_channel if fallback_channel in STEP_CHANNELS else "",
        "max_attempts": max(1, int(max_attempts)), "stop_conditions": stop_conditions or ["reply", "opt_out", "suppressed"],
        "campaign_version": c.get("version", 1), "created_at": now_iso()}
    saved = stores.cmp_steps().put(tenant_id, rec)
    if c["status"] in ("pending_approval", "approved", "scheduled"):
        _invalidate_approval(tenant_id, campaign_id, reason="steps_changed")
        c["status"] = "draft"; c["updated_at"] = now_iso(); stores.cmp_campaigns().put(tenant_id, c)
    audit(tenant_id, campaign_id, "step_added", actor=actor, detail={"channel": channel, "order": order})
    return saved


def list_steps(tenant_id: str, campaign_id: str) -> list[dict]:
    return sorted([s for s in stores.cmp_steps().list(tenant_id) if s.get("campaign_id") == campaign_id],
                  key=lambda s: s.get("order", 0))


# ── content (channel-typed, versioned) ────────────────────────────────────────

def set_content(tenant_id: str, campaign_id: str, *, channel: str, body: str = "", subject: str = "",
                template_ref: str = "", variables: Optional[list] = None, interactive: Optional[dict] = None,
                locale: str = "en", actor: str = "operator") -> dict:
    from . import campaign_content
    validation = campaign_content.validate_content(channel, {"body": body, "subject": subject,
                                                             "template_ref": template_ref,
                                                             "interactive": interactive or {}})
    rec = {
        "id": new_id("cmpcnt"), "tenant_id": tenant_id, "campaign_id": campaign_id, "channel": channel,
        "subject": subject[:300], "body": body[:6000], "template_ref": template_ref,
        "variables": variables or [], "interactive": interactive or {}, "locale": locale,
        "approval_state": "draft", "validation": validation, "created_by": actor,
        "version": _next_content_version(tenant_id, campaign_id, channel), "created_at": now_iso()}
    saved = stores.cmp_content().put(tenant_id, rec)
    # editing content invalidates any existing approval
    c = get(tenant_id, campaign_id)
    if c and c["status"] in ("pending_approval", "approved", "scheduled"):
        _invalidate_approval(tenant_id, campaign_id, reason="content_changed")
        c["status"] = "draft"; c["updated_at"] = now_iso(); stores.cmp_campaigns().put(tenant_id, c)
        audit(tenant_id, campaign_id, "approval_invalidated", actor=actor, detail={"reason": "content_change"})
    audit(tenant_id, campaign_id, "content_edited", actor=actor, detail={"channel": channel})
    return saved


def _next_content_version(tenant_id: str, campaign_id: str, channel: str) -> int:
    versions = [c.get("version", 0) for c in stores.cmp_content().list(tenant_id)
                if c.get("campaign_id") == campaign_id and c.get("channel") == channel]
    return (max(versions) + 1) if versions else 1


def list_content(tenant_id: str, campaign_id: str) -> list[dict]:
    return [c for c in stores.cmp_content().list(tenant_id) if c.get("campaign_id") == campaign_id]


def latest_content(tenant_id: str, campaign_id: str, channel: str) -> Optional[dict]:
    items = [c for c in list_content(tenant_id, campaign_id) if c.get("channel") == channel]
    return max(items, key=lambda c: c.get("version", 0)) if items else None


# ── validation + approval ─────────────────────────────────────────────────────

def validate(tenant_id: str, campaign_id: str) -> dict:
    """Return {ok, errors[]} — a campaign must validate before approval."""
    c = get(tenant_id, campaign_id)
    if c is None:
        return {"ok": False, "errors": ["not_found"]}
    errors = []
    if not feature_enabled():
        errors.append("campaigns_feature_disabled")
    steps = list_steps(tenant_id, campaign_id)
    if not steps:
        errors.append("no_steps")
    if c["purpose"] == "promotional" and not promotional_enabled(tenant_id):
        errors.append("promotional_disabled")
    for s in steps:
        ch = s["channel"]
        if ch in ("voice_call", "voice_callback") and not voice_campaigns_enabled():
            errors.append(f"voice_campaigns_disabled:{s['id']}")
        if ch in ("email", "whatsapp", "instagram", "messenger", "sms", "telegram"):
            if latest_content(tenant_id, campaign_id, ch) is None:
                errors.append(f"missing_content:{ch}")
    if not c.get("audience_rule"):
        errors.append("no_audience_rule")
    return {"ok": len(errors) == 0, "errors": errors}


def request_approval(tenant_id: str, campaign_id: str, *, actor: str = "operator") -> dict:
    v = validate(tenant_id, campaign_id)
    if not v["ok"]:
        return {"status": "invalid", "errors": v["errors"]}
    c = get(tenant_id, campaign_id)
    c["status"] = "pending_approval"; c["updated_at"] = now_iso()
    stores.cmp_campaigns().put(tenant_id, c)
    audit(tenant_id, campaign_id, "approval_requested", actor=actor)
    return {"status": "pending_approval"}


def approve(tenant_id: str, campaign_id: str, *, actor: str = "approver", notes: str = "") -> dict:
    c = get(tenant_id, campaign_id)
    if c is None:
        return {"status": "not_found"}
    v = validate(tenant_id, campaign_id)
    if not v["ok"]:
        return {"status": "invalid", "errors": v["errors"]}
    rec = {
        "id": new_id("cmpapr"), "tenant_id": tenant_id, "campaign_id": campaign_id,
        "campaign_version": c.get("version", 1), "approver": actor, "scope": "campaign",
        "notes": notes[:500], "status": "active", "approved_at": now_iso()}
    stores.cmp_approvals().put(tenant_id, rec)
    c["status"] = "approved"; c["approval_id"] = rec["id"]; c["updated_at"] = now_iso()
    stores.cmp_campaigns().put(tenant_id, c)
    audit(tenant_id, campaign_id, "approved", actor=actor)
    return {"status": "approved", "approval_id": rec["id"]}


def reject(tenant_id: str, campaign_id: str, *, actor: str = "approver", notes: str = "") -> dict:
    c = get(tenant_id, campaign_id)
    if c is None:
        return {"status": "not_found"}
    c["status"] = "draft"; c["updated_at"] = now_iso()
    stores.cmp_campaigns().put(tenant_id, c)
    audit(tenant_id, campaign_id, "rejected", actor=actor, detail={"notes": notes[:200]})
    return {"status": "rejected"}


def approval_valid(tenant_id: str, campaign_id: str) -> bool:
    c = get(tenant_id, campaign_id)
    if c is None or not c.get("approval_id"):
        return False
    apr = stores.cmp_approvals().get(tenant_id, c["approval_id"])
    return bool(apr and apr.get("status") == "active" and apr.get("campaign_version") == c.get("version"))


def _invalidate_approval(tenant_id: str, campaign_id: str, *, reason: str) -> None:
    c = get(tenant_id, campaign_id)
    if c and c.get("approval_id"):
        apr = stores.cmp_approvals().get(tenant_id, c["approval_id"])
        if apr and apr.get("status") == "active":
            apr["status"] = "invalidated"; apr["invalidated_reason"] = reason
            apr["invalidated_at"] = now_iso()
            stores.cmp_approvals().put(tenant_id, apr)


# ── lifecycle transitions ─────────────────────────────────────────────────────

def _set_status(tenant_id: str, campaign_id: str, status: str, *, actor: str = "operator", action: str = "") -> dict:
    c = get(tenant_id, campaign_id)
    if c is None:
        return {"status": "not_found"}
    c["status"] = status; c["updated_at"] = now_iso()
    stores.cmp_campaigns().put(tenant_id, c)
    audit(tenant_id, campaign_id, action or status, actor=actor)
    return {"status": status}


def schedule(tenant_id: str, campaign_id: str, *, schedule_cfg: dict, actor: str = "operator") -> dict:
    if not approval_valid(tenant_id, campaign_id):
        return {"status": "approval_invalid"}
    c = get(tenant_id, campaign_id)
    c["schedule"] = schedule_cfg or {}
    c["status"] = "scheduled"; c["updated_at"] = now_iso()
    stores.cmp_campaigns().put(tenant_id, c)
    audit(tenant_id, campaign_id, "scheduled", actor=actor)
    return {"status": "scheduled"}


def start(tenant_id: str, campaign_id: str, *, actor: str = "operator") -> dict:
    """Enqueue campaign preparation once. Duplicate start cannot create two runs."""
    c = get(tenant_id, campaign_id)
    if c is None:
        return {"status": "not_found"}
    if not approval_valid(tenant_id, campaign_id):
        return {"status": "approval_invalid"}
    if c["status"] in ("preparing", "active"):
        return {"status": "already_running"}
    if c["status"] not in ("approved", "scheduled"):
        return {"status": "not_approved"}
    c["status"] = "preparing"; c["updated_at"] = now_iso(); c["run_id"] = c.get("run_id") or new_id("cmprun")
    stores.cmp_campaigns().put(tenant_id, c)
    try:
        from ..worker import jobs_store
        jobs_store.enqueue(tenant_id, "campaign_prepare", {"campaign_id": campaign_id, "run_id": c["run_id"]})
    except Exception:
        pass
    audit(tenant_id, campaign_id, "started", actor=actor, detail={"run_id": c["run_id"]})
    return {"status": "preparing", "run_id": c["run_id"]}


def pause(tenant_id, campaign_id, *, actor="operator"): return _set_status(tenant_id, campaign_id, "paused", actor=actor)
def resume(tenant_id, campaign_id, *, actor="operator"):
    c = get(tenant_id, campaign_id)
    if c is None or c["status"] != "paused":
        return {"status": "not_paused"}
    return _set_status(tenant_id, campaign_id, "active", actor=actor, action="resumed")


def cancel(tenant_id: str, campaign_id: str, *, actor: str = "operator") -> dict:
    res = _set_status(tenant_id, campaign_id, "cancelled", actor=actor)
    # cancel future queued recipient jobs (best-effort)
    for r in stores.cmp_recipients().list(tenant_id):
        if r.get("campaign_id") == campaign_id and r.get("state") in ("pending", "scheduled", "delayed", "queued"):
            r["state"] = "cancelled"; r["stop_reason"] = "campaign_cancelled"
            stores.cmp_recipients().put(tenant_id, r)
    return res


def archive(tenant_id, campaign_id, *, actor="operator"): return _set_status(tenant_id, campaign_id, "archived", actor=actor)
