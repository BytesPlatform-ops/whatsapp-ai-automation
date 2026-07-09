"""Progressive structured-intake handler.

Collects the essentials to open a case — name, a way to reach them (email OR
phone), and the service they want — one field at a time. Partial progress is
saved to the CRM on every turn via `find_or_create_contact` (which dedups by
email/phone), so a customer answering across several messages never loses what
they already gave. Asks for the next single missing field; only when all three
are present does it confirm intake is complete.
"""

from __future__ import annotations

from .. import stores
from .base import HandlerContext, HandlerResult, register


@register("intake")
def handle_intake(ctx: HandlerContext) -> HandlerResult:
    contact = stores.find_or_create_contact(
        ctx.tenant_id,
        name=ctx.f("name") or None,
        email=ctx.f("email") or None,
        phone=ctx.f("phone") or None,
        service_interest=ctx.f("service") or ctx.f("service_interest"),
        source=ctx.channel, intent="intake",
        notes=ctx.f("notes"),
        activity_note="Intake",
    )

    has_name = bool(contact.get("name"))
    has_contact = bool(contact.get("email") or contact.get("phone"))
    has_service = bool(contact.get("service_interest"))

    if not has_name:
        missing = "name"
        prompt = "Could I start with your name?"
    elif not has_contact:
        missing = "contact"
        prompt = "What's the best email or phone number to reach you on?"
    elif not has_service:
        missing = "service"
        prompt = "And which service are you interested in?"
    else:
        missing = ""
        prompt = ""

    who = contact.get("name") or "there"
    if missing:
        reply = f"Thanks{'' if who == 'there' else ', ' + who} — {prompt}"
        status = "pending"
        detail = f"missing={missing}"
    else:
        reply = (f"Perfect, {who} — I've got everything I need about "
                 f"{contact.get('service_interest') or 'your request'}. "
                 "The team will take it from here and follow up shortly.")
        status = "executed"
        detail = "complete"

    return HandlerResult(
        reply=reply, action="intake", status=status,
        record_type="contact", record_id=contact["id"], record=contact,
        detail=detail,
    )
