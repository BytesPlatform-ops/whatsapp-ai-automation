"""Voicemail-capture handler.

Stores a voicemail (transcript + caller name/phone/urgency) and opens a
`follow_up` Task so the message can't fall through the cracks — the team has a
queued action to return the call. Both records are internal, so this always
executes cleanly and the reply reassures the caller they'll hear back.
"""

from __future__ import annotations

from ..schemas import Task, Voicemail
from ..stores import tasks, voicemails
from .base import HandlerContext, HandlerResult, register


@register("voicemail")
def handle_voicemail(ctx: HandlerContext) -> HandlerResult:
    name = ctx.f("name")
    transcript = ctx.f("notes") or ctx.message
    voicemail = Voicemail(
        tenant_id=ctx.tenant_id, contact_id=ctx.contact_id,
        conversation_id=ctx.conversation_id,
        name=name or None, phone=ctx.f("phone") or None,
        transcript=transcript, urgency=ctx.f("urgency", "normal"),
        source=ctx.channel, status="new",
    ).model_dump()
    voicemails().put(ctx.tenant_id, voicemail)

    task = Task(
        tenant_id=ctx.tenant_id, contact_id=ctx.contact_id,
        conversation_id=ctx.conversation_id,
        kind="follow_up", title=f"Return voicemail from {name or 'caller'}",
        related_type="voicemail", related_id=voicemail["id"],
        status="open", source=ctx.channel,
    ).model_dump()
    tasks().put(ctx.tenant_id, task)

    who = name or "there"
    reply = (f"Thanks {who} — I've captured your message and the team will get "
             "back to you as soon as possible.")
    return HandlerResult(
        reply=reply, action="voicemail", status="executed",
        record_type="voicemail", record_id=voicemail["id"], record=voicemail,
        detail=f"task={task['id']}",
    )
