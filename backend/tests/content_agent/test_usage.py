"""Content Agent usage recording + status endpoint."""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

import pytest

pytest.importorskip("fastapi")

from fastapi import FastAPI
from fastapi.testclient import TestClient

import content_agent.store as store
from content_agent.routes import router

app = FastAPI()
app.include_router(router)
client = TestClient(app)
BASE = "/api/content-agent"


@pytest.fixture(autouse=True)
def _clean(monkeypatch):
    monkeypatch.setenv("PIXIE_INTERNAL_API_SECRET", "")
    monkeypatch.delenv("PIXIE_PERSIST", raising=False)
    monkeypatch.setenv("PIXIE_MODEL_MODE", "fake")
    store.reset_repositories()
    yield
    store.reset_repositories()


def _gen(tenant="ws_A"):
    return client.post(f"{BASE}/generate", json={"tenant_id": tenant, "content_type": "social_post", "inputs": {"topic": "sale"}, "options": {"platform": "instagram", "variations": 2}})


def test_status_reports_mock_availability_and_no_billing():
    b = client.get(f"{BASE}/status").json()
    assert b["mock"] is True and b["available"] is True
    assert b["billing_enforced"] is False
    assert b["missing"] == []


def test_generation_records_usage():
    assert _gen().status_code == 200
    u = client.get(f"{BASE}/usage", params={"tenant_id": "ws_A"}).json()
    assert u["totals"]["records"] == 1
    rec = u["usage"][0]["usage"]
    assert rec["mock"] is True and rec["success"] is True
    assert rec["variations"] == 2 and rec["content_type"] == "social_post"
    assert rec["provider"] == "mock"


def test_usage_is_tenant_isolated():
    _gen(tenant="ws_A")
    assert client.get(f"{BASE}/usage", params={"tenant_id": "ws_B"}).json()["totals"]["records"] == 0


def test_failed_real_generation_records_failure(monkeypatch):
    monkeypatch.setenv("PIXIE_MODEL_MODE", "openai")
    monkeypatch.setitem(sys.modules, "models", None)  # force provider-not-configured
    r = client.post(f"{BASE}/generate", json={"tenant_id": "ws_A", "content_type": "blog", "inputs": {"topic": "x"}, "options": {}})
    assert r.status_code == 503
    u = client.get(f"{BASE}/usage", params={"tenant_id": "ws_A"}).json()
    assert u["totals"]["records"] == 1
    assert u["usage"][0]["usage"]["success"] is False


def test_status_openai_missing_key(monkeypatch):
    monkeypatch.setenv("PIXIE_MODEL_MODE", "openai")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    b = client.get(f"{BASE}/status").json()
    assert b["mock"] is False and b["available"] is False
    assert "OPENAI_API_KEY" in b["missing"]
