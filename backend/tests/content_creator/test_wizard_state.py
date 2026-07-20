"""Aggregate /wizard-state + /wizard/invalidate (FastAPI TestClient)."""

from __future__ import annotations

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


def _state(tenant):
    r = client.get(f"{B}/wizard-state", params={"tenant_id": tenant})
    assert r.status_code == 200
    return r.json()


def test_empty_tenant_starts_at_intake():
    s = _state("wz_empty")
    assert s["current_stage"] == "intake"
    assert s["complete"] is False
    assert s["completed_count"] == 0
    assert s["total_stages"] == 13
    assert s["profile"] is None and s["identity"] is None
    assert all(g == "pending" for g in s["gates"].values())
    assert s["mock"] is True and s["dry_run"] is True
    by = {x["stage"]: x["status"] for x in s["stages"]}
    assert by["intake"] == "current"
    assert by["influencer_setup"] == "locked"


def test_progress_advances_current_stage():
    t = "wz_prog"
    client.post(f"{B}/profile", json={"tenant_id": t, "business_name": "Acme"})
    s = _state(t)
    assert s["profile"]["business_name"] == "Acme"
    assert s["current_stage"] == "influencer_setup"
    assert next(x for x in s["stages"] if x["stage"] == "intake")["status"] == "complete"

    client.post(f"{B}/influencer/from-characteristics", json={"tenant_id": t, "look": "athletic"})
    s = _state(t)
    assert s["identity"] is not None
    assert s["current_stage"] == "provider_connection"


def test_idea_gate_reflected_and_invalidation_resets():
    t = "wz_gate"
    client.post(f"{B}/profile", json={"tenant_id": t, "business_name": "Acme"})
    client.post(f"{B}/influencer/from-characteristics", json={"tenant_id": t, "look": "warm"})
    client.post(f"{B}/provider/connect", json={"tenant_id": t, "mode": "pixie_managed"})
    gen = client.post(f"{B}/ideas/generate", json={"tenant_id": t, "seeds": ["fitness"]}).json()
    idea_id = gen["ideas"][0]["id"]
    client.post(f"{B}/ideas/{idea_id}/approve", json={"tenant_id": t})

    s = _state(t)
    assert s["gates"]["idea"] == "approved"
    assert s["approved_idea_id"] == idea_id
    # current advanced past idea approval
    assert s["current_stage"] == "script_generation"

    # invalidate from idea generation → idea gate (and downstream) reset
    inv = client.post(f"{B}/wizard/invalidate", json={"tenant_id": t, "from_stage": "idea_generation"})
    assert inv.status_code == 200
    assert "idea" in inv.json()["reset_gates"]
    s = _state(t)
    assert s["gates"]["idea"] == "needs_changes"
    assert s["current_stage"] == "idea_approval"  # walked back to re-approve


def test_production_gate_blocks_video_until_approved_and_reblocks_after_invalidation():
    t = "wz_prod"
    client.post(f"{B}/profile", json={"tenant_id": t, "business_name": "Acme"})
    client.post(f"{B}/influencer/from-characteristics", json={"tenant_id": t, "look": "x"})
    gen = client.post(f"{B}/ideas/generate", json={"tenant_id": t}).json()
    idea_id = gen["ideas"][0]["id"]
    client.post(f"{B}/ideas/{idea_id}/approve", json={"tenant_id": t})
    scr = client.post(f"{B}/scripts/generate", json={"tenant_id": t, "idea_id": idea_id}).json()
    sid = scr["id"]
    client.post(f"{B}/scripts/{sid}/approve", json={"tenant_id": t})

    # video blocked before production approval (Gate 3)
    blocked = client.post(f"{B}/videos/generate", json={"tenant_id": t, "script_id": sid})
    assert blocked.status_code == 409

    client.post(f"{B}/production/approve", json={"tenant_id": t})
    ok = client.post(f"{B}/videos/generate", json={"tenant_id": t, "script_id": sid})
    assert ok.status_code == 200

    # invalidating from script approval resets production gate → re-blocks video
    client.post(f"{B}/wizard/invalidate", json={"tenant_id": t, "from_stage": "script_approval"})
    reblocked = client.post(f"{B}/videos/generate", json={"tenant_id": t, "script_id": sid})
    assert reblocked.status_code == 409
