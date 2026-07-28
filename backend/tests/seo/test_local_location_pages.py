"""Tests for location-page opportunities + Content Agent handoff.

Tests:
  - generate_location_page_opportunities: grounded in service_areas
  - Anti-doorway guardrails: unique_content_requirements present + doorway_risk=False
  - Max 20 service-area targets
  - handoff_location_page_to_content: correct payload shape, forward_to, doorway note
  - Cross-tenant isolation
"""

from __future__ import annotations

import pytest

from seo.local.stores import (
    Location,
    LocalRankSnapshot,
    reset_repositories,
    get_location_repository,
    get_local_rank_snapshot_repository,
)
from seo.local.location_pages import (
    generate_location_page_opportunities,
    handoff_location_page_to_content,
)


@pytest.fixture(autouse=True)
def _reset():
    reset_repositories()
    yield
    reset_repositories()


def _create_location(
    tenant: str = "t_pages",
    service_areas: list[str] | None = None,
    has_local_page: bool = False,
    primary_category: str = "Plumber",
) -> str:
    repo = get_location_repository()
    lid, _ = repo.create(Location(
        tenant_id=tenant,
        business_name="Acme Plumbing",
        city="Springfield",
        region="IL",
        website_url="https://acmeplumbing.com",
        primary_category=primary_category,
        service_areas=service_areas or ["Springfield", "Decatur", "Bloomington"],
        local_page_url="https://acmeplumbing.com/springfield" if has_local_page else "",
    ))
    return lid


# ── Opportunity generation ────────────────────────────────────────────────────

def test_opportunities_grounded_in_service_areas():
    """Opportunities must be derived from actual service_areas."""
    lid = _create_location(service_areas=["Springfield", "Decatur"])
    opps = generate_location_page_opportunities("t_pages", lid)
    # All target_city values in opportunities must come from service_areas
    for opp in opps:
        assert opp["target_city"] in {"Springfield", "Decatur"}


def test_no_opportunities_when_no_service_areas():
    """No service_areas and no city → no location-page opportunities."""
    repo = get_location_repository()
    lid, _ = repo.create(Location(
        tenant_id="t_pages",
        business_name="No-Area Co",
        # deliberately no city or service_areas
    ))
    opps = generate_location_page_opportunities("t_pages", lid)
    assert opps == []


def test_max_twenty_service_area_targets():
    """Generator must cap at 20 targets even with >20 service areas."""
    areas = [f"City{i}" for i in range(30)]
    lid = _create_location(service_areas=areas)
    opps = generate_location_page_opportunities("t_pages", lid)
    assert len(opps) <= 20


def test_missing_location_page_generates_opportunity():
    """When local_page_url is empty, a missing_location_page opportunity is generated."""
    lid = _create_location(service_areas=["Springfield"], has_local_page=False)
    opps = generate_location_page_opportunities("t_pages", lid)
    assert len(opps) >= 1
    for opp in opps:
        assert opp["opp_type"] in ("missing_location_page", "existing_location_page")
    # At least one should be "missing" since no local page exists
    missing = [o for o in opps if o["opp_type"] == "missing_location_page"]
    assert len(missing) >= 1


# ── Anti-doorway guardrails ───────────────────────────────────────────────────

def test_anti_doorway_unique_content_requirements():
    """Every opportunity must include unique_content_requirements."""
    lid = _create_location()
    opps = generate_location_page_opportunities("t_pages", lid)
    for opp in opps:
        assert "unique_content_requirements" in opp, (
            f"Opportunity missing unique_content_requirements: {opp.get('target_city')}"
        )
        reqs = opp["unique_content_requirements"]
        assert isinstance(reqs, list)
        assert len(reqs) >= 1, "Must have at least one unique content requirement"


def test_anti_doorway_risk_always_false():
    """doorway_risk must always be False — we never generate thin/templated pages."""
    lid = _create_location()
    opps = generate_location_page_opportunities("t_pages", lid)
    for opp in opps:
        assert opp.get("doorway_risk") is False, (
            f"doorway_risk should never be True; got: {opp.get('doorway_risk')!r}"
        )


def test_unique_content_requirements_mention_local_detail():
    """Anti-doorway requirements must reference local/unique content, not generic."""
    lid = _create_location()
    opps = generate_location_page_opportunities("t_pages", lid)
    for opp in opps:
        # At least one requirement should mention city or local-specific angle
        all_text = " ".join(opp.get("unique_content_requirements", [])).lower()
        has_local = any(word in all_text for word in [
            "local", "city", "area", "specific", "unique", "community",
            "neighborhood", opp["target_city"].lower()
        ])
        assert has_local, (
            f"unique_content_requirements for {opp['target_city']} must mention local/city specifics"
        )


def test_no_template_only_content_warning():
    """Opportunities must include a note warning against templated content."""
    lid = _create_location()
    opps = generate_location_page_opportunities("t_pages", lid)
    for opp in opps:
        # Should have a recommended_action that discourages templated pages
        ra = opp.get("recommended_action", "").lower()
        note = opp.get("anti_doorway_note", "").lower()
        any_text = ra + " " + note
        has_warning = any(word in any_text for word in [
            "unique", "original", "thin", "template", "doorway", "duplicate"
        ])
        assert has_warning, (
            f"No anti-doorway warning found in opportunity for {opp['target_city']}"
        )


# ── Priority keywords from rank snapshots ────────────────────────────────────

def test_primary_keywords_from_rank_snapshots():
    """When rank snapshots exist, primary_keywords should be populated."""
    lid = _create_location()
    snap_repo = get_local_rank_snapshot_repository()
    snap_repo.create(LocalRankSnapshot(
        tenant_id="t_pages", location_id=lid,
        keyword="plumber springfield", date="2026-07-31",
        organic_position=12,
    ))

    opps = generate_location_page_opportunities("t_pages", lid)
    springfield_opps = [o for o in opps if o["target_city"] == "Springfield"]
    if springfield_opps:
        # Keywords pulled from snapshots
        opp = springfield_opps[0]
        keywords = opp.get("primary_keywords", []) + opp.get("supporting_keywords", [])
        assert any("plumber" in kw.lower() for kw in keywords), (
            "primary_keywords should include keywords from rank snapshots"
        )


def test_fallback_keywords_when_no_snapshots():
    """Without rank snapshots, opportunities still have default keyword suggestions."""
    lid = _create_location()
    opps = generate_location_page_opportunities("t_pages", lid)
    for opp in opps:
        keywords = opp.get("primary_keywords", []) + opp.get("supporting_keywords", [])
        assert len(keywords) >= 1, (
            f"Opportunity for {opp['target_city']} should always have suggested keywords"
        )


# ── Content Agent handoff ─────────────────────────────────────────────────────

def test_handoff_returns_forward_flag():
    """handoff must indicate that the caller needs to forward to Content Agent."""
    lid = _create_location(service_areas=["Springfield"])
    opps = generate_location_page_opportunities("t_pages", lid)
    if not opps:
        pytest.skip("No opportunities generated")

    result = handoff_location_page_to_content("t_pages", lid, opps[0])
    assert result["requires_http_forward"] is True
    assert "forward_to" in result
    assert "content" in result["forward_to"].lower() or "agent" in result["forward_to"].lower()


def test_handoff_payload_shape():
    """Handoff payload must include SEO context and anti-doorway note."""
    lid = _create_location(service_areas=["Springfield"])
    opps = generate_location_page_opportunities("t_pages", lid)
    if not opps:
        pytest.skip("No opportunities generated")

    result = handoff_location_page_to_content("t_pages", lid, opps[0])
    payload = result["payload"]

    # Core fields
    assert "location_id" in payload
    assert "target_city" in payload
    assert "primary_keywords" in payload
    assert "seo_context" in payload
    assert "unique_content_requirements" in payload


def test_handoff_includes_anti_doorway_note():
    """Handoff payload must include an explicit note warning against doorway pages."""
    lid = _create_location(service_areas=["Decatur"])
    opps = generate_location_page_opportunities("t_pages", lid)
    if not opps:
        pytest.skip("No opportunities generated")

    result = handoff_location_page_to_content("t_pages", lid, opps[0])
    payload = result["payload"]

    # The seo_context or a top-level key must warn against thin/doorway pages
    all_text = str(payload).lower()
    has_warning = any(w in all_text for w in [
        "doorway", "thin", "unique", "original content", "templated"
    ])
    assert has_warning, "Handoff payload must warn against doorway/thin pages"


def test_handoff_location_not_found():
    lid = _create_location(service_areas=["Springfield"])
    opps = generate_location_page_opportunities("t_pages", lid)
    if not opps:
        pytest.skip("No opportunities generated")

    result = handoff_location_page_to_content("t_pages", "nonexistent", opps[0])
    assert result.get("error") == "location_not_found"


# ── Cross-tenant isolation ─────────────────────────────────────────────────────

def test_location_pages_cross_tenant():
    """Opportunities for tenant A must not include data from tenant B."""
    lid_a = _create_location("t_a", service_areas=["Springfield"])

    lid_b_repo = get_location_repository()
    lid_b, _ = lid_b_repo.create(Location(
        tenant_id="t_b",
        business_name="B Plumbing",
        service_areas=["Chicago", "Naperville"],
    ))

    opps_a = generate_location_page_opportunities("t_a", lid_a)
    cities_a = {o["target_city"] for o in opps_a}

    # Tenant A should not see Tenant B's service areas
    assert "Chicago" not in cities_a
    assert "Naperville" not in cities_a
    # And should see its own
    assert "Springfield" in cities_a or len(opps_a) == 0  # might be empty if no opps
