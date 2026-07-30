"""Orchestration engine — the durable receptionist turn.

`run_message` is the single entry point: classify → resolve contact/conversation
→ persist the inbound message → dispatch to the intent handler → persist the
assistant reply + an action record → update the conversation → log activity.
Everything is tenant-scoped and durable via `service.stores`. It never raises on
expected-missing data; handlers ask for it in the reply.

New in Wave 2:
  - Genuine multi-turn memory: bounded history fed into classify; contact profile
    merged into fields for returning customers; durable rolling summary.
  - Message idempotency: optional idempotency_key / provider_message_id dedup.
  - Durable per-conversation lock: best-effort serialization via stores.locks.
  - Human handoff state machine: AI is paused while conversation is human-owned.
"""

from __future__ import annotations

import os
from typing import Optional

from activity.router import log_activity

from . import stores
from .business_profile import get_profile
from .classifier import classify
from .handlers import get_handler
from .handlers.base import HandlerContext
from .ids import now_iso
from .schemas import ActionRecord, Conversation, Message

AGENT_SLUG = "ai-receptionist"

# Conversation statuses where the AI must not generate a reply
_HUMAN_OWNED_STATUSES = {"waiting_for_human", "assigned_to_human", "human_active", "resolved"}


# ── multi-turn context builder ────────────────────────────────────────────────

def build_context(tenant_id: str, conv: dict, contact: Optional[dict]) -> dict:
    """Build the bounded context dict passed into classify and handlers.

    Returns:
        {
          "history": [{"role": ..., "text": ...}, ...],  # bounded to limit
          "summary": str,
          "contact": dict | None,
        }
    """
    limit = int(os.environ.get("AI_RECEPTIONIST_HISTORY_MESSAGE_LIMIT", "10"))
    conv_id = conv.get("id", "")
    all_msgs = stores.messages().query(tenant_id, conversation_id=conv_id)
    # newest_first=False is the default for query (list → reversed), so sort by created_at
    all_msgs_sorted = sorted(all_msgs, key=lambda m: m.get("created_at", ""))
    # Take newest N (bounded)
    recent = all_msgs_sorted[-limit:] if len(all_msgs_sorted) > limit else all_msgs_sorted
    history = [{"role": m.get("role", "unknown"), "text": m.get("text", "")} for m in recent]
    return {
        "history": history,
        "summary": conv.get("summary", ""),
        "contact": contact,
    }


# ── rolling summary ───────────────────────────────────────────────────────────

_SUMMARY_MAX = 400  # characters, deterministic floor (not LLM)


def _update_summary(conv: dict, intent: str, customer_message: str, now: str) -> None:
    """Update conv in-place with a deterministic rolling summary.

    In openai mode a real LLM summary could be computed here; the deterministic
    version is the always-on floor and is sufficient for the hermetic test suite.
    """
    prev = conv.get("summary", "")
    version = int(conv.get("summary_version", 0))
    new_entry = f"[{intent}] {(customer_message or '')[:150]}"
    combined = f"{prev} | {new_entry}" if prev else new_entry
    # Bound length — keep the tail (most recent context is more useful)
    if len(combined) > _SUMMARY_MAX:
        combined = combined[-_SUMMARY_MAX:]
    conv["summary"] = combined
    conv["summary_version"] = version + 1
    conv["summary_updated_at"] = now


# ── internal helpers ──────────────────────────────────────────────────────────

def _get_or_create_conversation(tenant_id: str, conversation_id: Optional[str],
                                channel: str, contact_id: Optional[str]) -> dict:
    if conversation_id:
        conv = stores.conversations().get(tenant_id, conversation_id)
        if conv is not None:
            return conv
    conv = Conversation(tenant_id=tenant_id, channel=channel, contact_id=contact_id).model_dump()
    return stores.conversations().put(tenant_id, conv)


def _resolve_contact(tenant_id: str, fields: dict, channel: str, intent: str) -> Optional[str]:
    """Create/update a contact when the message carries identity (email/phone)."""
    email, phone = fields.get("email"), fields.get("phone")
    if not (email or phone):
        return None
    contact = stores.find_or_create_contact(
        tenant_id, name=fields.get("name") or None, email=email or None, phone=phone or None,
        company=fields.get("company") or None, source=channel, intent=intent,
        service_interest=fields.get("service") or fields.get("service_interest", ""),
        budget=fields.get("budget", ""), urgency=fields.get("urgency", "normal"),
        last_message_summary="", activity_note=f"Message ({intent})",
    )
    return contact["id"]


def _load_contact(tenant_id: str, contact_id: Optional[str]) -> Optional[dict]:
    if not contact_id:
        return None
    return stores.contacts().get(tenant_id, contact_id)


def _merge_contact_into_fields(fields: dict, contact: Optional[dict]) -> None:
    """Fill missing identity fields from the already-linked contact record.

    This enables returning-customer memory: if turn 1 gave us the name/email and
    turn 2 says "book it under my name", the booking handler will still have the
    name/email from the contact, without the user repeating themselves.
    """
    if not contact:
        return
    for key in ("name", "email", "phone", "service_interest"):
        if not fields.get(key) and contact.get(key):
            fields[key] = contact[key]


# ── idempotency index ─────────────────────────────────────────────────────────

def _idem_key(tenant_id: str, key: str) -> str:
    return f"{tenant_id}::{key}"


def _check_idempotency(tenant_id: str, idempotency_key: str,
                       provider_message_id: str) -> Optional[dict]:
    """Return the cached result if a dedup key was seen before; else None."""
    key = idempotency_key or provider_message_id
    if not key:
        return None
    record_id = _idem_key(tenant_id, key)
    rec = stores.message_index().get(tenant_id, record_id)
    if rec is not None:
        return rec.get("result")
    return None


def _store_idempotency(tenant_id: str, idempotency_key: str,
                       provider_message_id: str, result: dict) -> None:
    """Persist result under the dedup key."""
    key = idempotency_key or provider_message_id
    if not key:
        return
    record_id = _idem_key(tenant_id, key)
    stores.message_index().put(tenant_id, {
        "id": record_id,
        "tenant_id": tenant_id,
        "dedup_key": key,
        "result": result,
    })


# ── main entry point ──────────────────────────────────────────────────────────

def run_message(*, tenant_id: str, message: str, channel: str = "web_chat",
                conversation_id: Optional[str] = None, overrides: Optional[dict] = None,
                campaign_id: str = "", now: Optional[str] = None,
                idempotency_key: str = "", provider_message_id: str = "") -> dict:
    now = now or now_iso()
    profile = get_profile(tenant_id)

    # ── B: idempotency check (before any side-effects) ────────────────────────
    cached = _check_idempotency(tenant_id, idempotency_key, provider_message_id)
    if cached is not None:
        return cached

    # ── B: durable per-conversation lock (skip when conversation_id unknown) ──
    lock_owner = now  # use timestamp as a unique owner token
    lock_acquired = True
    if conversation_id:
        lock_acquired = stores.acquire_lock(tenant_id, conversation_id, owner=lock_owner)
        if not lock_acquired:
            return {
                "status": "processing",
                "detail": "conversation is busy",
                "conversation_id": conversation_id,
            }

    try:
        result = _run_message_inner(
            tenant_id=tenant_id, message=message, channel=channel,
            conversation_id=conversation_id, overrides=overrides,
            campaign_id=campaign_id, now=now, profile=profile,
        )
    finally:
        if conversation_id and lock_acquired:
            stores.release_lock(tenant_id, conversation_id)

    # ── B: store result in idempotency index ──────────────────────────────────
    _store_idempotency(tenant_id, idempotency_key, provider_message_id, result)
    return result


def _run_message_inner(*, tenant_id: str, message: str, channel: str,
                       conversation_id: Optional[str], overrides: Optional[dict],
                       campaign_id: str, now: str, profile: dict) -> dict:
    """Core message-processing logic, called from run_message after lock/dedup."""

    # ── resolve conversation early (needed for AI-pause check) ───────────────
    # We can only pre-load a conversation if we have the id; new conversations
    # are created after the AI-pause check.
    existing_conv: Optional[dict] = None
    if conversation_id:
        existing_conv = stores.conversations().get(tenant_id, conversation_id)

    # ── C: AI pause — if conversation is human-owned, park message only ───────
    if existing_conv is not None:
        conv_status = existing_conv.get("status", "open")
        if conv_status in _HUMAN_OWNED_STATUSES:
            # Persist the inbound customer message but do NOT run the AI
            stores.messages().put(tenant_id, Message(
                tenant_id=tenant_id, conversation_id=existing_conv["id"],
                role="customer", text=message, channel=channel,
                intent="unknown", confidence=0.0, degraded=True,
            ).model_dump())
            existing_conv["message_count"] = int(existing_conv.get("message_count", 0)) + 1
            stores.conversations().put(tenant_id, existing_conv)
            return {
                "status": conv_status,
                "ai_paused": True,
                "reply": "",
                "conversation_id": existing_conv["id"],
                "contact_id": existing_conv.get("contact_id"),
            }

    # ── A: classify with bounded history ─────────────────────────────────────
    # We need the conversation to build history; use existing or None for new ones
    history_ctx: list[dict] = []
    existing_contact: Optional[dict] = None

    if existing_conv is not None:
        existing_contact = _load_contact(tenant_id, existing_conv.get("contact_id"))
        ctx_data = build_context(tenant_id, existing_conv, existing_contact)
        history_ctx = ctx_data["history"]

    cls = classify(message, channel=channel, profile=profile, history=history_ctx)
    fields = dict(cls.fields)
    for key, val in (overrides or {}).items():  # explicit customer profile wins
        if val:
            fields[key] = val

    # ── A: contact memory — merge known contact profile into missing fields ────
    if existing_conv is not None and existing_conv.get("contact_id"):
        if existing_contact is None:
            existing_contact = _load_contact(tenant_id, existing_conv.get("contact_id"))
        _merge_contact_into_fields(fields, existing_contact)

    contact_id = _resolve_contact(tenant_id, fields, channel, cls.intent)
    # If no new contact was resolved but one is already linked, keep it
    if contact_id is None and existing_conv is not None:
        contact_id = existing_conv.get("contact_id")

    conv = _get_or_create_conversation(tenant_id, conversation_id, channel, contact_id)

    stores.messages().put(tenant_id, Message(
        tenant_id=tenant_id, conversation_id=conv["id"], role="customer", text=message,
        channel=channel, intent=cls.intent, confidence=cls.confidence, degraded=cls.degraded,
    ).model_dump())

    ctx = HandlerContext(
        tenant_id=tenant_id, message=message, intent=cls.intent, fields=fields,
        profile=profile, conversation_id=conv["id"], contact_id=contact_id, channel=channel,
        confidence=cls.confidence, degraded=cls.degraded,
        campaign_id=campaign_id or fields.get("campaign_id", ""), now=now,
    )

    handler = get_handler(cls.intent) or get_handler("fallback")
    handler_result = handler(ctx)

    reply = handler_result.reply or cls.reply or "Thanks for reaching out — how can I help?"
    if handler_result.record_type == "contact" and handler_result.record:
        contact_id = handler_result.record.get("id", contact_id)

    stores.messages().put(tenant_id, Message(
        tenant_id=tenant_id, conversation_id=conv["id"], role="assistant", text=reply,
        channel=channel, intent=cls.intent, action=handler_result.action,
        confidence=cls.confidence, degraded=(handler_result.degraded or cls.degraded),
    ).model_dump())

    action_rec = ActionRecord(
        tenant_id=tenant_id, conversation_id=conv["id"], intent=cls.intent,
        action=handler_result.action, status=handler_result.status,
        record_type=handler_result.record_type, record_id=handler_result.record_id,
        detail=handler_result.detail, degraded=cls.degraded,
    ).model_dump()
    stores.actions().put(tenant_id, action_rec)

    # ── D: build + persist a schema-validated response plan for this turn ──────
    # Additive + guarded: a plan-building failure must never break the turn.
    plan_version = ""
    try:
        from .response_plan import build_plan_from_classification, persist_plan
        _plan = build_plan_from_classification(
            cls.intent, dict(fields), reply,
            confidence=float(cls.confidence), handler_action=handler_result.action,
            handler_status=handler_result.status, record_type=handler_result.record_type,
            record_id=handler_result.record_id or "", provider=cls.provider, model=cls.model,
            escalation_recommendation=bool(handler_result.escalate),
        )
        persist_plan(_plan, action_record=action_rec, conversation=conv)
        stores.actions().put(tenant_id, action_rec)
        plan_version = _plan.plan_version
    except Exception:
        plan_version = ""

    # ── A: update conversation with durable rolling summary ───────────────────
    conv["last_intent"] = cls.intent
    conv["last_action"] = handler_result.action
    conv["sentiment"] = cls.sentiment
    conv["message_count"] = int(conv.get("message_count", 0)) + 2
    if contact_id:
        conv["contact_id"] = contact_id

    # ── C: escalation via handler sets waiting_for_human (not old "escalated") ─
    if handler_result.escalate:
        _apply_escalation_to_conv(conv, by="ai", now=now)

    _update_summary(conv, cls.intent, message, now)
    stores.conversations().put(tenant_id, conv)

    try:
        log_activity(tenant_id, f"receptionist_{handler_result.action}",
                     title=(handler_result.detail or cls.intent), agent=AGENT_SLUG,
                     created_at=now)
    except Exception:
        pass

    # ── durable usage counters (idempotent; never break the turn) ─────────────
    try:
        from . import usage
        is_new_conv = int(conv.get("message_count", 0)) <= 2
        if is_new_conv:
            usage.increment(tenant_id, "monthly_conversations",
                            idempotency_key=f"conv:{conv['id']}")
        usage.increment(tenant_id, "monthly_ai_turns", idempotency_key=f"turn:{action_rec['id']}")
        if handler_result.escalate:
            usage.increment(tenant_id, "escalations", idempotency_key=f"esc:{action_rec['id']}")
        if conv.get("summary_version"):
            usage.increment(tenant_id, "summaries", idempotency_key=f"sum:{conv['id']}:{conv.get('summary_version')}")
    except Exception:
        pass

    return {
        "reply": reply,
        "intent": cls.intent,
        "action": handler_result.action,
        "status": handler_result.status,
        "confidence": round(float(cls.confidence), 2),
        "sentiment": cls.sentiment,
        "degraded": bool(cls.degraded),
        "llm_provider": cls.provider,
        "model": cls.model,
        "conversation_id": conv["id"],
        "contact_id": contact_id,
        "record_type": handler_result.record_type,
        "record_id": handler_result.record_id,
        "record": handler_result.record,
        "provider_status": handler_result.provider_status,
        "escalated": handler_result.escalate,
        "action_id": action_rec["id"],
        "response_plan_version": plan_version,
    }


# ── C: shared handoff helpers (also used by console_api) ─────────────────────

def _sla_due_at(now: str) -> str:
    """Compute SLA deadline from now + AI_RECEPTIONIST_SLA_MINUTES (default 30)."""
    from datetime import datetime as _dt, timezone as _tz, timedelta as _td
    sla_minutes = int(os.environ.get("AI_RECEPTIONIST_SLA_MINUTES", "30"))
    try:
        base = _dt.fromisoformat(now)
    except Exception:
        base = _dt.now(_tz.utc)
    if base.tzinfo is None:
        base = base.replace(tzinfo=_tz.utc)
    return (base + _td(minutes=sla_minutes)).isoformat(timespec="seconds")


def _append_audit(conv: dict, from_status: str, to_status: str, by: str, now: str) -> None:
    conv.setdefault("audit", []).append({
        "at": now,
        "from": from_status,
        "to": to_status,
        "by": by,
    })


def _apply_escalation_to_conv(conv: dict, by: str = "system", now: Optional[str] = None) -> None:
    """Transition conversation → waiting_for_human, set ai_paused, compute SLA."""
    _now = now or now_iso()
    from_status = conv.get("status", "open")
    conv["status"] = "waiting_for_human"
    conv["ai_paused"] = True
    conv["sla_due_at"] = _sla_due_at(_now)
    _append_audit(conv, from_status, "waiting_for_human", by, _now)
