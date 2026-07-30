"""CRM marketplace HTTP endpoints + webhook (Wave 18). Hermetic — mock providers.

Asserts credentials never leak, external writes stay disabled by default, and the
webhook authenticates + resolves the workspace server-side.
"""

from __future__ import annotations

import hashlib
import hmac
import json

import pytest
from fastapi.testclient import TestClient

BASE = "/api/agents/ai-receptionist"


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setenv("PIXIE_PERSIST", "memory")
    monkeypatch.setenv("PIXIE_MODEL_MODE", "fake")
    monkeypatch.setenv("PIXIE_INTERNAL_API_SECRET", "")
    monkeypatch.setenv("AI_RECEPTIONIST_CRM_MARKETPLACE_ENABLED", "1")
    from receptionist.service import stores
    from receptionist.worker import jobs_store
    from integrations import connections, webhook_events
    from receptionist.providers import crm
    stores.reset_all(); jobs_store.reset_stores(); connections.clear_connections(); crm.clear_transports()
    try: webhook_events._reset_repos()
    except Exception: pass
    import app
    return TestClient(app.app)


def _connect(client, provider="hubspot"):
    return client.post(f"{BASE}/crm/{provider}/connect", params={"tenant_id": "t_a"},
                       json={"access_token": "SECRET_TOK", "account_id": f"{provider}_acct_1"})


def test_catalog_lists_five(client):
    r = client.get(f"{BASE}/crm/catalog", params={"tenant_id": "t_a"})
    assert r.status_code == 200 and len(r.json()["catalog"]) == 5
    assert r.json()["marketplace_enabled"] is True


def test_connect_no_secret_leak_and_safe_defaults(client):
    r = _connect(client)
    assert r.status_code == 200 and r.json()["status"] == "connected"
    assert "SECRET_TOK" not in r.text
    s = client.get(f"{BASE}/crm/hubspot/status", params={"tenant_id": "t_a"})
    assert "SECRET_TOK" not in s.text and "access_token" not in s.text
    assert s.json()["connection"]["write"] is False
    assert s.json()["connection"]["state"] == "sync_paused"


def test_sync_direction_bidirectional_blocked_by_default(client):
    _connect(client)
    r = client.post(f"{BASE}/crm/hubspot/sync-direction", params={"tenant_id": "t_a"}, json={"direction": "bidirectional"})
    assert r.json()["status"] == "blocked"


def test_import_and_conflicts_endpoints(client):
    _connect(client)
    imp = client.post(f"{BASE}/crm/hubspot/import", params={"tenant_id": "t_a"}, json={"object_type": "contact"})
    assert imp.json()["enqueued"] is True
    conf = client.get(f"{BASE}/crm/hubspot/conflicts", params={"tenant_id": "t_a"})
    assert "conflicts" in conf.json()


def test_field_mapping_validation(client):
    _connect(client)
    r = client.post(f"{BASE}/crm/hubspot/field-mappings", params={"tenant_id": "t_a"},
                    json={"object_type": "contact", "provider_field_id": "f1", "provider_field_name": "budget",
                          "provider_field_type": "number", "canonical_field": "phone"})
    assert r.json()["mapping"]["validation"] == "type_incompatible"


def test_disconnect(client):
    _connect(client)
    d = client.post(f"{BASE}/crm/hubspot/disconnect", params={"tenant_id": "t_a"})
    assert d.json()["status"] == "disconnected"
    s = client.get(f"{BASE}/crm/hubspot/status", params={"tenant_id": "t_a"})
    assert s.json()["connection"]["state"] == "not_connected"


def test_webhook_signature_and_resolution(client):
    # set a webhook secret on the connection
    _connect(client)
    from integrations import connections
    base = connections.find_active_connection_unsealed("t_a", "crm_hubspot")
    base = dict(base); base["webhook_secret"] = "whsec"
    connections.register_many("t_a", ["crm_hubspot"], base)
    body = json.dumps({"event_id": "e1", "object_type": "contact", "record_id": "hs_c_1"}).encode()
    sig = hmac.new(b"whsec", body, hashlib.sha256).hexdigest()
    ok = client.post(f"{BASE}/crm/webhook/hubspot/hubspot_acct_1", content=body,
                     headers={"x-crm-signature": sig, "content-type": "application/json"})
    assert ok.status_code == 200 and ok.json().get("enqueued") is True
    forged = client.post(f"{BASE}/crm/webhook/hubspot/hubspot_acct_1", content=body,
                         headers={"x-crm-signature": "bad"})
    assert forged.status_code == 403
    unknown = client.post(f"{BASE}/crm/webhook/hubspot/UNKNOWN", content=body,
                          headers={"x-crm-signature": sig})
    assert unknown.json().get("skipped") == "unknown_connection"
