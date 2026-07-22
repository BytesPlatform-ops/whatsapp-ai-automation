"""Meta connection diagnostics + Ads Assistant tests.

Uses the demo Meta connection (no Meta app needed) and a STUB LLM router for the
Ads Assistant (no OpenAI spend). Verifies:
  * diagnostics: disconnected → honest single error; demo → all-green report.
  * ads assistant: returns deterministic signals + (stubbed) AI suggestions,
    is read-only (never creates/changes a campaign), and blocks when disconnected.
"""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from models.base import ModelResult
from schemas import ModelTier

ADS_CANNED = {
    "summary": "Spend is efficient but concentrated in one campaign.",
    "suggested_angles": [
        {"angle": "Weekend urgency", "rationale": "Traffic peaks Saturday mornings."},
    ],
    "suggested_paused_campaigns": [
        {"name": "Retarget site visitors", "objective": "OUTCOME_SALES", "rationale": "Warm audience."},
    ],
}


class _StubRouter:
    mode = "fake"

    def model_for(self, tier: ModelTier) -> str:
        return "mock-small"

    async def complete(self, req):
        return ModelResult(text=json.dumps(ADS_CANNED), model="mock-small", tier=req.tier,
                           tokens_in=8, tokens_out=12, latency_ms=1)


@pytest.fixture(autouse=True)
def _reset(monkeypatch):
    import activity.router as act
    import meta.ads_agent as ads_agent
    import meta.store as ms
    from integrations import connections

    act._store = None
    ms._store = None
    connections.disconnect("t_diag")
    monkeypatch.setattr(ads_agent, "get_router", lambda: _StubRouter())
    yield
    connections.disconnect("t_diag")


@pytest.fixture
def client():
    from app import app
    return TestClient(app)


def _demo_connect(client, t="t_diag"):
    return client.post("/api/meta/connect/demo", json={"tenant_id": t})


# ── Diagnostics ───────────────────────────────────────────────────────────────

def test_diagnostics_disconnected_is_honest(client):
    r = client.get("/api/meta/diagnostics", params={"tenant_id": "t_diag"})
    assert r.status_code == 200
    d = r.json()
    assert d["connected"] is False
    assert d["overall"] == "disconnected"
    assert len(d["checks"]) == 1 and d["checks"][0]["status"] == "error"
    assert d["required_scopes"]  # UI still shows what will be requested


def test_diagnostics_demo_all_green(client):
    _demo_connect(client)
    d = client.get("/api/meta/diagnostics", params={"tenant_id": "t_diag"}).json()
    assert d["connected"] is True and d["demo"] is True
    assert d["overall"] == "ok"
    ids = {c["id"]: c["status"] for c in d["checks"]}
    for cid in ("connected", "pages", "instagram", "ad_accounts", "campaigns", "insights", "permissions"):
        assert ids.get(cid) == "ok", f"{cid} not ok: {ids.get(cid)}"
    assert d["missing_permissions"] == []


# ── Ads Assistant ─────────────────────────────────────────────────────────────

def test_ads_analyze_requires_connection(client):
    r = client.post("/api/meta/ads/analyze", json={"tenant_id": "t_diag"})
    assert r.status_code == 200
    assert r.json()["status"] == "not_connected"


def test_ads_analyze_demo_returns_signals_and_suggestions(client):
    _demo_connect(client)
    d = client.post("/api/meta/ads/analyze", json={"tenant_id": "t_diag"}).json()
    assert d["status"] == "analyzed"
    assert d["source"] == "demo"
    assert d["campaign_count"] == 3
    assert isinstance(d["signals"], list) and len(d["signals"]) >= 1
    # Stubbed LLM output flows through.
    assert d["summary"] == ADS_CANNED["summary"]
    assert d["suggested_angles"] and d["suggested_paused_campaigns"]
    assert "ideas only" in d["note"].lower()


def test_ads_analyze_is_read_only(client):
    """Analyzing must not create or change any campaign."""
    _demo_connect(client)
    before = client.get("/api/meta/campaigns", params={"tenant_id": "t_diag", "ad_account_id": "act_demo_1"}).json()
    client.post("/api/meta/ads/analyze", json={"tenant_id": "t_diag", "ad_account_id": "act_demo_1"})
    after = client.get("/api/meta/campaigns", params={"tenant_id": "t_diag", "ad_account_id": "act_demo_1"}).json()
    assert [c["id"] for c in before["campaigns"]] == [c["id"] for c in after["campaigns"]]
