"""Brand Brain tests — analyze old posts into a persisted brand identity.

Demo connection (no Meta app) + STUB LLM (no OpenAI spend). Verifies deterministic
stats, the model-output path, the demo canned fallback when the model is empty,
persistence round-trip, and the not-connected guard.
"""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from models.base import ModelResult
from schemas import ModelTier

BRAIN_CANNED = {
    "brand_tone": "Warm and expert.",
    "audience": "Local coffee lovers.",
    "services": ["Coffee", "Brunch"],
    "best_topics": ["Latte art"],
    "best_hooks": ["Can you do this at home?"],
    "weak_topics": ["Plain storefront photos"],
    "content_pillars": ["Craft", "Behind the scenes", "Menu"],
    "cta_style": "Question-led.",
    "posting_suggestions": ["Lead with Reels."],
}


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
def _reset():
    import activity.router as act
    import meta.brand_brain as bb
    import meta.store as ms
    from integrations import connections

    act._store = None
    ms._store = None
    bb._cache = None  # reset the Brand Brain in-process snapshot between tests
    connections.disconnect("t_bb")
    yield
    bb._cache = None
    connections.disconnect("t_bb")


@pytest.fixture
def client():
    from app import app
    return TestClient(app)


def _demo_connect(client, t="t_bb"):
    return client.post("/api/meta/connect/demo", json={"tenant_id": t})


def _stub(monkeypatch, payload):
    import meta.brand_brain as bb
    monkeypatch.setattr(bb, "get_router", lambda: _StubRouter(payload))


def test_generate_requires_connection(client, monkeypatch):
    _stub(monkeypatch, json.dumps(BRAIN_CANNED))
    r = client.post("/api/meta/brand-brain/generate", json={"tenant_id": "t_bb"})
    assert r.json()["status"] == "not_connected"


def test_generate_uses_model_output(client, monkeypatch):
    _stub(monkeypatch, json.dumps(BRAIN_CANNED))
    _demo_connect(client)
    d = client.post("/api/meta/brand-brain/generate", json={"tenant_id": "t_bb"}).json()
    assert d["status"] == "generated"
    assert d["source"] == "demo"
    assert d["post_count"] == 8
    assert d["ai_generated"] is True
    assert d["analyzed"]["brand_tone"] == "Warm and expert."
    # Deterministic stats regardless of the model.
    assert d["stats"]["total_posts"] == 8
    assert d["stats"]["top_posts"][0]["engagement"] >= d["stats"]["weak_posts"][0]["engagement"]
    assert set(d["stats"]["post_types"]) == {"REEL", "IMAGE", "STATUS", "CAROUSEL_ALBUM"}


def test_empty_model_falls_back_to_demo_brain(client, monkeypatch):
    """Fake/empty model output → demo mode uses the clearly-labelled canned brain."""
    _stub(monkeypatch, "{}")
    _demo_connect(client)
    d = client.post("/api/meta/brand-brain/generate", json={"tenant_id": "t_bb"}).json()
    assert d["ai_generated"] is False
    from meta import seed
    assert d["analyzed"] == seed.demo_brand_brain()


def test_persistence_round_trip(client, monkeypatch):
    _stub(monkeypatch, json.dumps(BRAIN_CANNED))
    # Nothing before generation.
    assert client.get("/api/meta/brand-brain", params={"tenant_id": "t_bb"}).json()["exists"] is False
    _demo_connect(client)
    client.post("/api/meta/brand-brain/generate", json={"tenant_id": "t_bb"})
    got = client.get("/api/meta/brand-brain", params={"tenant_id": "t_bb"}).json()
    assert got["exists"] is True and got["status"] == "ok"
    assert got["analyzed"]["brand_tone"] == "Warm and expert."
