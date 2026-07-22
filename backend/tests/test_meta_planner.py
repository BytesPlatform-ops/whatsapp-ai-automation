"""Idea Curator + Content Calendar tests.

Demo connection + STUB LLM (no spend). Verifies generation (model + deterministic
fallback), normalization, persistence (idea library, calendar), calendar dates &
status lifecycle guards, and the not-connected guard.
"""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from models.base import ModelResult
from schemas import ModelTier

IDEAS_CANNED = {"ideas": [
    {"type": "carousel", "title": "Latte art 101", "hook": "Ever wondered how?",
     "slide_flow_or_script": "5 slides", "visual_direction": "bright", "caption": "Learn it", "cta": "Visit"},
    {"type": "reel", "title": "15s pour", "hook": "Sound on", "slide_flow_or_script": "shots",
     "visual_direction": "close-up", "caption": "Watch", "cta": "Follow"},
]}

CAL_CANNED = {"items": [
    {"platform": "instagram", "content_type": "reel", "topic": "Latte art", "hook": "Sound on",
     "caption": "Watch this", "visual_direction": "close-up"},
    {"platform": "facebook", "content_type": "post", "topic": "Brunch", "hook": "Book now",
     "caption": "Weekend brunch", "visual_direction": "table shot"},
]}


class _StubRouter:
    mode = "fake"

    def __init__(self, payload):
        self._payload = payload

    def model_for(self, tier: ModelTier) -> str:
        return "mock-small"

    async def complete(self, req):
        return ModelResult(text=self._payload, model="mock-small", tier=req.tier,
                           tokens_in=8, tokens_out=12, latency_ms=1)


@pytest.fixture(autouse=True)
def _reset(monkeypatch):
    import activity.router as act
    import approvals.router as ar
    import meta.brand_brain as bb
    import meta.calendar as cal
    import meta.idea_curator as ic
    import meta.store as ms
    from integrations import connections

    act._store = None
    ar._store = None
    ms._store = None
    bb._cache = None
    ic._LIBRARY._reset_cache()
    cal._CAL._reset_cache()
    connections.disconnect("t_pl")
    monkeypatch.setenv("PIXIE_AGENT_MODE", "production")
    monkeypatch.setenv("PIXIE_EXECUTION_MODE", "mock")
    monkeypatch.setenv("PIXIE_REQUIRE_APPROVAL", "true")
    yield
    ic._LIBRARY._reset_cache()
    cal._CAL._reset_cache()
    connections.disconnect("t_pl")


@pytest.fixture
def client():
    from app import app
    return TestClient(app)


def _connect(client, t="t_pl"):
    return client.post("/api/meta/connect/demo", json={"tenant_id": t})


def _stub_ideas(monkeypatch, payload):
    import meta.idea_curator as ic
    monkeypatch.setattr(ic, "get_router", lambda: _StubRouter(payload))


def _stub_cal(monkeypatch, payload):
    import meta.calendar as cal
    monkeypatch.setattr(cal, "get_router", lambda: _StubRouter(payload))


# ── Ideas ─────────────────────────────────────────────────────────────────────

def test_ideas_requires_connection(client, monkeypatch):
    _stub_ideas(monkeypatch, json.dumps(IDEAS_CANNED))
    r = client.post("/api/meta/ideas/generate", json={"tenant_id": "t_pl"})
    assert r.json()["status"] == "not_connected"


def test_ideas_generate_uses_model(client, monkeypatch):
    _stub_ideas(monkeypatch, json.dumps(IDEAS_CANNED))
    _connect(client)
    d = client.post("/api/meta/ideas/generate", json={"tenant_id": "t_pl", "types": ["carousel", "reel"], "per_type": 1}).json()
    assert d["status"] == "generated" and d["ai_generated"] is True
    assert len(d["ideas"]) == 2
    idea = d["ideas"][0]
    assert idea["id"].startswith("idea_") and idea["type_label"] and idea["saved"] is False


def test_ideas_fallback_when_model_empty(client, monkeypatch):
    _stub_ideas(monkeypatch, "{}")
    _connect(client)
    d = client.post("/api/meta/ideas/generate", json={"tenant_id": "t_pl", "types": ["pain_point"], "per_type": 2}).json()
    assert d["ai_generated"] is False
    assert len(d["ideas"]) == 2
    assert all(i["type"] == "pain_point" and i["title"] for i in d["ideas"])


def test_ideas_save_list_delete(client, monkeypatch):
    _stub_ideas(monkeypatch, json.dumps(IDEAS_CANNED))
    _connect(client)
    gen = client.post("/api/meta/ideas/generate", json={"tenant_id": "t_pl", "types": ["reel"], "per_type": 1}).json()
    idea = gen["ideas"][0]
    saved = client.post("/api/meta/ideas/save", json={"tenant_id": "t_pl", "idea": idea}).json()
    assert saved["status"] == "saved"
    lib = client.get("/api/meta/ideas", params={"tenant_id": "t_pl"}).json()
    assert len(lib["ideas"]) == 1 and lib["ideas"][0]["saved"] is True
    dele = client.request("DELETE", "/api/meta/ideas", params={"tenant_id": "t_pl", "id": idea["id"]}).json()
    assert dele["status"] == "deleted"
    assert client.get("/api/meta/ideas", params={"tenant_id": "t_pl"}).json()["ideas"] == []


# ── Calendar ──────────────────────────────────────────────────────────────────

def test_calendar_requires_connection(client, monkeypatch):
    _stub_cal(monkeypatch, json.dumps(CAL_CANNED))
    r = client.post("/api/meta/calendar/generate", json={"tenant_id": "t_pl"})
    assert r.json()["status"] == "not_connected"


def test_calendar_7day_dates_and_status(client, monkeypatch):
    _stub_cal(monkeypatch, json.dumps(CAL_CANNED))
    _connect(client)
    d = client.post("/api/meta/calendar/generate",
                    json={"tenant_id": "t_pl", "horizon": 7, "start_date": "2026-08-01"}).json()
    assert d["status"] == "generated" and d["horizon"] == 7
    assert len(d["items"]) == 7
    assert d["items"][0]["date"] == "2026-08-01" and d["items"][6]["date"] == "2026-08-07"
    assert all(it["status"] == "draft" and it["id"].startswith("cal_") for it in d["items"])


def test_calendar_30day_spread(client, monkeypatch):
    _stub_cal(monkeypatch, json.dumps(CAL_CANNED))
    _connect(client)
    d = client.post("/api/meta/calendar/generate", json={"tenant_id": "t_pl", "horizon": 30, "start_date": "2026-08-01"}).json()
    assert d["horizon"] == 30 and len(d["items"]) == 12
    assert d["items"][0]["date"] == "2026-08-01"


def test_calendar_fallback_and_lifecycle(client, monkeypatch):
    _stub_cal(monkeypatch, "{}")  # empty model → deterministic fallback
    _connect(client)
    gen = client.post("/api/meta/calendar/generate", json={"tenant_id": "t_pl", "horizon": 7, "start_date": "2026-08-01"}).json()
    assert gen["ai_generated"] is False and len(gen["items"]) == 7
    item_id = gen["items"][0]["id"]
    ok = client.patch("/api/meta/calendar", json={"tenant_id": "t_pl", "id": item_id, "patch": {"status": "approved"}}).json()
    assert ok["status"] == "ok" and ok["item"]["status"] == "approved"
    bad = client.patch("/api/meta/calendar", json={"tenant_id": "t_pl", "id": item_id, "patch": {"status": "nope"}}).json()
    assert bad["status"] == "error"
    # GET reflects the persisted change; delete removes it.
    got = client.get("/api/meta/calendar", params={"tenant_id": "t_pl"}).json()
    assert any(i["id"] == item_id and i["status"] == "approved" for i in got["items"])
    dele = client.request("DELETE", "/api/meta/calendar", params={"tenant_id": "t_pl", "id": item_id}).json()
    assert dele["status"] == "deleted"


# ── Approval workflow (Part 5) ────────────────────────────────────────────────

def _make_calendar(client, monkeypatch):
    _stub_cal(monkeypatch, json.dumps(CAL_CANNED))
    _connect(client)
    return client.post("/api/meta/calendar/generate",
                       json={"tenant_id": "t_pl", "horizon": 7, "start_date": "2026-08-01"}).json()


def test_calendar_save_to_library(client, monkeypatch):
    gen = _make_calendar(client, monkeypatch)
    item = gen["items"][0]
    r = client.post("/api/meta/calendar/save-to-library", json={"tenant_id": "t_pl", "id": item["id"]}).json()
    assert r["status"] == "saved"
    lib = client.get("/api/meta/ideas", params={"tenant_id": "t_pl"}).json()
    assert len(lib["ideas"]) == 1 and lib["ideas"][0]["caption"] == item["caption"]


def test_calendar_regenerate(client, monkeypatch):
    gen = _make_calendar(client, monkeypatch)
    item = gen["items"][0]
    _stub_cal(monkeypatch, json.dumps({"topic": "New topic", "hook": "New hook",
                                       "caption": "New caption", "visual_direction": "New visual"}))
    r = client.post("/api/meta/calendar/regenerate", json={"tenant_id": "t_pl", "id": item["id"]}).json()
    assert r["status"] == "ok" and r["item"]["hook"] == "New hook" and r["item"]["caption"] == "New caption"


def test_calendar_request_publish_goes_through_approval_gate(client, monkeypatch):
    """Publishing never happens directly — it files an approval and only runs
    (as a mock in demo) once approved. Item → scheduled, then reflects the result."""
    gen = _make_calendar(client, monkeypatch)
    item = gen["items"][0]

    req = client.post("/api/meta/calendar/request-publish", json={"tenant_id": "t_pl", "id": item["id"]}).json()
    assert req["status"] == "approval_required" and req["approval_id"]
    # Item is queued, not published.
    got = client.get("/api/meta/calendar", params={"tenant_id": "t_pl"}).json()
    assert next(i for i in got["items"] if i["id"] == item["id"])["status"] == "scheduled"

    # The approval shows up in the queue (list endpoint returns a bare list).
    appr = client.get("/api/approvals", params={"tenant_id": "t_pl"}).json()
    assert any(a["id"] == req["approval_id"] for a in appr)

    # Approve → executor runs a MOCK publish (demo has no real connection).
    res = client.post(f"/api/approvals/{req['approval_id']}/approve", json={"tenant_id": "t_pl"}).json()
    assert res["status"] == "executed"
    assert res["execution_result"]["executed"] is False  # not real → nothing went live

    # Honest reflection: never 'published' on a mock (only a real publish is).
    final = next(i for i in client.get("/api/meta/calendar", params={"tenant_id": "t_pl"}).json()["items"]
                 if i["id"] == item["id"])["status"]
    assert final in ("scheduled", "approved") and final != "published"
