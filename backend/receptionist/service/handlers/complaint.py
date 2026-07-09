"""Complaint handler.

Opens a `complaint` ticket with the customer's own words as context and a
priority derived from sentiment/urgency. A negative or high-urgency complaint is
also pushed to the team (email/provider) and marks the result `escalate=True`;
either way a `ticket.created` webhook is emitted best-effort. Never fakes a
notification — if nothing is configured the ticket still exists honestly.
"""

from __future__ import annotations

from ..schemas import Ticket
from ..stores import tickets
from .base import HandlerContext, HandlerResult, register


@register("complaint")
def handle_complaint(ctx: HandlerContext) -> HandlerResult:
    subject = (ctx.message or "Complaint").strip()[:60]
    sentiment = ctx.f("sentiment", "negative") or "negative"
    urgent = sentiment == "negative" or ctx.f("urgency") in ("high", "emergency")
    priority = "urgent" if urgent else "normal"

    ticket = Ticket(
        tenant_id=ctx.tenant_id, contact_id=ctx.contact_id,
        conversation_id=ctx.conversation_id, kind="complaint",
        subject=subject, body=ctx.message, priority=priority,
        sentiment=sentiment, status="open", source=ctx.channel,
        context=[{"role": "customer", "text": ctx.message, "at": ctx.now}],
    ).model_dump()

    notified: list[str] = []
    provider_status: dict = {}
    escalate = False
    if priority == "urgent":
        escalate = True
        try:
            from ...providers import notify_team

            note = notify_team(
                tenant_id=ctx.tenant_id,
                subject=f"[Complaint] {subject}",
                body=f"A customer raised a complaint.\n\nPriority: {priority}\n"
                     f"Sentiment: {sentiment}\nMessage: {ctx.message}\n"
                     f"Conversation: {ctx.conversation_id}",
                event="ticket.created",
            )
            provider_status["notify"] = note.to_dict()
            if note.status == "success":
                notified.append("email")
        except Exception:
            pass

    ticket["notified"] = notified

    try:
        from ...providers import emit_webhook

        hook = emit_webhook(event="ticket.created", payload=ticket)
        provider_status["webhook"] = hook.to_dict()
    except Exception:
        pass

    tickets().put(ctx.tenant_id, ticket)

    reply = ("I'm really sorry to hear that — thank you for flagging it. I've "
             "logged the details and "
             + ("escalated this to the team so someone can put it right as quickly "
                "as possible." if escalate else
                "the team will look into it and get back to you shortly."))

    return HandlerResult(
        reply=reply, action="complaint", status="executed",
        record_type="ticket", record_id=ticket["id"], record=ticket,
        escalate=escalate,
        provider_status=provider_status or None,
        detail=f"priority={priority} notified={notified}",
    )
