"""Payment-link handler.

Creates a real Stripe payment link when the payment provider is configured; when
it isn't (pending/disabled) the request is parked and the reply promises the team
will send a link — we NEVER invent a link. Amount is required to create one, so a
missing amount saves the request `pending` and asks for it. Fires the
`payment.created` webhook best-effort so external systems can track it.
"""

from __future__ import annotations

from ..schemas import PaymentRequest
from ..stores import payments
from .base import HandlerContext, HandlerResult, register


def _emit(payment: dict) -> None:
    try:
        from ...providers import emit_webhook

        emit_webhook(event="payment.created", payload=payment)
    except Exception:
        pass


@register("payment_link")
def handle_payment(ctx: HandlerContext) -> HandlerResult:
    amount = ctx.f("amount")
    currency = ctx.f("currency", "USD")
    description = ctx.f("notes") or ctx.f("service") or "Payment"
    email = ctx.f("email")
    who = ctx.f("name") or "there"

    payment = PaymentRequest(
        tenant_id=ctx.tenant_id, contact_id=ctx.contact_id,
        conversation_id=ctx.conversation_id,
        name=ctx.f("name") or None, email=email or None,
        amount=amount or None, currency=currency, description=description,
        source=ctx.channel, status="pending",
    ).model_dump()

    if not amount:
        payments().put(ctx.tenant_id, payment)
        _emit(payment)
        reply = (f"Happy to send a payment link, {who}. How much should it be for?")
        return HandlerResult(
            reply=reply, action="payment_link", status="pending",
            record_type="payment", record_id=payment["id"], record=payment,
            detail="missing amount",
        )

    provider_status = None
    status = "pending"
    reply = ""
    try:
        from ...providers import create_payment_link

        result = create_payment_link(
            amount=amount, currency=currency,
            description=description, customer_email=email)
        provider_status = result.to_dict()

        if result.status == "success":
            payment["status"] = "link_created"
            payment["payment_link"] = result.data.get("payment_link", "")
            payment["provider"] = "stripe"
            payment["provider_ref"] = result.data.get("provider_ref", "")
            status = "executed"
            reply = (f"Here's your secure payment link for {amount} {currency}, {who}: "
                     f"{payment['payment_link']}")
        elif result.status in ("pending", "disabled"):
            payment["status"] = "pending"
            status = "pending"
            reply = (f"Thanks {who} — the team will send you a payment link for "
                     f"{amount} {currency} shortly.")
        else:  # error
            payment["status"] = "failed"
            status = "failed"
            reply = ("Sorry — I wasn't able to generate a payment link just now. "
                     "The team will follow up with one shortly.")
    except Exception:
        payment["status"] = "failed"
        status = "failed"
        provider_status = None
        reply = ("Sorry — I wasn't able to generate a payment link just now. "
                 "The team will follow up with one shortly.")

    payments().put(ctx.tenant_id, payment)
    _emit(payment)

    return HandlerResult(
        reply=reply, action="payment_link", status=status,
        record_type="payment", record_id=payment["id"], record=payment,
        provider_status=provider_status,
        detail=f"amount={amount} {currency} status={payment['status']}",
    )
