"""Behavioral tests for the Content Creator demo flow.

Drives the pipeline through the router and proves the owner-in-the-loop gates:
 - scripts/generate BEFORE the idea gate is approved → 409
 - videos/generate BEFORE Gate 3 (production) is approved → 409 (no spend)
 - the full happy path reaches ANALYTICS with a mock video.

Run in a venv with fastapi + httpx installed:
    pytest -q backend/tests/content_creator/test_demo_routes.py
"""

from __future__ import annotations

import pytest

pytest.importorskip("fastapi")

from fastapi import FastAPI
from fastapi.testclient import TestClient

from content_creator.demo.demo_routes import router as demo_router

PREFIX = "/demo/api/content-creator"


@pytest.fixture()
def client() -> TestClient:
    app = FastAPI()
    app.include_router(demo_router, prefix="/demo")
    return TestClient(app)


def _p(client, path, tenant, body=None):
    return client.post(f"{PREFIX}{path}", params={"tenant": tenant}, json=body or {})


def test_script_gen_blocked_before_idea_approval(client):
    t = "flow_gate1"
    assert _p(client, "/reset", t).status_code == 200
    assert _p(client, "/profile", t, {"niche": "bakery", "brand": "Crumb"}).status_code == 200
    assert _p(client, "/influencer/characteristics", t, {"gender": "any", "age": "30s"}).status_code == 200
    assert _p(client, "/provider", t, {"mode": "pixie_account"}).status_code == 200
    assert _p(client, "/ideas/generate", t).status_code == 200

    # Gate 1 NOT approved yet → 409
    blocked = _p(client, "/scripts/generate", t)
    assert blocked.status_code == 409
    assert blocked.json()["error"] == "gate_blocked"

    # Approve Gate 1 → script generation now allowed
    assert _p(client, "/ideas/approve", t, {"idea_index": 0}).status_code == 200
    ok = _p(client, "/scripts/generate", t)
    assert ok.status_code == 200
    assert ok.json()["state"]["script"]  # script artifact populated


def test_video_gen_blocked_before_production_gate(client):
    """No spend before Gate 3: videos/generate must 409 until PRODUCTION approved."""
    t = "flow_gate3"
    _p(client, "/reset", t)
    _p(client, "/profile", t, {"niche": "gym"})
    _p(client, "/influencer/reference", t, {"reference_ref": "ref-xyz"})
    _p(client, "/provider", t, {"mode": "user_account"})
    _p(client, "/ideas/generate", t)
    _p(client, "/ideas/approve", t)
    _p(client, "/scripts/generate", t)
    _p(client, "/scripts/approve", t)
    _p(client, "/cost-estimate", t)

    # Gate 3 NOT approved → no video, 409
    blocked = _p(client, "/videos/generate", t)
    assert blocked.status_code == 409
    assert blocked.json()["error"] == "gate_blocked"

    # Approve Gate 3 → video generation allowed
    assert _p(client, "/production/approve", t).status_code == 200
    ok = _p(client, "/videos/generate", t)
    assert ok.status_code == 200
    assert ok.json()["state"]["video"]  # mock video populated


def test_reference_identity_path(client):
    t = "flow_ref"
    _p(client, "/reset", t)
    _p(client, "/profile", t, {"niche": "spa"})
    res = _p(client, "/influencer/reference", t, {"reference_ref": "ref-777"})
    identity = res.json()["state"]["identity"]
    assert identity["source"] == "reference_image"
    assert identity["reference_ref"] == "ref-777"
    assert identity["locked"] is True


def test_generated_character_path(client):
    t = "flow_gen"
    _p(client, "/reset", t)
    _p(client, "/profile", t, {"niche": "spa"})
    res = _p(client, "/influencer/characteristics", t, {"gender": "female", "age": "20s"})
    identity = res.json()["state"]["identity"]
    assert identity["source"] == "generated_character"
    assert identity["reference_ref"].startswith("gen-")
    assert identity["characteristics"]["gender"] == "female"
    assert identity["locked"] is True


def test_full_happy_path_reaches_analytics(client):
    t = "flow_happy"
    _p(client, "/reset", t)
    _p(client, "/profile", t, {"niche": "coffee", "brand": "Aurora", "tone": "warm"})
    _p(client, "/influencer/characteristics", t, {"gender": "female", "age": "late 20s"})
    _p(client, "/provider", t, {"mode": "pixie_account"})
    _p(client, "/ideas/generate", t)
    _p(client, "/ideas/approve", t)
    _p(client, "/scripts/generate", t)
    _p(client, "/scripts/approve", t)
    _p(client, "/cost-estimate", t)
    _p(client, "/production/approve", t)
    assert _p(client, "/videos/generate", t).status_code == 200
    _p(client, "/videos/quality-check", t)
    _p(client, "/videos/publish-approve", t)
    _p(client, "/posts/schedule", t, {"platforms": ["meta"], "scheduled_time": "2026-07-01T09:00:00Z"})
    final = _p(client, "/analytics/sync", t)

    assert final.status_code == 200
    state = final.json()["state"]

    # Reached the last stage (ANALYTICS is terminal; cursor stays there).
    assert state["stage"] == "analytics"
    # Mock video present.
    assert state["video"]
    # All four gates approved.
    for gate in ("idea", "script", "production", "publish"):
        assert state["approvals"][gate] == "approved"
    # Metrics + a posting record were produced.
    assert state["metrics"]
    assert state["posts"]

    # Logs accumulated for the run.
    logs = client.get(f"{PREFIX}/logs", params={"tenant": t}).json()["logs"]
    assert len(logs) >= 13


def test_gate_blocked_does_not_advance_stage(client):
    """A 409 must NOT advance the pipeline cursor (gate holds the line)."""
    t = "flow_noadvance"
    _p(client, "/reset", t)
    _p(client, "/profile", t, {"niche": "x"})
    _p(client, "/influencer/reference", t, {"reference_ref": "r"})
    _p(client, "/provider", t, {})
    _p(client, "/ideas/generate", t)
    before = client.get(f"{PREFIX}/state", params={"tenant": t}).json()["state"]["stage"]
    blocked = _p(client, "/scripts/generate", t)
    assert blocked.status_code == 409
    after = client.get(f"{PREFIX}/state", params={"tenant": t}).json()["state"]["stage"]
    assert before == after  # cursor unchanged
