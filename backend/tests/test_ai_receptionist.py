"""AI Receptionist vertical-slice tests.

Normal tests use a STUB LLM router (canned structured JSON) — no OpenAI spend,
deterministic. The real OpenAI path is covered by a separate, opt-in integration
test that only runs when OPENAI_API_KEY is present and PIXIE_RUN_OPENAI_IT=1.

Covers the spec's required cases:
  1. manual message creates a lead
  2. manual message creates an approval
  3. prepared reply exists
  4. NO tool execution before approval
  5. approve executes mock email
  6. activity log created
  7. real mode + missing connection blocks execution
  8. missing OpenAI key gives a clear error
"""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from schemas import ModelTier
from models.base import ModelResult

CANNED = {
    "agent_slug": "ai-receptionist",
    "intent": "pricing_question",
    "risk_level": "medium",
    "summary": "Customer asked about pricing and Friday availability.",
    "lead": {"name": "Sarah", "email": "sarah@example.com", "source": "manual", "status": "reply_prepared"},
    "prepared_reply": "Hi Sarah, thanks for reaching out! Our pricing depends on the service — could you tell me which one? I can also check Friday availability for you.",
    "internal_notes": "Pricing + availability enquiry; medium priority.",
    "recommended_actions": [
        {"capability": "email_send", "tool_preference": "gmail", "approval_required": True,
         "description": "Send the pricing reply", "payload": {}},
    ],
    "booking": {"needed": False, "suggested_slots": [], "event_title": "", "event_description": ""},
    "user_action": "approve",
}


class _StubRouter:
    """Looks like models.ModelRouter but returns canned JSON (no network)."""

    mode = "fake"  # → provider label "mock"

    def model_for(self, tier: ModelTier) -> str:
        return "mock-small"

    async def complete(self, req):
        return ModelResult(text=json.dumps(CANNED), model="mock-small", tier=req.tier,
                           tokens_in=10, tokens_out=20, latency_ms=1)


@pytest.fixture(autouse=True)
def _reset_stores(monkeypatch):
    """Fresh in-memory stores + stubbed LLM router for every test."""
    import approvals.router as ar
    import activity.router as act
    import leads.service as ls
    import receptionist.agent as agent
    from integrations import connections

    ar._store = None
    act._store = None
    ls._store = None
    connections.clear_connections()
    monkeypatch.setattr(agent, "get_router", lambda: _StubRouter())
    # default: production + mock execution (matches .env intent), approval required
    monkeypatch.setenv("PIXIE_AGENT_MODE", "production")
    monkeypatch.setenv("PIXIE_EXECUTION_MODE", "mock")
    monkeypatch.setenv("PIXIE_REQUIRE_APPROVAL", "true")
    yield


@pytest.fixture
def client():
    from app import app
    return TestClient(app)


def _run(client, tenant="t_ai"):
    return client.post("/api/agents/ai-receptionist/run", json={
        "tenant_id": tenant, "source": "manual",
        "from_email": "sarah@example.com", "from_name": "Sarah",
        "subject": "Pricing and availability",
        "body": "Hi, can you tell me your pricing and if you are available this Friday?",
    })


def test_manual_message_creates_lead(client):
    r = _run(client)
    assert r.status_code == 200
    body = r.json()
    assert body["lead_id"]
    assert body["intent"] == "pricing_question"
    assert body["prepared_output"]["lead"]["email"] == "sarah@example.com"


def test_manual_message_creates_approval(client):
    body = _run(client).json()
    assert body["approval_id"]
    approvals = client.get("/api/approvals", params={"tenant_id": "t_ai"}).json()
    assert any(a["id"] == body["approval_id"] for a in approvals)


def test_prepared_reply_exists(client):
    body = _run(client).json()
    assert body["prepared_output"]["reply"].strip()
    assert body["llm_provider"] == "mock"  # stubbed provider


def test_no_execution_before_approval(client):
    _run(client)
    activity = client.get("/api/activity", params={"tenant_id": "t_ai"}).json()
    assert not any(e["type"] == "action_executed" for e in activity)


def test_approve_executes_mock_email(client):
    approval_id = _run(client).json()["approval_id"]
    res = client.post(f"/api/approvals/{approval_id}/approve",
                      json={"tenant_id": "t_ai", "now": "2026-07-03T10:00:00Z"}).json()
    assert res["status"] == "executed"
    er = res["execution_result"]
    assert er["ok"] is True and er["executed"] is False  # mock: nothing left the box
    email = er["results"][0]
    assert email["provider"] == "mock_email"
    assert "No real email was delivered" in email["message"]


def test_activity_logged(client):
    approval_id = _run(client).json()["approval_id"]
    client.post(f"/api/approvals/{approval_id}/approve",
                json={"tenant_id": "t_ai", "now": "2026-07-03T10:00:00Z"})
    activity = client.get("/api/activity", params={"tenant_id": "t_ai"}).json()
    types = [e["type"] for e in activity]
    assert "lead_captured" in types
    assert "action_executed" in types
    assert types[0] == "approval_completed"  # newest event


def test_real_mode_missing_connection_blocks(client, monkeypatch):
    monkeypatch.setenv("PIXIE_EXECUTION_MODE", "real")  # production+real, but no Gmail connection
    approval_id = _run(client).json()["approval_id"]
    res = client.post(f"/api/approvals/{approval_id}/approve",
                      json={"tenant_id": "t_ai", "now": "2026-07-03T10:00:00Z"}).json()
    er = res["execution_result"]
    assert er["executed"] is False
    blocked = er["results"][0]
    assert blocked["status"] == "blocked"
    assert blocked["error"] == "missing_connection"


def test_missing_openai_key_gives_clear_error():
    """Provider-level: no key → the exact, actionable message (not a fake success)."""
    import asyncio
    from models.openai import OpenAIProvider, MISSING_KEY_MESSAGE
    from models import ModelRequest

    provider = OpenAIProvider(api_key="")
    with pytest.raises(RuntimeError) as exc:
        asyncio.run(provider.complete(
            ModelRequest(tier=ModelTier.SMALL, task="reception", system="s", user="u",
                         expects_json=True),
            model="gpt-4o-mini",
        ))
    assert str(exc.value) == MISSING_KEY_MESSAGE


@pytest.mark.skipif(
    __import__("os").getenv("PIXIE_RUN_OPENAI_IT") != "1",
    reason="opt-in real OpenAI integration test (set PIXIE_RUN_OPENAI_IT=1 with a key)",
)
def test_openai_integration_real(monkeypatch):
    monkeypatch.setattr("receptionist.agent.get_router", __import__("models").get_router)
    monkeypatch.setenv("PIXIE_LLM_PROVIDER", "openai")
    from app import app
    c = TestClient(app)
    body = _run(c, tenant="t_it").json()
    assert body["llm_provider"] == "openai"
    assert body["prepared_output"]["reply"].strip()
