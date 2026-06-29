"""Production router stages 8-13 — video/quality/posting/analytics + Gates 3 & 4."""

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

import pytest

pytest.importorskip("fastapi")

from fastapi import FastAPI
from fastapi.testclient import TestClient

from content_creator.router import router

app = FastAPI()
app.include_router(router)
client = TestClient(app)

B = "/api/content-creator"


def _ready_script(t):
    """Drive stages 1-7 to get an approved script id for tenant t."""
    client.post(f"{B}/profile", json={"tenant_id": t, "business_name": "Acme", "niche": "hvac repair"})
    client.post(f"{B}/influencer/upload-reference", json={"tenant_id": t, "reference_ref": "img-1"})
    client.post(f"{B}/provider/connect", json={"tenant_id": t, "mode": "pixie_account"})
    gen = client.post(f"{B}/ideas/generate", json={"tenant_id": t})
    idea_id = gen.json()["ideas"][0]["id"]
    client.post(f"{B}/ideas/{idea_id}/approve", json={"tenant_id": t})
    s = client.post(f"{B}/scripts/generate", json={"tenant_id": t, "idea_id": idea_id})
    sid = s.json()["id"]
    client.post(f"{B}/scripts/{sid}/approve", json={"tenant_id": t})
    return sid


def test_cost_estimate_pixie():
    t = "t8_cost"
    _ready_script(t)
    r = client.post(f"{B}/cost-estimate", json={"tenant_id": t})
    assert r.status_code == 200
    assert r.json()["cost_estimate"]["final_user_price"] > 0


def test_gate3_blocks_video_until_production_approved():
    t = "t8_gate3"
    sid = _ready_script(t)
    # video BEFORE production approval → 409 (no spend before Gate 3)
    blocked = client.post(f"{B}/videos/generate", json={"tenant_id": t, "script_id": sid})
    assert blocked.status_code == 409 and blocked.json()["detail"]["gate"] == "production"
    # approve production, then video succeeds with the locked identity
    client.post(f"{B}/production/approve", json={"tenant_id": t})
    ok = client.post(f"{B}/videos/generate", json={"tenant_id": t, "script_id": sid})
    assert ok.status_code == 200, ok.text
    assert ok.json()["video"]["aspect_ratio"] == "9:16"


def test_full_stage8_to_13_with_gate4():
    t = "t8_full"
    sid = _ready_script(t)
    client.post(f"{B}/production/approve", json={"tenant_id": t})
    vid = client.post(f"{B}/videos/generate", json={"tenant_id": t, "script_id": sid}).json()["id"]
    qc = client.post(f"{B}/videos/{vid}/quality-check", json={"tenant_id": t})
    assert qc.status_code == 200 and "status" in qc.json()["quality"]

    # posting BEFORE publish approval → 409 (Gate 4)
    blocked = client.post(f"{B}/posts/schedule", json={"tenant_id": t, "video_id": vid})
    assert blocked.status_code == 409 and blocked.json()["detail"]["gate"] == "publish"

    client.post(f"{B}/videos/{vid}/publish-approve", json={"tenant_id": t})
    sched = client.post(f"{B}/posts/schedule", json={"tenant_id": t, "video_id": vid,
                                                      "platforms": ["meta", "instagram"]})
    assert sched.status_code == 200
    posts = sched.json()["posts"]
    assert len(posts) == 2 and all(p["would_post"] is False for p in posts)  # dry-run only

    # analytics + learning
    sync = client.post(f"{B}/analytics/sync", json={"tenant_id": t})
    assert sync.status_code == 200 and len(sync.json()["metrics"]) == 2
    learn = client.get(f"{B}/learnings", params={"tenant_id": t})
    assert learn.status_code == 200 and learn.json()["learning"]["insights"]
