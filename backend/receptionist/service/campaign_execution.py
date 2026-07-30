"""Campaign execution orchestrator (Parts 6/7/9/10/16/19/21/24).

Coordinates recipient-step execution over the EXISTING channel registry actions —
never raw provider APIs. Enforces send-time eligibility revalidation, frequency caps,
stop conditions, idempotent step execution, and honest recipient-step statuses.
Sending is gated OFF by default (``AI_RECEPTIONIST_CAMPAIGN_SEND_ENABLED``); when
disabled it records a ``send_disabled`` execution instead of dispatching.
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Optional

from . import stores
from .ids import new_id, now_iso

# recipient-step statuses (Part 21)
STEP_STATES = ("pending", "scheduled", "delayed", "eligibility_blocked", "awaiting_approval",
               "queued", "provider_pending", "sent", "delivered", "read", "answered", "completed",
               "failed", "suppressed", "opted_out", "stopped", "expired", "reconciliation_required",
               "cancelled", "send_disabled")

# campaign channel → existing registry action + arg builder
_CHANNEL_ACTION = {
    "email": "gmail_send", "whatsapp": "whatsapp_send", "instagram": "instagram_send",
    "messenger": "messenger_send", "sms": "sms_send", "telegram": "telegram_send",
    "voice_call": "voice_outbound_call", "voice_callback": "voice_outbound_call",
}


def _default_cap() -> int:
    try:
        return int(os.environ.get("AI_RECEPTIONIST_CAMPAIGN_DEFAULT_FREQUENCY_CAP", "") or 1)
    except ValueError:
        return 1


# ── frequency caps (durable, multi-instance safe) ─────────────────────────────

def _period_key(now: Optional[datetime] = None) -> str:
    now = now or datetime.now(timezone.utc)
    return now.strftime("%Y-%m-%d")


def frequency_check(tenant_id: str, campaign: dict, contact_id: str, channel: str, *,
                    commit: bool = False, now: Optional[datetime] = None) -> dict:
    """Per-contact per-channel daily cap (campaign override → config default). commit
    increments durably and idempotently is the caller's responsibility."""
    caps = campaign.get("frequency_caps") or {}
    limit = int(caps.get(f"{channel}_per_day", caps.get("per_day", _default_cap())))
    if limit < 0:
        return {"allowed": True, "used": 0, "limit": limit}
    key = f"cmpcap::{tenant_id}::{contact_id}::{channel}::{_period_key(now)}"
    rec = stores.cmp_freqcaps().get(tenant_id, key)
    used = int((rec or {}).get("count", 0))
    if used >= limit:
        return {"allowed": False, "reason": "daily_cap_reached", "used": used, "limit": limit}
    if commit:
        stores.cmp_freqcaps().put(tenant_id, {"id": key, "tenant_id": tenant_id, "contact_id": contact_id,
                                              "channel": channel, "count": used + 1, "updated_at": now_iso()})
    return {"allowed": True, "used": used, "limit": limit}


# ── channel dispatch (through existing registry actions) ──────────────────────

def _channel_send(tenant_id: str, channel: str, *, identity: str, rendered: dict, contact: dict,
                  campaign_id: str, contact_id: str, step_id: str) -> dict:
    """Dispatch one send via the existing channel action. Returns the action result.
    Idempotent through the action idempotency_key."""
    from . import campaigns
    if not campaigns.send_enabled():
        return {"status": "send_disabled", "detail": "campaign_send_disabled"}
    action = _CHANNEL_ACTION.get(channel)
    if action is None:
        return {"status": "failed", "detail": "unsupported_channel"}
    body = rendered.get("body", "")
    idem = f"cmpsend:{campaign_id}:{step_id}:{contact_id}"
    args = {"idempotency_key": idem}
    if channel == "email":
        args.update({"to": identity, "subject": rendered.get("subject", ""), "body": body})
    elif channel == "whatsapp":
        args.update({"to": identity, "body": body})
    elif channel in ("instagram", "messenger"):
        args.update({"to": identity, "body": body, "asset_id": ""})
    elif channel == "sms":
        args.update({"to": identity, "body": body, "sender_number": ""})
    elif channel == "telegram":
        args.update({"chat_id": identity, "user_id": identity, "body": body})
    elif channel in ("voice_call", "voice_callback"):
        args.update({"to": identity, "purpose": "callback", "responding_to_request": True})
    from .registry import execute_action
    return execute_action(tenant_id, action, args, idempotency_key=idem, skip_approval=True)


# ── stop conditions (Part 9) ──────────────────────────────────────────────────

def evaluate_stop_conditions(tenant_id: str, campaign_id: str, contact_id: str) -> dict:
    """Return {stop, reason} for a recipient before a step runs."""
    from . import campaigns, campaign_audience
    c = campaigns.get(tenant_id, campaign_id)
    if c is None or c.get("status") in ("cancelled", "completed", "archived"):
        return {"stop": True, "reason": "campaign_" + (c.get("status") if c else "missing")}
    if c.get("status") == "paused":
        return {"stop": False, "paused": True, "reason": "campaign_paused"}
    r = campaign_audience.get_recipient(tenant_id, campaign_id, contact_id)
    if r and r.get("state") in ("stopped", "opted_out", "suppressed", "completed", "cancelled"):
        return {"stop": True, "reason": r.get("stop_reason") or r.get("state")}
    # suppression added after snapshot
    contact = stores.contacts().get(tenant_id, contact_id) or {}
    if r and campaign_audience._is_suppressed(tenant_id, r.get("channel", ""), r.get("identity", "")):
        return {"stop": True, "reason": "suppressed"}
    return {"stop": False, "reason": ""}


# ── step execution (idempotent) ───────────────────────────────────────────────

def execute_step(tenant_id: str, campaign_id: str, contact_id: str) -> dict:
    """Execute the recipient's current step once: stop-check → revalidate eligibility
    → frequency commit → render → dispatch → record. Idempotent per (campaign, step,
    contact)."""
    from . import campaigns, campaign_audience, campaign_content
    r = campaign_audience.get_recipient(tenant_id, campaign_id, contact_id)
    if r is None:
        return {"status": "no_recipient"}
    stop = evaluate_stop_conditions(tenant_id, campaign_id, contact_id)
    if stop.get("paused"):
        return {"status": "paused"}
    if stop["stop"]:
        _set_recipient(tenant_id, r, state="stopped", stop_reason=stop["reason"])
        return {"status": "stopped", "reason": stop["reason"]}

    steps = campaigns.list_steps(tenant_id, campaign_id)
    idx = int(r.get("current_step", 0))
    if idx >= len(steps):
        _set_recipient(tenant_id, r, state="completed")
        return {"status": "completed"}
    step = steps[idx]
    channel = step["channel"]

    # idempotency: one execution per (recipient, step)
    exec_id = f"cmpexec::{tenant_id}::{campaign_id}::{step['id']}::{contact_id}"
    prev = stores.cmp_executions().get(tenant_id, exec_id)
    if prev is not None and prev.get("state") not in ("failed", "reconciliation_required"):
        return {"status": "duplicate", "state": prev.get("state")}

    # non-messaging step types
    if channel in ("wait", "condition", "task", "human_review", "stop"):
        _record_exec(tenant_id, exec_id, campaign_id, step, contact_id, state="completed", detail={"kind": channel})
        return _advance(tenant_id, r, steps, idx, "completed")

    # send-time revalidation
    contact = stores.contacts().get(tenant_id, contact_id) or {}
    elig = campaign_audience.evaluate_eligibility(tenant_id, campaigns.get(tenant_id, campaign_id), contact, channel)
    if elig["status"] != "eligible":
        state = {"suppressed": "suppressed", "frequency_cap_blocked": "eligibility_blocked",
                 "missing_consent": "eligibility_blocked", "missing_identity": "eligibility_blocked"}.get(
                     elig["status"], "eligibility_blocked")
        _record_exec(tenant_id, exec_id, campaign_id, step, contact_id, state=state, detail=elig)
        _set_recipient(tenant_id, r, state=state, stop_reason=elig["reason"])
        return {"status": state, "reason": elig["reason"]}

    # render content (missing required variable blocks the step)
    content = campaigns.latest_content(tenant_id, campaign_id, channel) or {}
    from . import config_repo
    biz = (config_repo.get_active(tenant_id) or {}).get("business_name", "")
    variables = campaign_content.build_variable_map(contact, business_name=biz)
    rendered = campaign_content.render(content, variables)
    if not rendered["ok"]:
        _record_exec(tenant_id, exec_id, campaign_id, step, contact_id, state="awaiting_approval",
                     detail={"unresolved": rendered["unresolved"]})
        _set_recipient(tenant_id, r, state="awaiting_approval")
        return {"status": "human_review", "unresolved": rendered["unresolved"]}

    # commit frequency cap then dispatch
    frequency_check(tenant_id, campaigns.get(tenant_id, campaign_id), contact_id, channel, commit=True)
    result = _channel_send(tenant_id, channel, identity=elig["identity"], rendered=rendered, contact=contact,
                           campaign_id=campaign_id, contact_id=contact_id, step_id=step["id"])
    state = _map_send_state(result.get("status", ""))
    _record_exec(tenant_id, exec_id, campaign_id, step, contact_id, state=state,
                 detail={"action_status": result.get("status"), "record_id": result.get("record_id", "")},
                 provider_id=result.get("record_id", ""))
    try:
        from . import usage
        usage.increment(tenant_id, "campaign_messages", idempotency_key=f"cmpmsg:{exec_id}")
    except Exception:
        pass
    if state in ("provider_pending", "sent", "completed", "send_disabled"):
        return _advance(tenant_id, r, steps, idx, state)
    _set_recipient(tenant_id, r, state=state)
    return {"status": state, "detail": result.get("detail", "")}


def _map_send_state(action_status: str) -> str:
    return {
        "provider_pending": "provider_pending", "queued": "provider_pending", "completed": "completed",
        "confirmed": "completed", "sent": "sent", "send_disabled": "send_disabled",
        "suppressed": "suppressed", "blocked_by_policy": "eligibility_blocked",
        "delayed_quiet_hours": "delayed", "not_connected": "failed", "failed": "failed",
    }.get(action_status, "failed")


def _advance(tenant_id, recipient, steps, idx, state) -> dict:
    nxt = idx + 1
    if nxt >= len(steps):
        _set_recipient(tenant_id, recipient, state="completed", current_step=nxt)
        return {"status": "completed", "last_state": state}
    _set_recipient(tenant_id, recipient, state="scheduled", current_step=nxt)
    return {"status": "advanced", "next_step": nxt, "last_state": state}


def _set_recipient(tenant_id, recipient, *, state, stop_reason: str = "", current_step: Optional[int] = None):
    recipient["state"] = state
    if stop_reason:
        recipient["stop_reason"] = stop_reason
    if current_step is not None:
        recipient["current_step"] = current_step
    recipient["attempts"] = int(recipient.get("attempts", 0)) + (1 if state in ("provider_pending", "sent", "failed") else 0)
    recipient["updated_at"] = now_iso()
    stores.cmp_recipients().put(tenant_id, recipient)


def _record_exec(tenant_id, exec_id, campaign_id, step, contact_id, *, state, detail=None, provider_id=""):
    stores.cmp_executions().put(tenant_id, {
        "id": exec_id, "tenant_id": tenant_id, "campaign_id": campaign_id, "step_id": step["id"],
        "contact_id": contact_id, "channel": step["channel"], "state": state,
        "provider_id": provider_id, "detail": detail or {}, "created_at": now_iso()})


# ── reply / conversion attribution (Part 10) ──────────────────────────────────

ATTRIBUTION = ("direct_reply", "assisted_reply", "booking_conversion", "lead_conversion",
               "human_conversion", "uncertain", "unrelated")


def process_reply(tenant_id: str, *, contact_id: str, conversation_id: str = "",
                  kind: str = "direct_reply") -> dict:
    """Link an inbound reply to any active campaign for this contact, pause its
    sequence, and record attribution. Never fabricates attribution."""
    linked = []
    for r in stores.cmp_recipients().list(tenant_id):
        if r.get("contact_id") != contact_id:
            continue
        if r.get("state") in ("completed", "stopped", "cancelled", "opted_out", "suppressed"):
            continue
        # a live reply pauses the sequence and stops the next scheduled step
        r["state"] = "answered" if kind in ("direct_reply", "assisted_reply") else "completed"
        r["reply_conversation_id"] = conversation_id
        r["updated_at"] = now_iso()
        stores.cmp_recipients().put(tenant_id, r)
        att = kind if kind in ATTRIBUTION else "uncertain"
        stores.cmp_attribution().put(tenant_id, {
            "id": new_id("cmpattr"), "tenant_id": tenant_id, "campaign_id": r["campaign_id"],
            "contact_id": contact_id, "conversation_id": conversation_id, "attribution": att,
            "created_at": now_iso()})
        linked.append(r["campaign_id"])
    return {"status": "attributed" if linked else "no_active_campaign", "campaigns": linked}


def process_opt_out(tenant_id: str, contact_id: str) -> dict:
    """A suppression/opt-out stops all future campaign steps for a contact."""
    stopped = 0
    for r in stores.cmp_recipients().list(tenant_id):
        if r.get("contact_id") == contact_id and r.get("state") not in ("completed", "cancelled", "opted_out"):
            r["state"] = "opted_out"; r["stop_reason"] = "opted_out"; r["updated_at"] = now_iso()
            stores.cmp_recipients().put(tenant_id, r)
            stopped += 1
    return {"status": "stopped", "count": stopped}
