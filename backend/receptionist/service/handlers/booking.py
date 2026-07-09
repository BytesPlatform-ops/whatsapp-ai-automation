"""Booking / appointment handler.

Stores a durable booking request. If the tenant has Google Calendar connected
(production + real) AND a concrete ISO date+time is available, it creates a REAL
calendar event via the existing integration connector and marks the booking
confirmed; otherwise the booking is parked as `pending` for the team — never a
fake calendar event. Missing date/time → asks for it in the reply.
"""

from __future__ import annotations

from ..schemas import Booking
from ..stores import bookings
from .base import HandlerContext, HandlerResult, register


def _iso_slot(date: str, time: str) -> tuple[str, str] | None:
    """Build (start, end) ISO strings when date looks YYYY-MM-DD and time HH:MM.
    Returns None if we can't be confident — we never guess a real event time."""
    import re

    if not (date and time):
        return None
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date.strip()):
        return None
    m = re.fullmatch(r"(\d{1,2}):(\d{2})", time.strip())
    if not m:
        return None
    hh, mm = int(m.group(1)), int(m.group(2))
    if hh > 23 or mm > 59:
        return None
    start = f"{date.strip()}T{hh:02d}:{mm:02d}:00"
    end = f"{date.strip()}T{(hh + 1) % 24:02d}:{mm:02d}:00"
    return start, end


@register("booking")
def handle_booking(ctx: HandlerContext) -> HandlerResult:
    date, time = ctx.f("date"), ctx.f("time")
    service = ctx.f("service") or ctx.f("service_interest")
    booking = Booking(
        tenant_id=ctx.tenant_id, contact_id=ctx.contact_id,
        conversation_id=ctx.conversation_id,
        name=ctx.f("name") or None, phone=ctx.f("phone") or None,
        email=ctx.f("email") or None, service_type=service,
        date=date, time=time, timezone=ctx.f("timezone", "UTC"),
        notes=ctx.f("notes"), source=ctx.channel, status="pending",
    ).model_dump()

    missing = [label for label, val in (("date", date), ("time", time)) if not val]

    calendar_result = None
    slot = _iso_slot(date, time)
    if slot is not None:
        try:
            from integrations import execute_action
            from integrations.connections import find_active_connection

            if find_active_connection(ctx.tenant_id, "calendar_create_event"):
                start, end = slot
                calendar_result = execute_action(ctx.tenant_id, "calendar_create_event", {
                    "event_title": f"{service or 'Appointment'} — {ctx.f('name') or 'customer'}",
                    "event_description": ctx.f("notes") or ctx.message,
                    "start": start, "end": end,
                    "attendee": ctx.f("email") or None,
                })
                if calendar_result.get("status") == "success" and calendar_result.get("mode") == "real":
                    booking["status"] = "confirmed"
                    booking["calendar_event_id"] = calendar_result.get("event_id", "")
                    booking["calendar_html_link"] = calendar_result.get("html_link", "")
        except Exception:
            calendar_result = None

    bookings().put(ctx.tenant_id, booking)

    who = ctx.f("name") or "there"
    if missing:
        reply = (f"Happy to book that in, {who}. Could you share the "
                 f"{' and '.join(missing)} you'd like? I've noted the rest.")
        status = "pending"
    elif booking["status"] == "confirmed":
        reply = (f"You're booked, {who} — {service or 'your appointment'} on {date} at {time}. "
                 "A calendar invite is on its way.")
        status = "executed"
    else:
        reply = (f"Got it, {who} — I've requested {service or 'your appointment'} for {date} at {time}. "
                 "The team will confirm shortly.")
        status = "pending"

    return HandlerResult(
        reply=reply, action="booking", status=status,
        record_type="booking", record_id=booking["id"], record=booking,
        detail=f"calendar={calendar_result.get('status') if calendar_result else 'not_attempted'}",
        provider_status={"calendar": calendar_result} if calendar_result else None,
    )
