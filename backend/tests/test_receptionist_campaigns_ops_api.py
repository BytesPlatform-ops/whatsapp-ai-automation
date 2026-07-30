"""Campaign operator HTTP endpoints (Wave 17). Hermetic — no live sends.

Asserts the campaign builder surface behaves and that launch requires a valid
approval (no launch from a frontend state alone).
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

BASE = "/api/agents/ai-receptionist"


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setenv("PIXIE_PERSIST", "memory")
    monkeypatch.setenv("PIXIE_MODEL_MODE", "fake")
    monkeypatch.setenv("PIXIE_INTERNAL_API_SECRET", "")
    monkeypatch.setenv("AI_RECEPTIONIST_CAMPAIGNS_ENABLED", "1")
    from receptionist.service import stores
    from receptionist.worker import jobs_store
    from integrations import connections
    stores.reset_all(); jobs_store.reset_stores(); connections.clear_connections()
    import app
    return TestClient(app.app)


def _make(client):
    r = client.post(f"{BASE}/outbound-campaigns", params={"tenant_id": "t_a"},
                    json={"name": "Reminders", "purpose": "support", "channels": ["sms"]})
    cid = r.json()["campaign"]["id"]
    client.post(f"{BASE}/outbound-campaigns/{cid}/update", params={"tenant_id": "t_a"},
                json={"audience_rule": {"contact_ids": []}})
    client.post(f"{BASE}/outbound-campaigns/{cid}/steps", params={"tenant_id": "t_a"},
                json={"name": "s1", "channel": "sms", "order": 0})
    client.post(f"{BASE}/outbound-campaigns/{cid}/content", params={"tenant_id": "t_a"},
                json={"channel": "sms", "body": "Hi {{first_name}}"})
    return cid


def test_create_list_and_flags(client):
    _make(client)
    r = client.get(f"{BASE}/outbound-campaigns", params={"tenant_id": "t_a"})
    assert r.status_code == 200
    assert r.json()["feature_enabled"] is True and r.json()["send_enabled"] is False
    assert len(r.json()["campaigns"]) == 1


def test_validate_and_approval_flow(client):
    cid = _make(client)
    v = client.get(f"{BASE}/outbound-campaigns/{cid}/validate", params={"tenant_id": "t_a"})
    assert v.json()["ok"] is True
    client.post(f"{BASE}/outbound-campaigns/{cid}/request-approval", params={"tenant_id": "t_a"})
    ap = client.post(f"{BASE}/outbound-campaigns/{cid}/approve", params={"tenant_id": "t_a"}, json={"notes": "ok"})
    assert ap.json()["status"] == "approved"
    detail = client.get(f"{BASE}/outbound-campaigns/{cid}", params={"tenant_id": "t_a"})
    assert detail.json()["approval_valid"] is True


def test_launch_requires_valid_approval(client):
    cid = _make(client)
    # start without approval → refused
    r = client.post(f"{BASE}/outbound-campaigns/{cid}/start", params={"tenant_id": "t_a"})
    assert r.json()["status"] in ("approval_invalid", "not_approved")
    # approve, then editing content invalidates → start refused again (stale approval)
    client.post(f"{BASE}/outbound-campaigns/{cid}/request-approval", params={"tenant_id": "t_a"})
    client.post(f"{BASE}/outbound-campaigns/{cid}/approve", params={"tenant_id": "t_a"}, json={})
    client.post(f"{BASE}/outbound-campaigns/{cid}/content", params={"tenant_id": "t_a"},
                json={"channel": "sms", "body": "edited {{first_name}}"})
    r2 = client.post(f"{BASE}/outbound-campaigns/{cid}/start", params={"tenant_id": "t_a"})
    assert r2.json()["status"] == "approval_invalid"


def test_start_enqueues_prepare_once(client):
    cid = _make(client)
    client.post(f"{BASE}/outbound-campaigns/{cid}/request-approval", params={"tenant_id": "t_a"})
    client.post(f"{BASE}/outbound-campaigns/{cid}/approve", params={"tenant_id": "t_a"}, json={})
    r = client.post(f"{BASE}/outbound-campaigns/{cid}/start", params={"tenant_id": "t_a"})
    assert r.json()["status"] == "preparing" and r.json()["run_id"]
    # duplicate start does not create a second run
    r2 = client.post(f"{BASE}/outbound-campaigns/{cid}/start", params={"tenant_id": "t_a"})
    assert r2.json()["status"] == "already_running"


def test_audience_and_analytics(client):
    cid = _make(client)
    a = client.get(f"{BASE}/outbound-campaigns/{cid}/audience", params={"tenant_id": "t_a"})
    assert "estimate" in a.json()
    an = client.get(f"{BASE}/outbound-campaigns/{cid}/analytics", params={"tenant_id": "t_a"})
    assert an.json()["analytics"]["audience"] == 0
