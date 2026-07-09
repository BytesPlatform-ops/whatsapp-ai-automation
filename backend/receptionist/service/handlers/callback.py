"""Callback-request / call-routing handler.

Parks a callback request (number + preferred time + reason). When a number is
present it asks the voice provider to arrange the callback; the provider parks
the call (it never dials from here unless Twilio is configured), so the booking
stays `pending` and the reply promises the team will call at the chosen time.
No number → saved `pending` and we ask for the best number to reach them.
"""

from __future__ import annotations

from ..schemas import Callback
from ..stores import callbacks
from .base import HandlerContext, HandlerResult, register


@register("call_routing")
def handle_callback(ctx: HandlerContext) -> HandlerResult:
    phone = ctx.f("phone")
    preferred_time = ctx.f("preferred_time") or ctx.f("time")
    reason = ctx.f("reason") or ctx.f("notes")
    who = ctx.f("name") or "there"

    callback = Callback(
        tenant_id=ctx.tenant_id, contact_id=ctx.contact_id,
        conversation_id=ctx.conversation_id,
        name=ctx.f("name") or None, phone=phone or None,
        preferred_time=preferred_time, reason=reason,
        source=ctx.channel, status="pending",
    ).model_dump()

    if not phone:
        callbacks().put(ctx.tenant_id, callback)
        reply = (f"I'd be glad to arrange a callback, {who}. What's the best "
                 "number for the team to reach you on?")
        return HandlerResult(
            reply=reply, action="call_routing", status="pending",
            record_type="callback", record_id=callback["id"], record=callback,
            detail="missing phone",
        )

    provider_status = None
    try:
        from ...providers import request_callback

        result = request_callback(to=phone, reason=reason, preferred_time=preferred_time)
        provider_status = result.to_dict()
        callback["provider"] = result.provider
    except Exception:
        provider_status = None

    # Voice provider parks the call for the team to place — status stays pending.
    callbacks().put(ctx.tenant_id, callback)

    when = f" around {preferred_time}" if preferred_time else " as soon as we can"
    reply = (f"Got it, {who} — I've arranged a callback on {phone}{when}. "
             "A team member will be in touch.")
    return HandlerResult(
        reply=reply, action="call_routing", status="pending",
        record_type="callback", record_id=callback["id"], record=callback,
        provider_status=provider_status,
        detail=f"preferred_time={preferred_time or 'unspecified'}",
    )
