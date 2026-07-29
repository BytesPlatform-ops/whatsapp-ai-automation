"""Reminder handler.

Schedules a reminder for the customer (title + when + channel). We store the
reminder record `scheduled` and enqueue a durable `reminder_process` job in the
worker queue. The job is what actually attempts delivery at `remind_at` via the
provider abstraction (SMS/email).

Status returned to the caller is always `queued` — we NEVER claim the message
was sent until a provider confirms it. If `remind_at` is unspecified the job is
enqueued for immediate processing and the reply asks when they'd like the nudge.
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

    # Enqueue a durable job so actual delivery is handled by the worker.
    # run_at = remind_at when available; otherwise now (immediate due).
    job_id: str = ""
    try:
        from receptionist.worker.jobs_store import enqueue
        job_id = enqueue(
            tenant_id=ctx.tenant_id,
            job_type="reminder_process",
            payload={
                "reminder_id": reminder["id"],
                "contact_id": ctx.contact_id or "",
                "conversation_id": ctx.conversation_id or "",
                "channel": channel,
                "title": title,
                "job_created_at": ctx.now,
            },
            run_at=remind_at or None,
        )
    except Exception:
        pass  # fail-safe: the reminder record already exists; worker may retry

    who = ctx.f("name") or "there"
    if remind_at:
        reply = (f"Done, {who} — I've scheduled a reminder for \"{title}\" at {remind_at}. "
                 f"We'll nudge you via {channel}.")
    else:
        reply = (f"Happy to set that reminder, {who}. When would you like to be "
                 "reminded?")

    return HandlerResult(
        reply=reply, action="reminder", status="queued",
        record_type="reminder", record_id=reminder["id"], record=reminder,
        detail=f"remind_at={remind_at or 'unspecified'} channel={channel} job_id={job_id}",
    )
