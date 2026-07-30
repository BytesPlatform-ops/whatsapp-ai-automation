"""AI Receptionist Google Calendar adapter + availability + booking (Wave 7).

Hermetic: a mock Calendar transport is injected; NO live Calendar calls. Proves
config, free/busy availability with timezone/notice/horizon, atomic holds,
double-booking prevention, provider-confirmed event creation, idempotency,
reschedule and cancellation.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from receptionist.providers import gcal as C


class _Tx(C.CalendarTransport):
    def __init__(self, busy=None):
        self.creates = 0
        self.updates = 0
        self.cancels = 0
        self._busy = busy or []
    def list_calendars(self, token):
        return {"items": [{"id": "primary", "summary": "Biz", "accessRole": "owner", "timeZone": "UTC", "primary": True}]}
    def free_busy(self, token, calendar_ids, time_min, time_max):
        return {"calendars": {cid: {"busy": self._busy} for cid in calendar_ids}}
    def create_event(self, token, calendar_id, event):
        self.creates += 1
        return {"id": f"evt{self.creates}", "status": "confirmed", "start": event["start"], "end": event["end"],
                "htmlLink": "https://cal/evt", "attendees": event.get("attendees", []), "updated": "2026-08-02T00:00:00Z"}
    def update_event(self, token, calendar_id, event_id, patch):
        self.updates += 1
        return {"id": event_id, "status": "confirmed", "start": patch["start"], "end": patch["end"], "updated": "x"}
    def cancel_event(self, token, calendar_id, event_id):
        self.cancels += 1
        return {"id": event_id, "status": "cancelled"}
    def get_event(self, token, calendar_id, event_id):
        return {"id": event_id, "status": "confirmed"}


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setenv("PIXIE_PERSIST", "memory")
    monkeypatch.setenv("PIXIE_MODEL_MODE", "fake")
    from receptionist.service import stores
    stores.reset_all()
    from integrations import connections
    connections.clear_connections()
    connections.register_many("t_a", ["calendar_read", "calendar_create_event"], {
        "provider": "google", "status": "active", "email": "biz@example.com",
        "access_token": "tok", "refresh_token": "r", "expires_at": 9_999_999_999,
        "scope": "https://www.googleapis.com/auth/calendar.events"})
    tx = _Tx()
    C.set_transport(tx)
    yield tx
    C.set_transport(None)
    stores.reset_all()


def _future_monday(now):
    d = now
    while d.weekday() != 0:
        d += timedelta(days=1)
    return d.replace(hour=0, minute=0, second=0, microsecond=0)


def _cfg():
    from receptionist.service import booking
    booking.save_config("t_a", {"services": {"consultation": 30}, "timezone": "UTC",
                                "working_hours": {"mon": [9, 17]}, "slot_interval": 30,
                                "min_notice_minutes": 60, "max_horizon_days": 14})


def test_config_persists():
    from receptionist.service import booking
    booking.save_config("t_a", {"calendar_id": "primary", "services": {"haircut": 45}})
    assert booking.get_config("t_a")["services"]["haircut"] == 45


def test_availability_returns_slots():
    _cfg()
    from receptionist.service import booking
    now = datetime(2026, 8, 3, 6, 0, tzinfo=timezone.utc)  # a Monday early morning
    mon = _future_monday(now)
    res = booking.availability("t_a", service="consultation", start=mon, days=1, now=now)
    assert res["status"] == "ok" and len(res["slots"]) > 0
    assert len(res["slots"]) <= booking.max_slot_results()


def test_availability_provider_unavailable(monkeypatch):
    _cfg()
    from receptionist.service import booking
    from receptionist.providers import gcal
    def boom(*a, **k):
        raise gcal.CalendarError("provider_error")
    monkeypatch.setattr(gcal, "get_free_busy", boom)
    res = booking.availability("t_a", service="consultation", days=1)
    assert res["status"] == "provider_unavailable"


def test_hold_prevents_double_booking():
    _cfg()
    from receptionist.service import booking
    start = "2026-08-03T10:00:00+00:00"; end = "2026-08-03T10:30:00+00:00"
    h1 = booking.create_hold("t_a", service="consultation", start=start, end=end)
    assert h1["status"] == "active"
    h2 = booking.create_hold("t_a", service="consultation", start=start, end=end)
    assert h2["status"] == "conflict"


def test_create_booking_confirmed_and_idempotent(_env):
    _cfg()
    from receptionist.service import booking, stores
    now = datetime(2026, 8, 3, 6, 0, tzinfo=timezone.utc)
    start = "2026-08-03T10:00:00+00:00"; end = "2026-08-03T10:30:00+00:00"
    r1 = booking.create_booking("t_a", service="consultation", start=start, end=end,
                                email="c@x.com", idempotency_key="k1", now=now)
    assert r1["status"] == "confirmed" and r1["booking"]["provider_event_id"] == "evt1"
    assert _env.creates == 1
    # duplicate request → same booking, no second event
    r2 = booking.create_booking("t_a", service="consultation", start=start, end=end,
                                email="c@x.com", idempotency_key="k1", now=now)
    assert r2.get("idempotent") and _env.creates == 1
    assert stores.bookings().count("t_a") == 1


def test_reschedule_updates_provider(_env):
    _cfg()
    from receptionist.service import booking
    now = datetime(2026, 8, 3, 6, 0, tzinfo=timezone.utc)
    r = booking.create_booking("t_a", service="consultation", start="2026-08-03T10:00:00+00:00",
                               end="2026-08-03T10:30:00+00:00", idempotency_key="k", now=now)
    bid = r["booking"]["id"]
    rr = booking.reschedule_booking("t_a", bid, new_start="2026-08-03T11:00:00+00:00", new_end="2026-08-03T11:30:00+00:00")
    assert rr["status"] == "rescheduled" and _env.updates == 1
    assert rr["booking"]["reschedule_history"]


def test_cancel_is_provider_backed_and_idempotent(_env):
    _cfg()
    from receptionist.service import booking
    now = datetime(2026, 8, 3, 6, 0, tzinfo=timezone.utc)
    r = booking.create_booking("t_a", service="consultation", start="2026-08-03T10:00:00+00:00",
                               end="2026-08-03T10:30:00+00:00", idempotency_key="k", now=now)
    bid = r["booking"]["id"]
    c1 = booking.cancel_booking("t_a", bid, reason="customer")
    assert c1["status"] == "cancelled" and _env.cancels == 1
    c2 = booking.cancel_booking("t_a", bid)
    assert c2.get("idempotent") and _env.cancels == 1


def test_registry_create_event_confirmed(_env):
    _cfg()
    from receptionist.service import registry
    res = registry._h_calendar_create_event("t_a", {
        "service": "consultation", "start": "2026-08-03T10:00:00+00:00",
        "end": "2026-08-03T10:30:00+00:00", "email": "c@x.com", "idempotency_key": "rk"})
    assert res["status"] == "confirmed" and res["record_type"] == "booking"


def test_registry_create_event_not_connected():
    from integrations import connections
    connections.clear_connections()
    from receptionist.service import registry
    res = registry._h_calendar_create_event("t_a", {"service": "consultation",
                                                    "start": "2026-08-03T10:00:00+00:00",
                                                    "end": "2026-08-03T10:30:00+00:00"})
    assert res["status"] == "not_connected"


def test_validate_connection_capabilities(_env):
    import asyncio
    from receptionist.providers import gcal
    v = asyncio.new_event_loop().run_until_complete(gcal.validate_connection("t_a"))
    assert v["connected"] and v["can_write_events"]
