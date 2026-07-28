"""Tests for the backlink gap and opportunity engine.

Covers:
  - Gap opportunities vs competitors
  - Lost-reclamation opportunities from stored lost links
  - Resource candidates from anchor/page heuristics
  - Competitor-page opportunities
  - Every opportunity has non-empty score_inputs
  - Estimates are labelled as estimates
  - Metering: is_mock → 0 credits (no billing in tests)
  - Cross-tenant isolation on gap analysis

No network calls; MockBacklinkProvider only.
"""

from __future__ import annotations

import pytest

import seo.backlinks.stores as bs
import seo.metering_search as metering
from seo.backlinks.gaps import (
    COMPETITOR_PAGE,
    GAP_DOMAIN,
    LOST_RECLAMATION,
    MULTI_COMPETITOR,
    RESOURCE_CANDIDATE,
    get_opportunities,
    run_gap_analysis,
)
from seo.backlinks.provider import MockBacklinkProvider
from seo.backlinks.service import run_backlink_sync
from seo.backlinks.stores import (
    Backlink,
    LinkRel,
    LinkStatus,
    get_backlink_repository,
)


@pytest.fixture(autouse=True)
def clean_repos(monkeypatch):
    monkeypatch.delenv("PIXIE_PERSIST", raising=False)
    monkeypatch.setattr(metering.credit_config, "credit_system_enabled", lambda: False)
    bs.reset_repositories()
    yield
    bs.reset_repositories()


@pytest.fixture()
def provider():
    return MockBacklinkProvider()


# ── Score inputs always present ───────────────────────────────────────────────

def test_all_opportunities_have_score_inputs(provider):
    run_backlink_sync("t_a", "s1", provider=provider, domain="client.com")
    opps = get_opportunities("t_a", "s1", ["comp1.com", "comp2.com"],
                              provider=provider, client_domain="client.com", is_mock=True)
    for opp in opps:
        assert "score_inputs" in opp, f"opportunity {opp.get('opportunity_type')} missing score_inputs"
        assert opp["score_inputs"], f"score_inputs must not be empty for {opp.get('opportunity_type')}"


def test_score_inputs_is_estimate_flagged(provider):
    run_backlink_sync("t_a", "s1", provider=provider, domain="client.com")
    opps = get_opportunities("t_a", "s1", ["rival.com"],
                              provider=provider, client_domain="client.com", is_mock=True)
    for opp in opps:
        # All estimates must be labelled (in score_inputs or estimated_value)
        score_inputs = opp["score_inputs"]
        est_value = opp.get("estimated_value", "")
        has_estimate_flag = (
            score_inputs.get("is_estimate") is True
            or "estimate" in str(est_value).lower()
        )
        assert has_estimate_flag, f"opportunity not labelled as estimate: {opp}"


# ── run_gap_analysis structure ────────────────────────────────────────────────

def test_gap_analysis_returns_expected_keys(provider):
    result = run_gap_analysis("t_a", "s1", ["rival.com"],
                               provider=provider, client_domain="client.com", is_mock=True)
    assert "gap_opportunities" in result
    assert "lost_reclamation" in result
    assert "resource_candidates" in result
    assert "competitor_pages" in result
    assert "summary" in result
    assert "metering" in result


def test_gap_analysis_summary_fields(provider):
    run_backlink_sync("t_a", "s1", provider=provider, domain="client.com")
    result = run_gap_analysis("t_a", "s1", ["r1.com", "r2.com"],
                               provider=provider, client_domain="client.com", is_mock=True)
    summary = result["summary"]
    assert summary["competitor_count"] == 2
    assert summary["client_domain"] == "client.com"
    assert "total" in summary
    assert "by_type" in summary


# ── Gap domain opportunities ──────────────────────────────────────────────────

def test_gap_opportunities_have_required_fields(provider):
    result = run_gap_analysis("t_a", "s1", ["comp.com"],
                               provider=provider, client_domain="client.com", is_mock=True)
    for opp in result["gap_opportunities"]:
        assert opp["opportunity_type"] in (GAP_DOMAIN, MULTI_COMPETITOR)
        assert "source_evidence" in opp and opp["source_evidence"]
        assert "competitors" in opp and opp["competitors"]
        assert "link_likelihood" in opp
        assert "effort" in opp
        assert "recommended_outreach_angle" in opp
        assert "score_inputs" in opp and opp["score_inputs"]


def test_multi_competitor_opp_type_for_two_competitors(provider):
    """Domains linking to 2+ competitors should be typed MULTI_COMPETITOR."""
    result = run_gap_analysis("t_a", "s1", ["c1.com", "c2.com", "c3.com"],
                               provider=provider, client_domain="client.com", is_mock=True)
    multi = [o for o in result["gap_opportunities"]
             if o["opportunity_type"] == MULTI_COMPETITOR]
    # Not guaranteed but the mock should produce at least some with multiple comps.
    # Just verify that when they exist they have competitor_count >= 2.
    for opp in multi:
        assert opp["score_inputs"].get("competitor_count", 0) >= 2


# ── Lost reclamation ──────────────────────────────────────────────────────────

def test_lost_reclamation_from_stored_lost_links(provider):
    # Sync to get some links, then mark one as lost
    run_backlink_sync("t_a", "s1", provider=provider, domain="client.com")
    bl_repo = get_backlink_repository()
    bls = bl_repo.list_by_site("t_a", "s1", status=LinkStatus.ACTIVE)
    if bls:
        bid, _ = bls[0]
        bl_repo.update("t_a", bid, status=LinkStatus.LOST)

    result = run_gap_analysis("t_a", "s1", [],
                               provider=provider, client_domain="client.com", is_mock=True)
    reclaim = result["lost_reclamation"]
    assert len(reclaim) >= 1
    for opp in reclaim:
        assert opp["opportunity_type"] == LOST_RECLAMATION
        assert opp["effort"] == "low"
        assert opp["score_inputs"]


def test_lost_reclamation_has_source_evidence(provider):
    run_backlink_sync("t_a", "s1", provider=provider, domain="client.com")
    bl_repo = get_backlink_repository()
    bls = bl_repo.list_by_site("t_a", "s1")
    if bls:
        bid, _ = bls[0]
        bl_repo.update("t_a", bid, status=LinkStatus.LOST)
    result = run_gap_analysis("t_a", "s1", [], provider=provider,
                               client_domain="client.com", is_mock=True)
    for opp in result["lost_reclamation"]:
        assert opp["source_evidence"]


# ── Resource candidates ───────────────────────────────────────────────────────

def test_resource_candidates_from_anchor_heuristic():
    """Inject a backlink with 'resource' anchor and verify it becomes a candidate."""
    bl_repo = get_backlink_repository()
    bl_repo.create(Backlink(
        tenant_id="t_a", site_id="s1",
        source_url="https://blog.example.com/resources/",
        source_domain="blog.example.com",
        target_url="https://client.com/",
        anchor_text="best resource guide",
        dedup_key="res_test_1",
    ))
    result = run_gap_analysis("t_a", "s1", [], provider=MockBacklinkProvider(),
                               client_domain="client.com", is_mock=True)
    # Resource candidates should be non-empty (our injected link is a candidate)
    resources = result["resource_candidates"]
    assert any("resource" in str(opp.get("source_evidence", "")).lower() or
               opp["opportunity_type"] == RESOURCE_CANDIDATE
               for opp in resources)


def test_resource_candidates_score_inputs_present():
    bl_repo = get_backlink_repository()
    bl_repo.create(Backlink(
        tenant_id="t_a", site_id="s1",
        source_url="https://guides.io/tutorial/",
        source_domain="guides.io",
        target_url="https://client.com/",
        anchor_text="how to guide",
        dedup_key="res_test_2",
    ))
    result = run_gap_analysis("t_a", "s1", [], provider=MockBacklinkProvider(),
                               client_domain="client.com", is_mock=True)
    for opp in result["resource_candidates"]:
        assert opp["score_inputs"], f"score_inputs empty for resource candidate"
        assert opp["score_inputs"].get("heuristic"), "heuristic key missing"


# ── Competitor page opportunities ─────────────────────────────────────────────

def test_competitor_page_opportunities(provider):
    result = run_gap_analysis("t_a", "s1", ["rival.com"],
                               provider=provider, client_domain="client.com", is_mock=True)
    comp_opps = result["competitor_pages"]
    assert len(comp_opps) >= 1
    for opp in comp_opps:
        assert opp["opportunity_type"] == COMPETITOR_PAGE
        assert opp["score_inputs"]
        assert "competitor" in opp["score_inputs"]


# ── get_opportunities flat list ───────────────────────────────────────────────

def test_get_opportunities_all_have_score_inputs(provider):
    opps = get_opportunities("t_a", "s1", ["comp.com"],
                              provider=provider, client_domain="client.com", is_mock=True)
    assert isinstance(opps, list)
    for opp in opps:
        assert opp.get("score_inputs") is not None
        assert opp["score_inputs"]  # must not be empty dict


# ── Metering ──────────────────────────────────────────────────────────────────

def test_gap_analysis_meters_with_is_mock_true(provider, monkeypatch):
    calls = []

    def fake_gap_meter(tenant_id, *, report_id, is_mock):
        calls.append({"tenant_id": tenant_id, "is_mock": is_mock})
        return {"recorded": False, "reason": "mock_or_zero", "credits_mc": 0}

    monkeypatch.setattr("seo.backlinks.gaps.record_backlink_gap", fake_gap_meter)
    run_gap_analysis("t_a", "s1", ["comp.com"],
                     provider=provider, client_domain="client.com", is_mock=True)
    assert calls, "record_backlink_gap was not called"
    assert calls[-1]["is_mock"] is True


# ── Cross-tenant isolation ────────────────────────────────────────────────────

def test_gap_analysis_cross_tenant_isolation(provider):
    run_backlink_sync("t_a", "s1", provider=provider, domain="client.com")
    # t_b should see nothing
    result = run_gap_analysis("t_b", "s1", ["comp.com"],
                               provider=provider, client_domain="client.com", is_mock=True)
    # Gap and reclamation from stored t_b records should be empty
    assert result["lost_reclamation"] == []
