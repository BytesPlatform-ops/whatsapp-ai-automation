"""Tests for the LocalBusiness JSON-LD schema builder + approval gate.

Tests:
  - build_jsonld produces valid structured data
  - validate_jsonld catches missing required fields
  - AggregateRating only included when policy_compliant_rating=True (manual gate)
  - Schema is stored as PROPOSED — not auto-approved
  - Approval gate requires explicit approve call
  - Cross-tenant isolation
"""

from __future__ import annotations

import json

import pytest

from seo.local.stores import (
    Location,
    SchemaStatus,
    reset_repositories,
    get_location_repository,
)
from seo.local.schema import (
    approve_schema,
    audit_schema,
    build_jsonld,
    list_schemas,
    mark_published,
    propose_schema,
    validate_jsonld,
)


@pytest.fixture(autouse=True)
def _reset():
    reset_repositories()
    yield
    reset_repositories()


def _create_location(tenant: str = "t_schema") -> tuple:
    repo = get_location_repository()
    lid, loc = repo.create(Location(
        tenant_id=tenant,
        business_name="Acme Plumbing",
        address_line1="123 Main St",
        city="Springfield",
        region="IL",
        postal_code="62701",
        country="US",
        phone="+15551234567",
        website_url="https://acmeplumbing.com",
        primary_category="Plumber",
        service_areas=["Springfield", "Decatur"],
        lat=39.7817,
        lng=-89.6501,
    ))
    return lid, loc


# ── JSON-LD builder ───────────────────────────────────────────────────────────

def test_build_jsonld_required_fields():
    lid, loc = _create_location()
    jsonld = build_jsonld(lid, loc)

    assert jsonld["@context"] == "https://schema.org"
    assert jsonld["@type"] == "LocalBusiness"
    assert jsonld["name"] == "Acme Plumbing"
    assert jsonld["telephone"] == "+15551234567"
    assert jsonld["url"] == "https://acmeplumbing.com"


def test_build_jsonld_postal_address():
    lid, loc = _create_location()
    jsonld = build_jsonld(lid, loc)

    addr = jsonld["address"]
    assert addr["@type"] == "PostalAddress"
    assert addr["streetAddress"] == "123 Main St"
    assert addr["addressLocality"] == "Springfield"
    assert addr["addressRegion"] == "IL"
    assert addr["postalCode"] == "62701"
    assert addr["addressCountry"] == "US"


def test_build_jsonld_geocoordinates():
    lid, loc = _create_location()
    jsonld = build_jsonld(lid, loc)

    assert "geo" in jsonld
    assert jsonld["geo"]["@type"] == "GeoCoordinates"
    assert jsonld["geo"]["latitude"] == 39.7817
    assert jsonld["geo"]["longitude"] == -89.6501


def test_build_jsonld_area_served():
    lid, loc = _create_location()
    jsonld = build_jsonld(lid, loc, service_areas=["Springfield", "Decatur"])

    assert "areaServed" in jsonld
    areas = jsonld["areaServed"]
    area_names = [a["name"] if isinstance(a, dict) else a for a in areas]
    assert "Springfield" in area_names or jsonld["areaServed"] == "Springfield"


def test_build_jsonld_same_as():
    lid, loc = _create_location()
    jsonld = build_jsonld(lid, loc, same_as_urls=["https://facebook.com/acmeplumbing"])

    assert "sameAs" in jsonld
    assert "https://facebook.com/acmeplumbing" in jsonld["sameAs"]


def test_build_jsonld_services():
    lid, loc = _create_location()
    jsonld = build_jsonld(lid, loc, service_names=["Drain Cleaning", "Water Heater Install"])

    assert "hasOfferCatalog" in jsonld
    items = jsonld["hasOfferCatalog"]["itemListElement"]
    names = [i["itemOffered"]["name"] for i in items]
    assert "Drain Cleaning" in names
    assert "Water Heater Install" in names


def test_aggregate_rating_not_included_by_default():
    """AggregateRating must NOT be included without explicit policy compliance flag."""
    lid, loc = _create_location()
    jsonld = build_jsonld(lid, loc)
    assert "aggregateRating" not in jsonld


def test_aggregate_rating_requires_policy_compliant_flag():
    """AggregateRating only included when policy_compliant_rating=True is explicit."""
    lid, loc = _create_location()

    # Without flag → not included
    jsonld_no_flag = build_jsonld(lid, loc,
                                   policy_compliant_rating=False,
                                   aggregate_rating={"ratingValue": 4.5, "reviewCount": 48})
    assert "aggregateRating" not in jsonld_no_flag

    # With explicit flag → included
    jsonld_with_flag = build_jsonld(lid, loc,
                                     policy_compliant_rating=True,
                                     aggregate_rating={"ratingValue": 4.5, "reviewCount": 48})
    assert "aggregateRating" in jsonld_with_flag
    assert jsonld_with_flag["aggregateRating"]["ratingValue"] == 4.5


def test_build_jsonld_is_json_serialisable():
    lid, loc = _create_location()
    jsonld = build_jsonld(lid, loc)
    # Must not raise
    json.dumps(jsonld)


# ── Validation ────────────────────────────────────────────────────────────────

def test_valid_jsonld():
    lid, loc = _create_location()
    jsonld = build_jsonld(lid, loc)
    is_valid, issues = validate_jsonld(jsonld)
    assert is_valid, f"Expected valid JSON-LD, got issues: {issues}"


def test_invalid_jsonld_missing_name():
    jsonld = {
        "@context": "https://schema.org",
        "@type": "LocalBusiness",
        # name missing
    }
    is_valid, issues = validate_jsonld(jsonld)
    assert not is_valid
    assert any("name" in issue for issue in issues)


def test_invalid_jsonld_unknown_type():
    jsonld = {
        "@context": "https://schema.org",
        "@type": "FakeType",
        "name": "Test",
    }
    is_valid, issues = validate_jsonld(jsonld)
    assert not is_valid
    assert any("Unknown @type" in issue or "@type" in issue for issue in issues)


def test_invalid_jsonld_wrong_context():
    jsonld = {
        "@context": "https://example.com",
        "@type": "LocalBusiness",
        "name": "Test",
    }
    is_valid, issues = validate_jsonld(jsonld)
    assert not is_valid


# ── propose_schema ────────────────────────────────────────────────────────────

def test_propose_schema_creates_proposed_status():
    lid, _ = _create_location()
    result = propose_schema("t_schema", lid)
    assert "schema_id" in result
    assert result["status"] == SchemaStatus.PROPOSED.value
    assert "deployment_note" in result


def test_propose_schema_stored_as_proposed():
    """Proposed schema must NOT be auto-approved."""
    lid, _ = _create_location()
    result = propose_schema("t_schema", lid)
    schema_id = result["schema_id"]

    schemas = list_schemas("t_schema", lid)
    schema_statuses = {sid: s.status for sid, s in schemas}
    assert schema_statuses[schema_id] is SchemaStatus.PROPOSED


def test_propose_schema_missing_location():
    result = propose_schema("t_schema", "nonexistent_loc")
    assert result.get("error") == "location_not_found"


# ── Approval gate ─────────────────────────────────────────────────────────────

def test_approve_schema_changes_status():
    lid, _ = _create_location()
    proposed = propose_schema("t_schema", lid)
    schema_id = proposed["schema_id"]

    result = approve_schema("t_schema", schema_id, approved_by="alice")
    assert result["status"] == SchemaStatus.APPROVED.value
    assert result["approved_by"] == "alice"


def test_cannot_approve_already_approved():
    lid, _ = _create_location()
    proposed = propose_schema("t_schema", lid)
    schema_id = proposed["schema_id"]
    approve_schema("t_schema", schema_id)

    # Trying to approve again should return an error
    result = approve_schema("t_schema", schema_id)
    assert result.get("error") == "not_proposed"


def test_mark_published():
    lid, _ = _create_location()
    proposed = propose_schema("t_schema", lid)
    schema_id = proposed["schema_id"]
    approve_schema("t_schema", schema_id)

    result = mark_published("t_schema", schema_id)
    assert result is not None
    _, schema = result
    assert schema.status is SchemaStatus.PUBLISHED
    assert schema.published_at


# ── Schema audit ──────────────────────────────────────────────────────────────

def test_audit_no_schema():
    lid, _ = _create_location()
    result = audit_schema("t_schema", lid)
    assert result["has_schema"] is False
    assert "recommendation" in result


def test_audit_with_schema():
    lid, _ = _create_location()
    propose_schema("t_schema", lid)
    result = audit_schema("t_schema", lid)
    assert result["has_schema"] is True
    assert "schema_id" in result
    assert "is_valid" in result
    assert isinstance(result["validation_issues"], list)


# ── Cross-tenant isolation ────────────────────────────────────────────────────

def test_schema_cross_tenant_isolation():
    lid_a, _ = _create_location("t_a")
    lid_b_repo = get_location_repository()
    lid_b, loc_b = lid_b_repo.create(Location(
        tenant_id="t_b", business_name="B Plumbing"
    ))

    result_a = propose_schema("t_a", lid_a)
    schema_id_a = result_a["schema_id"]

    # t_b cannot approve t_a's schema
    result = approve_schema("t_b", schema_id_a)
    assert result.get("error") == "schema_not_found"
