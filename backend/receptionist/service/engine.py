"""Orchestration engine — the durable receptionist turn.

`run_message` is the single entry point: classify → resolve contact/conversation
→ persist the inbound message → dispatch to the intent handler → persist the
assistant reply + an action record → update the conversation → log activity.
Everything is tenant-scoped and durable via `service.stores`. It never raises on
expected-missing data; handlers ask for it in the reply.
"""

from __future__ import annotations

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


def run_message(*, tenant_id: str, message: str, channel: str = "web_chat",
                conversation_id: Optional[str] = None, overrides: Optional[dict] = None,
                campaign_id: str = "", now: Optional[str] = None) -> dict:
    now = now or now_iso()
    profile = get_profile(tenant_id)

    cls = classify(message, channel=channel, profile=profile)
    fields = dict(cls.fields)
    for key, val in (overrides or {}).items():  # explicit customer profile wins
        if val:
            fields[key] = val

    contact_id = _resolve_contact(tenant_id, fields, channel, cls.intent)
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
    result = handler(ctx)

    reply = result.reply or cls.reply or "Thanks for reaching out — how can I help?"
    if result.record_type == "contact" and result.record:
        contact_id = result.record.get("id", contact_id)

    stores.messages().put(tenant_id, Message(
        tenant_id=tenant_id, conversation_id=conv["id"], role="assistant", text=reply,
        channel=channel, intent=cls.intent, action=result.action,
        confidence=cls.confidence, degraded=(result.degraded or cls.degraded),
    ).model_dump())

    action_rec = ActionRecord(
        tenant_id=tenant_id, conversation_id=conv["id"], intent=cls.intent,
        action=result.action, status=result.status, record_type=result.record_type,
        record_id=result.record_id, detail=result.detail, degraded=cls.degraded,
    ).model_dump()
    stores.actions().put(tenant_id, action_rec)

    conv["last_intent"] = cls.intent
    conv["last_action"] = result.action
    conv["sentiment"] = cls.sentiment
    conv["summary"] = (message or "")[:200]
    conv["message_count"] = int(conv.get("message_count", 0)) + 2
    if contact_id:
        conv["contact_id"] = contact_id
    if result.escalate:
        conv["status"] = "escalated"
    stores.conversations().put(tenant_id, conv)

    try:
        log_activity(tenant_id, f"receptionist_{result.action}",
                     title=(result.detail or cls.intent), agent=AGENT_SLUG, created_at=now)
    except Exception:
        pass

    return {
        "reply": reply,
        "intent": cls.intent,
        "action": result.action,
        "status": result.status,
        "confidence": round(float(cls.confidence), 2),
        "sentiment": cls.sentiment,
        "degraded": bool(cls.degraded),
        "llm_provider": cls.provider,
        "model": cls.model,
        "conversation_id": conv["id"],
        "contact_id": contact_id,
        "record_type": result.record_type,
        "record_id": result.record_id,
        "record": result.record,
        "provider_status": result.provider_status,
        "escalated": result.escalate,
        "action_id": action_rec["id"],
    }
