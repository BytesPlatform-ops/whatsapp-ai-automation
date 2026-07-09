"""Unsubscribe / opt-out handler.

Records a durable `OptOut` (marketing by default, or `all` when the brain
extracts that scope) so the contact is suppressed from future sends. Best-effort
it also mirrors the opt-out into the legacy campaigns store and emits an
`optout.created` webhook — both wrapped so a missing dependency never breaks the
confirmation to the customer.
"""

from __future__ import annotations

from ..schemas import OptOut
from ..stores import optouts
from .base import HandlerContext, HandlerResult, register


@register("unsubscribe")
def handle_unsubscribe(ctx: HandlerContext) -> HandlerResult:
    email = ctx.f("email") or None
    phone = ctx.f("phone") or None
    scope = ctx.f("unsubscribe_scope") or "marketing"

    optout = OptOut(
        tenant_id=ctx.tenant_id, contact_id=ctx.contact_id,
        email=email, phone=phone, scope=scope,
        reason="reply_stop", source=ctx.channel,
    ).model_dump()
    optouts().put(ctx.tenant_id, optout)

    # Best-effort mirror into the legacy campaigns opt-out store, if present.
    try:
        from ...campaigns import store as _cstore

        add_opt_out = getattr(_cstore, "add_opt_out", None)
        if callable(add_opt_out):
            from ...campaigns.schemas import OptOutEntry

            add_opt_out(OptOutEntry(
                tenant_id=ctx.tenant_id, email=email, phone=phone,
                scope=scope, source="reply_stop",
            ))
    except Exception:
        pass

    try:
        from ...providers import emit_webhook

        emit_webhook(event="optout.created", payload=optout)
    except Exception:
        pass

    reply = ("You're all set — I've unsubscribed you and you won't receive any "
             "further marketing messages from us.")

    return HandlerResult(
        reply=reply, action="unsubscribe", status="executed",
        record_type="optout", record_id=optout["id"], record=optout,
        detail=f"scope={scope}",
    )
