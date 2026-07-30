"""Calendar configuration + availability + booking for the AI Receptionist (Wave 7).

Availability is computed from durable per-tenant config (working hours, timezone,
service durations, buffers, notice, horizon) intersected with Google free/busy
(via the injectable :mod:`receptionist.providers.gcal` adapter) and active internal
holds. Booking holds are atomic (process-serialised in memory/file; a unique
idempotency key in supabase) so one slot can't be double-booked. Real events are
created only after an availability recheck; the AI never claims success before the
provider confirms. All hermetic — tests inject a mock Calendar transport.
"""

from __future__ import annotations

import os
import threading
from datetime import datetime, timedelta, timezone
from typing import Optional

try:
    from zoneinfo import ZoneInfo
except Exception:  # pragma: no cover
    ZoneInfo = None  # type: ignore

from . import stores
from .ids import new_id, now_iso

_HOLD_LOCK = threading.RLock()

BOOKING_POLICIES = ("automatic", "approval_required", "manual_request_only")


def _int_env(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, "").strip() or default)
    except (TypeError, ValueError):
        return default


def max_slot_results() -> int:
    return _int_env("AI_RECEPTIONIST_CALENDAR_MAX_SLOT_RESULTS", 10)


def hold_ttl_seconds() -> int:
    return _int_env("AI_RECEPTIONIST_BOOKING_HOLD_TTL_SECONDS", 600)


# ── configuration (Part 16) ───────────────────────────────────────────────────

_DEFAULT_CONFIG = {
    "calendar_id": "primary",
    "timezone": "UTC",
    "services": {"consultation": 30},         # name → duration minutes
    "buffer_before": 0,
    "buffer_after": 0,
    "working_hours": {"mon": [9, 17], "tue": [9, 17], "wed": [9, 17],
                      "thu": [9, 17], "fri": [9, 17]},  # weekday → [start_hour, end_hour]
    "slot_interval": 30,
    "min_notice_minutes": 120,
    "max_horizon_days": 30,
    "booking_policy": "approval_required",
}


def get_config(tenant_id: str) -> dict:
    cfg = stores.calendar_config().get(tenant_id, tenant_id)
    if cfg is None:
        return {**_DEFAULT_CONFIG, "tenant_id": tenant_id, "id": tenant_id, "configured": False}
    return cfg


def save_config(tenant_id: str, patch: dict) -> dict:
    cfg = get_config(tenant_id)
    for k, v in (patch or {}).items():
        if k in ("tenant_id", "id"):
            continue
        if v is not None:
            cfg[k] = v
    cfg.update({"tenant_id": tenant_id, "id": tenant_id, "configured": True, "updated_at": now_iso()})
    return stores.calendar_config().put(tenant_id, cfg)


def _tz(name: str):
    if ZoneInfo is None:
        return timezone.utc
    try:
        return ZoneInfo(name)
    except Exception:
        return timezone.utc


# ── availability engine (Part 18) ─────────────────────────────────────────────

def availability(tenant_id: str, *, service: str, start: Optional[datetime] = None,
                 days: int = 7, now: Optional[datetime] = None) -> dict:
    """Compute bounded available slots. Returns provider_unavailable (never invented
    availability) if the free/busy check fails."""
    import asyncio
    from ..providers import gcal

    cfg = get_config(tenant_id)
    duration = int((cfg.get("services") or {}).get(service, 0))
    if duration <= 0:
        return {"status": "unknown_service", "slots": []}

    tz = _tz(cfg.get("timezone", "UTC"))
    now = now or datetime.now(timezone.utc)
    win_start = (start or now).astimezone(tz)
    min_notice = timedelta(minutes=int(cfg.get("min_notice_minutes", 0)))
    horizon = min(int(days), int(cfg.get("max_horizon_days", 30)))
    win_end = win_start + timedelta(days=horizon)

    # provider free/busy
    try:
        fb = _run(gcal.get_free_busy(tenant_id, [cfg.get("calendar_id", "primary")],
                                     win_start.astimezone(timezone.utc).isoformat(),
                                     win_end.astimezone(timezone.utc).isoformat()))
    except gcal.CalendarError as exc:
        return {"status": "provider_unavailable", "reason": exc.category, "slots": []}
    busy = []
    for _cid, spans in (fb.get("busy") or {}).items():
        for b in spans:
            busy.append((_parse(b["start"]), _parse(b["end"])))
    # active holds count as busy
    for h in active_holds(tenant_id):
        busy.append((_parse(h["start"]), _parse(h["end"])))

    interval = int(cfg.get("slot_interval", 30))
    buf_b = timedelta(minutes=int(cfg.get("buffer_before", 0)))
    buf_a = timedelta(minutes=int(cfg.get("buffer_after", 0)))
    hours = cfg.get("working_hours", {})
    slots: list[dict] = []
    day = win_start.replace(hour=0, minute=0, second=0, microsecond=0)

    while day < win_end and len(slots) < max_slot_results():
        wd = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"][day.weekday()]
        window = hours.get(wd)
        if window:
            cursor = day.replace(hour=int(window[0]), minute=0)
            end_of_day = day.replace(hour=int(window[1]), minute=0)
            while cursor + timedelta(minutes=duration) <= end_of_day and len(slots) < max_slot_results():
                slot_start = cursor
                slot_end = cursor + timedelta(minutes=duration)
                # notice + not in the past
                if slot_start.astimezone(timezone.utc) >= (now + min_notice):
                    conflict = any(not (slot_end + buf_a <= bs or slot_start - buf_b >= be)
                                   for bs, be in busy)
                    if not conflict:
                        slots.append({"start": slot_start.astimezone(timezone.utc).isoformat(),
                                      "end": slot_end.astimezone(timezone.utc).isoformat(),
                                      "timezone": cfg.get("timezone", "UTC")})
                cursor += timedelta(minutes=interval)
        day += timedelta(days=1)

    return {"status": "ok", "service": service, "slots": slots}


# ── booking holds (Part 20) ───────────────────────────────────────────────────

def active_holds(tenant_id: str) -> list[dict]:
    now = now_iso()
    out = []
    for h in stores.booking_holds().list(tenant_id):
        if h.get("status") == "active" and h.get("expires_at", "") > now:
            out.append(h)
    return out


def create_hold(tenant_id: str, *, service: str, start: str, end: str,
                contact_id: str = "", conversation_id: str = "", idempotency_key: str = "") -> dict:
    """Atomically create a short-lived hold. One active hold per (start) slot."""
    with _HOLD_LOCK:
        if idempotency_key:
            for h in stores.booking_holds().list(tenant_id):
                if h.get("idempotency_key") == idempotency_key:
                    return h
        for h in active_holds(tenant_id):
            if h.get("start") == start:
                return {"status": "conflict", "detail": "slot already held"}
        expires = (datetime.now(timezone.utc) + timedelta(seconds=hold_ttl_seconds())).isoformat(timespec="seconds")
        hold = {"id": new_id("hold"), "tenant_id": tenant_id, "service": service,
                "start": start, "end": end, "contact_id": contact_id,
                "conversation_id": conversation_id, "status": "active",
                "expires_at": expires, "idempotency_key": idempotency_key, "created_at": now_iso()}
        return stores.booking_holds().put(tenant_id, hold)


def release_hold(tenant_id: str, hold_id: str) -> None:
    h = stores.booking_holds().get(tenant_id, hold_id)
    if h:
        h["status"] = "released"
        stores.booking_holds().put(tenant_id, h)


# ── create / reschedule / cancel (Parts 21/23/24) ─────────────────────────────

def create_booking(tenant_id: str, *, service: str, start: str, end: str, name: str = "",
                   email: str = "", contact_id: str = "", conversation_id: str = "",
                   idempotency_key: str = "", now: Optional[datetime] = None) -> dict:
    """Recheck availability → create provider event → persist. Idempotent; provider
    confirmation required; unknown outcome → reconciliation."""
    from ..providers import gcal

    # idempotency: an existing booking for this key returns it (no second event)
    if idempotency_key:
        for b in stores.bookings().list(tenant_id):
            if b.get("idempotency_key") == idempotency_key and b.get("provider_event_id"):
                return {"status": "confirmed", "booking": b, "idempotent": True}

    # plan-limit gate (hard when enforcement on; advisory otherwise)
    from . import limits
    try:
        limits.enforce(tenant_id, "booking")
    except limits.LimitExceeded:
        return {"status": "limit_reached", "limit_key": "receptionist_monthly_bookings"}

    cfg = get_config(tenant_id)
    # recheck the slot is still free right before creation
    avail = availability(tenant_id, service=service, start=_parse(start), days=1, now=now)
    if avail["status"] == "provider_unavailable":
        return {"status": "provider_unavailable", "reason": avail.get("reason", "")}
    if not any(s["start"] == start for s in avail["slots"]) and not _slot_free_ignoring_own_hold(tenant_id, start, idempotency_key):
        return {"status": "slot_taken"}

    hold = create_hold(tenant_id, service=service, start=start, end=end, contact_id=contact_id,
                       conversation_id=conversation_id, idempotency_key=idempotency_key or start)
    if hold.get("status") == "conflict":
        return {"status": "slot_taken"}

    event = {"summary": f"{service} — {name or email or 'Booking'}",
             "start": {"dateTime": start, "timeZone": cfg.get("timezone", "UTC")},
             "end": {"dateTime": end, "timeZone": cfg.get("timezone", "UTC")},
             "attendees": [{"email": email}] if email else []}
    try:
        ev = _run(gcal.create_event(tenant_id, cfg.get("calendar_id", "primary"), event))
    except gcal.CalendarError as exc:
        release_hold(tenant_id, hold["id"])
        if exc.category == "unknown_result":
            return {"status": "reconciliation_required", "reason": exc.category}
        return {"status": "provider_error", "reason": exc.category}

    from .schemas import Booking
    booking = Booking(tenant_id=tenant_id, contact_id=contact_id or None, conversation_id=conversation_id,
                      name=name, email=email, service_type=service, date=start[:10], time=start,
                      timezone=cfg.get("timezone", "UTC"), status="confirmed", source="calendar").model_dump()
    booking["provider_event_id"] = ev["event_id"]
    booking["calendar_id"] = cfg.get("calendar_id", "primary")
    booking["start"] = start
    booking["end"] = end
    booking["provider_link"] = ev.get("html_link", "")
    booking["idempotency_key"] = idempotency_key or start
    booking["confirmed_at"] = now_iso()
    stores.bookings().put(tenant_id, booking)
    _link_provider_event(tenant_id, booking["id"], ev["event_id"])
    release_hold(tenant_id, hold["id"])
    try:
        from . import usage
        usage.increment(tenant_id, "calendar_operations", idempotency_key=f"book:{booking['id']}")
        usage.increment(tenant_id, "bookings", idempotency_key=f"bookct:{booking['id']}")
    except Exception:
        pass
    return {"status": "confirmed", "booking": booking}


def reschedule_booking(tenant_id: str, booking_id: str, *, new_start: str, new_end: str) -> dict:
    from ..providers import gcal
    b = stores.bookings().get(tenant_id, booking_id)
    if b is None:
        return {"status": "not_found"}
    if b.get("status") in ("cancelled", "completed") or not b.get("provider_event_id"):
        return {"status": "not_reschedulable"}
    cfg = get_config(tenant_id)
    try:
        ev = _run(gcal.update_event(tenant_id, b.get("calendar_id", "primary"), b["provider_event_id"],
                                    {"start": {"dateTime": new_start, "timeZone": cfg.get("timezone", "UTC")},
                                     "end": {"dateTime": new_end, "timeZone": cfg.get("timezone", "UTC")}}))
    except gcal.CalendarError as exc:
        return {"status": "provider_error", "reason": exc.category}
    b.setdefault("reschedule_history", []).append({"from": b.get("start"), "to": new_start, "at": now_iso()})
    b["start"] = new_start
    b["end"] = new_end
    b["updated_at"] = now_iso()
    stores.bookings().put(tenant_id, b)
    return {"status": "rescheduled", "booking": b, "event": ev}


def cancel_booking(tenant_id: str, booking_id: str, *, reason: str = "") -> dict:
    from ..providers import gcal
    b = stores.bookings().get(tenant_id, booking_id)
    if b is None:
        return {"status": "not_found"}
    if b.get("status") == "cancelled":
        return {"status": "cancelled", "booking": b, "idempotent": True}
    if b.get("provider_event_id"):
        try:
            _run(gcal.cancel_event(tenant_id, b.get("calendar_id", "primary"), b["provider_event_id"]))
        except gcal.CalendarError as exc:
            return {"status": "provider_error", "reason": exc.category}
    b["status"] = "cancelled"
    b["cancel_reason"] = reason
    b["cancelled_at"] = now_iso()
    stores.bookings().put(tenant_id, b)
    # stop reminders tied to this booking
    for r in stores.reminders().query(tenant_id, related_id=booking_id):
        if r.get("status") == "scheduled":
            r["status"] = "cancelled"
            stores.reminders().put(tenant_id, r)
    return {"status": "cancelled", "booking": b}


# ── helpers ───────────────────────────────────────────────────────────────────

def _link_provider_event(tenant_id: str, booking_id: str, event_id: str) -> None:
    stores.provider_events().put(tenant_id, {
        "id": new_id("pevt"), "tenant_id": tenant_id, "booking_id": booking_id,
        "provider_event_id": event_id, "reconciliation_status": "linked", "last_checked_at": now_iso()})


def _slot_free_ignoring_own_hold(tenant_id: str, start: str, idempotency_key: str) -> bool:
    for h in active_holds(tenant_id):
        if h.get("start") == start and h.get("idempotency_key") not in (idempotency_key, start):
            return False
    return True


def _parse(iso: str) -> datetime:
    try:
        dt = datetime.fromisoformat((iso or "").replace("Z", "+00:00"))
    except ValueError:
        dt = datetime.now(timezone.utc)
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _run(coro):
    import asyncio
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():  # pragma: no cover
            return asyncio.new_event_loop().run_until_complete(coro)
        return loop.run_until_complete(coro)
    except RuntimeError:
        return asyncio.new_event_loop().run_until_complete(coro)
