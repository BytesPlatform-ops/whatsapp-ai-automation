"""Booking action handler — scheduling into a calendar.

Demo-grade but REAL: when a booking has a date/time it
  1. creates an event in a per-tenant LOCAL calendar (JSON store),
  2. writes a standard .ics file (importable into Apple/Outlook/Google),
  3. returns a Google Calendar "add event" link (no OAuth needed).

Full 2-way Google Calendar sync (create/cancel on the business's real calendar)
needs Google OAuth credentials — that's a later, key-gated upgrade; the handler
surface stays the same.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import quote_plus

_DATA = Path(__file__).resolve().parent.parent / "data"
_DEFAULT_SLOT_MIN = 45


def _parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    v = value.strip().replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(v)
    except ValueError:
        return None


def _gcal_link(title: str, start: datetime, end: datetime, details: str, location: str) -> str:
    fmt = "%Y%m%dT%H%M%S"
    dates = f"{start.strftime(fmt)}/{end.strftime(fmt)}"
    return (
        "https://calendar.google.com/calendar/render?action=TEMPLATE"
        f"&text={quote_plus(title)}&dates={dates}"
        f"&details={quote_plus(details)}&location={quote_plus(location)}"
    )


def _ics(event: dict, start: datetime, end: datetime) -> str:
    fmt = "%Y%m%dT%H%M%S"
    return (
        "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Pixie Receptionist//EN\r\n"
        "BEGIN:VEVENT\r\n"
        f"UID:{event['id']}\r\n"
        f"SUMMARY:{event['title']}\r\n"
        f"DTSTART:{start.strftime(fmt)}\r\n"
        f"DTEND:{end.strftime(fmt)}\r\n"
        f"DESCRIPTION:{event['description']}\r\n"
        f"LOCATION:{event.get('location','')}\r\n"
        "END:VEVENT\r\nEND:VCALENDAR\r\n"
    )


def handle_booking(action, request) -> dict:
    """Create a calendar event for a booking/reschedule action."""
    start = _parse_dt(action.datetime)
    if start is None:
        # Real receptionist behaviour: no date/time yet → it asks first, no event.
        return {"handled": True, "created": False, "reason": "awaiting a specific date/time before booking"}

    end = start + timedelta(minutes=_DEFAULT_SLOT_MIN)
    title = (action.details or "Appointment").split(" — ")[0][:80]
    if action.name:
        title = f"{title} — {action.name}"
    location = "Glow & Go Salon, Gulberg III, Lahore"
    description = " | ".join(
        x for x in [action.details, f"Customer: {action.name or 'unknown'}",
                    f"Contact: {action.contact or 'unknown'}", f"Channel: {request.channel.value}"] if x
    )

    event = {
        "id": uuid.uuid4().hex,
        "tenant_id": request.tenant_id,
        "title": title,
        "start": start.isoformat(),
        "end": end.isoformat(),
        "customer": action.name,
        "contact": action.contact,
        "description": description,
        "location": location,
    }

    _DATA.mkdir(parents=True, exist_ok=True)
    store = _DATA / f"calendar_{request.tenant_id}.json"
    events = json.loads(store.read_text()) if store.exists() else []
    events.append(event)
    store.write_text(json.dumps(events, indent=2))

    ics_path = _DATA / f"event_{event['id']}.ics"
    ics_path.write_text(_ics(event, start, end), encoding="utf-8")

    return {
        "handled": True,
        "created": True,
        "event": event,
        "google_calendar_url": _gcal_link(title, start, end, description, location),
        "ics_file": str(ics_path),
        "calendar_store": str(store),
    }
