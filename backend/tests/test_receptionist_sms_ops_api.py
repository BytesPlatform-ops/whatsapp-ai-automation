"""SMS operator HTTP endpoints (Wave 14). Hermetic — mock transport, no live provider.

Asserts tenant id + credentials never leak, and quiet-hours/settings/number-select
behave. Drives the surface the Pixie Lab SMS panel uses through the proxy.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from receptionist.providers import sms_adapter as SMS

BASE = "/api/agents/ai-receptionist"


class _Tx(SMS.SMSTransport):
    def list_numbers(self, creds):
        return {"incoming_phone_numbers": [
            {"phone_number": "+15550001111", "friendly_name": "Main", "iso_country": "US",
             "capabilities": {"sms": True, "mms": True}}]}
    def get_number(self, creds, n): return {"phone_number": n, "capabilities": {"sms": True}}
    def send_message(self, creds, p): return {"sid": "SM1", "status": "queued", "num_segments": 1, "to": p.get("To", "")}
    def get_message_status(self, creds, m): return {"status": "delivered"}
    def download_media(self, creds, u): return b""


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setenv("PIXIE_PERSIST", "memory")
    monkeypatch.setenv("PIXIE_MODEL_MODE", "fake")
    monkeypatch.setenv("PIXIE_INTERNAL_API_SECRET", "")
    from receptionist.service import stores
    from receptionist.worker import jobs_store
    from integrations import connections
    stores.reset_all(); jobs_store.reset_stores(); connections.clear_connections()
    connections.register_many("t_a", ["sms_read", "sms_send"], {
        "status": "active", "account_sid": "AC_SECRET", "auth_token": "TOKEN_SECRET",
        "sender_number": "+15550001111", "sms_capable": True, "messaging_enabled": True,
        "inbound_webhook_subscribed": True, "delivery_webhook_subscribed": True})
    SMS.set_transport(_Tx())
    import app
    yield TestClient(app.app)
    SMS.set_transport(None); stores.reset_all()


def test_status_no_secret_leak(client):
    r = client.get(f"{BASE}/sms/status", params={"tenant_id": "t_a"})
    assert r.status_code == 200
    body = r.json()
    assert body["connection"]["state"] == "ready_to_send"
    assert body["quiet_hours"]["timezone"]
    assert "AC_SECRET" not in r.text and "TOKEN_SECRET" not in r.text and "tenant_id" not in body


def test_numbers_and_select(client):
    n = client.get(f"{BASE}/sms/numbers", params={"tenant_id": "t_a"})
    assert n.json()["numbers"][0]["sender_number"] == "+15550001111"
    ok = client.post(f"{BASE}/sms/select", params={"tenant_id": "t_a"}, json={"sender_number": "+15550001111"})
    assert ok.json()["status"] == "selected"
    bad = client.post(f"{BASE}/sms/select", params={"tenant_id": "t_a"}, json={"sender_number": "+19998887777"})
    assert bad.status_code == 400


def test_settings_and_quiet_hours(client):
    r = client.post(f"{BASE}/sms/settings", params={"tenant_id": "t_a"}, json={"sms_reply_mode": "approval_required"})
    assert r.json()["reply_mode"] == "approval_required"
    q = client.post(f"{BASE}/sms/quiet-hours", params={"tenant_id": "t_a"},
                    json={"start_hour": 22, "end_hour": 7, "timezone": "America/New_York"})
    assert q.json()["quiet_hours"]["start_hour"] == 22 and q.json()["quiet_hours"]["timezone"] == "America/New_York"


def test_drafts_retry_and_health(client):
    from receptionist.service import sms_sync
    sms_sync.save_draft("t_a", {"status": "failed", "customer_number": "+15559990000", "text": "hi",
                                "sender_number": "+15550001111"})
    d = client.get(f"{BASE}/sms/drafts", params={"tenant_id": "t_a"})
    draft_id = d.json()["drafts"][0]["id"]
    retry = client.post(f"{BASE}/sms/drafts/{draft_id}/retry", params={"tenant_id": "t_a"})
    assert retry.json()["enqueued"] is True
    h = client.post(f"{BASE}/sms/health", params={"tenant_id": "t_a"})
    assert h.json()["enqueued"] is True


def test_disconnect(client):
    d = client.post(f"{BASE}/sms/disconnect", params={"tenant_id": "t_a"})
    assert d.json()["status"] == "disconnected"
    s = client.get(f"{BASE}/sms/status", params={"tenant_id": "t_a"})
    assert s.json()["connection"]["state"] == "not_connected"
