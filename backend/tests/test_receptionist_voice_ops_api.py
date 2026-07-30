"""Voice operator HTTP endpoints (Wave 16). Hermetic — mock Vapi transport.

Asserts the Vapi API key + server secret never leak, and connect/numbers/settings/
outbound/call-detail behave.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from receptionist.providers import voice_adapter as VOICE

BASE = "/api/agents/ai-receptionist"


class _Tx(VOICE.VoiceTransport):
    def get_account(self, key): return {"id": "org_1", "name": "Acme"}
    def list_phone_numbers(self, key):
        return {"data": [{"id": "pn_v1", "number": "+15550009999", "provider": "vapi", "inbound": True, "outbound": True}]}
    def get_phone_number(self, key, n): return {"id": n, "number": "+15550009999"}
    def import_phone_number(self, key, p): return {"id": "pn_imp", "number": p.get("number", ""), "provider": p.get("provider", "twilio")}
    def configure_phone_number(self, key, n, p): return {"id": n}
    def create_assistant(self, key, p): return {"id": "a"}
    def update_assistant(self, key, a, p): return {"id": a}
    def get_assistant(self, key, a): return {"id": a}
    def start_call(self, key, p): return {"id": "call_1", "status": "queued", "type": "outboundPhoneCall", "customer": {"number": (p.get("customer") or {}).get("number", "")}}
    def get_call(self, key, c): return {"id": c, "status": "ended", "endedReason": "customer-ended-call", "durationSeconds": 30}
    def end_call(self, key, c): return {"ok": True}
    def transfer_call(self, key, c, d): return {"ok": True}
    def say(self, key, c, t): return {"ok": True}
    def get_call_artifacts(self, key, c): return {}
    def get_recording_metadata(self, key, c): return {}


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setenv("PIXIE_PERSIST", "memory")
    monkeypatch.setenv("PIXIE_MODEL_MODE", "fake")
    monkeypatch.setenv("PIXIE_INTERNAL_API_SECRET", "")
    from receptionist.service import stores
    from receptionist.worker import jobs_store
    from integrations import connections
    stores.reset_all(); jobs_store.reset_stores(); connections.clear_connections()
    VOICE.set_transport(_Tx())
    import app
    yield TestClient(app.app)
    VOICE.set_transport(None); stores.reset_all()


def _connect(client):
    return client.post(f"{BASE}/voice/connect", params={"tenant_id": "t_a"},
                       json={"vapi_api_key": "sk_SECRET", "server_secret": "srv_SECRET"})


def test_connect_no_secret_leak(client):
    r = _connect(client)
    assert r.status_code == 200 and r.json()["status"] == "connected"
    assert "sk_SECRET" not in r.text and "srv_SECRET" not in r.text
    s = client.get(f"{BASE}/voice/status", params={"tenant_id": "t_a"})
    assert "sk_SECRET" not in s.text and "srv_SECRET" not in s.text
    assert "vapi_api_key" not in s.text and "server_secret" not in s.text
    assert s.json()["connection"]["state"] in ("no_number", "server_auth_missing", "ready_for_inbound")


def test_numbers_and_settings(client):
    _connect(client)
    n = client.get(f"{BASE}/voice/numbers", params={"tenant_id": "t_a"})
    assert n.json()["numbers"][0]["phone_number_id"] == "pn_v1"
    st = client.post(f"{BASE}/voice/settings", params={"tenant_id": "t_a"}, json={"outbound": True})
    assert st.json()["connection"]["outbound_enabled"] is True


def test_assistant_config_no_secret(client):
    _connect(client)
    a = client.get(f"{BASE}/voice/assistant", params={"tenant_id": "t_a"})
    assert a.status_code == 200 and "sk_SECRET" not in a.text and "tools" in a.json()["assistant"]


def test_outbound_call_and_detail(client):
    _connect(client)
    client.post(f"{BASE}/voice/settings", params={"tenant_id": "t_a"}, json={"outbound": True})
    call = client.post(f"{BASE}/voice/calls/outbound", params={"tenant_id": "t_a"},
                       json={"to": "+15559990000", "number_id": "pn_v1", "responding_to_request": True})
    assert call.json()["status"] == "queued"
    call_id = call.json()["record_id"]
    detail = client.get(f"{BASE}/voice/calls/{call_id}", params={"tenant_id": "t_a"})
    assert detail.status_code == 200 and detail.json()["call"]["call_id"] == call_id


def test_outbound_disabled_returns_policy_block(client):
    _connect(client)
    call = client.post(f"{BASE}/voice/calls/outbound", params={"tenant_id": "t_a"},
                       json={"to": "+15559990000", "number_id": "pn_v1"})
    assert call.json()["status"] == "blocked_by_policy"


def test_disconnect(client):
    _connect(client)
    d = client.post(f"{BASE}/voice/disconnect", params={"tenant_id": "t_a"})
    assert d.json()["status"] == "disconnected"
    s = client.get(f"{BASE}/voice/status", params={"tenant_id": "t_a"})
    assert s.json()["connection"]["state"] == "not_connected"
