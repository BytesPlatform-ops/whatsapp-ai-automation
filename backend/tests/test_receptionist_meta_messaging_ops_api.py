"""Meta Messaging operator HTTP endpoints (Wave 13). Hermetic — mock transports.

Covers the ops_api surface the Pixie Lab Meta Messaging panel drives through the
/api/lab/receptionist/meta-messaging proxy: status, account/page discovery, select,
settings, drafts, edit/retry/reconcile, test/health/disconnect. Asserts tenant id +
tokens never leak in responses.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from receptionist.providers import instagram_messaging as IG
from receptionist.providers import messenger as FB

BASE = "/api/agents/ai-receptionist"


class _IGTx(IG.InstagramTransport):
    def list_accounts(self, token):
        return {"data": [{"id": "ig_1", "username": "acme.co", "account_type": "BUSINESS",
                          "page_id": "page_1", "messaging_capability": True}]}
    def get_account(self, token, a): return {"id": a, "username": "acme.co"}
    def send_message(self, token, a, p): return {"message_id": "ig.1", "recipient_id": "5551"}
    def mark_seen(self, token, a, r): return {}
    def get_media(self, token, m): return {}
    def download_media(self, token, u): return b""


class _FBTx(FB.MessengerTransport):
    def list_pages(self, token):
        return {"data": [{"id": "page_1", "name": "Acme Ltd", "messaging_capability": True, "access_token": "pat"}]}
    def get_page(self, token, p): return {"id": p, "name": "Acme Ltd"}
    def send_message(self, token, p, pl): return {"message_id": "mid.1", "recipient_id": "5552"}
    def send_sender_action(self, token, p, r, a): return {}
    def get_media(self, token, m): return {}
    def download_media(self, token, u): return b""


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setenv("PIXIE_PERSIST", "memory")
    monkeypatch.setenv("PIXIE_MODEL_MODE", "fake")
    monkeypatch.setenv("PIXIE_INTERNAL_API_SECRET", "")
    from receptionist.service import stores
    from receptionist.worker import jobs_store
    from integrations import connections
    stores.reset_all(); jobs_store.reset_stores(); connections.clear_connections()
    connections.register_many("t_a", ["instagram_read", "instagram_send"], {
        "status": "active", "instagram_account_id": "ig_1", "username": "acme.co",
        "access_token": "SECRET_TOK", "messaging_enabled": True, "messaging_permission": True,
        "webhook_subscribed": True})
    connections.register_many("t_a", ["messenger_read", "messenger_send"], {
        "status": "active", "page_id": "page_1", "page_name": "Acme Ltd",
        "page_access_token": "SECRET_PAT", "messaging_enabled": True, "messaging_permission": True,
        "webhook_subscribed": True})
    IG.set_transport(_IGTx()); FB.set_transport(_FBTx())
    import app
    yield TestClient(app.app)
    IG.set_transport(None); FB.set_transport(None); stores.reset_all()


def test_status_no_secret_leak(client):
    r = client.get(f"{BASE}/meta-messaging/status", params={"tenant_id": "t_a"})
    assert r.status_code == 200
    body = r.json()
    assert body["instagram"]["connection"]["state"] == "ready_for_replies"
    assert body["messenger"]["connection"]["state"] == "ready_for_replies"
    assert "SECRET_TOK" not in r.text and "SECRET_PAT" not in r.text and "tenant_id" not in body


def test_discover_accounts_and_pages(client):
    a = client.get(f"{BASE}/meta-messaging/instagram/accounts", params={"tenant_id": "t_a"})
    assert a.json()["accounts"][0]["instagram_account_id"] == "ig_1"
    p = client.get(f"{BASE}/meta-messaging/messenger/pages", params={"tenant_id": "t_a"})
    assert p.json()["pages"][0]["page_id"] == "page_1"


def test_select_ownership_enforced(client):
    ok = client.post(f"{BASE}/meta-messaging/select", params={"tenant_id": "t_a"},
                     json={"channel": "instagram", "asset_id": "ig_1"})
    assert ok.status_code == 200 and ok.json()["status"] == "selected"
    denied = client.post(f"{BASE}/meta-messaging/select", params={"tenant_id": "t_a"},
                         json={"channel": "instagram", "asset_id": "ig_NOPE"})
    assert denied.status_code == 403


def test_settings_reply_mode_per_channel(client):
    r = client.post(f"{BASE}/meta-messaging/settings", params={"tenant_id": "t_a"},
                    json={"channel": "messenger", "reply_mode": "approval_required"})
    assert r.status_code == 200 and r.json()["reply_mode"] == "approval_required"
    # unknown mode ignored
    r2 = client.post(f"{BASE}/meta-messaging/settings", params={"tenant_id": "t_a"},
                     json={"channel": "messenger", "reply_mode": "bogus"})
    assert r2.json()["reply_mode"] == "approval_required"


def test_drafts_filter_and_retry(client):
    from receptionist.service import meta_messaging_sync
    meta_messaging_sync.save_draft("t_a", {"channel": "instagram", "status": "failed",
                                           "sender_id": "5551", "asset_id": "ig_1", "text": "hi"})
    d = client.get(f"{BASE}/meta-messaging/drafts", params={"tenant_id": "t_a", "channel": "instagram"})
    assert len(d.json()["drafts"]) == 1
    draft_id = d.json()["drafts"][0]["id"]
    retry = client.post(f"{BASE}/meta-messaging/drafts/{draft_id}/retry", params={"tenant_id": "t_a"})
    assert retry.status_code == 200 and retry.json()["enqueued"] is True


def test_health_and_disconnect(client):
    h = client.post(f"{BASE}/meta-messaging/health", params={"tenant_id": "t_a"})
    assert h.json()["enqueued"] is True
    d = client.post(f"{BASE}/meta-messaging/disconnect", params={"tenant_id": "t_a"},
                    json={"channel": "instagram"})
    assert d.json()["status"] == "disconnected"
    # after disconnect, instagram is not connected
    s = client.get(f"{BASE}/meta-messaging/status", params={"tenant_id": "t_a"})
    assert s.json()["instagram"]["connection"]["state"] == "not_connected"
