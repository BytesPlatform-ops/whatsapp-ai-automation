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
    import meta.content_items as mci
    import content.service as csvc
    from integrations import connections

    ar._store = None
    act._store = None
    ms._store = None
    mci._store = None
    csvc._store = None
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
    """Pre-App-Review posture: when META_SCOPES is deliberately restricted it is
    authoritative (used verbatim), so publishing scopes like
    instagram_content_publish are intentionally NOT requested. This test pins that
    behaviour deterministically instead of depending on ambient .env."""
    monkeypatch.setenv("META_APP_ID", "123")
    monkeypatch.setenv("META_APP_SECRET", "secret")
    monkeypatch.setenv(
        "META_SCOPES",
        "pages_show_list,pages_read_engagement,ads_read,ads_management,business_management",
    )
    r = client.get("/api/meta/connect/start", params={"tenant_id": "t_meta", "feature": "publishing"},
                   follow_redirects=False)
    assert r.status_code == 302
    loc = r.headers["location"]
    assert "facebook.com" in loc
    assert "pages_show_list" in loc and "ads_read" in loc
    # Publishing scopes are NOT requested until App Review is approved.
    assert "instagram_content_publish" not in loc


def test_oauth_start_requests_publishing_scopes_when_unrestricted(client, monkeypatch):
    """When META_SCOPES is unset, the hardcoded MVP set + the requested feature's
    extras are used — so the publishing feature does request instagram_content_publish.
    (Guards that the feature-scope path still works once App Review widens scopes.)"""
    monkeypatch.setenv("META_APP_ID", "123")
    monkeypatch.setenv("META_APP_SECRET", "secret")
    monkeypatch.setenv("META_SCOPES", "")  # unrestricted
    r = client.get("/api/meta/connect/start", params={"tenant_id": "t_meta", "feature": "publishing"},
                   follow_redirects=False)
    assert r.status_code == 302
    assert "instagram_content_publish" in r.headers["location"]


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


import base64


def _upload(client, tenant="t_meta", filename="reel.mp4", ctype="video/mp4"):
    data = base64.b64encode(b"fake-media-bytes").decode()
    return client.post("/api/content/assets", json={
        "tenant_id": tenant, "filename": filename, "content_type": ctype, "data_base64": data}).json()


def test_content_upload_creates_record(client, monkeypatch, tmp_path):
    monkeypatch.setenv("PIXIE_STORAGE_PROVIDER", "local")
    monkeypatch.setenv("PIXIE_DATA_DIR", str(tmp_path))
    r = _upload(client)
    assert r["status"] == "uploaded" and r["asset"]["id"]
    lst = client.get("/api/content/assets", params={"tenant_id": "t_meta"}).json()
    assert any(a["id"] == r["asset"]["id"] for a in lst["assets"])


def test_prepare_post_uses_media_asset(client, monkeypatch, tmp_path):
    monkeypatch.setenv("PIXIE_STORAGE_PROVIDER", "local")
    monkeypatch.setenv("PIXIE_DATA_DIR", str(tmp_path))
    _demo_connect(client)
    aid = _upload(client)["asset"]["id"]
    pp = client.post("/api/agents/marketing/meta/prepare-post", json={
        "tenant_id": "t_meta", "platform": "instagram", "content_type": "reel",
        "idea": "latte", "media_asset_id": aid}).json()
    assert pp["status"] == "approval_required"
    assert pp["prepared_output"]["media_asset_id"] == aid
    assert pp["prepared_output"]["media_url"]  # resolved from the ContentAsset


def test_mock_publish_creates_meta_content_item(client, monkeypatch, tmp_path):
    monkeypatch.setenv("PIXIE_STORAGE_PROVIDER", "local")
    monkeypatch.setenv("PIXIE_DATA_DIR", str(tmp_path))
    _demo_connect(client)
    aid = _upload(client)["asset"]["id"]
    apid = client.post("/api/agents/marketing/meta/prepare-post", json={
        "tenant_id": "t_meta", "platform": "instagram", "content_type": "reel",
        "idea": "x", "media_asset_id": aid}).json()["approval_id"]
    client.post(f"/api/approvals/{apid}/approve", json={"tenant_id": "t_meta"})
    content = client.get("/api/meta/content", params={"tenant_id": "t_meta"}).json()
    assert any(c["status"] == "mock_published" and c["media_asset_id"] == aid for c in content["content"])


def test_real_mode_invalid_media_blocks_prepare(client, monkeypatch):
    """A ready live connection but no uploaded media → prepare refuses (no approval)."""
    from integrations import connections
    from meta.oauth import META_CAPABILITIES
    _demo_connect(client)
    connections.register_many("t_meta", META_CAPABILITIES, {
        "provider": "meta", "mode": "live",
        "pages": [{"id": "page_demo_1", "page_access_token": "t",
                   "linked_instagram": {"id": "ig_demo_1", "username": "brand"}}],
    })
    try:
        r = client.post("/api/agents/marketing/meta/prepare-post", json={
            "tenant_id": "t_meta", "platform": "instagram", "content_type": "reel", "idea": "x"}).json()
        assert r["status"] == "invalid_media"
        assert "approval_id" not in r
    finally:
        connections.disconnect("t_meta", META_CAPABILITIES)


def test_no_token_in_status_or_assets(client):
    """Tokens must never appear in frontend-facing responses."""
    from meta.store import get_meta_store
    from meta import token_service as ts
    assets = {
        "facebook_pages": [{"id": "page_1", "name": "P", "page_access_token": "SECRET_PAGE_TOKEN",
                            "linked_instagram": {"id": "ig_1", "username": "brand"}}],
        "instagram_accounts": [{"id": "ig_1", "username": "brand", "page_id": "page_1"}],
        "ad_accounts": [],
    }
    ts.save_token_ref("t_meta", {"provider": "meta", "mode": "live", "user_token": "SECRET_USER_TOKEN",
                                 "pages": assets["facebook_pages"], "scopes": ["pages_manage_posts"]})
    get_meta_store().set_assets("t_meta", assets, mode="live")
    status_text = client.get("/api/meta/status", params={"tenant_id": "t_meta"}).text
    assets_text = client.get("/api/meta/assets", params={"tenant_id": "t_meta"}).text
    for blob in (status_text, assets_text):
        assert "SECRET_PAGE_TOKEN" not in blob
        assert "SECRET_USER_TOKEN" not in blob
        assert "page_access_token" not in blob
    # ...but publishing permission IS surfaced (derived from scopes, safe)
    import json as _json
    assert _json.loads(status_text)["permissions"]["publishing"] is True


def test_persistence_survives_reload(monkeypatch, tmp_path):
    monkeypatch.setenv("PIXIE_PERSIST", "file")
    monkeypatch.setenv("PIXIE_DATA_DIR", str(tmp_path))
    import approvals.router as ar
    ar._store = None
    ar.create_approval("t_persist", "marketing-agent", "Persisted", action_type="meta_content_publish")
    # simulate a restart: drop the singleton, rebuild from disk
    ar._store = None
    items = ar.get_approvals_store().list("t_persist")
    assert len(items) == 1 and items[0].title == "Persisted"


def test_demo_stays_mock(client):
    _demo_connect(client)
    from integrations import resolve_connector
    assert resolve_connector("t_meta", "meta_content_publish").mode == "mock"


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
