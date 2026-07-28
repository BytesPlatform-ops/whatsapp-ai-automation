"""Tests for the citation tracking module.

Tests:
  - CRUD operations
  - CSV import / export (formula-injection safe)
  - Duplicate detection
  - Missing high-priority directories
  - Consistency check (mock)
  - Verification history persistence
  - Cross-tenant isolation
"""

from __future__ import annotations

import pytest

from seo.local.stores import (
    CitationStatus,
    ClaimedStatus,
    Location,
    reset_repositories,
    get_location_repository,
    get_citation_repository,
)
from seo.local.citations import (
    add_citation,
    check_citation,
    delete_citation,
    detect_duplicates,
    detect_missing,
    export_citations_csv,
    import_citations_csv,
    list_citations,
    mark_corrected,
)


@pytest.fixture(autouse=True)
def _reset():
    reset_repositories()
    yield
    reset_repositories()


def _create_location(tenant: str = "t_cit") -> str:
    repo = get_location_repository()
    lid, _ = repo.create(Location(
        tenant_id=tenant,
        business_name="Acme Plumbing",
        address_line1="123 Main St",
        city="Springfield",
        phone="+15551234567",
        website_url="https://acmeplumbing.com",
    ))
    return lid


# ── CRUD ──────────────────────────────────────────────────────────────────────

def test_add_citation():
    lid = _create_location()
    cid, cit = add_citation(
        "t_cit", lid, "Yelp",
        listing_url="https://yelp.com/biz/acme",
        business_name="Acme Plumbing",
        phone="+15551234567",
        status=CitationStatus.ACTIVE,
        claimed=ClaimedStatus.CLAIMED,
    )
    assert cid.startswith("cit_")
    assert cit.directory == "Yelp"
    assert cit.status is CitationStatus.ACTIVE


def test_list_citations_by_status():
    lid = _create_location()
    add_citation("t_cit", lid, "Yelp", status=CitationStatus.ACTIVE)
    add_citation("t_cit", lid, "Manta", status=CitationStatus.MISSING)

    active = list_citations("t_cit", lid, status=CitationStatus.ACTIVE)
    assert len(active) == 1
    assert active[0][1].directory == "Yelp"


def test_delete_citation():
    lid = _create_location()
    cid, _ = add_citation("t_cit", lid, "Superpages")
    deleted = delete_citation("t_cit", cid)
    assert deleted is True
    rows = list_citations("t_cit", lid)
    assert not any(i == cid for i, _ in rows)


def test_cross_tenant_citation_isolation():
    lid_a = _create_location("t_a")
    lid_b_repo = get_location_repository()
    lid_b, _ = lid_b_repo.create(Location(tenant_id="t_b", business_name="B Co"))

    cid_a, _ = add_citation("t_a", lid_a, "Yelp")
    cid_b, _ = add_citation("t_b", lid_b, "Yelp")

    assert get_citation_repository().get("t_a", cid_b) is None
    assert get_citation_repository().get("t_b", cid_a) is None


# ── CSV export / import ───────────────────────────────────────────────────────

def test_export_csv_formula_injection_safe():
    """CSV cells must not start with dangerous characters."""
    lid = _create_location()
    add_citation(
        "t_cit", lid, "=DangerDir",
        business_name="+15551234567",
        notes="@SUM(A1:A10)",
    )
    csv_text = export_citations_csv("t_cit", lid)
    for line in csv_text.strip().splitlines()[1:]:  # skip header
        for cell in line.split(","):
            cell = cell.strip('"')
            if cell:
                assert cell[0] not in ("=", "+", "-", "@", "|"), (
                    f"Formula injection risk: cell starts with {cell[0]!r}: {cell!r}"
                )


def test_export_then_import_roundtrip():
    lid = _create_location()
    add_citation("t_cit", lid, "Yelp", listing_url="https://yelp.com/biz/acme",
                 business_name="Acme Plumbing", phone="+15551234567")
    add_citation("t_cit", lid, "Manta", listing_url="https://manta.com/biz/acme")

    csv_text = export_citations_csv("t_cit", lid)

    # Import into a fresh location
    lid2_repo = get_location_repository()
    lid2, _ = lid2_repo.create(Location(tenant_id="t_cit", business_name="Acme Branch"))

    result = import_citations_csv("t_cit", lid2, csv_text)
    assert result["imported"] == 2
    assert result["errors"] == []

    imported = list_citations("t_cit", lid2)
    assert len(imported) == 2
    dirs = {c.directory for _, c in imported}
    assert "Yelp" in dirs
    assert "Manta" in dirs


def test_import_skips_duplicates():
    lid = _create_location()
    add_citation("t_cit", lid, "Yelp")

    csv_text = "directory,directory_url,listing_url,business_name,address,phone,website,category,status,claimed,notes\n"
    csv_text += "Yelp,https://yelp.com,,,,,,, pending,unknown,\n"

    result = import_citations_csv("t_cit", lid, csv_text, skip_duplicates=True)
    assert result["skipped"] == 1
    assert result["imported"] == 0


def test_import_empty_directory_is_error():
    lid = _create_location()
    csv_text = "directory,listing_url\n,https://yelp.com/biz/acme\n"
    result = import_citations_csv("t_cit", lid, csv_text)
    assert len(result["errors"]) >= 1


# ── Deduplication + missing detection ────────────────────────────────────────

def test_detect_duplicates():
    lid = _create_location()
    add_citation("t_cit", lid, "Yelp", listing_url="https://yelp.com/biz/acme-1")
    add_citation("t_cit", lid, "Yelp", listing_url="https://yelp.com/biz/acme-2")
    dups = detect_duplicates("t_cit", lid)
    assert len(dups) == 1
    assert dups[0]["directory"] == "yelp"
    assert dups[0]["count"] == 2


def test_no_false_positive_duplicates():
    lid = _create_location()
    add_citation("t_cit", lid, "Yelp")
    add_citation("t_cit", lid, "Manta")
    dups = detect_duplicates("t_cit", lid)
    assert dups == []


def test_detect_missing_high_priority():
    lid = _create_location()
    # Add only a low-priority dir
    add_citation("t_cit", lid, "Judy's Book")
    missing = detect_missing("t_cit", lid)
    # High-priority dirs like "Google Business Profile", "Yelp" should be missing
    assert "Yelp" in missing or "Google Business Profile" in missing


def test_detect_missing_none_when_all_present():
    lid = _create_location()
    # Seed all high-priority directories (priority >= 60)
    high_prio = [
        "Google Business Profile", "Yelp", "Facebook", "Bing Places",
        "Apple Maps", "YellowPages", "Foursquare", "Better Business Bureau",
        "TripAdvisor", "Angi",
    ]
    for name in high_prio:
        add_citation("t_cit", lid, name)
    missing = detect_missing("t_cit", lid)
    assert missing == []


# ── Consistency check ─────────────────────────────────────────────────────────

def test_check_citation_mock():
    lid = _create_location()
    cid, _ = add_citation(
        "t_cit", lid, "Yelp",
        business_name="Acme Plumbing",
        address="123 main st springfield",
        phone="+15551234567",
        website="https://acmeplumbing.com",
    )
    result = check_citation("t_cit", cid, is_mock=True)
    assert "consistency" in result
    assert 0.0 <= result["consistency"] <= 1.0
    assert "status" in result
    assert "checked_at" in result
    assert result["is_mock"] is True


def test_check_citation_updates_history():
    lid = _create_location()
    cid, _ = add_citation("t_cit", lid, "Yelp",
                           business_name="Acme Plumbing",
                           phone="+15551234567")
    check_citation("t_cit", cid, is_mock=True)
    check_citation("t_cit", cid, is_mock=True)

    repo = get_citation_repository()
    _, cit = repo.get("t_cit", cid)
    assert len(cit.verification_history) == 2
    assert cit.verification_history[0]["action"] == "checked"


def test_mark_corrected():
    lid = _create_location()
    cid, _ = add_citation("t_cit", lid, "Manta",
                           status=CitationStatus.INCORRECT)
    result = mark_corrected("t_cit", cid, correction_note="Updated phone number")
    assert result is not None
    _, cit = result
    assert cit.status is CitationStatus.ACTIVE
    assert cit.verification_history[-1]["action"] == "corrected"


# ── Metering zero in mock ─────────────────────────────────────────────────────

def test_check_metering_zero_in_mock():
    lid = _create_location()
    cid, _ = add_citation("t_cit", lid, "Yelp", business_name="Acme Plumbing",
                           phone="+15551234567")
    result = check_citation("t_cit", cid, is_mock=True)
    metering = result.get("metering", {})
    assert metering.get("credits_mc", 0) == 0
