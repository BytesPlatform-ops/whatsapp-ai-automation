"""Meta Marketing Agent tests.

Normal tests use a STUB LLM router (canned JSON superset) — no OpenAI spend — and
the demo Meta connection (no Meta app needed). Real Graph calls are covered
structurally (connected → real connector chosen; blocked when missing).

Required cases: oauth start, demo connect stores assets, asset discovery,
analytics summary (mock), marketing analyze, prepare-post creates approval,
no publish before approval, approve executes mock publish, real-mode missing
connection blocks, ads insights read-only, comment reply requires approval.
"""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from schemas import ModelTier
from models.base import ModelResult

CANNED = {
    "agent_slug": "marketing-agent", "platform": "meta",
    "summary": "Reels outperform images this month.",
    "performance_insights": [
        {"title": "Reels win", "evidence": "3x the reach of images", "meaning": "post more reels", "priority": "high"},
    ],
    "recommendations": [
        {"type": "reel_idea", "title": "BTS latte", "summary": "behind the scenes",
         "prepared_output": {"caption": "c", "hook": "h", "hashtags": ["#a"], "script": "s", "cta": "Visit"},
         "approval_required": True, "recommended_action": "approve"},
    ],
    "next_best_actions": ["post a reel Tuesday 8am"],
    # keys the content-prep + comment-reply calls read:
    "caption": "Behind the scenes of our signature latte ☕✨", "hook": "Ever wondered how?",
    "hashtags": ["#coffee", "#latteart"], "script": "Shot 1... Shot 2...", "cta": "Come visit us",
    "reply": "Thanks so much! 🙏", "sentiment": "positive",
}


class _StubRouter:
    mode = "fake"

    def model_for(self, tier: ModelTier) -> str:
        return "mock-small"

    async def complete(self, req):
        return ModelResult(text=json.dumps(CANNED), model="mock-small", tier=req.tier,
                           tokens_in=8, tokens_out=12, latency_ms=1)


@pytest.fixture(autouse=True)
def _reset(monkeypatch):
    import approvals.router as ar
    import activity.router as act
    import meta.store as ms
    import meta.marketing_agent as agent
    from integrations import connections

    ar._store = None
    act._store = None
    ms._store = None
    connections.disconnect("t_meta")
    monkeypatch.setattr(agent, "get_router", lambda: _StubRouter())
    monkeypatch.setenv("PIXIE_AGENT_MODE", "production")
    monkeypatch.setenv("PIXIE_EXECUTION_MODE", "mock")
    monkeypatch.setenv("PIXIE_REQUIRE_APPROVAL", "true")
    yield
    connections.disconnect("t_meta")


@pytest.fixture
def client():
    from app import app
    return TestClient(app)


def _demo_connect(client, t="t_meta"):
    return client.post("/api/meta/connect/demo", json={"tenant_id": t}).json()


def test_oauth_start_not_configured_is_safe(client, monkeypatch):
    monkeypatch.delenv("META_APP_ID", raising=False)
    monkeypatch.delenv("META_APP_SECRET", raising=False)
    r = client.get("/api/meta/connect/start", params={"tenant_id": "t_meta"}, follow_redirects=False)
    assert r.status_code == 200 and "not configured" in r.text.lower()


def test_oauth_start_redirects_when_configured(client, monkeypatch):
    monkeypatch.setenv("META_APP_ID", "123")
    monkeypatch.setenv("META_APP_SECRET", "secret")
    r = client.get("/api/meta/connect/start", params={"tenant_id": "t_meta", "feature": "publishing"},
                   follow_redirects=False)
    assert r.status_code == 302
    loc = r.headers["location"]
    assert "facebook.com" in loc and "instagram_content_publish" in loc


def test_demo_connect_stores_assets(client):
    d = _demo_connect(client)
    assert d["mode"] == "demo"
    assert d["assets"]["facebook_pages"][0]["name"].startswith("Bytes Coffee")


def test_assets_discovery(client):
    _demo_connect(client)
    a = client.get("/api/meta/assets", params={"tenant_id": "t_meta"}).json()
    assert a["connected"] is True
    assert a["defaults"]["instagram_id"] == "ig_demo_1"


def test_analytics_summary_mock(client):
    _demo_connect(client)
    s = client.get("/api/meta/analytics/summary", params={"tenant_id": "t_meta"}).json()
    assert s["source"] == "demo"
    assert s["summary"]["profile"]["followers"] > 0


def test_marketing_agent_analyze(client):
    _demo_connect(client)
    an = client.post("/api/agents/marketing/meta/analyze", json={"tenant_id": "t_meta"}).json()
    assert an["status"] == "analyzed"
    assert an["llm_provider"] == "mock"  # stubbed
    assert len(an["analysis"]["performance_insights"]) >= 1


def test_analyze_requires_connection(client):
    an = client.post("/api/agents/marketing/meta/analyze", json={"tenant_id": "t_meta"}).json()
    assert an["status"] == "not_connected"


def test_prepare_post_creates_approval(client):
    _demo_connect(client)
    pp = client.post("/api/agents/marketing/meta/prepare-post", json={
        "tenant_id": "t_meta", "platform": "instagram", "content_type": "reel",
        "idea": "latte art", "media_url": "https://example.com/r.mp4"}).json()
    assert pp["status"] == "approval_required" and pp["approval_id"]
    assert pp["prepared_output"]["execution_actions"][0]["capability"] == "meta_reel_publish"


def test_no_publish_before_approval(client):
    _demo_connect(client)
    client.post("/api/agents/marketing/meta/prepare-post", json={
        "tenant_id": "t_meta", "platform": "instagram", "content_type": "post", "idea": "x"})
    activity = client.get("/api/activity", params={"tenant_id": "t_meta"}).json()
    assert not any(e["type"] == "action_executed" for e in activity)


def test_approve_executes_mock_publish(client):
    _demo_connect(client)
    apid = client.post("/api/agents/marketing/meta/prepare-post", json={
        "tenant_id": "t_meta", "platform": "instagram", "content_type": "reel",
        "idea": "x", "media_url": "https://example.com/r.mp4"}).json()["approval_id"]
    res = client.post(f"/api/approvals/{apid}/approve", json={"tenant_id": "t_meta"}).json()
    er = res["execution_result"]
    assert res["status"] == "executed" and er["executed"] is False
    assert er["results"][0]["provider"] == "mock_meta"
    assert "went live" in er["results"][0]["message"]


def test_real_mode_missing_connection_blocks(client, monkeypatch):
    _demo_connect(client)  # demo = assets but NO integrations connection
    monkeypatch.setenv("PIXIE_EXECUTION_MODE", "real")
    apid = client.post("/api/agents/marketing/meta/prepare-post", json={
        "tenant_id": "t_meta", "platform": "instagram", "content_type": "post", "idea": "x"}).json()["approval_id"]
    res = client.post(f"/api/approvals/{apid}/approve", json={"tenant_id": "t_meta"}).json()
    er = res["execution_result"]
    assert er["executed"] is False
    assert er["results"][0]["status"] == "blocked"
    assert er["results"][0]["error"] == "missing_connection"


def test_ads_insights_read_only(client):
    _demo_connect(client)
    ads = client.get("/api/meta/ads/insights", params={"tenant_id": "t_meta"}).json()
    assert ads["read_only"] is True
    assert "spend_usd" in ads["ads_summary"]


def test_comment_reply_requires_approval(client):
    _demo_connect(client)
    r = client.post("/api/agents/marketing/meta/comments/prepare-reply", json={
        "tenant_id": "t_meta", "target_id": "c1", "comment_text": "Do you open Sundays?"}).json()
    assert r["status"] == "approval_required"
    activity = client.get("/api/activity", params={"tenant_id": "t_meta"}).json()
    assert not any(e["type"] == "action_executed" for e in activity)


def test_connected_meta_routes_to_real_connector(monkeypatch):
    """Structural: a live Meta connection makes publish resolve to the REAL connector."""
    from integrations import resolve_connector
    from integrations import connections
    from meta.oauth import META_CAPABILITIES
    monkeypatch.setenv("PIXIE_AGENT_MODE", "production")
    monkeypatch.setenv("PIXIE_EXECUTION_MODE", "mock")
    connections.register_many("t_meta_live", META_CAPABILITIES, {
        "provider": "meta", "mode": "live", "user_token": "x",
        "pages": [{"id": "page_1", "page_access_token": "t",
                   "linked_instagram": {"id": "ig_1", "username": "brand"}}],
    })
    try:
        res = resolve_connector("t_meta_live", "meta_content_publish")
        assert res.mode == "real" and res.status == "ready" and res.provider == "meta"
    finally:
        connections.disconnect("t_meta_live", META_CAPABILITIES)
