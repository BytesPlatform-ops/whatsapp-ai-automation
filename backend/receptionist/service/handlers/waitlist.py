"""Waitlist handler.

Adds the customer to the waitlist for a service/slot that's currently full
(service + requested date/time + location + contact). The entry sits `waiting`
until a slot frees up, at which point the team (or a future job) notifies them.
Purely internal, so this always executes and the reply confirms their spot.
"""

from __future__ import annotations

from ..schemas import WaitlistEntry
from ..stores import waitlist
from .base import HandlerContext, HandlerResult, register


@register("waitlist")
def handle_waitlist(ctx: HandlerContext) -> HandlerResult:
    service = ctx.f("service") or ctx.f("service_interest")
    entry = WaitlistEntry(
        tenant_id=ctx.tenant_id, contact_id=ctx.contact_id,
        conversation_id=ctx.conversation_id,
        name=ctx.f("name") or None, phone=ctx.f("phone") or None,
        email=ctx.f("email") or None, service=service,
        requested_date=ctx.f("date"), requested_time=ctx.f("time"),
        location=ctx.f("location"), notes=ctx.f("notes"),
        source=ctx.channel, status="waiting",
    ).model_dump()

    waitlist().put(ctx.tenant_id, entry)

    who = ctx.f("name") or "there"
    reply = (f"You're on the waitlist, {who}"
             + (f" for {service}" if service else "")
             + " — we'll let you know the moment a slot opens up.")
    return HandlerResult(
        reply=reply, action="waitlist", status="executed",
        record_type="waitlist", record_id=entry["id"], record=entry,
        detail=f"service={service or 'unspecified'}",
    )
