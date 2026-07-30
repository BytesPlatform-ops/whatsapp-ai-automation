"""Gmail/Calendar worker jobs + booking reminders + reconciliation (Wave 8).

Hermetic: mock Gmail/Calendar transports injected; NO live calls. Proves bounded
initial sync + account lock, incremental history sync, send retry (terminal vs
retryable), send reconcile (no blind resend), calendar reconciliation of external
changes, and booking-reminder recalculation on reschedule/cancel.
"""

from __future__ import annotations

import base64
from datetime import datetime, timezone

import pytest

from receptionist.providers import gmail as G
from receptionist.providers import gcal as C
from receptionist.worker import handlers, jobs_store


class _GTx(G.GmailTransport):
    def __init__(self, n=3):
        self.n = n
    def profile(self, token): return {"emailAddress": "biz@example.com", "historyId": "10"}
    def list_messages(self, token, *, query, max_results, page_token=""):
        return {"messages": [{"id": f"m{i}", "threadId": f"t{i}"} for i in range(self.n)]}
    def get_message(self, token, message_id):
        return {"id": message_id, "threadId": f"th_{message_id}", "historyId": "11", "labelIds": ["INBOX"],
                "snippet": "Are you open?",
                "payload": {"mimeType": "text/plain",
                            "headers": [{"name": "From", "value": "Sam <sam@example.com>"},
                                        {"name": "Subject", "value": "Hi"}],
                            "body": {"data": base64.urlsafe_b64encode(b"Are you open?").decode()}}}
    def history(self, token, start_history_id):
        return {"history": [{"id": "12", "messagesAdded": [{"message": {"id": "mh1", "threadId": "th1"}}]}], "historyId": "12"}
    def create_draft(self, token, raw, thread_id=""): return {"id": "d1", "message": {"id": "dm1"}}
    def send(self, token, raw, thread_id=""): return {"id": "sent1", "threadId": thread_id or "t1"}


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setenv("PIXIE_PERSIST", "memory")
    monkeypatch.setenv("PIXIE_MODEL_MODE", "fake")
    monkeypatch.setenv("PIXIE_LLM_PROVIDER", "")
    monkeypatch.setenv("AI_RECEPTIONIST_GMAIL_REPLY_MODE", "draft_only")
    from receptionist.service import stores
    stores.reset_all()
    jobs_store.reset_stores()
    from integrations import connections
    connections.clear_connections()
    connections.register_many("t_a", ["email_read", "email_send", "calendar_read", "calendar_create_event"], {
        "provider": "google", "status": "active", "email": "biz@example.com",
        "access_token": "tok", "refresh_token": "r", "expires_at": 9_999_999_999,
        "scope": "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send "
                 "https://www.googleapis.com/auth/calendar.events"})
    G.set_transport(_GTx())
    C.set_transport(C._MockCalendarTransport())
    yield
    G.set_transport(None); C.set_transport(None)
    stores.reset_all(); jobs_store.reset_stores()


# ── Gmail sync ────────────────────────────────────────────────────────────────

def test_initial_sync_is_bounded_and_creates_drafts():
    from receptionist.service import stores
    res = handlers.get_handler("gmail_initial_sync")({"tenant_id": "t_a", "payload": {"batch_size": 3}})
    assert res["status"] == "completed" and res["processed"] == 3
    assert stores.gmail_drafts().count("t_a") == 3


def test_initial_sync_account_lock_blocks_second_worker():
    from receptionist.service import stores
    # hold the lock as if another worker is syncing
    assert stores.acquire_lock("t_a", "gmailsync::t_a", owner="other", ttl_seconds=300)
    res = handlers.get_handler("gmail_initial_sync")({"tenant_id": "t_a", "payload": {}})
    assert res["status"] == "skipped" and res["reason"] == "account_sync_in_progress"


def test_incremental_sync_processes_history():
    res = handlers.get_handler("gmail_incremental_sync")({"tenant_id": "t_a", "payload": {"history_id": "10"}})
    assert res["status"] == "completed" and res["history_id"] == "12"


def test_duplicate_messages_not_reprocessed():
    from receptionist.service import stores
    handlers.get_handler("gmail_initial_sync")({"tenant_id": "t_a", "payload": {"batch_size": 3}})
    n = stores.gmail_drafts().count("t_a")
    handlers.get_handler("gmail_initial_sync")({"tenant_id": "t_a", "payload": {"batch_size": 3}})
    assert stores.gmail_drafts().count("t_a") == n  # idempotent


# ── Gmail send retry + reconcile ──────────────────────────────────────────────

def test_send_retry_completes(_env):
    from receptionist.service import gmail_sync
    d = gmail_sync.save_draft("t_a", {"to": "sam@example.com", "subject": "Re", "body": "hi", "status": "failed"})
    res = handlers.get_handler("gmail_send_retry")({"tenant_id": "t_a", "payload": {"draft_id": d["id"]}})
    assert res["status"] == "completed"


def test_send_retry_terminal_on_suppression(_env):
    from receptionist.service import gmail_sync, stores
    from receptionist.service.schemas import OptOut
    stores.optouts().put("t_a", OptOut(tenant_id="t_a", email="sam@example.com").model_dump())
    d = gmail_sync.save_draft("t_a", {"to": "sam@example.com", "subject": "Re", "body": "hi", "status": "failed"})
    res = handlers.get_handler("gmail_send_retry")({"tenant_id": "t_a", "payload": {"draft_id": d["id"]}})
    assert res["status"] == "terminal"


def test_send_reconcile_confirms_when_provider_id_present(_env):
    from receptionist.service import gmail_sync
    d = gmail_sync.save_draft("t_a", {"to": "x@y.com", "provider_message_id": "abc", "status": "sending"})
    res = handlers.get_handler("gmail_send_reconcile")({"tenant_id": "t_a", "payload": {"draft_id": d["id"]}})
    assert res["status"] == "confirmed_sent"


def test_send_reconcile_requires_manual_when_unknown(_env):
    from receptionist.service import gmail_sync
    d = gmail_sync.save_draft("t_a", {"to": "x@y.com", "status": "sending"})
    res = handlers.get_handler("gmail_send_reconcile")({"tenant_id": "t_a", "payload": {"draft_id": d["id"]}})
    assert res["status"] == "reconciliation_required"  # never blind resend


# ── Calendar reconciliation + reminders ───────────────────────────────────────

def _make_booking():
    from receptionist.service import booking
    booking.save_config("t_a", {"services": {"consultation": 30}, "timezone": "UTC",
                                "working_hours": {"mon": [9, 17]}, "min_notice_minutes": 60,
                                "reminder_offsets": [1440, 60]})
    now = datetime(2026, 8, 3, 6, 0, tzinfo=timezone.utc)
    return booking.create_booking("t_a", service="consultation", start="2026-08-03T10:00:00+00:00",
                                  end="2026-08-03T10:30:00+00:00", email="c@x.com", idempotency_key="k", now=now)


def test_booking_schedules_reminders():
    from receptionist.service import stores
    r = _make_booking()
    assert r["status"] == "confirmed"
    rems = [x for x in stores.reminders().list("t_a") if x.get("related_id") == r["booking"]["id"]]
    assert len(rems) == 2 and all(x["status"] == "scheduled" for x in rems)


def test_reschedule_recalculates_reminders():
    from receptionist.service import booking, stores
    r = _make_booking()
    bid = r["booking"]["id"]
    booking.reschedule_booking("t_a", bid, new_start="2026-08-03T14:00:00+00:00", new_end="2026-08-03T14:30:00+00:00")
    rems = [x for x in stores.reminders().list("t_a") if x.get("related_id") == bid]
    scheduled = [x for x in rems if x["status"] == "scheduled"]
    # new reminders scheduled relative to 14:00; none left at the old 10:00 offset
    assert scheduled and all("2026-08-03T13:00" in x["remind_at"] or "2026-08-02T14:00" in x["remind_at"] for x in scheduled)


def test_cancellation_stops_reminders():
    from receptionist.service import booking, stores
    r = _make_booking()
    bid = r["booking"]["id"]
    booking.cancel_booking("t_a", bid)
    rems = [x for x in stores.reminders().list("t_a") if x.get("related_id") == bid]
    assert all(x["status"] == "cancelled" for x in rems)


def test_calendar_reconcile_external_cancellation(monkeypatch):
    from receptionist.service import booking, stores
    r = _make_booking()
    bid = r["booking"]["id"]
    # provider now reports the event cancelled externally
    class _Cx(C.CalendarTransport):
        def list_calendars(self, t): return {"items": []}
        def free_busy(self, t, c, a, b): return {"calendars": {}}
        def create_event(self, t, c, e): return {"id": "e", "status": "confirmed"}
        def update_event(self, t, c, i, p): return {"id": i, "status": "confirmed"}
        def cancel_event(self, t, c, i): return {"id": i, "status": "cancelled"}
        def get_event(self, t, c, i): return {"id": i, "status": "cancelled"}
    C.set_transport(_Cx())
    res = handlers.get_handler("calendar_event_reconcile")({"tenant_id": "t_a", "payload": {"booking_id": bid}})
    assert res["status"] == "reconciled" and res["change"] == "external_cancellation"
    assert stores.bookings().get("t_a", bid)["status"] == "cancelled"
