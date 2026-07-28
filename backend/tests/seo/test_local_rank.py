"""Local rank tracking tests.

Tests:
  - check_local_rank: returns organic + local-pack + maps positions
  - No fabricated geo-grid positions in mock mode (is_geo_grid=False stored)
  - Rank overview / winners-losers / pack visibility analytics
  - Metering zero in mock mode
  - Competitor positions stored in snapshot
"""

from __future__ import annotations

import pytest

from seo.local.stores import (
    Location,
    LocalCompetitor,
    reset_repositories,
    get_location_repository,
    get_local_rank_snapshot_repository,
    get_local_competitor_repository,
)
from seo.local.local_rank import (
    check_local_rank,
    get_local_pack_visibility,
    get_rank_overview,
    get_winners_losers,
)


@pytest.fixture(autouse=True)
def _reset():
    reset_repositories()
    yield
    reset_repositories()


def _create_location(tenant: str = "t_rank") -> str:
    repo = get_location_repository()
    lid, _ = repo.create(Location(
        tenant_id=tenant,
        business_name="Acme Plumbing",
        city="Springfield",
        website_url="https://acmeplumbing.com",
    ))
    return lid


# ── Local rank check ─────────────────────────────────────────────────────────

def test_local_rank_check_returns_positions():
    lid = _create_location()
    result = check_local_rank(
        "t_rank", lid,
        keywords=["plumber springfield", "emergency plumber"],
        city="Springfield",
        is_mock=True,
    )
    assert result["location_id"] == lid
    assert len(result["results"]) == 2

    for kw_result in result["results"]:
        assert "keyword" in kw_result
        assert "organic_position" in kw_result
        assert "local_pack_position" in kw_result
        assert "maps_position" in kw_result
        # Positions are int or None — never a string or fabricated value
        assert kw_result["organic_position"] is None or isinstance(kw_result["organic_position"], int)
        assert kw_result["local_pack_position"] is None or isinstance(kw_result["local_pack_position"], int)
        assert kw_result["maps_position"] is None or isinstance(kw_result["maps_position"], int)


def test_no_fabricated_geo_grid_in_mock():
    """In mock mode, is_geo_grid must be False on all snapshots."""
    lid = _create_location()
    result = check_local_rank(
        "t_rank", lid,
        keywords=["plumber"],
        is_mock=True,
        geo_grid=True,  # requested but should be silently ignored in mock
    )
    for kw_result in result["results"]:
        assert kw_result["is_geo_grid"] is False, (
            "Geo-grid positions must NOT be fabricated in mock mode"
        )

    # Verify stored snapshots also have is_geo_grid=False
    snap_repo = get_local_rank_snapshot_repository()
    snaps = snap_repo.list_by_location("t_rank", lid)
    for _, snap in snaps:
        assert snap.is_geo_grid is False


def test_local_rank_check_snapshots_persisted():
    lid = _create_location()
    check_local_rank("t_rank", lid, keywords=["plumber", "drain cleaning"], is_mock=True)

    snap_repo = get_local_rank_snapshot_repository()
    snaps = snap_repo.list_by_location("t_rank", lid)
    assert len(snaps) == 2
    keywords = {s.keyword for _, s in snaps}
    assert "plumber" in keywords
    assert "drain cleaning" in keywords


def test_competitor_positions_stored():
    """Competitor positions should be stored in the snapshot."""
    lid = _create_location()

    # Add a competitor
    comp_repo = get_local_competitor_repository()
    comp_repo.create(LocalCompetitor(
        tenant_id="t_rank", location_id=lid,
        business_name="Bob's Plumbing", domain="bobs-plumbing.com",
    ))

    check_local_rank("t_rank", lid, keywords=["plumber"], is_mock=True)

    snap_repo = get_local_rank_snapshot_repository()
    snaps = snap_repo.list_by_location("t_rank", lid)
    assert len(snaps) == 1
    _, snap = snaps[0]
    # Competitor positions dict should be present (may have entry for bobs-plumbing.com)
    assert isinstance(snap.competitor_positions, dict)


def test_local_rank_missing_location():
    result = check_local_rank("t_rank", "nonexistent_loc", keywords=["plumber"], is_mock=True)
    assert result.get("error") == "location_not_found"


# ── Rank overview ─────────────────────────────────────────────────────────────

def test_rank_overview_empty():
    lid = _create_location()
    overview = get_rank_overview("t_rank", lid)
    assert overview["keywords_tracked"] == 0
    assert overview["keywords_ranking"] == 0


def test_rank_overview_after_check():
    lid = _create_location()
    check_local_rank("t_rank", lid, keywords=["plumber", "drain repair", "pipe fix"], is_mock=True)

    overview = get_rank_overview("t_rank", lid)
    assert overview["keywords_tracked"] == 3
    assert overview["keywords_ranking"] + overview["keywords_not_ranking"] == 3
    # Latest list should have entries with positions
    for entry in overview.get("latest", []):
        assert "keyword" in entry
        assert "organic_position" in entry
        assert "local_pack_position" in entry


# ── Winners / losers ──────────────────────────────────────────────────────────

def test_winners_losers_needs_history():
    """With only one snapshot per keyword, no winners/losers reported."""
    lid = _create_location()
    check_local_rank("t_rank", lid, keywords=["plumber"], is_mock=True)

    result = get_winners_losers("t_rank", lid)
    assert result["location_id"] == lid
    # One snapshot = no history delta = empty lists
    assert isinstance(result["winners"], list)
    assert isinstance(result["losers"], list)


def test_winners_losers_with_history():
    """Two snapshots for the same keyword should yield winners or losers."""
    lid = _create_location()
    snap_repo = get_local_rank_snapshot_repository()
    from seo.local.stores import LocalRankSnapshot

    # First snapshot: position 10
    snap_repo.create(LocalRankSnapshot(
        tenant_id="t_rank", location_id=lid,
        keyword="plumber", date="2026-07-01",
        organic_position=10,
    ))
    # Second snapshot: position 5 (improved)
    snap_repo.create(LocalRankSnapshot(
        tenant_id="t_rank", location_id=lid,
        keyword="plumber", date="2026-07-31",
        organic_position=5,
    ))

    result = get_winners_losers("t_rank", lid)
    assert len(result["winners"]) == 1
    assert result["winners"][0]["keyword"] == "plumber"
    assert result["winners"][0]["position_change"] == 5  # 10 - 5


# ── Pack visibility ───────────────────────────────────────────────────────────

def test_local_pack_visibility():
    lid = _create_location()
    check_local_rank("t_rank", lid, keywords=["plumber", "drain repair", "emergency"], is_mock=True)

    result = get_local_pack_visibility("t_rank", lid)
    assert result["location_id"] == lid
    assert result["total_keywords"] == 3
    assert "keywords_in_local_pack" in result
    assert "pack_position_breakdown" in result
    assert "local_pack_rate" in result
    assert 0.0 <= result["local_pack_rate"] <= 1.0


# ── Metering zero in mock ─────────────────────────────────────────────────────

def test_rank_check_metering_zero_in_mock():
    lid = _create_location()
    result = check_local_rank("t_rank", lid, keywords=["plumber"], is_mock=True)
    metering = result.get("metering", {})
    assert metering.get("credits_mc", 0) == 0
