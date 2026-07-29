"""Payment-link handler (Wave 4 update).

Payment-link creation now goes through the approval gating path: a pending
approval is filed via the shared approvals system and no live Stripe link is
created inline. The reply is honest about this state.

Wave 1-3 behaviour preserved:
  - If amount is missing, the request is parked with status=pending and the
    user is asked for the amount (no change).
  - The `payment.created` webhook is still fired best-effort.
  - The HandlerContext / HandlerResult contract is unchanged.
  - `payments()` store still gets a record stamped with status="pending".

New in Wave 4:
  - When amount IS present, the action goes through `execute_action` with
    action_type="create_payment_link" which requires_approval=True.
    This files a shared approval and returns status="approval_required".
    The reply is honest: "pending review", not "here's your link".
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
        reply = f"Happy to send a payment link, {who}. How much should it be for?"
        return HandlerResult(
            reply=reply, action="payment_link", status="pending",
            record_type="payment", record_id=payment["id"], record=payment,
            detail="missing amount",
        )

    # Amount is present — route through the approval-gated action registry.
    # No live Stripe call; the payment record is stored as pending.
    payments().put(ctx.tenant_id, payment)
    _emit(payment)

    try:
        from ..registry import execute_action

        reg_result = execute_action(
            ctx.tenant_id, "create_payment_link",
            {
                "contact_id": ctx.contact_id or "",
                "name": ctx.f("name"),
                "email": email,
                "amount": amount,
                "currency": currency,
                "description": description,
                "source": ctx.channel,
            },
            conversation_id=ctx.conversation_id,
            idempotency_key=f"pay_{ctx.conversation_id}_{amount}_{currency}",
        )
        status = reg_result.get("status", "pending")
    except Exception:
        status = "pending"
        reg_result = {"detail": "approval gating unavailable"}

    # Honest reply: approval_required → tell the user it's under review
    if status == "approval_required":
        reply = (
            f"Thanks {who} — I've noted your payment request for {amount} {currency}. "
            "This is being reviewed and you'll receive the payment link shortly."
        )
    else:
        reply = (
            f"Thanks {who} — your payment request for {amount} {currency} has been "
            "recorded. The team will follow up with a payment link."
        )

    return HandlerResult(
        reply=reply, action="payment_link", status=status,
        record_type="payment", record_id=payment["id"], record=payment,
        detail=f"amount={amount} {currency} status={payment['status']}",
    )
