"""Gmail/Calendar/Widget provider HTTP endpoints (Wave 8). Hermetic."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

BASE = "/api/agents/ai-receptionist"


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setenv("PIXIE_PERSIST", "memory")
    monkeypatch.setenv("PIXIE_MODEL_MODE", "fake")
    monkeypatch.setenv("PIXIE_INTERNAL_API_SECRET", "")
    from receptionist.service import stores
    from receptionist.worker import jobs_store
    stores.reset_all(); jobs_store.reset_stores()
    from integrations import connections
    connections.clear_connections()
    connections.register_many("t_a", ["email_read", "email_send", "calendar_read", "calendar_create_event"], {
        "provider": "google", "status": "active", "email": "biz@example.com",
        "access_token": "tok", "refresh_token": "r", "expires_at": 9_999_999_999,
        "scope": "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send "
                 "https://www.googleapis.com/auth/calendar.events"})
    import app
    return TestClient(app.app)


def test_gmail_status(client):
    r = client.get(f"{BASE}/gmail/status", params={"tenant_id": "t_a"})
    assert r.status_code == 200 and r.json()["connection"]["can_send"]


def test_gmail_settings_reply_mode(client):
    r = client.post(f"{BASE}/gmail/settings", json={"gmail_reply_mode": "approval_required"}, params={"tenant_id": "t_a"})
    assert r.status_code == 200 and r.json()["reply_mode"] == "approval_required"


def test_gmail_sync_enqueues(client):
    r = client.post(f"{BASE}/gmail/sync", json={"mode": "initial"}, params={"tenant_id": "t_a"})
    assert r.status_code == 200 and r.json()["job_type"] == "gmail_initial_sync"


def test_calendar_status_and_config(client):
    r = client.get(f"{BASE}/calendar/status", params={"tenant_id": "t_a"})
    assert r.status_code == 200 and r.json()["connection"]["can_write_events"]
    r2 = client.post(f"{BASE}/calendar/config", json={"services": {"consultation": 30}, "timezone": "UTC",
                                                      "working_hours": {"mon": [9, 17]}}, params={"tenant_id": "t_a"})
    assert r2.status_code == 200 and r2.json()["config"]["configured"]


def test_calendar_availability(client):
    client.post(f"{BASE}/calendar/config", json={"services": {"consultation": 30}, "timezone": "UTC",
                                                 "working_hours": {"mon": [9, 17], "tue": [9, 17], "wed": [9, 17],
                                                                   "thu": [9, 17], "fri": [9, 17]},
                                                 "min_notice_minutes": 0}, params={"tenant_id": "t_a"})
    r = client.get(f"{BASE}/calendar/availability", params={"tenant_id": "t_a", "service": "consultation", "days": 14})
    assert r.status_code == 200 and r.json()["status"] == "ok"


def test_widget_config_roundtrip(client):
    r = client.get(f"{BASE}/widget/config", params={"tenant_id": "t_a"})
    assert r.status_code == 200 and r.json()["config"]["public_id"]
    r2 = client.post(f"{BASE}/widget/config", json={"allowed_domains": ["shop.example"]}, params={"tenant_id": "t_a"})
    assert r2.json()["config"]["allowed_domains"] == ["shop.example"]
    # tenant id never leaks in the widget config response
    assert "tenant_id" not in r2.json()["config"]
