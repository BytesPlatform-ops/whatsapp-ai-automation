"""Marketing Brain tests — the unified Command Center intelligence.

Covers the deterministic personalization rules (unit), the HTTP surface
(analyze/brain/recommendations/approve/skip/state), persistence, and the hard
guardrail that any campaign draft attached to a recommendation is PAUSED only.
No model is called (analyze is local-first).
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from meta import marketing_brain as mb


def _state(**over):
    base = {
        "connected": True, "mode": "demo", "demo": True,
        "has_page": True, "has_instagram": True,
        "ad_account_count": 1, "ad_account_id": "act_demo_1",
        "campaign_count": 3, "campaigns": [], "insights": {"spend": 100, "ctr": 1.9},
        "has_spend": True, "ctr": 1.9, "post_count": 8,
        "brand_exists": False, "brand_ai": False, "analyzed": {}, "stats": {},
        "ideas_count": 0, "calendar_count": 0, "calendar_drafts": 0,
        "inbox": {"comments": 0, "dms": 0, "unhandled": 0},
        "missing_permissions": [], "pending_approvals": 0,
        # Profile complete by default so tests isolate the rule under test; the
        # onboarding nudge is covered by its own test.
        "profile_completion": 1.0, "profile_complete": True,
        "profile_answered": 12, "profile_total": 12, "profile_missing": [],
    }
    base.update(over)
    return base


def _recs(**over):
    s = _state(**over)
    return mb.build_recommendations(s, mb.build_brand_view(s))


def _ids(recs):
    return {r["action"] for r in recs}


# ── Personalization rules (unit) ──────────────────────────────────────────────

def test_not_connected_gives_connect_rec():
    recs = mb.build_recommendations(_state(connected=False), {})
    assert recs[0]["action"] == "connect" and recs[0]["target_tab"] == "overview"


def test_incomplete_profile_yields_onboarding_rec():
    recs = mb.build_recommendations(_state(profile_completion=0.25, profile_complete=False, profile_answered=3), {})
    assert "open_onboarding" in _ids(recs)


def test_no_campaigns_yields_paused_draft():
    recs = _recs(campaign_count=0)
    first = next(r for r in recs if r["action"] == "review_campaign")
    assert first["category"] == "campaign" and first["draft"]["status"] == "PAUSED"
    assert first["draft"]["objective"].startswith("OUTCOME_")


def test_page_without_instagram_flags_link():
    assert "link_instagram" in _ids(_recs(has_instagram=False, post_count=0))


def test_no_spend_suggests_test_and_stays_paused():
    recs = _recs(has_spend=False, insights={"spend": 0})
    r = next(r for r in recs if r["action"] == "review_campaign")
    assert r["draft"]["status"] == "PAUSED"


def test_no_posts_suggests_starter_calendar():
    assert "generate_calendar" in _ids(_recs(post_count=0))


def test_pending_approvals_and_inbox_surface():
    recs = _recs(pending_approvals=2, inbox={"unhandled": 3})
    ids = _ids(recs)
    assert "approve" in ids and "view_inbox" in ids


def test_all_drafts_are_paused_never_active():
    """Guardrail: no recommendation may carry an ACTIVE campaign draft."""
    for over in ({}, {"campaign_count": 0}, {"has_spend": False, "insights": {"spend": 0}}):
        for r in _recs(**over):
            if "draft" in r and "status" in r["draft"]:
                assert r["draft"]["status"] == "PAUSED"


def test_brand_view_has_marketing_angles_and_warnings():
    v = mb.build_brand_view(_state(has_instagram=False, ad_account_count=0))
    for key in ("ad_angles", "retargeting_angles", "local_awareness_angles",
                "missing_data_warnings", "data_source"):
        assert key in v
    assert any("Instagram" in w for w in v["missing_data_warnings"])


# ── HTTP surface (integration) ────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def _reset():
    import activity.router as act
    import approvals.router as ar
    import meta.brand_brain as bb
    import meta.business_profile as bp
    import meta.marketing_ai as mai
    import meta.store as ms
    from integrations import connections

    act._store = None
    ar._store = None
    ms._store = None
    bb._cache = None
    mb._RECS._reset_cache()
    mb._STATE._reset_cache()
    mai._BRAIN._reset_cache()
    bp._STORE._reset_cache()
    connections.disconnect("t_mb")
    yield
    mb._RECS._reset_cache()
    mb._STATE._reset_cache()
    mai._BRAIN._reset_cache()
    bp._STORE._reset_cache()
    connections.disconnect("t_mb")


@pytest.fixture
def client():
    from app import app
    return TestClient(app)


def test_analyze_not_connected(client):
    d = client.post("/api/meta/marketing/analyze", json={"tenant_id": "t_mb"}).json()
    assert d["status"] == "analyzed" and d["connected"] is False
    assert d["recommendations"][0]["action"] == "connect"


def test_analyze_connected_persists_and_reads_back(client):
    client.post("/api/meta/connect/demo", json={"tenant_id": "t_mb"})
    d = client.post("/api/meta/marketing/analyze", json={"tenant_id": "t_mb"}).json()
    assert d["status"] == "analyzed" and d["connected"] is True
    assert "8 recent post" in d["summary"]
    assert d["brand"]["data_source"] and d["brand"]["ad_angles"]

    recs = client.get("/api/meta/marketing/recommendations", params={"tenant_id": "t_mb"}).json()["recommendations"]
    assert recs and recs == d["recommendations"]

    st = client.get("/api/meta/marketing/state", params={"tenant_id": "t_mb"}).json()
    assert st["last_analyzed"] and st["connected"] is True

    brain = client.get("/api/meta/marketing/brain", params={"tenant_id": "t_mb"}).json()
    assert brain["local_awareness_angles"]


def test_profile_onboarding_and_brand_uses_answers(client):
    # Nothing answered yet → analyze nudges onboarding + generates a starter brain.
    prof = client.get("/api/meta/marketing/profile", params={"tenant_id": "t_mb"}).json()
    assert prof["complete"] is False and prof["answered"] == 0 and len(prof["missing"]) == prof["total"]

    d0 = client.post("/api/meta/marketing/analyze", json={"tenant_id": "t_mb"}).json()
    assert any(r["action"] == "open_onboarding" for r in d0["recommendations"])
    # Brain always present, never errors on missing data.
    assert d0["brand"]["business_summary"] and d0["brand"]["confidence_level"]
    assert d0["brand"]["missing_data_questions"]

    # Answer some questions → brain reflects them; completion rises.
    saved = client.post("/api/meta/marketing/profile", json={
        "tenant_id": "t_mb", "answers": {"sells": "handmade candles", "main_offer": "3-for-2 gift sets"}}).json()
    assert saved["answered"] == 2 and saved["completion"] > 0
    d1 = client.post("/api/meta/marketing/analyze", json={"tenant_id": "t_mb"}).json()
    assert "candles" in d1["brand"]["business_summary"].lower()
    assert "business_profile" in d1["brand"]["data_sources_used"]


def test_approve_and_skip_recommendation(client):
    client.post("/api/meta/connect/demo", json={"tenant_id": "t_mb"})
    d = client.post("/api/meta/marketing/analyze", json={"tenant_id": "t_mb"}).json()
    rid = d["recommendations"][0]["id"]
    ap = client.post(f"/api/meta/marketing/recommendations/{rid}/approve", json={"tenant_id": "t_mb"}).json()
    assert ap["status"] == "ok" and ap["recommendation"]["status"] == "approved"
    other = d["recommendations"][-1]["id"]
    sk = client.post(f"/api/meta/marketing/recommendations/{other}/skip", json={"tenant_id": "t_mb"}).json()
    assert sk["recommendation"]["status"] == "skipped"
    miss = client.post("/api/meta/marketing/recommendations/nope/skip", json={"tenant_id": "t_mb"}).json()
    assert miss["status"] == "not_found"
