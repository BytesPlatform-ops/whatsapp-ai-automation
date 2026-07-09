"""Follow-up task handler.

Schedules an internal `follow_up` task the team can act on later — linked to the
contact when we have one, with an optional due date pulled from `due_at`/
`remind_at`. Purely internal, so it always succeeds; no provider side effect.
"""

from __future__ import annotations

from ..schemas import Task
from ..stores import tasks
from .base import HandlerContext, HandlerResult, register


@register("follow_up")
def handle_follow_up(ctx: HandlerContext) -> HandlerResult:
    who = ctx.f("name") or "customer"
    title = ctx.f("notes") or f"Follow up with {who}"
    due_at = ctx.f("due_at") or ctx.f("remind_at") or ""

    task = Task(
        tenant_id=ctx.tenant_id, contact_id=ctx.contact_id,
        conversation_id=ctx.conversation_id, kind="follow_up",
        title=title, related_type="contact", related_id=ctx.contact_id or "",
        owner="", status="open", due_at=due_at,
        notes=ctx.f("notes"), source=ctx.channel,
    ).model_dump()

    tasks().put(ctx.tenant_id, task)

    reply = ("Done — I've scheduled a follow-up"
             + (f" for {due_at}" if due_at else "")
             + ". The team will be in touch.")

    return HandlerResult(
        reply=reply, action="follow_up", status="executed",
        record_type="task", record_id=task["id"], record=task,
        detail=f"due_at={due_at or 'unset'}",
    )
