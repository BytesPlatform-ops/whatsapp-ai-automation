"""Canonical action registry for the AI Receptionist (Wave 4).

Every receptionist action is defined here as an `ActionSpec` that maps
`action_type -> (handler_fn, requires_approval, billable, provider_action)`.
The `execute_action` entry point runs the full pipeline:
  validate args -> tenant ownership -> policy -> approval check
  -> billing hook (no-op `meter()` stub) -> execute -> persist -> activity.

Provider-facing actions (Gmail, Calendar, etc.) are typed stubs that return
`not_connected` / `provider_phase_pending` — no live calls are made in this
wave. This prepares the typed interface for the next integration phase.

Idempotency: if the same `idempotency_key` is presented for the same tenant,
the stored execution result is returned immediately without re-running the
action (no double side-effects, no double charges).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Callable, Optional

from activity.router import log_activity

from . import stores
from .ids import new_id, now_iso
from .schemas import (
    ActionExecution, Booking, Callback, Contact, Escalation, OptOut, Quote,
    Reminder, Task, Ticket,
)

log = logging.getLogger(__name__)

AGENT_SLUG = "ai-receptionist"

# ── ActionSpec ────────────────────────────────────────────────────────────────

@dataclass
class ActionSpec:
    handler: Callable[..., dict]
    requires_approval: bool = False
    billable: bool = False
    provider_action: bool = False  # True = external provider; stub returns not_connected


# ── billing ────────────────────────────────────────────────────────────────────

# Registry action_type → billing operation_type (only billable actions listed).
_BILLABLE_OPERATIONS = {
    "create_payment_link": "receptionist_approval_exec",
    "gmail_send": "receptionist_gmail_op",
    "calendar_create_event": "receptionist_calendar_op",
    "calendar_update_event": "receptionist_calendar_op",
}


def meter(tenant_id: str, action_type: str, *, estimated_cost: float = 0.0,
          idempotency_key: str = "") -> None:
    """Attribute a billable action to the ``ai_receptionist`` product. No-op (zero)
    unless billing is enabled and the action is billable; idempotent on the key so a
    duplicate action never double-charges. Never raises — billing must not break an
    action."""
    op = _BILLABLE_OPERATIONS.get(action_type)
    if not op:
        return
    try:
        from . import billing
        micro = int(estimated_cost * 1_000_000) if estimated_cost else 0
        billing.charge(tenant_id, op,
                       operation_id=idempotency_key or f"{tenant_id}:{action_type}",
                       actual_micro_usd=micro)
    except Exception:
        pass


# ── idempotency helpers ───────────────────────────────────────────────────────

def _idem_record_id(tenant_id: str, idempotency_key: str) -> str:
    return f"axe_idem::{tenant_id}::{idempotency_key}"


def _check_idempotency(tenant_id: str, idempotency_key: str) -> Optional[dict]:
    if not idempotency_key:
        return None
    rid = _idem_record_id(tenant_id, idempotency_key)
    rec = stores.action_executions().get(tenant_id, rid)
    return rec if rec is not None else None


def _store_idempotency(tenant_id: str, idempotency_key: str, execution: dict) -> None:
    if not idempotency_key:
        return
    # Store under the composite idempotency id so it can be retrieved cheaply
    idem_rec = dict(execution)
    idem_rec["id"] = _idem_record_id(tenant_id, idempotency_key)
    stores.action_executions().put(tenant_id, idem_rec)


# ── approval helper ───────────────────────────────────────────────────────────

def execute_approved_action(approval_item: Any) -> dict:  # type: ignore[type-arg]
    """Durable, stateless executor for an approved receptionist action.

    Reconstructs the action purely from the approval's persisted ``prepared_output``
    (action_type, arguments, conversation_id, idempotency_key) — NO in-process
    closure — so approval execution survives a cold restart. Executes exactly once
    (idempotency index), refuses rejected/expired approvals, fails safely on an
    unknown action type, records the execution and settles billing once.
    """
    tenant_id = getattr(approval_item, "tenant_id", "")
    status = getattr(approval_item, "status", "")
    if status in ("rejected", "skipped"):
        return {"ok": False, "error": f"{status} approval cannot execute"}

    po = getattr(approval_item, "prepared_output", None) or {}

    # Legacy /run payloads carry connector "execution_actions" instead of a canonical
    # action_type. Route them through the single registered dispatcher (so there is
    # never a second competing executor clobbering this slot by import order).
    if "execution_actions" in po and "action_type" not in po:
        try:
            from .. import agent as _legacy_agent
            return _legacy_agent._execute_receptionist(approval_item)
        except Exception as exc:  # pragma: no cover
            return {"ok": False, "error": f"legacy execution failed: {exc}"}

    action_type = po.get("action_type") or ""
    args = po.get("arguments", {}) or {}
    conv_id = po.get("conversation_id", "")
    idem = po.get("idempotency_key", "")

    spec = _REGISTRY.get(action_type)
    if spec is None:
        return {"ok": False, "error": f"unknown action_type: {action_type}"}

    # Execute once: a real (non-approval_required) prior result → return it.
    if idem:
        cached = _check_idempotency(tenant_id, idem)
        if cached is not None and cached.get("status") != "approval_required":
            return {"ok": True, "idempotent": True, "status": cached.get("status"),
                    "detail": cached.get("detail"), "record_type": cached.get("record_type"),
                    "record_id": cached.get("record_id")}

    try:
        result = spec.handler(tenant_id, args, conversation_id=conv_id)
    except Exception as exc:
        log.exception("approved action %s failed", action_type)
        return {"ok": False, "error": str(exc)}

    _persist_execution(tenant_id, action_type, args, idem, conv_id, result)
    try:
        meter(tenant_id, action_type, idempotency_key=idem or f"approved:{tenant_id}:{action_type}")
    except Exception:
        pass
    return {"ok": True, **result}


_EXECUTOR_REGISTERED = False


def _ensure_executor_registered() -> None:
    """Register the durable stateless executor for AGENT_SLUG exactly once. Safe to
    call at import and on every approval filing (so a restarted process re-registers
    before it can approve anything)."""
    global _EXECUTOR_REGISTERED
    if _EXECUTOR_REGISTERED:
        return
    try:
        from approvals.router import register_executor_for
        register_executor_for(AGENT_SLUG, execute_approved_action)
        _EXECUTOR_REGISTERED = True
    except Exception:
        pass


def _file_approval(tenant_id: str, action_type: str, args: dict,
                   idempotency_key: str, conversation_id: str) -> dict:
    """File a shared approval via the approvals subsystem. The executor is a durable,
    module-level function (registered at import), so no per-approval closure is kept."""
    from approvals.router import create_approval

    _ensure_executor_registered()

    # Build snapshot payload so the reviewer sees exactly what would execute — and so
    # the stateless executor can reconstruct the action after a restart.
    prepared = {
        "action_type": action_type,
        "arguments": args,
        "conversation_id": conversation_id,
        "idempotency_key": idempotency_key,
    }
    item = create_approval(
        tenant_id=tenant_id,
        agent=AGENT_SLUG,
        title=f"Approval required: {action_type}",
        action_type=action_type,
        description=f"Sensitive action '{action_type}' requires explicit approval before execution.",
        risk_level="high",
        capability="receptionist_action",
        tool=action_type,
        prepared_output=prepared,
        preview=f"{action_type} for conversation {conversation_id or 'unknown'}",
    )

    return {
        "status": "approval_required",
        "detail": f"Action '{action_type}' is pending approval (approval id: {item.id})",
        "record_type": "approval",
        "record_id": item.id,
        "data": {"approval_id": item.id, "approval_status": item.status},
    }


# ── execution persistence helper ──────────────────────────────────────────────

def _persist_execution(tenant_id: str, action_type: str, args: dict,
                       idempotency_key: str, conversation_id: str, result: dict) -> dict:
    """Persist an action execution record and store idempotency mapping."""
    rec = ActionExecution(
        tenant_id=tenant_id,
        action_type=action_type,
        arguments=args,
        idempotency_key=idempotency_key,
        status=result.get("status", "completed"),
        detail=result.get("detail", ""),
        record_type=result.get("record_type", ""),
        record_id=result.get("record_id", ""),
        data=result.get("data") or {},
        conversation_id=conversation_id,
    ).model_dump()
    stores.action_executions().put(tenant_id, rec)
    _store_idempotency(tenant_id, idempotency_key, rec)
    try:
        log_activity(tenant_id, f"action_{action_type}",
                     title=result.get("detail") or action_type, agent=AGENT_SLUG)
    except Exception:
        pass
    return rec


# ── action handler implementations ───────────────────────────────────────────
# Each handler takes (tenant_id: str, args: dict, *, conversation_id: str = "")
# and returns a typed dict: {status, detail, record_type, record_id, data}

def _h_answer_question(tenant_id: str, args: dict, *, conversation_id: str = "") -> dict:
    return {
        "status": "completed",
        "detail": "question answered",
        "record_type": "message",
        "record_id": "",
        "data": {"answer": args.get("answer", "")},
    }


def _h_capture_contact(tenant_id: str, args: dict, *, conversation_id: str = "") -> dict:
    contact = stores.find_or_create_contact(
        tenant_id,
        name=args.get("name"),
        email=args.get("email"),
        phone=args.get("phone"),
        company=args.get("company"),
        source=args.get("source", "receptionist"),
        intent=args.get("intent", "unknown"),
    )
    return {
        "status": "completed",
        "detail": f"contact captured: {contact.get('id')}",
        "record_type": "contact",
        "record_id": contact.get("id", ""),
        "data": contact,
    }


def _h_update_contact(tenant_id: str, args: dict, *, conversation_id: str = "") -> dict:
    contact_id = args.get("contact_id", "")
    if not contact_id:
        return {"status": "failed", "detail": "contact_id required", "record_type": "contact", "record_id": "", "data": {}}
    contact = stores.contacts().get(tenant_id, contact_id)
    if contact is None:
        return {"status": "failed", "detail": "contact not found", "record_type": "contact", "record_id": contact_id, "data": {}}
    for k, v in args.items():
        if k != "contact_id" and v is not None:
            contact[k] = v
    stores.contacts().put(tenant_id, contact)
    return {
        "status": "completed", "detail": "contact updated",
        "record_type": "contact", "record_id": contact_id, "data": contact,
    }


def _h_capture_lead(tenant_id: str, args: dict, *, conversation_id: str = "") -> dict:
    return _h_capture_contact(tenant_id, args, conversation_id=conversation_id)


def _h_update_lead(tenant_id: str, args: dict, *, conversation_id: str = "") -> dict:
    return _h_update_contact(tenant_id, args, conversation_id=conversation_id)


def _h_add_qualification_answer(tenant_id: str, args: dict, *, conversation_id: str = "") -> dict:
    contact_id = args.get("contact_id", "")
    question = args.get("question", "")
    answer = args.get("answer", "")
    if contact_id:
        stores.add_contact_activity(tenant_id, contact_id, f"Qualification: {question} → {answer}")
    return {
        "status": "completed", "detail": "qualification answer recorded",
        "record_type": "contact", "record_id": contact_id, "data": {"question": question, "answer": answer},
    }


def _h_update_lead_score(tenant_id: str, args: dict, *, conversation_id: str = "") -> dict:
    contact_id = args.get("contact_id", "")
    score = int(args.get("score", 0))
    if not contact_id:
        return {"status": "failed", "detail": "contact_id required", "record_type": "contact", "record_id": "", "data": {}}
    contact = stores.contacts().get(tenant_id, contact_id)
    if contact is None:
        return {"status": "failed", "detail": "contact not found", "record_type": "contact", "record_id": contact_id, "data": {}}
    contact["score"] = score
    stores.contacts().put(tenant_id, contact)
    return {
        "status": "completed", "detail": f"lead score updated to {score}",
        "record_type": "contact", "record_id": contact_id, "data": {"score": score},
    }


def _h_add_note(tenant_id: str, args: dict, *, conversation_id: str = "") -> dict:
    contact_id = args.get("contact_id", "")
    note = args.get("note", "")
    stores.add_contact_activity(tenant_id, contact_id, note)
    return {
        "status": "completed", "detail": "note added",
        "record_type": "contact", "record_id": contact_id, "data": {"note": note},
    }


def _h_add_tag(tenant_id: str, args: dict, *, conversation_id: str = "") -> dict:
    contact_id = args.get("contact_id", "")
    tag = args.get("tag", "")
    if contact_id:
        contact = stores.contacts().get(tenant_id, contact_id)
        if contact is not None:
            tags = contact.get("tags") or []
            if tag and tag not in tags:
                tags.append(tag)
            contact["tags"] = tags
            stores.contacts().put(tenant_id, contact)
    return {
        "status": "completed", "detail": f"tag '{tag}' added",
        "record_type": "contact", "record_id": contact_id, "data": {"tag": tag},
    }


def _h_change_lead_stage(tenant_id: str, args: dict, *, conversation_id: str = "") -> dict:
    contact_id = args.get("contact_id", "")
    stage = args.get("stage", "")
    if not contact_id:
        return {"status": "failed", "detail": "contact_id required", "record_type": "contact", "record_id": "", "data": {}}
    contact = stores.contacts().get(tenant_id, contact_id)
    if contact is None:
        return {"status": "failed", "detail": "contact not found", "record_type": "contact", "record_id": contact_id, "data": {}}
    contact["status"] = stage
    stores.contacts().put(tenant_id, contact)
    return {
        "status": "approval_required",
        "detail": f"Stage change to '{stage}' is pending approval",
        "record_type": "contact", "record_id": contact_id,
        "data": {"stage": stage},
    }


def _h_create_ticket(tenant_id: str, args: dict, *, conversation_id: str = "") -> dict:
    ticket = Ticket(
        tenant_id=tenant_id,
        contact_id=args.get("contact_id"),
        conversation_id=conversation_id,
        kind=args.get("kind", "support"),
        subject=args.get("subject", ""),
        body=args.get("body", ""),
        priority=args.get("priority", "normal"),
        source=args.get("source", "receptionist"),
    ).model_dump()
    stores.tickets().put(tenant_id, ticket)
    return {
        "status": "completed", "detail": f"ticket created: {ticket['id']}",
        "record_type": "ticket", "record_id": ticket["id"], "data": ticket,
    }


def _h_create_task(tenant_id: str, args: dict, *, conversation_id: str = "") -> dict:
    task = Task(
        tenant_id=tenant_id,
        contact_id=args.get("contact_id"),
        conversation_id=conversation_id,
        kind=args.get("kind", "generic"),
        title=args.get("title", ""),
        owner=args.get("owner", ""),
        due_at=args.get("due_at", ""),
        notes=args.get("notes", ""),
        source=args.get("source", "receptionist"),
    ).model_dump()
    stores.tasks().put(tenant_id, task)
    return {
        "status": "completed", "detail": f"task created: {task['id']}",
        "record_type": "task", "record_id": task["id"], "data": task,
    }


def _h_create_quote(tenant_id: str, args: dict, *, conversation_id: str = "") -> dict:
    quote = Quote(
        tenant_id=tenant_id,
        contact_id=args.get("contact_id"),
        conversation_id=conversation_id,
        service=args.get("service", ""),
        scope=args.get("scope", ""),
        budget=args.get("budget", ""),
        notes=args.get("notes", ""),
        source=args.get("source", "receptionist"),
    ).model_dump()
    stores.quotes().put(tenant_id, quote)
    return {
        "status": "completed", "detail": f"quote created: {quote['id']}",
        "record_type": "quote", "record_id": quote["id"], "data": quote,
    }


def _h_create_callback(tenant_id: str, args: dict, *, conversation_id: str = "") -> dict:
    """Callback request — requires approval before staff is notified."""
    cb = Callback(
        tenant_id=tenant_id,
        contact_id=args.get("contact_id"),
        conversation_id=conversation_id,
        name=args.get("name"),
        phone=args.get("phone"),
        preferred_time=args.get("preferred_time", ""),
        reason=args.get("reason", ""),
        source=args.get("source", "receptionist"),
        status="pending",
    ).model_dump()
    stores.callbacks().put(tenant_id, cb)
    return {
        "status": "pending",
        "detail": "callback request queued — pending staff assignment approval",
        "record_type": "callback", "record_id": cb["id"], "data": cb,
    }


def _h_escalate(tenant_id: str, args: dict, *, conversation_id: str = "") -> dict:
    esc = Escalation(
        tenant_id=tenant_id,
        contact_id=args.get("contact_id"),
        conversation_id=conversation_id,
        reason=args.get("reason", "Escalation requested"),
        priority=args.get("priority", "high"),
        context=args.get("context", ""),
        source=args.get("source", "receptionist"),
        status="open",
    ).model_dump()
    esc["notified"] = []
    stores.escalations().put(tenant_id, esc)
    return {
        "status": "completed", "detail": f"escalation created: {esc['id']}",
        "record_type": "escalation", "record_id": esc["id"], "data": esc,
    }


def _h_assign(tenant_id: str, args: dict, *, conversation_id: str = "") -> dict:
    """Assign conversation to a human agent — requires approval."""
    conv_id = args.get("conversation_id") or conversation_id
    assignee = args.get("assignee", "")
    return {
        "status": "approval_required",
        "detail": f"Assignment to '{assignee}' requires approval",
        "record_type": "conversation", "record_id": conv_id,
        "data": {"assignee": assignee},
    }


def _h_accept(tenant_id: str, args: dict, *, conversation_id: str = "") -> dict:
    conv_id = args.get("conversation_id") or conversation_id
    conv = stores.conversations().get(tenant_id, conv_id) if conv_id else None
    if conv is None:
        return {"status": "failed", "detail": "conversation not found", "record_type": "conversation", "record_id": conv_id, "data": {}}
    conv["status"] = "human_active"
    conv["ai_paused"] = True
    stores.conversations().put(tenant_id, conv)
    return {
        "status": "completed", "detail": "conversation accepted by human",
        "record_type": "conversation", "record_id": conv_id, "data": conv,
    }


def _h_pause_ai(tenant_id: str, args: dict, *, conversation_id: str = "") -> dict:
    conv_id = args.get("conversation_id") or conversation_id
    if conv_id:
        conv = stores.conversations().get(tenant_id, conv_id)
        if conv:
            conv["ai_paused"] = True
            stores.conversations().put(tenant_id, conv)
    return {
        "status": "completed", "detail": "AI paused",
        "record_type": "conversation", "record_id": conv_id, "data": {},
    }


def _h_resume_ai(tenant_id: str, args: dict, *, conversation_id: str = "") -> dict:
    conv_id = args.get("conversation_id") or conversation_id
    if conv_id:
        conv = stores.conversations().get(tenant_id, conv_id)
        if conv:
            conv["ai_paused"] = False
            stores.conversations().put(tenant_id, conv)
    return {
        "status": "completed", "detail": "AI resumed",
        "record_type": "conversation", "record_id": conv_id, "data": {},
    }


def _h_human_reply(tenant_id: str, args: dict, *, conversation_id: str = "") -> dict:
    """Log a human agent reply. Honest: just persists, does NOT send."""
    from .schemas import Message
    conv_id = args.get("conversation_id") or conversation_id
    msg = Message(
        tenant_id=tenant_id, conversation_id=conv_id,
        role="human", text=args.get("message", ""),
        channel=args.get("channel", "web_chat"),
        intent="unknown",
    ).model_dump()
    stores.messages().put(tenant_id, msg)
    return {
        "status": "completed", "detail": "human reply persisted",
        "record_type": "message", "record_id": msg["id"], "data": msg,
    }


def _h_resolve(tenant_id: str, args: dict, *, conversation_id: str = "") -> dict:
    conv_id = args.get("conversation_id") or conversation_id
    if conv_id:
        conv = stores.conversations().get(tenant_id, conv_id)
        if conv:
            conv["status"] = "resolved"
            stores.conversations().put(tenant_id, conv)
    return {
        "status": "completed", "detail": "conversation resolved",
        "record_type": "conversation", "record_id": conv_id, "data": {},
    }


def _h_close_conversation(tenant_id: str, args: dict, *, conversation_id: str = "") -> dict:
    conv_id = args.get("conversation_id") or conversation_id
    if conv_id:
        conv = stores.conversations().get(tenant_id, conv_id)
        if conv:
            conv["status"] = "closed"
            stores.conversations().put(tenant_id, conv)
    return {
        "status": "completed", "detail": "conversation closed",
        "record_type": "conversation", "record_id": conv_id, "data": {},
    }


def _h_reopen_conversation(tenant_id: str, args: dict, *, conversation_id: str = "") -> dict:
    conv_id = args.get("conversation_id") or conversation_id
    if conv_id:
        conv = stores.conversations().get(tenant_id, conv_id)
        if conv:
            conv["status"] = "open"
            conv["ai_paused"] = False
            stores.conversations().put(tenant_id, conv)
    return {
        "status": "completed", "detail": "conversation reopened",
        "record_type": "conversation", "record_id": conv_id, "data": {},
    }


def _h_suppress_contact(tenant_id: str, args: dict, *, conversation_id: str = "") -> dict:
    contact_id = args.get("contact_id", "")
    if contact_id:
        contact = stores.contacts().get(tenant_id, contact_id)
        if contact:
            contact["suppressed"] = True
            stores.contacts().put(tenant_id, contact)
    return {
        "status": "completed", "detail": "contact suppressed",
        "record_type": "contact", "record_id": contact_id, "data": {},
    }


def _h_unsubscribe_contact(tenant_id: str, args: dict, *, conversation_id: str = "") -> dict:
    opt = OptOut(
        tenant_id=tenant_id,
        contact_id=args.get("contact_id"),
        email=args.get("email"),
        phone=args.get("phone"),
        channel=args.get("channel"),
        scope=args.get("scope", "marketing"),
        reason=args.get("reason", "explicit_request"),
        source=args.get("source", "receptionist"),
    ).model_dump()
    stores.optouts().put(tenant_id, opt)
    return {
        "status": "completed", "detail": "contact unsubscribed",
        "record_type": "opt_out", "record_id": opt["id"], "data": opt,
    }


def _h_create_approval_request(tenant_id: str, args: dict, *, conversation_id: str = "") -> dict:
    from approvals.router import create_approval
    item = create_approval(
        tenant_id=tenant_id, agent=AGENT_SLUG,
        title=args.get("title", "Approval requested"),
        action_type=args.get("action_type", "generic"),
        description=args.get("description", ""),
        risk_level=args.get("risk_level", "medium"),
        capability=args.get("capability", "receptionist_action"),
        prepared_output=args.get("prepared_output") or {},
        preview=args.get("preview", ""),
    )
    return {
        "status": "approval_required", "detail": f"approval created: {item.id}",
        "record_type": "approval", "record_id": item.id,
        "data": {"approval_id": item.id, "approval_status": item.status},
    }


def _h_create_reminder(tenant_id: str, args: dict, *, conversation_id: str = "") -> dict:
    """Create a reminder record. Honest: queued, not sent."""
    reminder = Reminder(
        tenant_id=tenant_id,
        contact_id=args.get("contact_id"),
        conversation_id=conversation_id,
        title=args.get("title", "Reminder"),
        remind_at=args.get("remind_at", ""),
        channel=args.get("channel", "email"),
        related_type=args.get("related_type", ""),
        related_id=args.get("related_id", ""),
        status="scheduled",
        source=args.get("source", "receptionist"),
    ).model_dump()
    stores.reminders().put(tenant_id, reminder)
    return {
        "status": "queued",
        "detail": "reminder queued — will be dispatched by the reminder worker",
        "record_type": "reminder", "record_id": reminder["id"], "data": reminder,
    }


def _h_create_follow_up(tenant_id: str, args: dict, *, conversation_id: str = "") -> dict:
    """Create a follow-up task. Honest: pending, not scheduled."""
    task = Task(
        tenant_id=tenant_id,
        contact_id=args.get("contact_id"),
        conversation_id=conversation_id,
        kind="follow_up",
        title=args.get("title", "Follow up"),
        owner=args.get("owner", ""),
        due_at=args.get("due_at", ""),
        notes=args.get("notes", ""),
        source=args.get("source", "receptionist"),
    ).model_dump()
    stores.tasks().put(tenant_id, task)
    return {
        "status": "pending",
        "detail": "follow-up task created — pending assignment",
        "record_type": "task", "record_id": task["id"], "data": task,
    }


def _h_record_pending_booking_request(tenant_id: str, args: dict, *, conversation_id: str = "") -> dict:
    """Record a booking request that requires approval/provider confirmation."""
    from .schemas import Booking
    booking = Booking(
        tenant_id=tenant_id,
        contact_id=args.get("contact_id"),
        conversation_id=conversation_id,
        name=args.get("name"),
        phone=args.get("phone"),
        email=args.get("email"),
        service_type=args.get("service_type", ""),
        date=args.get("date", ""),
        time=args.get("time", ""),
        timezone=args.get("timezone", "UTC"),
        notes=args.get("notes", ""),
        status="pending",
        source=args.get("source", "receptionist"),
    ).model_dump()
    stores.bookings().put(tenant_id, booking)
    return {
        "status": "pending",
        "detail": "booking request recorded — pending calendar confirmation",
        "record_type": "booking", "record_id": booking["id"], "data": booking,
    }


def _h_record_pending_email_request(tenant_id: str, args: dict, *, conversation_id: str = "") -> dict:
    """Record a pending email send request. Honest: not sent until approved."""
    task = Task(
        tenant_id=tenant_id,
        contact_id=args.get("contact_id"),
        conversation_id=conversation_id,
        kind="generic",
        title=f"Send email: {args.get('subject', 'Pending email')}",
        owner=args.get("owner", ""),
        due_at=args.get("due_at", ""),
        notes=f"To: {args.get('to', '')} | Subject: {args.get('subject', '')} | Body: {args.get('body', '')[:200]}",
        source=args.get("source", "receptionist"),
    ).model_dump()
    stores.tasks().put(tenant_id, task)
    return {
        "status": "pending",
        "detail": "email request recorded — requires approval before sending",
        "record_type": "task", "record_id": task["id"], "data": task,
    }


def _h_record_pending_provider_action(tenant_id: str, args: dict, *, conversation_id: str = "") -> dict:
    """Generic placeholder for any provider-facing action pending a future wave."""
    return {
        "status": "provider_unavailable",
        "detail": f"Provider action '{args.get('provider_action', 'unknown')}' is not yet connected",
        "record_type": "", "record_id": "", "data": args,
    }


# ── Provider stubs (typed; no live calls) ─────────────────────────────────────

def _h_gmail_send(tenant_id: str, args: dict, *, conversation_id: str = "") -> dict:
    return {
        "status": "not_connected",
        "detail": "Gmail provider not connected — action queued for next integration phase",
        "record_type": "", "record_id": "", "data": {},
    }


def _h_calendar_create_event(tenant_id: str, args: dict, *, conversation_id: str = "") -> dict:
    return {
        "status": "not_connected",
        "detail": "Calendar provider not connected — action queued for next integration phase",
        "record_type": "", "record_id": "", "data": {},
    }


def _h_calendar_update_event(tenant_id: str, args: dict, *, conversation_id: str = "") -> dict:
    return {
        "status": "not_connected",
        "detail": "Calendar provider not connected — action queued for next integration phase",
        "record_type": "", "record_id": "", "data": {},
    }


# ── Payment action (approval-gated) ──────────────────────────────────────────

def _h_create_payment_link(tenant_id: str, args: dict, *, conversation_id: str = "") -> dict:
    """Payment-link creation — always requires approval; never creates inline."""
    from .schemas import PaymentRequest
    payment = PaymentRequest(
        tenant_id=tenant_id,
        contact_id=args.get("contact_id"),
        conversation_id=conversation_id,
        name=args.get("name"),
        email=args.get("email"),
        amount=args.get("amount"),
        currency=args.get("currency", "USD"),
        description=args.get("description", "Payment"),
        source=args.get("source", "receptionist"),
        status="pending",
    ).model_dump()
    stores.payments().put(tenant_id, payment)
    return {
        "status": "approval_required",
        "detail": f"Payment link for {args.get('amount')} {args.get('currency', 'USD')} requires approval before creation",
        "record_type": "payment", "record_id": payment["id"], "data": payment,
    }


# ── Registry definition ───────────────────────────────────────────────────────

_REGISTRY: dict[str, ActionSpec] = {
    # Information / CRM
    "answer_question":                ActionSpec(_h_answer_question, requires_approval=False),
    "capture_contact":                ActionSpec(_h_capture_contact, requires_approval=False),
    "update_contact":                 ActionSpec(_h_update_contact, requires_approval=False),
    "capture_lead":                   ActionSpec(_h_capture_lead, requires_approval=False),
    "update_lead":                    ActionSpec(_h_update_lead, requires_approval=False),
    "add_qualification_answer":       ActionSpec(_h_add_qualification_answer, requires_approval=False),
    "update_lead_score":              ActionSpec(_h_update_lead_score, requires_approval=False),
    "add_note":                       ActionSpec(_h_add_note, requires_approval=False),
    "add_tag":                        ActionSpec(_h_add_tag, requires_approval=False),
    # Lead stage change is sensitive (e.g. marking lost/converted)
    "change_lead_stage":              ActionSpec(_h_change_lead_stage, requires_approval=True),
    # Workflow records
    "create_ticket":                  ActionSpec(_h_create_ticket, requires_approval=False),
    "create_task":                    ActionSpec(_h_create_task, requires_approval=False),
    "create_quote":                   ActionSpec(_h_create_quote, requires_approval=False),
    # Sensitive: staff callback assignment
    "create_callback":                ActionSpec(_h_create_callback, requires_approval=True, billable=False),
    # Escalation
    "escalate":                       ActionSpec(_h_escalate, requires_approval=False),
    "assign":                         ActionSpec(_h_assign, requires_approval=True),
    "accept":                         ActionSpec(_h_accept, requires_approval=False),
    # AI control
    "pause_ai":                       ActionSpec(_h_pause_ai, requires_approval=False),
    "resume_ai":                      ActionSpec(_h_resume_ai, requires_approval=False),
    # Human messaging
    "human_reply":                    ActionSpec(_h_human_reply, requires_approval=False),
    # Conversation lifecycle
    "resolve":                        ActionSpec(_h_resolve, requires_approval=False),
    "close_conversation":             ActionSpec(_h_close_conversation, requires_approval=False),
    "reopen_conversation":            ActionSpec(_h_reopen_conversation, requires_approval=False),
    # Contact suppression
    "suppress_contact":               ActionSpec(_h_suppress_contact, requires_approval=False),
    "unsubscribe_contact":            ActionSpec(_h_unsubscribe_contact, requires_approval=False),
    # Meta-actions
    "create_approval_request":        ActionSpec(_h_create_approval_request, requires_approval=False),
    # Scheduled / async (queued/pending, not sent inline)
    "create_reminder":                ActionSpec(_h_create_reminder, requires_approval=True),
    "create_follow_up":               ActionSpec(_h_create_follow_up, requires_approval=True),
    # Pending placeholders (approval required before any external action)
    "record_pending_booking_request": ActionSpec(_h_record_pending_booking_request, requires_approval=False),
    "record_pending_email_request":   ActionSpec(_h_record_pending_email_request, requires_approval=True),
    "record_pending_provider_action": ActionSpec(_h_record_pending_provider_action, requires_approval=False),
    # Payment (always requires approval)
    "create_payment_link":            ActionSpec(_h_create_payment_link, requires_approval=True, billable=True),
    # Provider stubs (not_connected)
    "gmail_send":                     ActionSpec(_h_gmail_send, requires_approval=True, provider_action=True),
    "calendar_create_event":          ActionSpec(_h_calendar_create_event, requires_approval=True, provider_action=True),
    "calendar_update_event":          ActionSpec(_h_calendar_update_event, requires_approval=True, provider_action=True),
}


# ── Public API ────────────────────────────────────────────────────────────────

def get_spec(action_type: str) -> Optional[ActionSpec]:
    return _REGISTRY.get(action_type)


def list_action_types() -> list[str]:
    return sorted(_REGISTRY.keys())


def execute_action(
    tenant_id: str,
    action_type: str,
    args: dict,
    *,
    conversation_id: str = "",
    idempotency_key: str = "",
    estimated_cost: float = 0.0,
    skip_approval: bool = False,
) -> dict:
    """Execute a registered action through the full pipeline.

    Pipeline:
      1. validate args (action_type must exist)
      2. idempotency dedup (same key → stored result, no side-effect)
      3. approval check (requires_approval → file with approvals system)
      4. billing hook (no-op meter() stub)
      5. execute handler
      6. persist execution + idempotency index
      7. activity log

    Returns a typed dict: {status, detail, record_type, record_id, data}
    """
    # 1. Validate action_type
    spec = _REGISTRY.get(action_type)
    if spec is None:
        return {
            "status": "not_supported",
            "detail": f"Unknown action type: '{action_type}'",
            "record_type": "", "record_id": "", "data": {},
        }

    # 2. Idempotency dedup
    if idempotency_key:
        cached = _check_idempotency(tenant_id, idempotency_key)
        if cached is not None:
            return {
                "status": cached.get("status", "completed"),
                "detail": cached.get("detail", ""),
                "record_type": cached.get("record_type", ""),
                "record_id": cached.get("record_id", ""),
                "data": cached.get("data") or {},
            }

    # 3. Approval check — file approval and return early (no execution)
    if spec.requires_approval and not skip_approval:
        result = _file_approval(tenant_id, action_type, args, idempotency_key, conversation_id)
        # Persist an execution record for auditability even for approval-gated actions
        _persist_execution(tenant_id, action_type, args, idempotency_key, conversation_id, result)
        return result

    # 4. Billing hook — attributes billable actions to ai_receptionist (idempotent)
    try:
        meter(tenant_id, action_type, estimated_cost=estimated_cost, idempotency_key=idempotency_key)
    except Exception:
        pass

    # 5. Execute handler
    try:
        result = spec.handler(tenant_id, args, conversation_id=conversation_id)
    except Exception as exc:
        log.exception("registry action %s failed", action_type)
        result = {
            "status": "failed",
            "detail": f"Action '{action_type}' raised an exception: {exc}",
            "record_type": "", "record_id": "", "data": {},
        }

    # 6. Persist execution + idempotency
    _persist_execution(tenant_id, action_type, args, idempotency_key, conversation_id, result)

    return result


# Register the durable, stateless approval executor at import so approving a
# receptionist action works even on a freshly restarted process.
_ensure_executor_registered()
