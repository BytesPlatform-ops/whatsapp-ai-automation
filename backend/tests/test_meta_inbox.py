"""Meta inbox (comments/DM) tests — stub LLM (no OpenAI spend), demo Meta data."""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from schemas import ModelTier
from models.base import ModelResult

CANNED = {
    "agent_slug": "marketing-agent", "platform": "meta", "interaction_type": "comment",
    "intent": "positive_feedback", "sentiment": "positive", "risk_level": "low",
    "summary": "praise", "recommended_route": "marketing-agent",
    "prepared_reply": "Thank you so much! 🙏 We appreciate you.",
    "internal_notes": "happy customer",
    "recommended_actions": [{"capability": "meta_comment_reply", "approval_required": True,
                             "description": "reply", "payload": {}}],
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
    import meta.inbox as inbox
    import content.service as csvc
    from integrations import connections

    ar._store = None
    act._store = None
    ms._store = None
    inbox._store = None
    csvc._store = None
    connections.disconnect("t_inbox")
    monkeypatch.setattr(inbox, "get_router", lambda: _StubRouter())
    monkeypatch.setenv("PIXIE_AGENT_MODE", "production")
    monkeypatch.setenv("PIXIE_EXECUTION_MODE", "mock")
    monkeypatch.setenv("PIXIE_REQUIRE_APPROVAL", "true")
    yield
    connections.disconnect("t_inbox")


@pytest.fixture
def client():
    from app import app
    return TestClient(app)


def _connect(client, t="t_inbox"):
    client.post("/api/meta/connect/demo", json={"tenant_id": t})


def _first_comment(client, t="t_inbox"):
    return client.get("/api/meta/comments", params={"tenant_id": t}).json()["comments"][0]


def test_comment_demo_items_load(client):
    _connect(client)
    comments = client.get("/api/meta/comments", params={"tenant_id": "t_inbox"}).json()["comments"]
    assert len(comments) >= 1
    assert all(c["interaction_type"] == "comment" for c in comments)


def test_content_library_lists_meta_content_items(client, monkeypatch, tmp_path):
    monkeypatch.setenv("PIXIE_STORAGE_PROVIDER", "local")
    monkeypatch.setenv("PIXIE_DATA_DIR", str(tmp_path))
    content = client.get("/api/meta/content", params={"tenant_id": "t_inbox"}).json()
    assert "content" in content and "executions" in content


def test_comment_analyze_creates_structured_ai_result(client):
    _connect(client)
    item = _first_comment(client)
    r = client.post("/api/agents/marketing/meta/comments/analyze",
                    json={"tenant_id": "t_inbox", "item_id": item["id"]}).json()
    assert r["status"] == "analyzed"
    assert r["item"]["intent"] == "positive_feedback"
    assert r["item"]["sentiment"] == "positive"
    assert r["item"]["prepared_reply"]


def test_comment_prepare_reply_creates_approval(client):
    _connect(client)
    item = _first_comment(client)
    client.post("/api/agents/marketing/meta/comments/analyze", json={"tenant_id": "t_inbox", "item_id": item["id"]})
    pr = client.post("/api/agents/marketing/meta/inbox/prepare-reply",
                     json={"tenant_id": "t_inbox", "item_id": item["id"]}).json()
    assert pr["status"] == "approval_required" and pr["approval_id"]
    assert pr["capability"] == "meta_comment_reply"


def test_no_comment_reply_before_approval(client):
    _connect(client)
    item = _first_comment(client)
    client.post("/api/agents/marketing/meta/comments/analyze", json={"tenant_id": "t_inbox", "item_id": item["id"]})
    client.post("/api/agents/marketing/meta/inbox/prepare-reply", json={"tenant_id": "t_inbox", "item_id": item["id"]})
    activity = client.get("/api/activity", params={"tenant_id": "t_inbox"}).json()
    assert not any(e["type"] == "action_executed" for e in activity)


def test_approval_executes_mock_comment_reply(client):
    _connect(client)
    item = _first_comment(client)
    client.post("/api/agents/marketing/meta/comments/analyze", json={"tenant_id": "t_inbox", "item_id": item["id"]})
    apid = client.post("/api/agents/marketing/meta/inbox/prepare-reply",
                       json={"tenant_id": "t_inbox", "item_id": item["id"]}).json()["approval_id"]
    res = client.post(f"/api/approvals/{apid}/approve", json={"tenant_id": "t_inbox"}).json()
    assert res["status"] == "executed"
    assert res["execution_result"]["results"][0]["provider"] == "mock_meta"
    # inbox item reflects the outcome
    items = client.get("/api/meta/inbox", params={"tenant_id": "t_inbox"}).json()["inbox"]
    assert next(i for i in items if i["id"] == item["id"])["status"] == "replied"


def test_real_comment_reply_missing_connection_blocks(client, monkeypatch):
    _connect(client)  # demo → no real connection
    item = _first_comment(client)
    client.post("/api/agents/marketing/meta/comments/analyze", json={"tenant_id": "t_inbox", "item_id": item["id"]})
    apid = client.post("/api/agents/marketing/meta/inbox/prepare-reply",
                       json={"tenant_id": "t_inbox", "item_id": item["id"]}).json()["approval_id"]
    monkeypatch.setenv("PIXIE_EXECUTION_MODE", "real")
    res = client.post(f"/api/approvals/{apid}/approve", json={"tenant_id": "t_inbox"}).json()
    er = res["execution_result"]
    assert er["executed"] is False and er["results"][0]["status"] == "blocked"
    items = client.get("/api/meta/inbox", params={"tenant_id": "t_inbox"}).json()["inbox"]
    assert next(i for i in items if i["id"] == item["id"])["status"] == "blocked"


def test_dm_permission_missing_shows_blocked(client):
    _connect(client)
    perms = client.get("/api/meta/permissions", params={"tenant_id": "t_inbox"}).json()
    assert perms["dms"] == "missing" and perms["comments"] == "missing"


def test_inbox_route_to_receptionist_creates_internal_signal(client):
    _connect(client)
    item = _first_comment(client)
    r = client.post("/api/agents/marketing/meta/inbox/route",
                    json={"tenant_id": "t_inbox", "item_id": item["id"]}).json()
    assert r["status"] == "routed" and r["route"] == "ai-receptionist"
    activity = client.get("/api/activity", params={"tenant_id": "t_inbox"}).json()
    assert any(e["type"] == "routed_to_receptionist" for e in activity)


def test_tokens_not_exposed_in_inbox_responses(client):
    from meta import token_service as ts
    _connect(client)
    ts.save_token_ref("t_inbox", {"provider": "meta", "mode": "live", "user_token": "SECRET_TOK",
                                  "pages": [{"id": "p", "page_access_token": "SECRET_PAGE"}],
                                  "scopes": ["instagram_manage_comments"]})
    for path in ("/api/meta/inbox", "/api/meta/comments"):
        text = client.get(path, params={"tenant_id": "t_inbox"}).text
        assert "SECRET_TOK" not in text and "SECRET_PAGE" not in text and "page_access_token" not in text
