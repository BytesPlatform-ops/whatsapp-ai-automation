"""Quote / estimate-request handler.

Captures a durable quote request (service, scope, quantity, location, timeline,
budget + contact details) so the team can price it, then fires the
`quote.created` webhook so external CRMs/Slack pick it up. Pricing itself stays
with a human — we never invent an estimate — so the quote is saved `new` and the
reply promises a follow-up. Missing detail is fine: the team fills the gaps.
"""

from __future__ import annotations

from ..schemas import Quote
from ..stores import quotes
from .base import HandlerContext, HandlerResult, register


@register("quote")
def handle_quote(ctx: HandlerContext) -> HandlerResult:
    service = ctx.f("service") or ctx.f("service_interest")
    quote = Quote(
        tenant_id=ctx.tenant_id, contact_id=ctx.contact_id,
        conversation_id=ctx.conversation_id,
        name=ctx.f("name") or None, email=ctx.f("email") or None,
        phone=ctx.f("phone") or None, service=service,
        scope=ctx.f("scope"), quantity=ctx.f("quantity"),
        location=ctx.f("location"), timeline=ctx.f("timeline"),
        budget=ctx.f("budget"), notes=ctx.f("notes"),
        source=ctx.channel, status="new",
    ).model_dump()

    quotes().put(ctx.tenant_id, quote)

    provider_status = None
    try:
        from ...providers import emit_webhook

        hook = emit_webhook(event="quote.created", payload=quote)
        provider_status = {"webhook": hook.to_dict()}
    except Exception:
        provider_status = None

    who = ctx.f("name") or "there"
    reply = (f"Thanks {who} — I've noted your request"
             + (f" for {service}" if service else "")
             + ". Our team will put together a quote and get back to you shortly.")
    return HandlerResult(
        reply=reply, action="quote", status="executed",
        record_type="quote", record_id=quote["id"], record=quote,
        provider_status=provider_status,
        detail=f"service={service or 'unspecified'}",
    )
