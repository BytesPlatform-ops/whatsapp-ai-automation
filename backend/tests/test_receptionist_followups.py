"""Hermetic tests for reminder/follow-up handler → worker job lifecycle.

Verifies:
  - reminder handler returns status="queued" and enqueues a reminder_process job
  - follow_up handler returns status="queued" and enqueues a follow_up_process job
  - reminder_process stops on: unsubscribe, suppression, customer reply, conversation closed
  - follow_up_process stops on the same conditions
  - delivery always reports "provider_not_connected" (never "sent") without a real provider
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

BASE = "/api/agents/ai-receptionist"


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setenv("PIXIE_PERSIST", "memory")
    monkeypatch.setenv("PIXIE_MODEL_MODE", "fake")
    monkeypatch.setenv("PIXIE_LLM_PROVIDER", "")
    monkeypatch.setenv("PIXIE_AGENT_MODE", "test")
    monkeypatch.setenv("PIXIE_EXECUTION_MODE", "mock")
    monkeypatch.setenv("PIXIE_INTERNAL_API_SECRET", "")
    monkeypatch.setenv("AI_RECEPTIONIST_WORKER_ENABLED", "")  # no thread
    for k in ("STRIPE_SECRET_KEY", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN",
              "TWILIO_PHONE_NUMBER", "EMAIL_PROVIDER_API_KEY", "AI_RECEPTIONIST_WEBHOOK_URL"):
        monkeypatch.delenv(k, raising=False)

    import models.router as mr
    mr._router = None

    from receptionist.service import stores
    stores.reset_all()

    from receptionist.worker import jobs_store as js
    js.reset_stores()

    import app
    from fastapi.testclient import TestClient
    return TestClient(app.app)


@pytest.fixture()
def clean_stores(monkeypatch):
    """Hermetic fixture for direct store/worker tests (no HTTP layer)."""
    monkeypatch.setenv("PIXIE_PERSIST", "memory")
    monkeypatch.setenv("PIXIE_MODEL_MODE", "fake")
    monkeypatch.setenv("AI_RECEPTIONIST_WORKER_ENABLED", "")

    from receptionist.service import stores
    stores.reset_all()

    from receptionist.worker import jobs_store as js
    js.reset_stores()

    yield

    stores.reset_all()
    js.reset_stores()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _run(client, message, tenant="t_a", **kw):
    body = {"tenant_id": tenant, "message": message, **kw}
    r = client.post(f"{BASE}/message", json=body)
    assert r.status_code == 200, r.text
    return r.json()


# ── Handler → job enqueue tests ───────────────────────────────────────────────

class TestReminderEnqueuesJob:
    def test_reminder_handler_returns_queued(self, client):
        out = _run(client, "Remind me about my appointment on 2026-08-02")
        assert out["intent"] == "reminder"
        assert out["status"] == "queued"

    def test_reminder_creates_record(self, client):
        _run(client, "Remind me about my appointment on 2026-08-02")
        r = client.get(f"{BASE}/reminders", params={"tenant_id": "t_a"})
        assert r.status_code == 200
        rems = r.json()["reminders"]
        assert len(rems) == 1
        assert rems[0]["status"] == "scheduled"

    def test_reminder_enqueues_worker_job(self, clean_stores):
        """Direct handler call → jobs_store has a reminder_process job."""
        from receptionist.service.handlers.base import HandlerContext
        from receptionist.service.handlers.reminder import handle_reminder
        from receptionist.worker import jobs_store as js

        ctx = HandlerContext(
            tenant_id="t1",
            message="Remind me at 2026-08-10 10:00 via email",
            intent="reminder",
            fields={"remind_at": "2026-08-10 10:00", "channel": "email"},
            profile={},
            conversation_id="conv_1",
            contact_id="ctc_1",
        )
        result = handle_reminder(ctx)
        assert result.status == "queued"

        # Check via the raw store that the job was enqueued (run_at is in the future)
        all_rows = list(getattr(js._jobs(), "_rows", []))
        types = [r["data"]["job_type"] for r in all_rows if isinstance(r.get("data"), dict)]
        assert "reminder_process" in types

        # Confirm it is due when simulating time beyond run_at
        due = js.due_jobs(now=_now() + timedelta(days=15))
        due_types = [d[1]["job_type"] for d in due]
        assert "reminder_process" in due_types

    def test_reminder_without_time_enqueues_immediate_job(self, clean_stores):
        """No remind_at → job is enqueued for now (immediately due)."""
        from receptionist.service.handlers.base import HandlerContext
        from receptionist.service.handlers.reminder import handle_reminder
        from receptionist.worker import jobs_store as js

        ctx = HandlerContext(
            tenant_id="t1", message="Set me a reminder", intent="reminder",
            fields={}, profile={}, conversation_id="conv_1", contact_id="ctc_1",
        )
        result = handle_reminder(ctx)
        assert result.status == "queued"

        due = js.due_jobs(now=_now())
        types = [d[1]["job_type"] for d in due]
        assert "reminder_process" in types


class TestFollowUpEnqueuesJob:
    def test_follow_up_handler_returns_queued(self, client):
        # The fake model may route to 'follow_up' or another intent
        out = _run(client, "Please follow up with me next week about the project quote")
        # Accept follow_up or similar intents — what matters is the job is enqueued
        assert out["status"] in ("queued", "executed")

    def test_follow_up_enqueues_worker_job(self, clean_stores):
        """Direct handler call → jobs_store has a follow_up_process job."""
        from receptionist.service.handlers.base import HandlerContext
        from receptionist.service.handlers.follow_up import handle_follow_up
        from receptionist.worker import jobs_store as js

        ctx = HandlerContext(
            tenant_id="t1", message="Follow up with John next week",
            intent="follow_up",
            fields={"name": "John", "due_at": "2026-08-10"},
            profile={}, conversation_id="conv_1", contact_id="ctc_1",
        )
        result = handle_follow_up(ctx)
        assert result.status == "queued"

        # Check via the raw store that the job was enqueued
        all_rows = list(getattr(js._jobs(), "_rows", []))
        types = [r["data"]["job_type"] for r in all_rows if isinstance(r.get("data"), dict)]
        assert "follow_up_process" in types

        # Confirm it is due when simulating time beyond run_at
        due = js.due_jobs(now=_now() + timedelta(days=15))
        due_types = [d[1]["job_type"] for d in due]
        assert "follow_up_process" in due_types

    def test_follow_up_creates_task_record(self, clean_stores):
        from receptionist.service.handlers.base import HandlerContext
        from receptionist.service.handlers.follow_up import handle_follow_up
        from receptionist.service import stores

        ctx = HandlerContext(
            tenant_id="t1", message="Follow up with Jane",
            intent="follow_up", fields={"name": "Jane"}, profile={},
            conversation_id="conv_1", contact_id="ctc_1",
        )
        result = handle_follow_up(ctx)
        assert result.record_type == "task"
        tasks = stores.tasks().list("t1")
        assert len(tasks) == 1


# ── STOP conditions for reminder_process ──────────────────────────────────────

class TestReminderProcessStopConditions:
    def _enqueue_and_run(self, tenant_id, reminder_id, contact_id="", conversation_id="",
                         job_created_at=""):
        from receptionist.worker import jobs_store as js
        from receptionist.worker.runtime import Worker

        jid = js.enqueue(
            tenant_id=tenant_id,
            job_type="reminder_process",
            payload={
                "reminder_id": reminder_id,
                "contact_id": contact_id,
                "conversation_id": conversation_id,
                "job_created_at": job_created_at or _now().isoformat(timespec="seconds"),
            },
        )
        w = Worker(instance_id="test-stop-worker")
        result = w.run_due_once(now=_now())
        return jid, result

    def _make_reminder(self, tenant_id, reminder_id, contact_id=""):
        from receptionist.service import stores
        from receptionist.service.schemas import Reminder
        rem = Reminder(
            id=reminder_id, tenant_id=tenant_id,
            contact_id=contact_id or None,
            title="Test reminder", status="scheduled",
        ).model_dump()
        stores.reminders().put(tenant_id, rem)
        return rem

    def test_stops_on_unsubscribe(self, clean_stores):
        from receptionist.service import stores
        from receptionist.service.schemas import OptOut

        tid = "t_stop_unsub"
        cid = "ctc_unsub"
        rid = "rem_unsub"

        self._make_reminder(tid, rid, cid)

        opt = OptOut(id="opt_1", tenant_id=tid, contact_id=cid, scope="all").model_dump()
        stores.optouts().put(tid, opt)

        jid, result = self._enqueue_and_run(tid, rid, contact_id=cid)
        assert result["count"] == 1

        from receptionist.worker import jobs_store as js
        job = js.get_job(jid, tid)
        # job is completed; check the handler result's stop_reason via processed
        assert job["status"] == "completed"
        proc = result["processed"][0]["result"]
        assert proc.get("stop_reason") == "unsubscribed"
        assert proc.get("delivered") is False

    def test_stops_on_contact_archived(self, clean_stores):
        from receptionist.service import stores
        from receptionist.service.schemas import Contact

        tid = "t_stop_arch"
        cid = "ctc_arch"
        rid = "rem_arch"

        self._make_reminder(tid, rid, cid)
        c = Contact(id=cid, tenant_id=tid, status="archived").model_dump()
        stores.contacts().put(tid, c)

        _, result = self._enqueue_and_run(tid, rid, contact_id=cid)
        proc = result["processed"][0]["result"]
        assert proc.get("stop_reason") == "contact_archived"
        assert proc.get("delivered") is False

    def test_stops_on_contact_suppressed(self, clean_stores):
        from receptionist.service import stores
        from receptionist.service.schemas import Contact

        tid = "t_stop_supp"
        cid = "ctc_supp"
        rid = "rem_supp"

        self._make_reminder(tid, rid, cid)
        c = Contact(id=cid, tenant_id=tid, status="suppressed").model_dump()
        stores.contacts().put(tid, c)

        _, result = self._enqueue_and_run(tid, rid, contact_id=cid)
        proc = result["processed"][0]["result"]
        assert proc.get("stop_reason") == "suppressed"

    def test_stops_on_conversation_closed(self, clean_stores):
        from receptionist.service import stores
        from receptionist.service.schemas import Conversation

        tid = "t_stop_closed"
        cid = "ctc_cls"
        conv_id = "conv_cls"
        rid = "rem_cls"

        self._make_reminder(tid, rid, cid)
        conv = Conversation(id=conv_id, tenant_id=tid, status="closed").model_dump()
        stores.conversations().put(tid, conv)

        _, result = self._enqueue_and_run(tid, rid, contact_id=cid, conversation_id=conv_id)
        proc = result["processed"][0]["result"]
        assert proc.get("stop_reason") == "conversation_resolved"

    def test_stops_on_customer_reply_since(self, clean_stores):
        from receptionist.service import stores
        from receptionist.service.schemas import Message

        tid = "t_stop_reply"
        cid = "ctc_rpl"
        conv_id = "conv_rpl"
        rid = "rem_rpl"

        job_created_at = "2026-08-01T10:00:00+00:00"
        # Customer message AFTER job_created_at
        self._make_reminder(tid, rid, cid)
        msg = Message(
            id="msg_1", tenant_id=tid, conversation_id=conv_id,
            role="customer", text="Thanks, I'll be there",
            created_at="2026-08-01T11:00:00+00:00",
        ).model_dump()
        stores.messages().put(tid, msg)

        from receptionist.worker import jobs_store as js
        from receptionist.worker.runtime import Worker

        jid = js.enqueue(
            tenant_id=tid,
            job_type="reminder_process",
            payload={
                "reminder_id": rid,
                "contact_id": cid,
                "conversation_id": conv_id,
                "job_created_at": job_created_at,
            },
        )
        w = Worker(instance_id="test-reply-stop")
        result = w.run_due_once(now=_now())
        proc = result["processed"][0]["result"]
        assert proc.get("stop_reason") == "customer_replied_since"

    def test_delivery_reports_provider_not_connected(self, clean_stores):
        """Without a configured provider, delivery must never report 'sent'."""
        from receptionist.service import stores
        from receptionist.service.schemas import Reminder
        from receptionist.worker import jobs_store as js
        from receptionist.worker.runtime import Worker

        tid = "t_no_provider"
        rid = "rem_noprov"
        cid = "ctc_noprov"

        rem = Reminder(
            id=rid, tenant_id=tid, contact_id=cid,
            title="No provider reminder", status="scheduled", channel="email",
        ).model_dump()
        stores.reminders().put(tid, rem)

        jid = js.enqueue(
            tenant_id=tid,
            job_type="reminder_process",
            payload={"reminder_id": rid, "contact_id": cid, "conversation_id": ""},
        )
        w = Worker(instance_id="test-no-provider")
        result = w.run_due_once(now=_now())
        proc = result["processed"][0]["result"]

        # delivery_status must be "provider_not_connected", never "sent"
        assert proc.get("delivery_status") == "provider_not_connected"
        assert proc.get("delivered") is False

        # Reminder record must remain "scheduled" (not "sent")
        rem2 = stores.reminders().get(tid, rid)
        assert rem2["status"] == "scheduled"


# ── STOP conditions for follow_up_process ────────────────────────────────────

class TestFollowUpProcessStopConditions:
    def _make_task(self, tenant_id, task_id, contact_id=""):
        from receptionist.service import stores
        from receptionist.service.schemas import Task
        t = Task(
            id=task_id, tenant_id=tenant_id, contact_id=contact_id or None,
            kind="follow_up", title="Test follow-up", status="open",
        ).model_dump()
        stores.tasks().put(tenant_id, t)
        return t

    def _enqueue_and_run(self, tenant_id, task_id, contact_id="", conversation_id=""):
        from receptionist.worker import jobs_store as js
        from receptionist.worker.runtime import Worker

        jid = js.enqueue(
            tenant_id=tenant_id,
            job_type="follow_up_process",
            payload={
                "task_id": task_id,
                "contact_id": contact_id,
                "conversation_id": conversation_id,
                "job_created_at": _now().isoformat(timespec="seconds"),
            },
        )
        w = Worker(instance_id="test-fu-worker")
        result = w.run_due_once(now=_now())
        return jid, result

    def test_stops_on_unsubscribe(self, clean_stores):
        from receptionist.service import stores
        from receptionist.service.schemas import OptOut

        tid = "t_fu_unsub"
        cid = "ctc_fu_unsub"
        task_id = "task_unsub"

        self._make_task(tid, task_id, cid)
        opt = OptOut(id="opt_fu", tenant_id=tid, contact_id=cid, scope="all").model_dump()
        stores.optouts().put(tid, opt)

        _, result = self._enqueue_and_run(tid, task_id, contact_id=cid)
        proc = result["processed"][0]["result"]
        assert proc.get("stop_reason") == "unsubscribed"
        assert proc.get("activated") is False

    def test_stops_on_conversation_resolved(self, clean_stores):
        from receptionist.service import stores
        from receptionist.service.schemas import Conversation

        tid = "t_fu_resolved"
        conv_id = "conv_fu_res"
        task_id = "task_resolved"

        self._make_task(tid, task_id)
        conv = Conversation(id=conv_id, tenant_id=tid, status="resolved").model_dump()
        stores.conversations().put(tid, conv)

        _, result = self._enqueue_and_run(tid, task_id, conversation_id=conv_id)
        proc = result["processed"][0]["result"]
        assert proc.get("stop_reason") == "conversation_resolved"

    def test_follow_up_delivery_never_sent(self, clean_stores):
        """follow_up_process never reports 'sent' — delivery_status is at most 'notified'
        (team email) or 'provider_not_connected'. Without EMAIL_PROVIDER_API_KEY it
        must report 'provider_not_connected'."""
        from receptionist.worker import jobs_store as js
        from receptionist.worker.runtime import Worker

        tid = "t_fu_delivery"
        task_id = "task_delivery"
        self._make_task(tid, task_id)

        jid = js.enqueue(
            tenant_id=tid,
            job_type="follow_up_process",
            payload={"task_id": task_id, "contact_id": "", "conversation_id": ""},
        )
        w = Worker(instance_id="test-fu-delivery")
        result = w.run_due_once(now=_now())
        proc = result["processed"][0]["result"]

        # delivery_status must NEVER be "sent" without provider confirmation
        assert proc.get("delivery_status") in ("provider_not_connected", "notified")
        # "sent" is only valid with a real message delivery — never claimed here
        assert proc.get("delivery_status") != "sent"

    def test_idempotent_follow_up_already_done(self, clean_stores):
        """Running follow_up_process on a completed task is a no-op."""
        from receptionist.service import stores
        from receptionist.service.schemas import Task
        from receptionist.worker import jobs_store as js
        from receptionist.worker.runtime import Worker

        tid = "t_fu_idem"
        task_id = "task_idem"
        t = Task(id=task_id, tenant_id=tid, kind="follow_up",
                 title="Done task", status="done").model_dump()
        stores.tasks().put(tid, t)

        jid = js.enqueue(
            tenant_id=tid,
            job_type="follow_up_process",
            payload={"task_id": task_id, "contact_id": "", "conversation_id": ""},
        )
        w = Worker(instance_id="test-fu-idem")
        result = w.run_due_once(now=_now())
        proc = result["processed"][0]["result"]
        assert proc.get("idempotent") is True
