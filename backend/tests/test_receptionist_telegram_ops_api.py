"""Telegram operator HTTP endpoints (Wave 15). Hermetic — mock transport.

Asserts tenant id + bot token never leak in responses, and connect/webhook/settings/
mode/drafts behave.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from receptionist.providers import telegram_adapter as TG

BASE = "/api/agents/ai-receptionist"


class _Tx(TG.TelegramTransport):
    def get_me(self, token): return {"ok": True, "result": {"id": 111, "username": "acme_bot", "first_name": "Acme"}}
    def set_webhook(self, t, u, s, a): return {"ok": True, "result": True}
    def get_webhook_info(self, t): return {"ok": True, "result": {"url": "https://x", "pending_update_count": 0}}
    def delete_webhook(self, t): return {"ok": True, "result": True}
    def send_message(self, t, p): return {"ok": True, "result": {"message_id": 1, "chat": {"id": p.get("chat_id")}}}
    def edit_message(self, t, p): return {"ok": True, "result": {"message_id": 1}}
    def delete_message(self, t, c, m): return {"ok": True}
    def answer_callback_query(self, t, c, x): return {"ok": True}
    def send_chat_action(self, t, c, a): return {"ok": True}
    def send_media(self, t, m, p): return {"ok": True, "result": {"message_id": 2, "chat": {"id": p.get("chat_id")}}}
    def get_file(self, t, f): return {"ok": True, "result": {}}
    def download_file(self, t, p): return b""
    def get_business_connection(self, t, b): return {"ok": True, "result": {"id": b, "rights": {"can_reply": True}}}


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setenv("PIXIE_PERSIST", "memory")
    monkeypatch.setenv("PIXIE_MODEL_MODE", "fake")
    monkeypatch.setenv("PIXIE_INTERNAL_API_SECRET", "")
    from receptionist.service import stores
    from receptionist.worker import jobs_store
    from integrations import connections
    stores.reset_all(); jobs_store.reset_stores(); connections.clear_connections()
    TG.set_transport(_Tx())
    import app
    yield TestClient(app.app)
    TG.set_transport(None); stores.reset_all()


def test_connect_validates_and_no_secret_leak(client):
    r = client.post(f"{BASE}/telegram/connect", params={"tenant_id": "t_a"}, json={"bot_token": "123:SECRET_TOK"})
    assert r.status_code == 200 and r.json()["status"] == "connected"
    assert r.json()["bot"]["bot_username"] == "acme_bot"
    assert "SECRET_TOK" not in r.text
    s = client.get(f"{BASE}/telegram/status", params={"tenant_id": "t_a"})
    assert "SECRET_TOK" not in s.text and "bot_token" not in s.text and "tenant_id" not in s.json()
    assert s.json()["connection"]["state"] in ("webhook_missing", "standard_bot_ready")


def test_webhook_configure_and_info(client):
    client.post(f"{BASE}/telegram/connect", params={"tenant_id": "t_a"}, json={"bot_token": "1:A"})
    w = client.post(f"{BASE}/telegram/webhook", params={"tenant_id": "t_a"}, json={"base_url": "https://pixie.app"})
    assert w.json()["status"] == "configured"
    info = client.get(f"{BASE}/telegram/webhook-info", params={"tenant_id": "t_a"})
    assert info.status_code == 200 and "webhook" in info.json()


def test_settings_per_mode_and_mode_toggle(client):
    client.post(f"{BASE}/telegram/connect", params={"tenant_id": "t_a"}, json={"bot_token": "1:A"})
    r = client.post(f"{BASE}/telegram/settings", params={"tenant_id": "t_a"},
                    json={"mode": "business", "reply_mode": "approval_required"})
    assert r.json()["reply_mode"] == "approval_required"
    m = client.post(f"{BASE}/telegram/mode", params={"tenant_id": "t_a"}, json={"business": True})
    assert m.json()["connection"]["business_enabled"] is True


def test_drafts_retry_and_health(client):
    from receptionist.service import telegram_sync
    telegram_sync.save_draft("t_a", {"mode": "bot", "status": "failed", "chat_id": "900",
                                     "user_id": "900", "text": "hi"})
    d = client.get(f"{BASE}/telegram/drafts", params={"tenant_id": "t_a", "mode": "bot"})
    draft_id = d.json()["drafts"][0]["id"]
    retry = client.post(f"{BASE}/telegram/drafts/{draft_id}/retry", params={"tenant_id": "t_a"})
    assert retry.json()["enqueued"] is True
    h = client.post(f"{BASE}/telegram/health", params={"tenant_id": "t_a"})
    assert h.json()["enqueued"] is True


def test_disconnect(client):
    client.post(f"{BASE}/telegram/connect", params={"tenant_id": "t_a"}, json={"bot_token": "1:A"})
    d = client.post(f"{BASE}/telegram/disconnect", params={"tenant_id": "t_a"})
    assert d.json()["status"] == "disconnected"
    s = client.get(f"{BASE}/telegram/status", params={"tenant_id": "t_a"})
    assert s.json()["connection"]["state"] == "not_connected"
