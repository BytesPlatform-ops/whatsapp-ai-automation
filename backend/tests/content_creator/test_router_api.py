"""Production /api/content-creator router — stages 1-7 (FastAPI TestClient)."""

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

T = "t_router"


def _seed_profile(tenant=T):
    return client.post("/api/content-creator/profile", json={
        "tenant_id": tenant, "business_name": "Acme HVAC", "niche": "hvac repair",
        "brand_tone": "friendly", "language": "en",
    })


def test_profile_create_and_get():
    r = _seed_profile("t_p1")
    assert r.status_code == 200, r.text
    assert r.json()["profile"]["niche"] == "hvac repair"
    g = client.get("/api/content-creator/profile", params={"tenant_id": "t_p1"})
    assert g.status_code == 200 and g.json()["profile"]["business_name"] == "Acme HVAC"
    # tenant isolation: another tenant has no profile
    assert client.get("/api/content-creator/profile", params={"tenant_id": "stranger"}).status_code == 404


def test_one_locked_identity():
    t = "t_id"
    client.post("/api/content-creator/influencer/upload-reference",
                json={"tenant_id": t, "reference_ref": "img-001"})
    client.post("/api/content-creator/influencer/from-characteristics",
                json={"tenant_id": t, "gender": "female", "vibe": "warm"})
    g = client.get("/api/content-creator/influencer", params={"tenant_id": t})
    assert g.status_code == 200
    # the most recent save is the single active identity
    assert g.json()["identity"]["active"] is True
    assert g.json()["identity"]["source"] == "generated_character"


def test_provider_pixie_price_display():
    t = "t_prov"
    r = client.post("/api/content-creator/provider/connect",
                    json={"tenant_id": t, "mode": "pixie_account"})
    assert r.status_code == 200, r.text
    p = r.json()["provider"]
    assert p["estimated_credits"] > 0 and p["pixie_markup"] > 0 and p["final_price"] > p["estimated_provider_cost"]


def test_gate1_blocks_script_until_idea_approved():
    t = "t_gate"
    _seed_profile(t)
    gen = client.post("/api/content-creator/ideas/generate", json={"tenant_id": t})
    assert gen.status_code == 200, gen.text
    ideas = gen.json()["ideas"]
    assert len(ideas) >= 1
    idea_id = ideas[0]["id"]

    # script BEFORE approval → 409 gate_blocked
    blocked = client.post("/api/content-creator/scripts/generate",
                          json={"tenant_id": t, "idea_id": idea_id})
    assert blocked.status_code == 409
    assert blocked.json()["detail"]["error"] == "gate_blocked"

    # approve the idea, then script succeeds
    ap = client.post("/api/content-creator/ideas/%s/approve" % idea_id, json={"tenant_id": t})
    assert ap.status_code == 200 and ap.json()["idea"]["approval_status"] == "approved"
    ok = client.post("/api/content-creator/scripts/generate",
                     json={"tenant_id": t, "idea_id": idea_id})
    assert ok.status_code == 200, ok.text
    sid = ok.json()["id"]
    assert 30 <= ok.json()["script"]["word_count"] <= 60

    # approve script (Gate 2)
    aps = client.post("/api/content-creator/scripts/%s/approve" % sid, json={"tenant_id": t})
    assert aps.status_code == 200 and aps.json()["script"]["approval_status"] == "approved"


def test_cross_tenant_idea_status_isolation():
    t = "t_x1"
    _seed_profile(t)
    gen = client.post("/api/content-creator/ideas/generate", json={"tenant_id": t})
    idea_id = gen.json()["ideas"][0]["id"]
    # another tenant cannot approve this idea
    bad = client.post("/api/content-creator/ideas/%s/approve" % idea_id, json={"tenant_id": "other"})
    assert bad.status_code == 404
