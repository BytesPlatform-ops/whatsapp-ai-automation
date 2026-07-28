"""Tests for local competitor tracking + local opportunity engine.

Tests:
  - Competitor CRUD
  - generate_local_opportunities: score_inputs present, evidence grounded in real data
  - Opportunities use real stored data (never fabricate)
  - Cross-tenant isolation
"""

from __future__ import annotations

import pytest

from seo.local.stores import (
    GbpReview,
    LocalCompetitor,
    Location,
    NapAudit,
    ReplyStatus,
    reset_repositories,
    get_gbp_review_repository,
    get_local_competitor_repository,
    get_local_rank_snapshot_repository,
    get_location_repository,
    get_nap_audit_repository,
    LocalRankSnapshot,
)
from seo.local.competitors import (
    add_competitor,
    delete_competitor,
    generate_local_opportunities,
    get_competitor_rank_comparison,
    list_competitors,
    update_competitor,
)


@pytest.fixture(autouse=True)
def _reset():
    reset_repositories()
    yield
    reset_repositories()


def _create_location(
    tenant: str = "t_comp",
    has_category: bool = False,
    has_local_page: bool = False,
) -> str:
    repo = get_location_repository()
    lid, _ = repo.create(Location(
        tenant_id=tenant,
        business_name="Acme Plumbing",
        city="Springfield",
        website_url="https://acmeplumbing.com",
        primary_category="Plumber" if has_category else "",
        local_page_url="https://acmeplumbing.com/springfield" if has_local_page else "",
        phone="+15551234567",
    ))
    return lid


# ── Competitor CRUD ───────────────────────────────────────────────────────────

def test_add_competitor():
    lid = _create_location()
    cid, comp = add_competitor(
        "t_comp", lid, "Bob's Plumbing",
        domain="bobs-plumbing.com",
        rating=4.2,
        review_count=35,
    )
    assert cid.startswith("lcomp_")
    assert comp.business_name == "Bob's Plumbing"


def test_list_competitors():
    lid = _create_location()
    add_competitor("t_comp", lid, "Competitor A")
    add_competitor("t_comp", lid, "Competitor B")
    rows = list_competitors("t_comp", lid)
    assert len(rows) == 2


def test_update_competitor():
    lid = _create_location()
    cid, _ = add_competitor("t_comp", lid, "Rival Co")
    result = update_competitor("t_comp", cid, rating=4.5, review_count=100)
    assert result is not None
    _, comp = result
    assert comp.rating == 4.5
    assert comp.review_count == 100


def test_delete_competitor():
    lid = _create_location()
    cid, _ = add_competitor("t_comp", lid, "Gone Co")
    deleted = delete_competitor("t_comp", cid)
    assert deleted is True
    rows = list_competitors("t_comp", lid)
    assert not any(i == cid for i, _ in rows)


def test_add_competitor_location_not_found():
    with pytest.raises(ValueError, match="not found"):
        add_competitor("t_comp", "nonexistent_loc", "Rival")


def test_competitor_cross_tenant_isolation():
    lid_a = _create_location("t_a")
    lid_b_repo = get_location_repository()
    lid_b, _ = lid_b_repo.create(Location(tenant_id="t_b", business_name="B"))

    cid_a, _ = add_competitor("t_a", lid_a, "A Rival")
    cid_b, _ = add_competitor("t_b", lid_b, "B Rival")

    comp_repo = get_local_competitor_repository()
    assert comp_repo.get("t_a", cid_b) is None
    assert comp_repo.get("t_b", cid_a) is None


# ── Local opportunity engine ──────────────────────────────────────────────────

def test_opportunities_have_score_inputs():
    """Every opportunity must have score_inputs (never a black box)."""
    lid = _create_location()  # no category, no local page
    opps = generate_local_opportunities("t_comp", lid)
    for opp in opps:
        assert "score_inputs" in opp, (
            f"Opportunity type {opp['opp_type']!r} missing score_inputs"
        )
        assert isinstance(opp["score_inputs"], dict)


def test_opportunities_have_evidence():
    """Every opportunity must have an evidence message."""
    lid = _create_location()
    opps = generate_local_opportunities("t_comp", lid)
    for opp in opps:
        assert "evidence" in opp
        assert opp["evidence"].get("message")


def test_missing_category_opportunity():
    """No primary_category → missing_category opportunity must be generated."""
    lid = _create_location(has_category=False)
    opps = generate_local_opportunities("t_comp", lid)
    opp_types = [o["opp_type"] for o in opps]
    assert "missing_category" in opp_types


def test_no_missing_category_opportunity_when_category_set():
    """When primary_category is set, no missing_category opportunity."""
    lid = _create_location(has_category=True)
    opps = generate_local_opportunities("t_comp", lid)
    opp_types = [o["opp_type"] for o in opps]
    assert "missing_category" not in opp_types


def test_missing_location_page_opportunity():
    """No local_page_url → missing_location_page opportunity."""
    lid = _create_location(has_local_page=False)
    opps = generate_local_opportunities("t_comp", lid)
    opp_types = [o["opp_type"] for o in opps]
    assert "missing_location_page" in opp_types


def test_unanswered_reviews_opportunity():
    """Unanswered negative reviews → weak_review_response opportunity."""
    lid = _create_location()
    rev_repo = get_gbp_review_repository()
    rev_repo.create(GbpReview(
        tenant_id="t_comp", location_id=lid,
        rating=1, review_text="Terrible!", sentiment="negative",
        reply_status=ReplyStatus.NONE, handled=False,
    ))
    rev_repo.create(GbpReview(
        tenant_id="t_comp", location_id=lid,
        rating=2, review_text="Poor service.", sentiment="negative",
        reply_status=ReplyStatus.NONE, handled=False,
    ))

    opps = generate_local_opportunities("t_comp", lid)
    opp_types = [o["opp_type"] for o in opps]
    assert "weak_review_response" in opp_types


def test_nap_inconsistency_opportunity():
    """NAP mismatches → nap_inconsistency opportunity."""
    lid = _create_location()
    nap_repo = get_nap_audit_repository()
    nap_repo.create(NapAudit(
        tenant_id="t_comp", location_id=lid,
        source="citation:Yelp", field="phone",
        canonical_value="+15551234567",
        observed_value="+15559999999",
        mismatch=True,
    ))
    nap_repo.create(NapAudit(
        tenant_id="t_comp", location_id=lid,
        source="citation:Manta", field="name",
        canonical_value="Acme Plumbing",
        observed_value="ACME PLBG.",
        mismatch=True,
    ))

    opps = generate_local_opportunities("t_comp", lid)
    opp_types = [o["opp_type"] for o in opps]
    assert "nap_inconsistency" in opp_types


def test_opportunities_sorted_by_priority():
    """Opportunities must be sorted by priority_score descending."""
    lid = _create_location()
    opps = generate_local_opportunities("t_comp", lid)
    if len(opps) < 2:
        return  # nothing to assert
    scores = [o["priority_score"] for o in opps]
    assert scores == sorted(scores, reverse=True)


def test_opportunities_grounded_in_real_data():
    """Opportunities must reference actual stored data, not fabricated values."""
    lid = _create_location()  # empty location
    opps = generate_local_opportunities("t_comp", lid)

    for opp in opps:
        # Each opp must have source_data referencing the location
        assert opp.get("source_data", {}).get("location_id") == lid, (
            f"Opportunity {opp['opp_type']!r} source_data does not reference location_id"
        )


# ── Competitor rank comparison ─────────────────────────────────────────────────

def test_competitor_rank_comparison_empty():
    lid = _create_location()
    result = get_competitor_rank_comparison("t_comp", lid, "plumber")
    assert result["our_organic_position"] is None
    assert result["competitors"] == {}


def test_competitor_rank_comparison_with_data():
    lid = _create_location()
    snap_repo = get_local_rank_snapshot_repository()
    snap_repo.create(LocalRankSnapshot(
        tenant_id="t_comp", location_id=lid,
        keyword="plumber", date="2026-07-31",
        organic_position=3, local_pack_position=2,
        competitor_positions={"rival.com": 1, "other.com": 5},
    ))

    result = get_competitor_rank_comparison("t_comp", lid, "plumber")
    assert result["our_organic_position"] == 3
    assert result["our_local_pack_position"] == 2
    assert result["competitors"]["rival.com"] == 1
