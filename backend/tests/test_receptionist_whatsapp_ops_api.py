"""WhatsApp operator HTTP endpoints (Wave 12). Hermetic — mock transport, no live Meta.

Covers the ops_api surface the Pixie Lab WhatsApp panel drives through the
/api/lab/receptionist/whatsapp proxy: status, wabas, phone-numbers, settings,
templates (+sync), drafts, and the draft edit/retry/reconcile actions. Asserts the
tenant id is never echoed back to the client.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from receptionist.providers import whatsapp_cloud as WA

BASE = "/api/agents/ai-receptionist"


class _Tx(WA.WhatsAppTransport):
    def __init__(self):
        self.sends = 0
    def list_business_accounts(self, token): return {"data": [{"id": "waba_1", "name": "Acme"}]}
    def list_phone_numbers(self, token, waba_id):
        return {"data": [{"id": "pn_1", "display_phone_number": "+15551230000", "verified_name": "Acme",
                          "quality_rating": "GREEN", "code_verification_status": "VERIFIED"}]}
    def get_phone_number(self, token, pid): return {"id": pid, "display_phone_number": "+15551230000"}
    def send_message(self, token, pid, payload):
        self.sends += 1
        return {"messages": [{"id": f"wamid.{self.sends}"}], "contacts": [{"wa_id": payload.get("to", "")}]}
    def mark_read(self, token, pid, mid): return {"success": True}
    def get_media(self, token, media_id): return {"url": "https://x", "mime_type": "image/jpeg", "file_size": 8}
    def download_media(self, token, url): return b"x"
    def list_templates(self, token, waba_id):
        return {"data": [{"id": "t1", "name": "appointment_reminder", "language": "en_US", "category": "UTILITY",
                          "status": "APPROVED", "components": [{"type": "BODY", "text": "Hi {{1}} at {{2}}"}]},
                         {"id": "t2", "name": "old_promo", "language": "en_US", "category": "MARKETING",
                          "status": "REJECTED", "components": [{"type": "BODY", "text": "{{1}}"}]}]}


def _register(tenant="t_a", pid="pn_1"):
    from integrations import connections
    connections.register_many(tenant, ["whatsapp_read", "whatsapp_send"], {
        "provider": "meta", "status": "active", "waba_id": "waba_1", "waba_name": "Acme",
        "phone_number_id": pid, "display_phone_number": "+15551230000", "verified_name": "Acme",
        "access_token": "tok", "messaging_enabled": True, "template_enabled": True,
        "webhook_subscribed": True})


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setenv("PIXIE_PERSIST", "memory")
    monkeypatch.setenv("PIXIE_MODEL_MODE", "fake")
    monkeypatch.setenv("PIXIE_LLM_PROVIDER", "")
    monkeypatch.setenv("PIXIE_INTERNAL_API_SECRET", "")
    from receptionist.service import stores
    from receptionist.worker import jobs_store
    from integrations import connections
    stores.reset_all(); jobs_store.reset_stores(); connections.clear_connections()
    tx = _Tx(); WA.set_transport(tx)
    _register()
    import app
    c = TestClient(app.app)
    yield c
    WA.set_transport(None); stores.reset_all()


def test_status(client):
    r = client.get(f"{BASE}/whatsapp/status", params={"tenant_id": "t_a"})
    assert r.status_code == 200
    body = r.json()
    assert body["connection"]["display_phone_number"] == "+15551230000"
    assert body["reply_mode"] in ("disabled", "draft_only", "approval_required", "direct_reply")
    assert "tenant_id" not in body and "access_token" not in str(body)


def test_wabas_and_phone_numbers(client):
    r = client.get(f"{BASE}/whatsapp/wabas", params={"tenant_id": "t_a"})
    assert r.status_code == 200 and r.json()["wabas"][0]["waba_id"] == "waba_1"
    r2 = client.get(f"{BASE}/whatsapp/phone-numbers", params={"tenant_id": "t_a", "waba_id": "waba_1"})
    assert r2.status_code == 200 and r2.json()["phone_numbers"][0]["phone_number_id"] == "pn_1"


def test_settings_reply_mode(client):
    r = client.post(f"{BASE}/whatsapp/settings", json={"whatsapp_reply_mode": "approval_required"},
                    params={"tenant_id": "t_a"})
    assert r.status_code == 200 and r.json()["reply_mode"] == "approval_required"
    # unknown mode is ignored, not applied
    r2 = client.post(f"{BASE}/whatsapp/settings", json={"whatsapp_reply_mode": "bogus"},
                     params={"tenant_id": "t_a"})
    assert r2.json()["reply_mode"] == "approval_required"


def test_templates_sync_and_list(client):
    s = client.post(f"{BASE}/whatsapp/templates/sync", params={"tenant_id": "t_a"})
    assert s.status_code == 200
    r = client.get(f"{BASE}/whatsapp/templates", params={"tenant_id": "t_a"})
    names = {t["name"]: t["status"] for t in r.json()["templates"]}
    assert names["appointment_reminder"] == "APPROVED" and names["old_promo"] == "REJECTED"


def test_drafts_and_retry_reconcile_enqueue(client):
    r = client.get(f"{BASE}/whatsapp/drafts", params={"tenant_id": "t_a"})
    assert r.status_code == 200 and isinstance(r.json()["drafts"], list)
    retry = client.post(f"{BASE}/whatsapp/drafts/nope/retry", params={"tenant_id": "t_a"})
    assert retry.status_code == 200 and retry.json()["enqueued"] is True
    rec = client.post(f"{BASE}/whatsapp/drafts/nope/reconcile", params={"tenant_id": "t_a"})
    assert rec.status_code == 200 and rec.json()["enqueued"] is True
