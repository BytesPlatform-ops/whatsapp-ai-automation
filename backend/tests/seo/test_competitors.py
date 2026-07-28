"""Tests for seo.intelligence.competitors.

All tests are purely in-memory (no network, no paid calls).
"""

import pytest

from seo.intelligence.competitors import (
    competitor_top_pages,
    create_competitor,
    get_competitor,
    keyword_gap,
    keyword_overlap,
    keywords_we_rank_higher,
    keywords_we_rank_lower,
    keywords_only_competitor_ranks_for,
    list_competitors,
    record_snapshot,
    remove_competitor,
    shared_ranking_pages,
    update_competitor,
)
from seo.metering_search import SeoLimitExceeded
from seo.search_stores import (
    Keyword,
    KeywordProject,
    RankSnapshot,
    TrackingStatus,
    get_keyword_repository,
    get_keyword_project_repository,
    get_rank_snapshot_repository,
    reset_repositories,
)
from seo.stores import reset_repositories as reset_stores


TENANT = "test_tenant_comp"
OTHER  = "other_tenant"
PROJECT = "proj_001"


@pytest.fixture(autouse=True)
def clean_repos():
    reset_repositories()
    reset_stores()
    yield
    reset_repositories()
    reset_stores()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _seed_keywords(tenant, project_id, keywords_data):
    """Seed keyword rows and return {keyword_str: (kid, kw)}."""
    repo = get_keyword_repository()
    result = {}
    for kw_str, volume in keywords_data.items():
        kw = Keyword(
            tenant_id=tenant, project_id=project_id, keyword=kw_str,
            search_volume=volume, tracking_status=TrackingStatus.TRACKED,
        )
        kid, saved = repo.create(kw)
        result[kw_str] = (kid, saved)
    return result


def _seed_rank_snapshot(tenant, project_id, keyword_id, keyword, *, our_pos, competitor_positions=None, date="2026-01-15", ranking_url="https://example.com/page1"):
    repo = get_rank_snapshot_repository()
    snap = RankSnapshot(
        tenant_id=tenant, project_id=project_id,
        keyword_id=keyword_id, keyword=keyword,
        date=date, position=our_pos,
        ranking_url=ranking_url,
        competitor_positions=competitor_positions or {},
    )
    return repo.create(snap)


# ── CRUD tests ────────────────────────────────────────────────────────────────

def test_create_competitor_basic():
    cid, comp = create_competitor(
        TENANT, PROJECT, "competitor.com",
        site_id="site_001", display_name="Competitor Inc", country="us"
    )
    assert cid.startswith("comp_")
    assert comp.domain == "competitor.com"
    assert comp.tenant_id == TENANT
    assert comp.project_id == PROJECT
    assert comp.tracking_status == TrackingStatus.TRACKED


def test_list_competitors_by_project():
    create_competitor(TENANT, PROJECT, "a.com")
    create_competitor(TENANT, PROJECT, "b.com")
    create_competitor(TENANT, "other_project", "c.com")

    pairs = list_competitors(TENANT, PROJECT)
    domains = {c.domain for _, c in pairs}
    assert "a.com" in domains
    assert "b.com" in domains
    assert "c.com" not in domains


def test_get_competitor():
    cid, comp = create_competitor(TENANT, PROJECT, "get-test.com")
    result = get_competitor(TENANT, cid)
    assert result is not None
    rid, fetched = result
    assert rid == cid
    assert fetched.domain == "get-test.com"


def test_get_competitor_wrong_tenant_returns_none():
    cid, _ = create_competitor(TENANT, PROJECT, "xcheck.com")
    result = get_competitor(OTHER, cid)
    assert result is None


def test_update_competitor():
    cid, _ = create_competitor(TENANT, PROJECT, "update.com", notes="old")
    result = update_competitor(TENANT, cid, notes="new notes", display_name="Updated")
    assert result is not None
    _, updated = result
    assert updated.notes == "new notes"
    assert updated.display_name == "Updated"


def test_remove_competitor():
    cid, _ = create_competitor(TENANT, PROJECT, "remove.com")
    ok = remove_competitor(TENANT, cid)
    assert ok is True
    assert get_competitor(TENANT, cid) is None


def test_cross_tenant_list_isolation():
    create_competitor(TENANT, PROJECT, "tenant-a.com")
    create_competitor(OTHER, PROJECT, "tenant-b.com")

    pairs_a = list_competitors(TENANT, PROJECT)
    pairs_b = list_competitors(OTHER, PROJECT)
    assert all(c.tenant_id == TENANT for _, c in pairs_a)
    assert all(c.tenant_id == OTHER for _, c in pairs_b)


# ── Plan limit ────────────────────────────────────────────────────────────────

def test_competitor_limit_not_enforced_under_credit_system_off():
    """When credit system is off (default), SeoLimitExceeded is NOT raised."""
    # Create many competitors — limit check passes because BILLING off by default
    for i in range(5):
        create_competitor(TENANT, PROJECT, f"comp{i}.com")
    pairs = list_competitors(TENANT, PROJECT)
    assert len(pairs) == 5


# ── Snapshot ─────────────────────────────────────────────────────────────────

def test_record_snapshot_basic():
    cid, _ = create_competitor(TENANT, PROJECT, "snap.com")
    snap_id, snap = record_snapshot(
        TENANT, cid, PROJECT,
        date="2026-01-10",
        visibility_score=42.5,
        tracked_keywords=100,
        keywords_ranked=80,
        avg_position=12.3,
        top_pages=[{"url": "/page1", "traffic": None}],
        provider="test",
        is_estimate=True,
    )
    assert snap_id.startswith("compsnap_")
    assert snap.is_estimate is True
    assert snap.visibility_score == 42.5


def test_record_snapshot_is_estimate_flag():
    """is_estimate must be set when no real traffic data — test that it propagates."""
    cid, _ = create_competitor(TENANT, PROJECT, "est.com")
    _, snap = record_snapshot(
        TENANT, cid, PROJECT, date="2026-01-10",
        is_estimate=False, provider="real_serp_api",
    )
    assert snap.is_estimate is False


# ── Analysis ─────────────────────────────────────────────────────────────────

def test_keyword_overlap():
    kws = _seed_keywords(TENANT, PROJECT, {"seo tools": 500, "analytics": 300})
    seo_kid, _ = kws["seo tools"]
    ana_kid, _ = kws["analytics"]

    # Our pos 5, competitor at 3 for "seo tools"
    # Our pos 2, no competitor for "analytics"
    _seed_rank_snapshot(TENANT, PROJECT, seo_kid, "seo tools",
                        our_pos=5, competitor_positions={"rival.com": 3})
    _seed_rank_snapshot(TENANT, PROJECT, ana_kid, "analytics",
                        our_pos=2, competitor_positions={})

    overlap = keyword_overlap(TENANT, PROJECT, "rival.com")
    assert len(overlap) == 1
    assert overlap[0]["keyword"] == "seo tools"
    assert overlap[0]["our_position"] == 5
    assert overlap[0]["competitor_position"] == 3


def test_keywords_only_competitor_ranks_for():
    kws = _seed_keywords(TENANT, PROJECT, {"email marketing": 800})
    kid, _ = kws["email marketing"]

    # Competitor has pos, we don't (position=None)
    repo = get_rank_snapshot_repository()
    snap = RankSnapshot(
        tenant_id=TENANT, project_id=PROJECT,
        keyword_id=kid, keyword="email marketing",
        date="2026-01-15", position=None,
        competitor_positions={"rival.com": 7},
    )
    repo.create(snap)

    gaps = keywords_only_competitor_ranks_for(TENANT, PROJECT, "rival.com")
    assert len(gaps) == 1
    assert gaps[0]["keyword"] == "email marketing"
    assert gaps[0]["competitor_position"] == 7


def test_keywords_we_rank_higher():
    kws = _seed_keywords(TENANT, PROJECT, {"content": 200})
    kid, _ = kws["content"]
    _seed_rank_snapshot(TENANT, PROJECT, kid, "content",
                        our_pos=2, competitor_positions={"rival.com": 5})

    result = keywords_we_rank_higher(TENANT, PROJECT, "rival.com")
    assert len(result) == 1
    assert result[0]["our_position"] < result[0]["competitor_position"]


def test_keywords_we_rank_lower():
    kws = _seed_keywords(TENANT, PROJECT, {"backlinks": 600})
    kid, _ = kws["backlinks"]
    _seed_rank_snapshot(TENANT, PROJECT, kid, "backlinks",
                        our_pos=8, competitor_positions={"rival.com": 2})

    result = keywords_we_rank_lower(TENANT, PROJECT, "rival.com")
    assert len(result) == 1
    assert result[0]["our_position"] > result[0]["competitor_position"]


def test_shared_ranking_pages():
    kws = _seed_keywords(TENANT, PROJECT, {"shared page": 400})
    kid, _ = kws["shared page"]
    _seed_rank_snapshot(TENANT, PROJECT, kid, "shared page",
                        our_pos=4, competitor_positions={"rival.com": 6},
                        ranking_url="https://example.com/shared")

    pages = shared_ranking_pages(TENANT, PROJECT, "rival.com")
    assert len(pages) == 1
    assert pages[0]["our_url"] == "https://example.com/shared"


def test_competitor_top_pages_from_snapshot():
    cid, _ = create_competitor(TENANT, PROJECT, "toppage.com")
    top = [{"url": "https://toppage.com/top1", "position": 1}]
    record_snapshot(TENANT, cid, PROJECT, date="2026-01-15", top_pages=top, is_estimate=False)

    pages = competitor_top_pages(TENANT, cid)
    assert len(pages) == 1
    assert pages[0]["url"] == "https://toppage.com/top1"
    assert pages[0]["is_snapshot_data"] is True


def test_competitor_top_pages_no_snapshot():
    cid, _ = create_competitor(TENANT, PROJECT, "empty.com")
    pages = competitor_top_pages(TENANT, cid)
    assert pages == []


def test_keyword_gap_sorted_by_volume():
    kws = _seed_keywords(TENANT, PROJECT, {"big keyword": 5000, "small keyword": 200})
    for kw_str, vol in [("big keyword", 5000), ("small keyword", 200)]:
        kid, _ = kws[kw_str]
        repo = get_rank_snapshot_repository()
        repo.create(RankSnapshot(
            tenant_id=TENANT, project_id=PROJECT,
            keyword_id=kid, keyword=kw_str,
            date="2026-01-15", position=None,
            competitor_positions={"gap.com": 5},
        ))

    gaps = keyword_gap(TENANT, PROJECT, "gap.com", min_volume=0)
    assert len(gaps) == 2
    # Sorted by volume descending
    assert gaps[0]["search_volume"] >= gaps[1]["search_volume"]
    # No fabricated data — all from stored keyword rows
    for gap in gaps:
        assert gap["data_note"] == "position_from_rank_snapshot"


def test_keyword_gap_min_volume_filter():
    kws = _seed_keywords(TENANT, PROJECT, {"tiny kw": 50})
    kid, _ = kws["tiny kw"]
    get_rank_snapshot_repository().create(RankSnapshot(
        tenant_id=TENANT, project_id=PROJECT,
        keyword_id=kid, keyword="tiny kw",
        date="2026-01-15", position=None,
        competitor_positions={"gap.com": 3},
    ))

    gaps = keyword_gap(TENANT, PROJECT, "gap.com", min_volume=100)
    assert len(gaps) == 0  # filtered out by min_volume
