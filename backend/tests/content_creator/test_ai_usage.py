"""Influencer text-generation AI telemetry: metadata threading + /ai-usage."""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

import pytest

pytest.importorskip("fastapi")

from fastapi import FastAPI
from fastapi.testclient import TestClient

from content_creator.agents.idea_agent import generate_ideas, generate_ideas_with_meta
from content_creator.agents.script_agent import generate_script, generate_script_with_meta
from content_creator.router import router

app = FastAPI()
app.include_router(router)
client = TestClient(app)
BASE = "/api/content-creator"


@pytest.fixture(autouse=True)
def _mock(monkeypatch):
    monkeypatch.setenv("PIXIE_INTERNAL_API_SECRET", "")
    monkeypatch.setenv("PIXIE_MODEL_MODE", "fake")
    monkeypatch.setenv("CONTENT_CREATOR_MOCK", "true")
    yield


def test_generate_ideas_with_meta_returns_fallback_in_mock():
    ideas, meta = generate_ideas_with_meta({"niche": "hvac", "business_name": "Acme"})
    assert isinstance(ideas, list) and ideas
    assert meta["fallback"] is True                 # deterministic mock, not a real call
    assert meta["prompt_version"] == "curator_idea_v1"
    assert meta["model"] == ""                       # no model used in mock


def test_generate_ideas_backward_compatible():
    ideas = generate_ideas({"niche": "hvac"})
    assert isinstance(ideas, list) and ideas          # still returns just a list


def test_generate_script_with_meta_returns_fallback_in_mock():
    script, meta = generate_script_with_meta({"title": "t", "hook": "h"}, {"brand_tone": "friendly"})
    assert set(["hook", "body", "cta"]).issubset(script)
    assert meta["fallback"] is True and meta["prompt_version"] == "script_v1"


def test_generate_script_backward_compatible():
    script = generate_script({"title": "t"}, {})
    assert "hook" in script and "approx_seconds" in script


def test_ideas_generate_records_ai_usage():
    t = "ws_aiuse_ideas"
    client.post(f"{BASE}/profile", json={"tenant_id": t, "business_name": "Acme", "niche": "hvac"})
    assert client.post(f"{BASE}/ideas/generate", json={"tenant_id": t}).status_code == 200
    u = client.get(f"{BASE}/ai-usage", params={"tenant_id": t}).json()
    assert u["billing_enforced"] is False
    assert u["totals"]["records"] >= 1
    stages = {r["stage"] for r in u["ai_usage"]}
    assert "idea_generation" in stages
    assert any(r["prompt_version"] == "curator_idea_v1" for r in u["ai_usage"])


def test_ai_usage_tenant_isolated():
    t = "ws_aiuse_iso"
    client.post(f"{BASE}/profile", json={"tenant_id": t, "business_name": "A", "niche": "x"})
    client.post(f"{BASE}/ideas/generate", json={"tenant_id": t})
    other = client.get(f"{BASE}/ai-usage", params={"tenant_id": "ws_stranger_iso"}).json()
    assert other["totals"]["records"] == 0
