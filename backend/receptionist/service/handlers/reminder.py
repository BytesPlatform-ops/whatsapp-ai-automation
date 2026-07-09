"""Reminder handler.

Schedules a reminder for the customer (title + when + channel). We store it
`scheduled`; actual SMS/email delivery at `remind_at` is handled by the provider
abstraction (SMS/notify) when a scheduler/worker is wired up — this handler only
records the intent, it never claims to have sent anything. Missing `remind_at`
→ saved and we ask when they'd like the nudge.
"""

from __future__ import annotations

from ..schemas import Reminder
from ..stores import reminders
from .base import HandlerContext, HandlerResult, register


@register("reminder")
def handle_reminder(ctx: HandlerContext) -> HandlerResult:
    title = ctx.f("notes") or ctx.f("service") or "Reminder"
    date, time = ctx.f("date"), ctx.f("time")
    remind_at = ctx.f("remind_at") or ((f"{date} {time}".strip()) if (date or time) else "")
    channel = ctx.f("channel") or "email"

    reminder = Reminder(
        tenant_id=ctx.tenant_id, contact_id=ctx.contact_id,
        conversation_id=ctx.conversation_id,
        title=title, remind_at=remind_at, channel=channel,
        source=ctx.channel, status="scheduled",
    ).model_dump()

    reminders().put(ctx.tenant_id, reminder)

    who = ctx.f("name") or "there"
    if remind_at:
        reply = (f"Done, {who} — I've set a reminder for \"{title}\" at {remind_at}. "
                 f"We'll nudge you via {channel}.")
    else:
        reply = (f"Happy to set that reminder, {who}. When would you like to be "
                 "reminded?")
    return HandlerResult(
        reply=reply, action="reminder", status="executed",
        record_type="reminder", record_id=reminder["id"], record=reminder,
        detail=f"remind_at={remind_at or 'unspecified'} channel={channel}",
    )
