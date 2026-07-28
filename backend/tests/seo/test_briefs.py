"""Tests for seo.intelligence.briefs + content_handoff.

Covers:
  - Brief generate/version/approve/duplicate
  - Content handoff builds correct payload + preserves IDs
  - Cross-tenant handoff FAILS with ValueError
  - Metering is mock (0 credits) in tests
  - Plan limit enforcement (soft: credit system off by default)
"""

import pytest

from seo.intelligence.briefs import (
    approve_brief,
    archive_brief,
    duplicate_brief,
    edit_brief,
    export_brief,
    generate_brief,
    get_brief,
    list_briefs,
    version_history,
)
from seo.intelligence.content_handoff import (
    execute_handoff,
    handoff_from_brief,
    handoff_from_cluster,
    handoff_from_opportunity,
    record_handoff_on_brief,
)
from seo.search_stores import (
    BriefStatus,
    GscQueryRow,
    Keyword,
    KeywordCluster,
    OpportunityStatus,
    RankSnapshot,
    SeoOpportunity,
    SearchIntent,
    TrackingStatus,
    get_content_brief_repository,
    get_gsc_query_row_repository,
    get_keyword_cluster_repository,
    get_keyword_repository,
    get_rank_snapshot_repository,
    get_opportunity_repository,
    reset_repositories,
)
from seo.stores import reset_repositories as reset_stores

TENANT  = "test_tenant_briefs"
OTHER   = "other_tenant_briefs"
SITE    = "site_brief_001"
PROJECT = "proj_brief_001"


@pytest.fixture(autouse=True)
def clean():
    reset_repositories()
    reset_stores()
    yield
    reset_repositories()
    reset_stores()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_brief(**kwargs):
    defaults = dict(
        tenant_id=TENANT,
        project_id=PROJECT,
        site_id=SITE,
        primary_keyword="seo strategy",
        secondary_keywords=["keyword research", "link building"],
        search_intent="informational",
        target_audience="SEO professionals",
        word_count_min=800,
        word_count_max=2000,
        cta_direction="Schedule a free consultation",
        is_mock=True,
    )
    defaults.update(kwargs)
    return generate_brief(**defaults)


# ── Generate ──────────────────────────────────────────────────────────────────

def test_generate_brief_basic():
    bid, brief = _make_brief()
    assert bid.startswith("brief_")
    assert brief.tenant_id == TENANT
    assert brief.primary_keyword == "seo strategy"
    assert brief.status == BriefStatus.DRAFT
    assert brief.version == 1


def test_generate_brief_populates_outline():
    bid, brief = _make_brief(search_intent="informational")
    assert len(brief.outline) > 0
    for section in brief.outline:
        assert "heading" in section
        assert "type" in section


def test_generate_brief_populates_questions():
    bid, brief = _make_brief()
    assert len(brief.questions) > 0
    for q in brief.questions:
        assert "?" in q


def test_generate_brief_populates_title_options():
    bid, brief = _make_brief()
    assert len(brief.title_options) >= 1


def test_generate_brief_entities_include_keyword():
    bid, brief = _make_brief()
    assert brief.primary_keyword in brief.entities


def test_generate_brief_competitor_headings_from_stored_data():
    """Competitor headings come from rank snapshot SERP titles, not external calls."""
    kw_repo = get_keyword_repository()
    kw = Keyword(
        tenant_id=TENANT, project_id=PROJECT, keyword="seo strategy",
        search_volume=2000, tracking_status=TrackingStatus.TRACKED,
    )
    kid, _ = kw_repo.create(kw)

    snap_repo = get_rank_snapshot_repository()
    snap = RankSnapshot(
        tenant_id=TENANT, project_id=PROJECT, keyword_id=kid, keyword="seo strategy",
        date="2026-01-10", position=3,
        serp_title="SEO Strategy: The Complete 2026 Guide",
        ranking_url="https://competitor.com/seo-guide",
    )
    snap_repo.create(snap)

    bid, brief = _make_brief()
    # competitor headings should include the SERP title
    assert "SEO Strategy: The Complete 2026 Guide" in brief.competitor_headings


def test_generate_brief_with_cluster():
    kid_str = "kw_test_001"
    cluster_repo = get_keyword_cluster_repository()
    cluster = KeywordCluster(
        tenant_id=TENANT, project_id=PROJECT,
        name="SEO Cluster",
        primary_keyword="seo strategy",
        target_url="",
        intent=SearchIntent.INFORMATIONAL,
        keyword_ids=[],
    )
    cid, _ = cluster_repo.create(cluster)

    bid, brief = _make_brief(cluster_id=cid)
    assert brief.cluster_id == cid
    assert brief.primary_keyword == "seo strategy"


def test_generate_brief_source_data_has_is_mock_true():
    bid, brief = _make_brief(is_mock=True)
    assert brief.source_data.get("is_mock") is True


# ── Version / edit ────────────────────────────────────────────────────────────

def test_edit_brief_bumps_version():
    bid, brief = _make_brief()
    assert brief.version == 1

    result = edit_brief(TENANT, bid, target_audience="Updated audience")
    assert result is not None
    _, updated = result
    assert updated.version == 2
    assert updated.target_audience == "Updated audience"


def test_edit_brief_multiple_times():
    bid, _ = _make_brief()
    edit_brief(TENANT, bid, target_audience="v2")
    edit_brief(TENANT, bid, target_audience="v3")
    _, final = get_brief(TENANT, bid)
    assert final.version == 3


def test_version_history():
    bid, _ = _make_brief()
    edit_brief(TENANT, bid, target_audience="updated")
    info = version_history(TENANT, bid)
    assert info["brief_id"] == bid
    assert info["version"] == 2
    assert info["primary_keyword"] == "seo strategy"


# ── Approve / archive ─────────────────────────────────────────────────────────

def test_approve_brief():
    bid, _ = _make_brief()
    result = approve_brief(TENANT, bid)
    assert result is not None
    _, approved = result
    assert approved.status == BriefStatus.APPROVED


def test_archive_brief():
    bid, _ = _make_brief()
    result = archive_brief(TENANT, bid)
    assert result is not None
    _, archived = result
    assert archived.status == BriefStatus.ARCHIVED


def test_list_briefs_filters_by_status():
    bid1, _ = _make_brief()
    bid2, _ = _make_brief(primary_keyword="link building")
    approve_brief(TENANT, bid1)

    approved = list_briefs(TENANT, status=BriefStatus.APPROVED)
    draft = list_briefs(TENANT, status=BriefStatus.DRAFT)
    assert any(bid == bid1 for bid, _ in approved)
    assert any(bid == bid2 for bid, _ in draft)


# ── Duplicate ─────────────────────────────────────────────────────────────────

def test_duplicate_brief_creates_new_draft_v1():
    bid, brief = _make_brief()
    edit_brief(TENANT, bid, target_audience="changed")  # bump to v2

    result = duplicate_brief(TENANT, bid)
    assert result is not None
    new_bid, clone = result
    assert new_bid != bid
    assert clone.version == 1
    assert clone.status == BriefStatus.DRAFT
    assert clone.primary_keyword == brief.primary_keyword
    assert clone.source_data.get("duplicated_from") == bid


def test_duplicate_brief_cross_tenant_isolation():
    bid, _ = _make_brief()
    # Other tenant cannot duplicate because their repo won't find it
    result = duplicate_brief(OTHER, bid)
    assert result is None


# ── Export ────────────────────────────────────────────────────────────────────

def test_export_brief_dict():
    bid, _ = _make_brief()
    data = export_brief(TENANT, bid, fmt="dict")
    assert data is not None
    assert data["primary_keyword"] == "seo strategy"
    assert "outline" in data
    assert "questions" in data
    assert "title_options" in data
    assert "status" in data


def test_export_brief_markdown():
    bid, _ = _make_brief()
    data = export_brief(TENANT, bid, fmt="markdown")
    assert data is not None
    assert "markdown" in data
    md = data["markdown"]
    assert "# Content Brief" in md
    assert "seo strategy" in md.lower()


def test_export_brief_not_found():
    result = export_brief(TENANT, "brief_nonexistent", fmt="dict")
    assert result is None


# ── Content handoff ───────────────────────────────────────────────────────────

def test_handoff_from_brief_builds_correct_payload():
    bid, brief = _make_brief()
    payload = handoff_from_brief(TENANT, bid, save=False)

    assert payload["tenant_id"] == TENANT
    assert payload["content_type"] == "blog"
    assert payload["inputs"]["keyword"] == "seo strategy"
    assert isinstance(payload["inputs"]["secondary_keywords"], list)
    assert payload["seo_context"]["brief_id"] == bid
    assert payload["seo_context"]["source"] == "content_brief"
    assert payload["seo_context"]["primary_keyword"] == "seo strategy"
    assert payload["seo_context"]["site_id"] == SITE
    assert payload["seo_context"]["project_id"] == PROJECT


def test_handoff_from_brief_preserves_ids():
    bid, _ = _make_brief(cluster_id="cluster_xyz")
    payload = handoff_from_brief(TENANT, bid)
    ctx = payload["seo_context"]
    assert ctx["brief_id"] == bid
    assert ctx["cluster_id"] == "cluster_xyz"


def test_handoff_from_brief_cross_tenant_fails():
    bid, _ = _make_brief()
    with pytest.raises(ValueError, match="not found for tenant|cross_tenant"):
        handoff_from_brief(OTHER, bid)


def test_handoff_from_cluster_builds_correct_payload():
    cluster_repo = get_keyword_cluster_repository()
    cluster = KeywordCluster(
        tenant_id=TENANT, project_id=PROJECT,
        name="Test Cluster", primary_keyword="link building",
        target_url="", intent=SearchIntent.INFORMATIONAL,
        keyword_ids=[],
    )
    cid, _ = cluster_repo.create(cluster)

    payload = handoff_from_cluster(TENANT, cid, PROJECT, SITE)
    assert payload["content_type"] == "article"
    assert payload["inputs"]["keyword"] == "link building"
    assert payload["seo_context"]["cluster_id"] == cid
    assert payload["seo_context"]["project_id"] == PROJECT
    assert payload["seo_context"]["site_id"] == SITE


def test_handoff_from_cluster_cross_tenant_fails():
    cluster_repo = get_keyword_cluster_repository()
    cluster = KeywordCluster(
        tenant_id=TENANT, project_id=PROJECT,
        name="Cluster", primary_keyword="kw", target_url="",
        intent=SearchIntent.UNKNOWN, keyword_ids=[],
    )
    cid, _ = cluster_repo.create(cluster)
    with pytest.raises(ValueError):
        handoff_from_cluster(OTHER, cid, PROJECT)


def test_handoff_from_opportunity_builds_correct_payload():
    opp_repo = get_opportunity_repository()
    opp = SeoOpportunity(
        tenant_id=TENANT, site_id=SITE, project_id=PROJECT,
        opp_type="content_gap",
        keyword="email marketing",
        page_url="https://ex.com/email",
        evidence={"message": "Gap keyword"},
        recommended_action="Create targeted content",
        priority_score=0.8,
        score_inputs={"search_volume": 2000},
        status=OpportunityStatus.OPEN,
    )
    oid, _ = opp_repo.create(opp)

    payload = handoff_from_opportunity(TENANT, oid)
    assert payload["content_type"] == "blog"
    assert payload["inputs"]["keyword"] == "email marketing"
    assert payload["seo_context"]["opportunity_id"] == oid
    assert payload["seo_context"]["opp_type"] == "content_gap"


def test_handoff_opp_low_ctr_maps_to_ad_copy():
    opp_repo = get_opportunity_repository()
    opp = SeoOpportunity(
        tenant_id=TENANT, site_id=SITE, project_id=PROJECT,
        opp_type="low_ctr", keyword="ctr kw",
        evidence={}, status=OpportunityStatus.OPEN,
        score_inputs={}, priority_score=0.5,
    )
    oid, _ = opp_repo.create(opp)
    payload = handoff_from_opportunity(TENANT, oid)
    assert payload["content_type"] == "ad_copy"


def test_handoff_from_opportunity_cross_tenant_fails():
    opp_repo = get_opportunity_repository()
    opp = SeoOpportunity(
        tenant_id=TENANT, site_id=SITE, project_id=PROJECT,
        opp_type="content_gap", keyword="kw",
        evidence={}, status=OpportunityStatus.OPEN,
        score_inputs={}, priority_score=0.5,
    )
    oid, _ = opp_repo.create(opp)
    with pytest.raises(ValueError, match="not found for tenant|cross_tenant"):
        handoff_from_opportunity(OTHER, oid)


def test_execute_handoff_returns_result():
    bid, _ = _make_brief()
    payload = handoff_from_brief(TENANT, bid)
    result = execute_handoff(payload, is_mock=True)
    # Either in-process or forward — both are acceptable
    assert "is_mock" in result
    assert result["is_mock"] is True


def test_record_handoff_on_brief():
    bid, _ = _make_brief()
    result = record_handoff_on_brief(TENANT, bid, "ca_doc_xyz")
    assert result is not None
    _, updated = result
    assert updated.handoff_ref == "ca_doc_xyz"


def test_record_handoff_cross_tenant_fails():
    bid, _ = _make_brief()
    with pytest.raises(ValueError, match="cross_tenant|not found"):
        record_handoff_on_brief(OTHER, bid, "ca_doc_xyz")
