"""End-to-end mock pipeline through the PRODUCTION router + wizard-state, on DURABLE
file persistence, including a simulated backend restart.

Proves: a caller can complete all 13 stages and 4 gates in mock mode ($0, no real
provider), the aggregate wizard-state reflects completion, and state survives a
restart (repository cache dropped → fresh instances re-read the file backing).
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

import pytest

pytest.importorskip("fastapi")

from fastapi import FastAPI
from fastapi.testclient import TestClient

import content_creator.store as store
from content_creator.router import router

B = "/api/content-creator"


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("PIXIE_PERSIST", "file")
    monkeypatch.setenv("PIXIE_DATA_DIR", str(tmp_path))
    store.reset_repositories()
    app = FastAPI()
    app.include_router(router)
    yield TestClient(app)
    store.reset_repositories()


def _drive_all_stages(c: TestClient, t: str) -> str:
    # 1 intake
    assert c.post(f"{B}/profile", json={"tenant_id": t, "business_name": "Acme"}).status_code == 200
    # 2 identity
    assert c.post(f"{B}/influencer/from-characteristics", json={"tenant_id": t, "look": "athletic"}).status_code == 200
    # 3 provider
    assert c.post(f"{B}/provider/connect", json={"tenant_id": t, "mode": "pixie_managed"}).status_code == 200
    # 4 ideas
    ideas = c.post(f"{B}/ideas/generate", json={"tenant_id": t, "seeds": ["fitness"]}).json()["ideas"]
    idea_id = ideas[0]["id"]
    # 5 gate 1
    assert c.post(f"{B}/ideas/{idea_id}/approve", json={"tenant_id": t}).status_code == 200
    # 6 script
    sid = c.post(f"{B}/scripts/generate", json={"tenant_id": t, "idea_id": idea_id}).json()["id"]
    # 7 gate 2
    assert c.post(f"{B}/scripts/{sid}/approve", json={"tenant_id": t}).status_code == 200
    # 8 cost + gate 3
    assert c.post(f"{B}/cost-estimate", json={"tenant_id": t, "script_id": sid}).status_code == 200
    assert c.post(f"{B}/production/approve", json={"tenant_id": t}).status_code == 200
    # 9 video (mock — no real provider call, no spend)
    gen = c.post(f"{B}/videos/generate", json={"tenant_id": t, "script_id": sid}).json()
    vid = gen["id"]
    # 9b poll until terminal (mock resolves immediately/quickly)
    terminal = {"ready", "failed", "mock"}
    for _ in range(10):
        st = c.get(f"{B}/videos/{vid}/status", params={"tenant_id": t}).json()
        if st["video"]["status"] in terminal:
            break
    assert st["video"]["status"] in terminal
    assert st["video"]["provider_mode"] == "" or gen["video"]["provider"] in ("", "mock")  # mock: no real provider
    # 10 quality
    assert c.post(f"{B}/videos/{vid}/quality-check", json={"tenant_id": t}).status_code == 200
    # 11 gate 4
    assert c.post(f"{B}/videos/{vid}/publish-approve", json={"tenant_id": t}).status_code == 200
    # 12 posting (dry-run)
    posts = c.post(f"{B}/posts/schedule", json={"tenant_id": t, "video_id": vid, "platforms": ["meta"]}).json()["posts"]
    assert posts and all(p.get("dry_run", True) for p in posts)  # never live
    # 13 analytics
    assert c.post(f"{B}/analytics/sync", json={"tenant_id": t}).status_code == 200
    return vid


def test_full_mock_pipeline_completes_and_survives_restart(client):
    t = "ws_e2e"
    _drive_all_stages(client, t)

    state = client.get(f"{B}/wizard-state", params={"tenant_id": t}).json()
    assert state["mock"] is True and state["dry_run"] is True
    assert state["complete"] is True
    assert state["completed_count"] == 13
    assert all(g == "approved" for g in state["gates"].values())

    # simulate a backend restart: drop cached repos → fresh instances re-read file
    store.reset_repositories()
    after = client.get(f"{B}/wizard-state", params={"tenant_id": t}).json()
    assert after["complete"] is True
    assert after["profile"]["business_name"] == "Acme"
    assert after["video"] is not None
    assert all(g == "approved" for g in after["gates"].values())


def test_cannot_skip_gates_in_e2e(client):
    t = "ws_skip"
    client.post(f"{B}/profile", json={"tenant_id": t, "business_name": "Acme"})
    client.post(f"{B}/influencer/from-characteristics", json={"tenant_id": t, "look": "x"})
    idea_id = client.post(f"{B}/ideas/generate", json={"tenant_id": t}).json()["ideas"][0]["id"]
    # script generation is blocked until the idea is approved (Gate 1)
    blocked = client.post(f"{B}/scripts/generate", json={"tenant_id": t, "idea_id": idea_id})
    assert blocked.status_code == 409
    assert blocked.json()["detail"]["gate"] == "idea"
