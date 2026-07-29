"""Human-escalation handler (Wave 4 update).

Creates an escalation ticket with priority + conversation context, notifies the
team through whatever is configured (email provider / connected Gmail, plus an
outbound webhook), records which channels were actually notified, and returns an
honest reply.

Wave 1-3 behaviour preserved:
  - Escalation record written to stores.escalations()
  - notify_team + emit_webhook called best-effort
  - escalate=True on HandlerResult triggers conversation → waiting_for_human
  - notified list is honest: [] when no notifier is configured

Wave 4 change:
  - Reply is honest: no "I've arranged a callback" or "human notified" when
    the notified list is empty. Instead the reply reflects the actual state
    (ticket created, team will review) without implying immediate human contact
    when no channel was successfully notified.
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

    # Honest reply — reflects actual notification state
    if notified:
        channels = " and ".join(notified)
        reply = (
            "I've flagged this as a priority for our team and a notification has been "
            f"sent via {channels}. Someone will reach out to you as soon as possible. "
            "Thank you for your patience."
        )
    else:
        # No notification channel was successfully reached
        reply = (
            "I've created an escalation ticket and flagged this for our team to review. "
            "A team member will follow up with you — thank you for your patience."
        )

    return HandlerResult(
        reply=reply, action="escalation", status="executed",
        record_type="escalation", record_id=esc["id"], record=esc,
        escalate=True, provider_status=provider_status,
        detail=f"notified={notified}",
    )
