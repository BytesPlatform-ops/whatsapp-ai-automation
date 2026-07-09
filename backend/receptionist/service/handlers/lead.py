"""Lead capture handler.

Captures/updates a CRM contact (the engine resolves identity; this ensures a
contact exists even for anonymous leads), scores it (urgency + intent +
completeness + budget), sets a CRM status, appends an activity entry, and fires
the `lead.created` webhook. Never blocks — a lead is internal.
"""

from __future__ import annotations

from .. import stores
from ..scoring import score_lead
from .base import HandlerContext, HandlerResult, register


@register("lead")
def handle_lead(ctx: HandlerContext) -> HandlerResult:
    contact = stores.contacts().get(ctx.tenant_id, ctx.contact_id) if ctx.contact_id else None
    if contact is None:
        contact = stores.find_or_create_contact(
            ctx.tenant_id, name=ctx.f("name") or None, email=ctx.f("email") or None,
            phone=ctx.f("phone") or None, company=ctx.f("company") or None,
            source=ctx.channel, intent="lead",
            service_interest=ctx.f("service") or ctx.f("service_interest"),
            budget=ctx.f("budget"), urgency=ctx.f("urgency", "normal"),
            last_message_summary=ctx.message[:280],
            activity_note="Lead captured",
        )

    score, status = score_lead(
        intent=ctx.intent or "lead", urgency=ctx.f("urgency", "normal"),
        has_email=bool(contact.get("email")), has_phone=bool(contact.get("phone")),
        has_name=bool(contact.get("name")),
        service_interest=contact.get("service_interest", "") or ctx.f("service"),
        budget=contact.get("budget", "") or ctx.f("budget"),
    )
    contact["score"] = score
    contact["status"] = status
    if ctx.f("service") or ctx.f("service_interest"):
        contact["service_interest"] = ctx.f("service") or ctx.f("service_interest")
    if ctx.f("budget"):
        contact["budget"] = ctx.f("budget")
    contact.setdefault("activity", []).append(
        {"at": ctx.now, "note": f"Scored {score} ({status})"})
    stores.contacts().put(ctx.tenant_id, contact)

    try:
        from ...providers import emit_webhook
        emit_webhook(event="lead.created", payload=contact)
    except Exception:
        pass

    who = contact.get("name") or "there"
    reply = (f"Thanks {who} — I've noted your details"
             + (f" about {contact['service_interest']}" if contact.get("service_interest") else "")
             + ". Someone from our team will follow up soon.")
    return HandlerResult(
        reply=reply, action="lead", status="executed",
        record_type="contact", record_id=contact["id"], record=contact,
        detail=f"score={score} status={status}",
    )
