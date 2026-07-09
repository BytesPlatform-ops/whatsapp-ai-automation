"""Human-escalation handler.

Creates an escalation ticket with priority + conversation context, notifies the
team through whatever is configured (email provider / connected Gmail, plus an
outbound webhook), records which channels were actually notified, and returns a
reassuring reply. If nothing is configured the ticket still exists (honest
`notified: []`).
"""

from __future__ import annotations

from ..schemas import Escalation
from ..stores import escalations
from .base import HandlerContext, HandlerResult, register


@register("escalation")
def handle_escalation(ctx: HandlerContext) -> HandlerResult:
    reason = ctx.f("reason") or (ctx.message[:200] if ctx.message else "Customer asked for a human")
    priority = ctx.f("urgency", "high") or "high"
    esc = Escalation(
        tenant_id=ctx.tenant_id, contact_id=ctx.contact_id,
        conversation_id=ctx.conversation_id, reason=reason, priority=priority,
        context=ctx.f("notes") or ctx.message, source=ctx.channel, status="open",
    ).model_dump()

    notified: list[str] = []
    provider_status: dict = {}
    try:
        from ...providers import emit_webhook, notify_team

        note = notify_team(
            tenant_id=ctx.tenant_id,
            subject=f"[Escalation] {reason[:80]}",
            body=f"A customer needs a human.\n\nReason: {reason}\nPriority: {priority}\n"
                 f"Message: {ctx.message}\nConversation: {ctx.conversation_id}",
            event="escalation.created",
        )
        provider_status["notify"] = note.to_dict()
        if note.status == "success":
            notified.append("email")

        hook = emit_webhook(event="escalation.created", payload=esc)
        provider_status["webhook"] = hook.to_dict()
        if hook.status == "success":
            notified.append("webhook")
    except Exception:
        pass

    esc["notified"] = notified
    escalations().put(ctx.tenant_id, esc)

    reply = ("I've flagged this for a team member who can help — they'll reach out to you "
             "as soon as possible. Thanks for your patience.")
    return HandlerResult(
        reply=reply, action="escalation", status="executed",
        record_type="escalation", record_id=esc["id"], record=esc,
        escalate=True, provider_status=provider_status,
        detail=f"notified={notified}",
    )
