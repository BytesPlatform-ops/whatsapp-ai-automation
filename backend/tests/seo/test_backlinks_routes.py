"""Tests for the backlinks FastAPI routes.

Covers:
  - POST /backlinks/sync → 200 with sync result
  - GET  /backlinks/overview → profile dict
  - GET  /backlinks → paginated list
  - GET  /backlinks/referring-domains → list
  - GET  /backlinks/new-lost → new/lost dicts
  - GET  /backlinks/anchors → anchor distribution
  - GET  /backlinks/risk → risk analysis (human_review_required always True)
  - GET  /backlinks/gap → gap analysis (score_inputs always present)
  - GET  /backlinks/opportunities → flat opportunity list
  - GET  /backlinks/export → CSV with formula-injection escaping

All tests use MockBacklinkProvider (no real API calls).
No paid/network calls; credits system off by default.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

import seo.backlinks.stores as bs
import seo.metering_search as metering


# ── Minimal FastAPI app fixture ───────────────────────────────────────────────

@pytest.fixture(scope="module")
def client():
    from fastapi import FastAPI
    from seo.backlinks.routes import router

    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


@pytest.fixture(autouse=True)
def clean_repos(monkeypatch):
    monkeypatch.delenv("PIXIE_PERSIST", raising=False)
    monkeypatch.setattr(metering.credit_config, "credit_system_enabled", lambda: False)
    bs.reset_repositories()
    yield
    bs.reset_repositories()


TENANT = "test_tenant"
SITE   = "site_abc"


def _sync(client, tenant=TENANT, site=SITE):
    resp = client.post("/api/agents/seo/backlinks/sync",
                       json={"tenant_id": tenant, "site_id": site, "domain": "example.com"})
    assert resp.status_code == 200, resp.text
    return resp.json()


# ── POST /backlinks/sync ──────────────────────────────────────────────────────

def test_sync_endpoint_returns_200(client):
    resp = client.post("/api/agents/seo/backlinks/sync",
                       json={"tenant_id": TENANT, "site_id": SITE, "domain": "example.com"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert "sync" in data
    assert data["sync"]["total_backlinks"] > 0


def test_sync_endpoint_idempotent(client):
    r1 = _sync(client)
    r2 = _sync(client)
    # Idempotent: second sync should have same (or equal) total
    assert r2["sync"]["total_backlinks"] == r1["sync"]["total_backlinks"]


# ── GET /backlinks/overview ───────────────────────────────────────────────────

def test_overview_before_sync_returns_not_synced(client):
    resp = client.get("/api/agents/seo/backlinks/overview",
                      params={"site_id": "new_site", "tenant_id": TENANT})
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "not_synced"


def test_overview_after_sync(client):
    _sync(client)
    resp = client.get("/api/agents/seo/backlinks/overview",
                      params={"site_id": SITE, "tenant_id": TENANT})
    assert resp.status_code == 200
    data = resp.json()
    assert data["sync_status"] == "completed"
    assert data["total_backlinks"] > 0


# ── GET /backlinks ────────────────────────────────────────────────────────────

def test_list_backlinks_requires_site_id(client):
    resp = client.get("/api/agents/seo/backlinks", params={"tenant_id": TENANT})
    assert resp.status_code == 422


def test_list_backlinks_after_sync(client):
    _sync(client)
    resp = client.get("/api/agents/seo/backlinks",
                      params={"site_id": SITE, "tenant_id": TENANT})
    assert resp.status_code == 200
    data = resp.json()
    assert "backlinks" in data
    assert "total" in data
    assert data["total"] > 0
    # Check record fields
    bl = data["backlinks"][0]
    assert "source_url" in bl
    assert "target_url" in bl
    assert "rel" in bl
    assert "provider_metrics" in bl


def test_list_backlinks_status_filter(client):
    _sync(client)
    resp = client.get("/api/agents/seo/backlinks",
                      params={"site_id": SITE, "tenant_id": TENANT, "status": "active"})
    assert resp.status_code == 200
    data = resp.json()
    for bl in data["backlinks"]:
        assert bl["status"] == "active"


def test_list_backlinks_invalid_status_returns_400(client):
    resp = client.get("/api/agents/seo/backlinks",
                      params={"site_id": SITE, "tenant_id": TENANT, "status": "invalid"})
    assert resp.status_code == 400


def test_list_backlinks_pagination(client):
    _sync(client)
    resp = client.get("/api/agents/seo/backlinks",
                      params={"site_id": SITE, "tenant_id": TENANT,
                               "limit": 5, "offset": 0})
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["backlinks"]) <= 5


# ── GET /backlinks/referring-domains ─────────────────────────────────────────

def test_referring_domains_after_sync(client):
    _sync(client)
    resp = client.get("/api/agents/seo/backlinks/referring-domains",
                      params={"site_id": SITE, "tenant_id": TENANT})
    assert resp.status_code == 200
    data = resp.json()
    assert "referring_domains" in data
    assert "total" in data
    assert data["total"] > 0


def test_referring_domains_status_filter(client):
    _sync(client)
    resp = client.get("/api/agents/seo/backlinks/referring-domains",
                      params={"site_id": SITE, "tenant_id": TENANT, "status": "active"})
    assert resp.status_code == 200
    data = resp.json()
    for rd in data["referring_domains"]:
        assert rd["status"] == "active"


# ── GET /backlinks/new-lost ───────────────────────────────────────────────────

def test_new_lost_endpoint(client):
    _sync(client)
    resp = client.get("/api/agents/seo/backlinks/new-lost",
                      params={"site_id": SITE, "tenant_id": TENANT})
    assert resp.status_code == 200
    data = resp.json()
    assert "new" in data
    assert "lost" in data


def test_new_lost_since_filter(client):
    _sync(client)
    resp = client.get("/api/agents/seo/backlinks/new-lost",
                      params={"site_id": SITE, "tenant_id": TENANT, "since": "2099-01-01"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["new"] == []


# ── GET /backlinks/anchors ────────────────────────────────────────────────────

def test_anchors_endpoint(client):
    _sync(client)
    resp = client.get("/api/agents/seo/backlinks/anchors",
                      params={"site_id": SITE, "tenant_id": TENANT})
    assert resp.status_code == 200
    data = resp.json()
    assert "anchors" in data
    assert data["total"] > 0
    for a in data["anchors"]:
        assert "anchor" in a
        assert "count" in a
        assert "percent" in a


# ── GET /backlinks/risk ───────────────────────────────────────────────────────

def test_risk_endpoint_has_human_review_required(client):
    _sync(client)
    resp = client.get("/api/agents/seo/backlinks/risk",
                      params={"site_id": SITE, "tenant_id": TENANT})
    assert resp.status_code == 200
    data = resp.json()
    assert data["human_review_required"] is True
    assert "disclaimer" in data
    assert "risk_analysis" in data
    for r in data["risk_analysis"]:
        assert r["human_review_required"] is True


def test_risk_endpoint_min_signals_filter(client):
    _sync(client)
    resp = client.get("/api/agents/seo/backlinks/risk",
                      params={"site_id": SITE, "tenant_id": TENANT, "min_signals": 1})
    assert resp.status_code == 200
    data = resp.json()
    for r in data["risk_analysis"]:
        assert r["signal_count"] >= 1


# ── GET /backlinks/gap ────────────────────────────────────────────────────────

def test_gap_endpoint(client):
    _sync(client)
    resp = client.get("/api/agents/seo/backlinks/gap",
                      params={"site_id": SITE, "tenant_id": TENANT,
                               "competitors": ["rival.com"]})
    assert resp.status_code == 200
    data = resp.json()
    assert "gap_opportunities" in data
    assert "lost_reclamation" in data
    assert "summary" in data


def test_gap_endpoint_score_inputs_always_present(client):
    _sync(client)
    resp = client.get("/api/agents/seo/backlinks/gap",
                      params={"site_id": SITE, "tenant_id": TENANT,
                               "competitors": ["rival.com", "other.com"]})
    assert resp.status_code == 200
    data = resp.json()
    all_opps = (
        data.get("gap_opportunities", [])
        + data.get("lost_reclamation", [])
        + data.get("resource_candidates", [])
        + data.get("competitor_pages", [])
    )
    for opp in all_opps:
        assert opp.get("score_inputs"), f"score_inputs missing/empty: {opp}"


# ── GET /backlinks/opportunities ──────────────────────────────────────────────

def test_opportunities_endpoint(client):
    _sync(client)
    resp = client.get("/api/agents/seo/backlinks/opportunities",
                      params={"site_id": SITE, "tenant_id": TENANT,
                               "competitors": ["rival.com"]})
    assert resp.status_code == 200
    data = resp.json()
    assert "opportunities" in data
    assert "total" in data
    for opp in data["opportunities"]:
        assert opp.get("score_inputs"), "every opportunity must have score_inputs"


# ── GET /backlinks/export (CSV) ───────────────────────────────────────────────

def test_export_csv_backlinks(client):
    _sync(client)
    resp = client.get("/api/agents/seo/backlinks/export",
                      params={"site_id": SITE, "tenant_id": TENANT,
                               "export_type": "backlinks"})
    assert resp.status_code == 200
    assert "text/csv" in resp.headers.get("content-type", "")
    text = resp.text
    assert "source_url" in text   # header row
    assert "target_url" in text


def test_export_csv_referring_domains(client):
    _sync(client)
    resp = client.get("/api/agents/seo/backlinks/export",
                      params={"site_id": SITE, "tenant_id": TENANT,
                               "export_type": "referring_domains"})
    assert resp.status_code == 200
    assert "text/csv" in resp.headers.get("content-type", "")
    text = resp.text
    assert "domain" in text
    assert "backlink_count" in text


def test_export_csv_formula_injection_escaping(client):
    """Cells starting with =, +, -, @, tab, CR must be prefixed with '."""
    from seo.backlinks.routes import _escape_cell
    for dangerous in ["=SUM(A1)", "+foo", "-bar", "@test", "\tcell", "\rcell"]:
        escaped = _escape_cell(dangerous)
        assert escaped.startswith("'"), f"not escaped: {dangerous!r} → {escaped!r}"


def test_export_csv_safe_values_not_escaped(client):
    from seo.backlinks.routes import _escape_cell
    for safe in ["example.com", "click here", "100", ""]:
        escaped = _escape_cell(safe)
        assert escaped == safe, f"over-escaped: {safe!r} → {escaped!r}"


# ── velocity endpoint (bonus, same prefix) ───────────────────────────────────

def test_velocity_endpoint(client):
    _sync(client)
    resp = client.get("/api/agents/seo/backlinks/velocity",
                      params={"site_id": SITE, "tenant_id": TENANT})
    assert resp.status_code == 200
    data = resp.json()
    assert "velocity" in data
    assert len(data["velocity"]) >= 1
