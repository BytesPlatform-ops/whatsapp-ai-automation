"""Tests for seo.intelligence.opportunities.

Verifies:
  - Each generated opportunity has score_inputs present (explainable score)
  - No fabricated traffic numbers (data comes from seeded repos only)
  - Deduplication of open opportunities
  - Dismiss / action lifecycle
  - Cross-tenant isolation
  - Metering is mock (0 credits) in tests
"""

import pytest

from seo.intelligence.opportunities import (
    action_opportunity,
    dismiss_opportunity,
    explain_opportunity,
    generate_opportunities,
    get_opportunity,
    list_opportunities,
)
from seo.schemas import Severity
from seo.search_stores import (
    GscQueryRow,
    Keyword,
    KeywordCluster,
    OpportunityStatus,
    RankSnapshot,
    SearchIntent,
    TrackingStatus,
    get_gsc_query_row_repository,
    get_keyword_cluster_repository,
    get_keyword_repository,
    get_rank_snapshot_repository,
    reset_repositories,
)
from seo.stores import (
    SeoIssue,
    IssueStatus,
    get_issue_repository,
    reset_repositories as reset_stores,
)

TENANT  = "test_tenant_opp"
OTHER   = "other_tenant_opp"
SITE    = "site_opp_001"
PROJECT = "proj_opp_001"


@pytest.fixture(autouse=True)
def clean():
    reset_repositories()
    reset_stores()
    yield
    reset_repositories()
    reset_stores()


# ── Seed helpers ──────────────────────────────────────────────────────────────

def _seed_gsc_row(tenant, site, *, query, page, impressions, ctr, clicks=10, position=3.5, date="2026-01-10"):
    repo = get_gsc_query_row_repository()
    row = GscQueryRow(
        tenant_id=tenant, property_id="prop1", site_id=site,
        date=date, query=query, page=page,
        clicks=clicks, impressions=impressions, ctr=ctr, position=position,
    )
    return repo.create(row)


def _seed_keyword(tenant, project, keyword, volume=1000):
    repo = get_keyword_repository()
    kw = Keyword(
        tenant_id=tenant, project_id=project, keyword=keyword,
        search_volume=volume, tracking_status=TrackingStatus.TRACKED,
    )
    return repo.create(kw)


def _seed_rank_snap(tenant, project, kid, keyword, *, pos, prev_pos=None, date="2026-01-15", ranking_url="https://ex.com/p", comp_pos=None):
    repo = get_rank_snapshot_repository()
    snap = RankSnapshot(
        tenant_id=tenant, project_id=project,
        keyword_id=kid, keyword=keyword,
        date=date, position=pos, previous_position=prev_pos,
        ranking_url=ranking_url,
        competitor_positions=comp_pos or {},
    )
    return repo.create(snap)


# ── Low CTR opportunities ─────────────────────────────────────────────────────

def test_low_ctr_opportunity_generated():
    _seed_gsc_row(TENANT, SITE, query="best seo tool", page="https://ex.com/seo",
                  impressions=500, ctr=0.01, position=4.2)

    opps = generate_opportunities(TENANT, SITE, PROJECT)
    low_ctr = [o for _, o in opps if o.opp_type == "low_ctr"]
    assert len(low_ctr) >= 1

    opp = low_ctr[0]
    assert opp.keyword == "best seo tool"
    assert opp.priority_score > 0
    # MUST have score_inputs (explainable score)
    assert "impressions" in opp.score_inputs
    assert "ctr" in opp.score_inputs
    assert "ctr_gap_from_threshold" in opp.score_inputs
    # source_data from actual GSC row — no fabrication
    assert opp.source_data["gsc_impressions"] == 500
    assert opp.source_data["gsc_ctr"] == 0.01
    assert opp.evidence["message"] != ""


def test_low_ctr_not_generated_when_impressions_low():
    _seed_gsc_row(TENANT, SITE, query="rare query", page="https://ex.com/rare",
                  impressions=10, ctr=0.005, position=5.0)
    opps = generate_opportunities(TENANT, SITE, PROJECT)
    low_ctr = [o for _, o in opps if o.opp_type == "low_ctr"]
    assert len(low_ctr) == 0


# ── Striking distance ─────────────────────────────────────────────────────────

def test_striking_distance_4_10_generated():
    kid, _ = _seed_keyword(TENANT, PROJECT, "rank tracking", volume=3000)
    _seed_rank_snap(TENANT, PROJECT, kid, "rank tracking", pos=6)

    opps = generate_opportunities(TENANT, SITE, PROJECT)
    sd = [o for _, o in opps if o.opp_type == "striking_distance_4"]
    assert len(sd) >= 1
    assert sd[0].score_inputs["position"] == 6
    assert "position_gap_to_top10" in sd[0].score_inputs
    assert sd[0].priority_score > 0


def test_striking_distance_11_20_generated():
    kid, _ = _seed_keyword(TENANT, PROJECT, "link building", volume=2000)
    _seed_rank_snap(TENANT, PROJECT, kid, "link building", pos=15)

    opps = generate_opportunities(TENANT, SITE, PROJECT)
    sd11 = [o for _, o in opps if o.opp_type == "striking_distance_11"]
    assert len(sd11) >= 1
    assert sd11[0].score_inputs["position"] == 15


def test_no_striking_distance_for_pos_1_3():
    kid, _ = _seed_keyword(TENANT, PROJECT, "top keyword", volume=5000)
    _seed_rank_snap(TENANT, PROJECT, kid, "top keyword", pos=2)

    opps = generate_opportunities(TENANT, SITE, PROJECT)
    sd = [o for _, o in opps if "striking_distance" in o.opp_type]
    assert len(sd) == 0


# ── Declining / lost keywords ────────────────────────────────────────────────

def test_declining_keyword_opportunity():
    kid, _ = _seed_keyword(TENANT, PROJECT, "declining kw", volume=1500)
    # Two snapshots showing a drop
    repo = get_rank_snapshot_repository()
    repo.create(RankSnapshot(
        tenant_id=TENANT, project_id=PROJECT, keyword_id=kid, keyword="declining kw",
        date="2026-01-01", position=5, ranking_url="https://ex.com/d",
    ))
    repo.create(RankSnapshot(
        tenant_id=TENANT, project_id=PROJECT, keyword_id=kid, keyword="declining kw",
        date="2026-01-15", position=12, ranking_url="https://ex.com/d",
    ))

    opps = generate_opportunities(TENANT, SITE, PROJECT)
    declining = [o for _, o in opps if o.opp_type == "declining_keyword"]
    assert len(declining) >= 1
    assert declining[0].score_inputs["position_drop"] == 7
    assert declining[0].source_data["drop"] == 7


def test_lost_keyword_opportunity():
    kid, _ = _seed_keyword(TENANT, PROJECT, "lost kw", volume=800)
    repo = get_rank_snapshot_repository()
    repo.create(RankSnapshot(
        tenant_id=TENANT, project_id=PROJECT, keyword_id=kid, keyword="lost kw",
        date="2026-01-01", position=8, ranking_url="https://ex.com/lost",
    ))
    repo.create(RankSnapshot(
        tenant_id=TENANT, project_id=PROJECT, keyword_id=kid, keyword="lost kw",
        date="2026-01-15", position=None,  # no longer ranking
    ))

    opps = generate_opportunities(TENANT, SITE, PROJECT)
    lost = [o for _, o in opps if o.opp_type == "lost_keyword"]
    assert len(lost) >= 1


# ── Content gap ───────────────────────────────────────────────────────────────

def test_content_gap_generated_for_keyword_without_ranking():
    kid, _ = _seed_keyword(TENANT, PROJECT, "gap keyword", volume=2000)
    # No rank snapshot → no ranking URL

    opps = generate_opportunities(TENANT, SITE, PROJECT)
    gaps = [o for _, o in opps if o.opp_type == "content_gap"]
    assert len(gaps) >= 1
    gap = gaps[0]
    assert gap.score_inputs["search_volume"] == 2000
    assert gap.source_data["search_volume"] == 2000
    # No fabricated numbers — volume comes from keyword row
    assert gap.source_data.get("search_volume") is not None


def test_content_gap_not_generated_without_volume():
    kid, _ = _seed_keyword(TENANT, PROJECT, "no-volume kw", volume=None)
    opps = generate_opportunities(TENANT, SITE, PROJECT)
    gaps = [o for _, o in opps if o.opp_type == "content_gap"]
    assert len(gaps) == 0


# ── Missing cluster page ──────────────────────────────────────────────────────

def test_missing_cluster_page_generated():
    kid, _ = _seed_keyword(TENANT, PROJECT, "cluster kw", volume=1200)
    cluster_repo = get_keyword_cluster_repository()
    cluster = KeywordCluster(
        tenant_id=TENANT, project_id=PROJECT,
        name="Main Cluster", primary_keyword="cluster kw",
        target_url="",  # no target URL
        keyword_ids=[kid[0] if isinstance(kid, tuple) else kid],
    )
    # kid is (id_str, obj) from _seed_keyword
    kid_id, _ = kid if isinstance(kid, tuple) else (kid, None)
    cluster.keyword_ids = [kid_id]
    cid, _ = cluster_repo.create(cluster)

    opps = generate_opportunities(TENANT, SITE, PROJECT)
    mc = [o for _, o in opps if o.opp_type == "missing_cluster_page"]
    assert len(mc) >= 1


# ── Technical on value page ───────────────────────────────────────────────────

def test_technical_on_value_page_generated():
    # Seed high-impression GSC row for a page
    _seed_gsc_row(TENANT, SITE, query="critical page kw", page="https://ex.com/critical",
                  impressions=300, ctr=0.05, position=3.0)

    # Seed a critical issue on a page with the same page_id
    issue_repo = get_issue_repository()
    issue = SeoIssue(
        tenant_id=TENANT, site_id=SITE, crawl_job_id="job1",
        page_id="https://ex.com/critical",  # matches GSC page URL
        rule_key="missing_title",
        category="on_page",
        severity=Severity.CRITICAL,
        status=IssueStatus.OPEN,
        recommendation="Add a title tag.",
    )
    issue_repo.create(issue)

    opps = generate_opportunities(TENANT, SITE, PROJECT)
    tech = [o for _, o in opps if o.opp_type == "technical_on_value"]
    assert len(tech) >= 1
    t = tech[0]
    assert t.score_inputs["severity"] == "critical"
    assert t.score_inputs["severity_weight"] == 1.0
    assert t.priority_score > 0


# ── Explainability guarantee ──────────────────────────────────────────────────

def test_all_opportunities_have_score_inputs_and_evidence():
    """Every generated opportunity MUST have score_inputs and evidence populated."""
    _seed_gsc_row(TENANT, SITE, query="test kw", page="https://ex.com/t",
                  impressions=200, ctr=0.01)
    kid, _ = _seed_keyword(TENANT, PROJECT, "striking kw", volume=4000)
    _seed_rank_snap(TENANT, PROJECT, kid, "striking kw", pos=7)

    opps = generate_opportunities(TENANT, SITE, PROJECT)
    assert len(opps) > 0

    for oid, opp in opps:
        assert opp.score_inputs, f"opportunity {oid} ({opp.opp_type}) has empty score_inputs"
        assert opp.evidence, f"opportunity {oid} ({opp.opp_type}) has empty evidence"
        assert opp.priority_score >= 0.0


# ── Deduplication ─────────────────────────────────────────────────────────────

def test_deduplication_prevents_duplicate_open_opportunities():
    _seed_gsc_row(TENANT, SITE, query="dedup kw", page="https://ex.com/dedup",
                  impressions=500, ctr=0.01)

    first_run = generate_opportunities(TENANT, SITE, PROJECT)
    second_run = generate_opportunities(TENANT, SITE, PROJECT)

    # Second run should not create any new low_ctr opps for the same keyword+page
    first_count = sum(1 for _, o in first_run if o.opp_type == "low_ctr" and o.keyword == "dedup kw")
    second_count = sum(1 for _, o in second_run if o.opp_type == "low_ctr" and o.keyword == "dedup kw")
    assert first_count >= 1
    assert second_count == 0


# ── Lifecycle ─────────────────────────────────────────────────────────────────

def test_dismiss_opportunity():
    _seed_gsc_row(TENANT, SITE, query="dismiss kw", page="https://ex.com/dis",
                  impressions=300, ctr=0.015)
    opps = generate_opportunities(TENANT, SITE, PROJECT)
    oid, opp = opps[0]

    result = dismiss_opportunity(TENANT, oid)
    assert result is not None
    _, updated = result
    assert updated.status == OpportunityStatus.DISMISSED


def test_action_opportunity():
    _seed_gsc_row(TENANT, SITE, query="action kw", page="https://ex.com/act",
                  impressions=400, ctr=0.01)
    opps = generate_opportunities(TENANT, SITE, PROJECT)
    oid, _ = opps[0]

    result = action_opportunity(TENANT, oid)
    assert result is not None
    _, updated = result
    assert updated.status == OpportunityStatus.ACTIONED


# ── Cross-tenant isolation ────────────────────────────────────────────────────

def test_cross_tenant_list_isolation():
    _seed_gsc_row(TENANT, SITE, query="tenant kw", page="https://ex.com/t",
                  impressions=200, ctr=0.01)
    generate_opportunities(TENANT, SITE, PROJECT)

    # Other tenant sees no opportunities
    other_opps = list_opportunities(OTHER)
    assert len(other_opps) == 0


def test_cross_tenant_get_returns_none():
    _seed_gsc_row(TENANT, SITE, query="iso kw", page="https://ex.com/iso",
                  impressions=200, ctr=0.01)
    opps = generate_opportunities(TENANT, SITE, PROJECT)
    oid, _ = opps[0]

    result = get_opportunity(OTHER, oid)
    assert result is None


# ── AI explain (metering is mock in tests) ────────────────────────────────────

def test_explain_opportunity_mock_deterministic():
    _seed_gsc_row(TENANT, SITE, query="explain kw", page="https://ex.com/ex",
                  impressions=300, ctr=0.01)
    opps = generate_opportunities(TENANT, SITE, PROJECT)
    oid, _ = opps[0]

    result = explain_opportunity(TENANT, oid, is_mock=True)
    assert result["is_mock"] is True
    assert "explanation" in result
    assert result["explanation"] != ""
    # Metering should be recorded as mock/no-op
    assert result["metering"]["credits_mc"] == 0
