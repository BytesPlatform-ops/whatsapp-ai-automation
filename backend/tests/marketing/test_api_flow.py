"""Wave 2 end-to-end — the full mock marketing flow over HTTP, $0 in fake mode.

Mounts ONLY the marketing router on a local FastAPI app so app.py stays untouched
while it's dirty. Drives the Definition-of-Done flow:
  profile → strategy → campaign → content → format/dry-run → brief
and exercises both required examples (salon bridal-booking, Pixie soft launch).
Nothing publishes live; every step costs $0.
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from marketing.api import router as marketing_router

app = FastAPI()
app.include_router(marketing_router)
client = TestClient(app)


SALON = {
    "tenant_id": "t_salon",
    "business_name": "Bliss Bridal Salon",
    "industry": "beauty_salon",
    "location": "Lahore",
    "target_audience": "brides-to-be, 22-35",
    "usp": "award-winning bridal styling",
    "primary_cta": "DM to book your bridal trial",
    "platforms_used": ["instagram", "tiktok"],
}

PIXIE = {
    "tenant_id": "t_pixie",
    "business_name": "Pixie",
    "industry": "ai_saas",
    "location": "United States",
    "target_audience": "small-business owners losing leads to missed calls",
    "usp": "an AI assistant that answers every call and recovers missed leads 24/7",
    "primary_cta": "Book a demo",
    "platforms_used": ["tiktok", "instagram", "linkedin"],
}


def _run_full_flow(profile: dict, goal: str, duration_days: int) -> dict:
    tid = profile["tenant_id"]

    # 1. create profile
    r = client.post("/v1/marketing/profile", json=profile)
    assert r.status_code == 200, r.text
    assert r.json()["id"]

    # 2. strategy (Brain → exact contract)
    r = client.post("/v1/marketing/strategy", json={"tenant_id": tid, "profile": profile, "goal": goal})
    assert r.status_code == 200, r.text
    strat = r.json()
    assert set(strat["strategy"].keys()) == {
        "campaignGoal", "targetAudience", "platforms", "contentPillars", "creativeAngles",
        "cta", "assetsNeeded", "recommendedCadence", "riskNotes", "nextActions",
    }
    assert strat["cost_usd"] == 0.0

    # 3. campaign plan
    r = client.post("/v1/marketing/campaigns", json={
        "tenant_id": tid, "profile": profile, "goal": goal, "duration_days": duration_days})
    assert r.status_code == 200, r.text
    campaign = r.json()
    assert campaign["id"] and campaign["schedule"], "campaign must have a posting schedule"
    assert campaign["approval_status"] == "needs_review"

    # campaign is retrievable + tenant-scoped
    cid = campaign["id"]
    assert client.get(f"/v1/marketing/campaigns/{cid}", params={"tenant_id": tid}).status_code == 200
    assert client.get(f"/v1/marketing/campaigns/{cid}", params={"tenant_id": "t_other"}).status_code == 404

    # 4. content for the campaign
    r = client.post("/v1/marketing/content", json={
        "tenant_id": tid, "profile": profile, "campaign_id": cid,
        "platform": "instagram", "content_type": "reel_script", "topic": goal, "count": 2})
    assert r.status_code == 200, r.text
    items = r.json()
    assert len(items) == 2
    for it in items:
        assert it["hook"] and it["main_copy"] and it["cta"]
        assert it["approval_status"] == "needs_review"  # nothing auto-approved

    # 5. format + dry-run a post (NOTHING publishes live)
    r = client.post("/v1/marketing/platforms/instagram/dry-run", json={
        "platform": "instagram", "content_type": "reel_script",
        "body": items[0]["main_copy"], "caption": items[0]["caption"],
        "hashtags": items[0]["hashtags"], "cta": items[0]["cta"]})
    assert r.status_code == 200, r.text
    dry = r.json()
    assert dry["would_post"] is False, "dry-run must never publish live"

    # 6. creative brief
    r = client.post("/v1/marketing/briefs", json={
        "tenant_id": tid, "profile": profile, "platform": "instagram",
        "video_format": "problem_solution_reel", "concept": goal})
    assert r.status_code == 200, r.text
    brief = r.json()
    assert brief["aspect_ratio"] == "9:16"
    assert brief["asset_checklist"] and brief["scene_direction"]

    return {"campaign": campaign, "content": items, "dry_run": dry, "brief": brief, "strategy": strat}


def test_salon_bridal_booking_campaign():
    out = _run_full_flow(SALON, "2-week bridal-booking campaign", duration_days=14)
    # salon is not a high-risk industry → schedule spans the 2 weeks
    assert len(out["campaign"]["schedule"]) >= 1


def test_pixie_us_soft_launch():
    out = _run_full_flow(PIXIE, "30-day Pixie US soft launch", duration_days=30)
    assert len(out["campaign"]["schedule"]) >= 1
    # content list endpoint returns the persisted items, tenant-scoped
    listed = client.get("/v1/marketing/content", params={"tenant_id": "t_pixie"}).json()
    assert len(listed) >= 2


def test_presets_and_platforms_endpoints():
    assert len(client.get("/v1/marketing/presets").json()) >= 20
    assert client.get("/v1/marketing/presets/dental_clinic").json()["high_risk"] is True
    assert len(client.get("/v1/marketing/platforms").json()) >= 11
