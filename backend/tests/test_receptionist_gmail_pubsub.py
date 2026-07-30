"""Gmail Pub/Sub webhook + Gmail reminder delivery (Wave 9). Hermetic — no live calls."""

from __future__ import annotations

import base64
import json

import pytest
from fastapi.testclient import TestClient

BASE = "/api/agents/ai-receptionist"


def _pubsub_body(email="biz@example.com", history="123", message_id="msg-1"):
    data = base64.b64encode(json.dumps({"emailAddress": email, "historyId": history}).encode()).decode()
    return {"message": {"data": data, "messageId": message_id}, "subscription": "sub/x"}


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setenv("PIXIE_PERSIST", "memory")
    monkeypatch.setenv("PIXIE_MODEL_MODE", "fake")
    monkeypatch.setenv("PIXIE_INTERNAL_API_SECRET", "")
    monkeypatch.delenv("AI_RECEPTIONIST_GMAIL_PUBSUB_AUDIENCE", raising=False)
    monkeypatch.delenv("AI_RECEPTIONIST_GMAIL_PUBSUB_SERVICE_ACCOUNT", raising=False)
    from receptionist.service import stores
    from receptionist.worker import jobs_store
    from integrations import connections, webhook_events
    stores.reset_all(); jobs_store.reset_stores()
    connections.clear_connections()
    try:
        webhook_events._reset_repos()
    except Exception:
        pass
    connections.register_many("t_a", ["email_read", "email_send"], {
        "provider": "google", "status": "active", "email": "biz@example.com",
        "access_token": "tok", "refresh_token": "r", "expires_at": 9_999_999_999,
        "scope": "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send"})
    import app
    return TestClient(app.app)


def _pending_jobs(tenant="t_a"):
    from receptionist.worker import jobs_store
    return [j for _id, j in jobs_store.due_jobs(limit=50) if j.get("tenant_id") == tenant]


def test_valid_notification_enqueues_incremental_sync(client):
    r = client.post(f"{BASE}/gmail/pubsub", json=_pubsub_body())
    assert r.status_code == 200 and r.json()["status"] == "enqueued"
    jobs = _pending_jobs()
    assert any(j["job_type"] == "gmail_incremental_sync" for j in jobs)


def test_duplicate_notification_enqueues_once(client):
    client.post(f"{BASE}/gmail/pubsub", json=_pubsub_body(message_id="dup"))
    r2 = client.post(f"{BASE}/gmail/pubsub", json=_pubsub_body(message_id="dup"))
    assert r2.json()["status"] == "duplicate"
    jobs = [j for j in _pending_jobs() if j["job_type"] == "gmail_incremental_sync"]
    assert len(jobs) == 1


def test_unknown_account_is_ignored(client):
    r = client.post(f"{BASE}/gmail/pubsub", json=_pubsub_body(email="stranger@nowhere.com"))
    assert r.status_code == 200 and r.json()["status"] == "unknown_account"
    assert not _pending_jobs()


def test_malformed_base64_rejected(client):
    body = {"message": {"data": "!!!not-base64!!!", "messageId": "m"}}
    r = client.post(f"{BASE}/gmail/pubsub", json=body)
    assert r.status_code == 400


def test_missing_email_rejected(client):
    data = base64.b64encode(json.dumps({"historyId": "1"}).encode()).decode()
    r = client.post(f"{BASE}/gmail/pubsub", json={"message": {"data": data, "messageId": "m"}})
    assert r.status_code == 400


def test_oversized_payload_rejected(client):
    r = client.post(f"{BASE}/gmail/pubsub", content=b"x" * 70_000,
                    headers={"Content-Type": "application/json"})
    assert r.status_code == 413


def test_disabled_connection_not_synced(client):
    from integrations import connections
    # mark connection disconnected
    connections.register_connection("t_a", "email_read", {
        "provider": "google", "status": "disconnected", "email": "biz@example.com"})
    r = client.post(f"{BASE}/gmail/pubsub", json=_pubsub_body(message_id="m2"))
    assert r.json()["status"] == "connection_inactive"
    assert not [j for j in _pending_jobs() if j["job_type"] == "gmail_incremental_sync"]


def test_auth_required_when_configured(client, monkeypatch):
    monkeypatch.setenv("AI_RECEPTIONIST_GMAIL_PUBSUB_SERVICE_ACCOUNT", "s3cr3t")
    r = client.post(f"{BASE}/gmail/pubsub", json=_pubsub_body(message_id="m3"))
    assert r.status_code == 401
    r2 = client.post(f"{BASE}/gmail/pubsub?token=s3cr3t", json=_pubsub_body(message_id="m3"))
    assert r2.status_code == 200


def test_body_does_not_carry_tenant(client):
    # a tenant injected into the body must be ignored (ownership from the account only)
    body = _pubsub_body(message_id="m4")
    body["tenant_id"] = "attacker"
    r = client.post(f"{BASE}/gmail/pubsub", json=body)
    assert r.json().get("tenant") == "t_a"


# ── Gmail reminder delivery ───────────────────────────────────────────────────

class _GTx:
    def __init__(self): self.sends = 0
    def profile(self, t): return {}
    def list_messages(self, t, **k): return {"messages": []}
    def get_message(self, t, mid): return {}
    def history(self, t, h): return {"history": []}
    def create_draft(self, t, raw, thread_id=""): return {"id": "d"}
    def send(self, t, raw, thread_id=""):
        self.sends += 1
        return {"id": f"rem-sent-{self.sends}"}


def test_gmail_reminder_delivery(client, monkeypatch):
    monkeypatch.setenv("AI_RECEPTIONIST_GMAIL_REMINDERS_ENABLED", "1")
    from receptionist.providers import gmail as G
    tx = _GTx(); G.set_transport(tx)
    try:
        from receptionist.service import stores
        from receptionist.service.schemas import Contact, Reminder
        c = stores.find_or_create_contact("t_a", email="cust@example.com")
        rem = Reminder(tenant_id="t_a", contact_id=c["id"], title="Appointment", channel="email",
                       related_type="booking", related_id="b1").model_dump()
        stores.reminders().put("t_a", rem)
        from receptionist.worker import handlers
        status = handlers._deliver_reminder("t_a", rem, "email")
        assert status == "sent" and tx.sends == 1
    finally:
        G.set_transport(None)


def test_gmail_reminder_suppressed_not_sent(client, monkeypatch):
    monkeypatch.setenv("AI_RECEPTIONIST_GMAIL_REMINDERS_ENABLED", "1")
    from receptionist.providers import gmail as G
    tx = _GTx(); G.set_transport(tx)
    try:
        from receptionist.service import stores
        from receptionist.service.schemas import OptOut
        c = stores.find_or_create_contact("t_a", email="cust@example.com")
        stores.optouts().put("t_a", OptOut(tenant_id="t_a", email="cust@example.com").model_dump())
        rem = {"id": "r9", "tenant_id": "t_a", "contact_id": c["id"], "title": "Appt", "channel": "email"}
        from receptionist.worker import handlers
        status = handlers._deliver_reminder("t_a", rem, "email")
        assert status == "stopped_suppressed" and tx.sends == 0
    finally:
        G.set_transport(None)
