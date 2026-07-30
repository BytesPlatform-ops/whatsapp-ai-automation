"""Gmail + Calendar plan limits and usage counters (Wave 7, Parts 27/28)."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest


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
    yield
    stores.reset_all()


def test_plan_limits_defined_and_scale():
    from credits.plans import get_plan, UNLIMITED
    free, starter, pro = get_plan("free"), get_plan("starter"), get_plan("pro")
    assert free.limit("receptionist_gmail_accounts") == 0        # disabled on free
    assert starter.limit("receptionist_gmail_accounts") == 1
    assert starter.limit("receptionist_monthly_bookings") == 200
    for k in ("receptionist_gmail_monthly_replies", "receptionist_monthly_bookings"):
        s, p = starter.limit(k), pro.limit(k)
        assert p == UNLIMITED or p >= s


def test_booking_increments_counters():
    from receptionist.service import booking, usage
    now = datetime(2026, 8, 3, 6, 0, tzinfo=timezone.utc)
    booking.save_config("t_a", {"services": {"consultation": 30}, "timezone": "UTC",
                                "working_hours": {"mon": [9, 17]}, "min_notice_minutes": 60})
    r = booking.create_booking("t_a", service="consultation", start="2026-08-03T10:00:00+00:00",
                               end="2026-08-03T10:30:00+00:00", idempotency_key="k", now=now)
    assert r["status"] == "confirmed"
    assert usage.get("t_a", "bookings") == 1
    assert usage.get("t_a", "calendar_operations") == 1
    # duplicate does not double-count
    booking.create_booking("t_a", service="consultation", start="2026-08-03T10:00:00+00:00",
                           end="2026-08-03T10:30:00+00:00", idempotency_key="k", now=now)
    assert usage.get("t_a", "bookings") == 1


def test_booking_hard_limit_blocks(monkeypatch):
    monkeypatch.setenv("BILLING_ENFORCEMENT_ENABLED", "1")
    from receptionist.service import booking, limits, usage
    # free plan → receptionist_monthly_bookings is 0 (disabled)
    now = datetime(2026, 8, 3, 6, 0, tzinfo=timezone.utc)
    booking.save_config("t_a", {"services": {"consultation": 30}, "timezone": "UTC",
                                "working_hours": {"mon": [9, 17]}, "min_notice_minutes": 60})
    res = booking.create_booking("t_a", service="consultation", start="2026-08-03T10:00:00+00:00",
                                 end="2026-08-03T10:30:00+00:00", idempotency_key="k", now=now)
    assert res["status"] == "limit_reached"


def test_receptionist_limits_summary_includes_google():
    from receptionist.service import limits
    s = limits.summary("t_a")
    assert "booking" in s and "gmail_reply" in s
    assert s["booking"]["limit_key"] == "receptionist_monthly_bookings"
