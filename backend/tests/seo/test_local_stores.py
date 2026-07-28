"""Contract + migration-coverage tests for the Local SEO stores.

Mirrors the pattern in tests/seo/test_search_stores.py:
  - Parametrised memory / file backends
  - Create + read-back
  - Enum round-trip
  - Cross-tenant isolation
  - ALL_REPOSITORIES covered in migration SQL

Zero paid/network calls.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

import seo.local.stores as ls
from seo.local.stores import (
    ALL_REPOSITORIES,
    Citation,
    CitationSource,
    CitationStatus,
    ClaimedStatus,
    GbpConnStatus,
    GbpConnection,
    GbpPost,
    GbpReview,
    LocalCompetitor,
    LocalRankSnapshot,
    LocalSchema,
    Location,
    NapAudit,
    PostStatus,
    PostType,
    ReplyStatus,
    SchemaStatus,
    reset_repositories,
)


REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent
MIGRATION = REPO_ROOT / "supabase" / "migrations" / "20260731_seo_local.sql"


@pytest.fixture(params=["memory", "file"])
def backend(request, tmp_path, monkeypatch):
    if request.param == "file":
        monkeypatch.setenv("PIXIE_PERSIST", "file")
        monkeypatch.setenv("PIXIE_DATA_DIR", str(tmp_path))
    else:
        monkeypatch.delenv("PIXIE_PERSIST", raising=False)
    reset_repositories()
    yield request.param
    reset_repositories()
    monkeypatch.delenv("PIXIE_PERSIST", raising=False)


# ── Location ──────────────────────────────────────────────────────────────────

def test_location_roundtrip(backend):
    repo = ls.get_location_repository()
    lid, loc = repo.create(Location(
        tenant_id="t_a",
        site_id="site_1",
        business_name="Acme Plumbing",
        city="Springfield",
        region="IL",
        postal_code="62701",
        country="US",
        phone="+15551234567",
        primary_category="Plumber",
        secondary_categories=["HVAC", "Drain cleaning"],
        service_areas=["Springfield", "Decatur"],
        lat=39.7817,
        lng=-89.6501,
    ))
    assert lid.startswith("loc_")
    got = repo.get("t_a", lid)
    assert got is not None
    _, back = got
    assert back.business_name == "Acme Plumbing"
    assert back.secondary_categories == ["HVAC", "Drain cleaning"]
    assert back.service_areas == ["Springfield", "Decatur"]
    assert back.lat == 39.7817
    assert back.created_at  # stamped


def test_location_archive_restore(backend):
    repo = ls.get_location_repository()
    lid, _ = repo.create(Location(tenant_id="t_a", business_name="Test Co"))

    # archive
    result = repo.update("t_a", lid, archived=True, archived_at="2026-07-31T00:00:00Z")
    assert result is not None
    _, loc = result
    assert loc.archived is True

    # list_active excludes archived
    active = repo.list_active("t_a")
    assert not any(i == lid for i, _ in active)

    # restore
    result = repo.update("t_a", lid, archived=False, archived_at="")
    _, loc = result
    assert loc.archived is False
    active = repo.list_active("t_a")
    assert any(i == lid for i, _ in active)


def test_location_cross_tenant_isolation(backend):
    repo = ls.get_location_repository()
    lid_a, _ = repo.create(Location(tenant_id="t_a", business_name="A Co"))
    lid_b, _ = repo.create(Location(tenant_id="t_b", business_name="B Co"))

    # t_a cannot see t_b's location
    assert repo.get("t_a", lid_b) is None
    assert repo.get("t_b", lid_a) is None

    # list is tenant-scoped
    a_locs = repo.list("t_a")
    assert all(loc.tenant_id == "t_a" for _, loc in a_locs)
    b_locs = repo.list("t_b")
    assert all(loc.tenant_id == "t_b" for _, loc in b_locs)


# ── GbpConnection ─────────────────────────────────────────────────────────────

def test_gbp_connection_roundtrip(backend):
    repo = ls.get_gbp_connection_repository()
    cid, conn = repo.create(GbpConnection(
        tenant_id="t_a",
        kind="gbp",
        account_email="owner@example.com",
        status=GbpConnStatus.CONNECTED,
        scopes=["https://www.googleapis.com/auth/business.manage"],
        access_token_sealed="obf:dGVzdA==",
        refresh_token_sealed="obf:cmVmcmVzaA==",
        token_expiry="9999999999",
    ))
    assert cid.startswith("gbpconn_")
    got = repo.get("t_a", cid)
    assert got is not None
    _, back = got
    assert back.account_email == "owner@example.com"
    assert back.status is GbpConnStatus.CONNECTED   # enum round-trip
    assert back.access_token_sealed == "obf:dGVzdA=="
    # refresh token is sealed — never plaintext
    assert "refresh_token_sealed" in vars(back)
    assert back.created_at  # stamped


def test_gbp_connection_revoke(backend):
    repo = ls.get_gbp_connection_repository()
    cid, _ = repo.create(GbpConnection(
        tenant_id="t_a", status=GbpConnStatus.CONNECTED
    ))
    repo.update("t_a", cid, status=GbpConnStatus.REVOKED,
                access_token_sealed="", refresh_token_sealed="")
    _, conn = repo.get("t_a", cid)
    assert conn.status is GbpConnStatus.REVOKED
    assert conn.access_token_sealed == ""
    assert conn.refresh_token_sealed == ""


# ── GbpReview ─────────────────────────────────────────────────────────────────

def test_gbp_review_roundtrip(backend):
    repo = ls.get_gbp_review_repository()
    rid, rev = repo.create(GbpReview(
        tenant_id="t_a",
        location_id="loc_001",
        gbp_review_id="rev_0001",
        reviewer_display_name="Alice Smith",
        rating=5,
        review_text="Excellent service!",
        sentiment="positive",
        themes=["service", "quality"],
    ))
    assert rid.startswith("gbprev_")
    _, back = repo.get("t_a", rid)
    assert back.rating == 5
    assert back.reply_status is ReplyStatus.NONE   # enum round-trip
    assert back.themes == ["service", "quality"]
    assert back.handled is False


def test_gbp_review_list_by_location(backend):
    repo = ls.get_gbp_review_repository()
    repo.create(GbpReview(tenant_id="t_a", location_id="loc_001", rating=4))
    repo.create(GbpReview(tenant_id="t_a", location_id="loc_001", rating=2))
    repo.create(GbpReview(tenant_id="t_a", location_id="loc_002", rating=5))

    loc1_reviews = repo.list_by_location("t_a", "loc_001")
    assert len(loc1_reviews) == 2
    loc2_reviews = repo.list_by_location("t_a", "loc_002")
    assert len(loc2_reviews) == 1


def test_gbp_review_unanswered(backend):
    repo = ls.get_gbp_review_repository()
    # Unanswered negative
    r1id, _ = repo.create(GbpReview(tenant_id="t_a", location_id="loc_001", rating=2,
                                    reply_status=ReplyStatus.NONE, handled=False))
    # Handled
    repo.create(GbpReview(tenant_id="t_a", location_id="loc_001", rating=5,
                          reply_status=ReplyStatus.PUBLISHED, handled=True))
    unanswered = repo.list_unanswered("t_a", "loc_001")
    assert any(i == r1id for i, _ in unanswered)
    assert len(unanswered) == 1


# ── GbpPost ───────────────────────────────────────────────────────────────────

def test_gbp_post_roundtrip(backend):
    repo = ls.get_gbp_post_repository()
    pid, post = repo.create(GbpPost(
        tenant_id="t_a",
        location_id="loc_001",
        post_type=PostType.UPDATE,
        title="Summer Special",
        body="Get 10% off this summer!",
        status=PostStatus.DRAFT,
    ))
    assert pid.startswith("gbppost_")
    _, back = repo.get("t_a", pid)
    assert back.post_type is PostType.UPDATE   # enum round-trip
    assert back.status is PostStatus.DRAFT


# ── CitationSource ────────────────────────────────────────────────────────────

def test_citation_source_roundtrip(backend):
    repo = ls.get_citation_source_repository()
    sid, src = repo.create(CitationSource(
        tenant_id="global",
        name="Yelp",
        domain="yelp.com",
        kind="directory",
        priority=90,
    ))
    assert sid.startswith("citsrc_")
    _, back = repo.get("global", sid)
    assert back.name == "Yelp"
    assert back.priority == 90


# ── Citation ──────────────────────────────────────────────────────────────────

def test_citation_roundtrip(backend):
    repo = ls.get_citation_repository()
    cid, cit = repo.create(Citation(
        tenant_id="t_a",
        location_id="loc_001",
        directory="Yelp",
        listing_url="https://yelp.com/biz/acme",
        business_name="Acme Plumbing",
        phone="+15551234567",
        status=CitationStatus.ACTIVE,
        claimed=ClaimedStatus.CLAIMED,
        consistency=0.95,
    ))
    assert cid.startswith("cit_")
    _, back = repo.get("t_a", cid)
    assert back.status is CitationStatus.ACTIVE   # enum round-trip
    assert back.claimed is ClaimedStatus.CLAIMED
    assert back.consistency == 0.95


def test_citation_cross_tenant_isolation(backend):
    repo = ls.get_citation_repository()
    cid_a, _ = repo.create(Citation(tenant_id="t_a", location_id="loc_001", directory="Yelp"))
    cid_b, _ = repo.create(Citation(tenant_id="t_b", location_id="loc_001", directory="Yelp"))
    assert repo.get("t_a", cid_b) is None
    assert repo.get("t_b", cid_a) is None


# ── LocalCompetitor ───────────────────────────────────────────────────────────

def test_local_competitor_roundtrip(backend):
    repo = ls.get_local_competitor_repository()
    cid, comp = repo.create(LocalCompetitor(
        tenant_id="t_a",
        location_id="loc_001",
        business_name="Bob's Plumbing",
        domain="bobs-plumbing.com",
        rating=4.2,
        review_count=35,
    ))
    assert cid.startswith("lcomp_")
    _, back = repo.get("t_a", cid)
    assert back.business_name == "Bob's Plumbing"
    assert back.rating == 4.2


# ── LocalRankSnapshot ─────────────────────────────────────────────────────────

def test_local_rank_snapshot_roundtrip(backend):
    repo = ls.get_local_rank_snapshot_repository()
    sid, snap = repo.create(LocalRankSnapshot(
        tenant_id="t_a",
        location_id="loc_001",
        keyword="plumber springfield",
        city="Springfield",
        date="2026-07-31",
        organic_position=3,
        local_pack_position=2,
        maps_position=2,
        competitor_positions={"bobs-plumbing.com": 1, "acme-rival.com": 5},
        provider="mock",
        is_geo_grid=False,
    ))
    assert sid.startswith("lsnap_")
    _, back = repo.get("t_a", sid)
    assert back.organic_position == 3
    assert back.local_pack_position == 2
    assert back.competitor_positions["bobs-plumbing.com"] == 1
    assert back.is_geo_grid is False   # never fabricated
    assert back.created_at  # stamped


def test_local_rank_snapshot_history_ordering(backend):
    repo = ls.get_local_rank_snapshot_repository()
    repo.create(LocalRankSnapshot(
        tenant_id="t_a", location_id="loc_001",
        keyword="plumber", date="2026-07-20", organic_position=5,
    ))
    repo.create(LocalRankSnapshot(
        tenant_id="t_a", location_id="loc_001",
        keyword="plumber", date="2026-07-10", organic_position=8,
    ))
    history = repo.history("t_a", "loc_001", "plumber")
    dates = [s.date for _, s in history]
    assert dates == sorted(dates)


# ── NapAudit ──────────────────────────────────────────────────────────────────

def test_nap_audit_roundtrip(backend):
    repo = ls.get_nap_audit_repository()
    nid, audit = repo.create(NapAudit(
        tenant_id="t_a",
        location_id="loc_001",
        source="citation:Yelp",
        field="phone",
        canonical_value="+15551234567",
        observed_value="+1 (555) 123-4567",
        mismatch=False,  # normalised values match
        confirmed_variant=False,
    ))
    assert nid.startswith("nap_")
    _, back = repo.get("t_a", nid)
    assert back.mismatch is False
    assert back.confirmed_variant is False
    assert back.source == "citation:Yelp"


def test_nap_audit_confirm_variant_requires_explicit_call(backend):
    """confirmed_variant must NOT be automatically set — manual confirmation only."""
    repo = ls.get_nap_audit_repository()
    nid, _ = repo.create(NapAudit(
        tenant_id="t_a", location_id="loc_001",
        source="citation:Yelp", field="name",
        canonical_value="Acme Plumbing",
        observed_value="ACME PLUMBING LLC",
        mismatch=True,
    ))
    _, back = repo.get("t_a", nid)
    # Before explicit confirmation, mismatch stays True
    assert back.mismatch is True
    assert back.confirmed_variant is False

    # Only after explicit update does confirmed_variant change
    repo.update("t_a", nid, confirmed_variant=True, mismatch=False,
                confirmed_at="2026-07-31T12:00:00Z", confirmed_by="alice")
    _, updated = repo.get("t_a", nid)
    assert updated.confirmed_variant is True
    assert updated.mismatch is False


# ── LocalSchema ───────────────────────────────────────────────────────────────

def test_local_schema_roundtrip(backend):
    repo = ls.get_local_schema_repository()
    sid, schema = repo.create(LocalSchema(
        tenant_id="t_a",
        location_id="loc_001",
        schema_type="LocalBusiness",
        jsonld={"@context": "https://schema.org", "@type": "LocalBusiness", "name": "Acme"},
        status=SchemaStatus.PROPOSED,
    ))
    assert sid.startswith("lschema_")
    _, back = repo.get("t_a", sid)
    assert back.status is SchemaStatus.PROPOSED   # enum round-trip
    assert back.jsonld["@type"] == "LocalBusiness"
    assert back.include_aggregate_rating is False  # default safe value


def test_local_schema_approval_gate(backend):
    """Schema stays PROPOSED until explicitly approved."""
    repo = ls.get_local_schema_repository()
    sid, _ = repo.create(LocalSchema(
        tenant_id="t_a", location_id="loc_001",
        schema_type="LocalBusiness", jsonld={}, status=SchemaStatus.PROPOSED,
    ))
    _, back = repo.get("t_a", sid)
    assert back.status is SchemaStatus.PROPOSED  # not auto-approved

    # Explicit approval
    repo.update("t_a", sid, status=SchemaStatus.APPROVED, approved_at="2026-07-31T00:00:00Z")
    _, approved = repo.get("t_a", sid)
    assert approved.status is SchemaStatus.APPROVED


# ── Migration-coverage test ───────────────────────────────────────────────────

def test_all_repositories_in_migration():
    """Every table in ALL_REPOSITORIES must appear in the migration SQL."""
    assert MIGRATION.exists(), f"Migration file not found: {MIGRATION}"
    sql = MIGRATION.read_text()
    # Extract table names from CREATE TABLE statements
    created_tables = set(re.findall(r"create table if not exists (\w+)", sql, re.IGNORECASE))

    missing = []
    for repo_cls in ALL_REPOSITORIES:
        table = repo_cls.table_name
        if table not in created_tables:
            missing.append(table)

    assert not missing, (
        f"These repository tables are NOT in the migration SQL: {missing}\n"
        f"Tables found in migration: {created_tables}"
    )


def test_all_repositories_have_table_names():
    """Every repo class has a non-empty table_name."""
    for repo_cls in ALL_REPOSITORIES:
        assert repo_cls.table_name, f"{repo_cls.__name__} has no table_name"
        # No digits in table names (migration-coverage regex is digit-blind)
        assert not re.search(r"\d", repo_cls.table_name), (
            f"{repo_cls.__name__}.table_name={repo_cls.table_name!r} contains a digit — "
            "use words instead (e.g. 'seo_local_rank_snapshots' not 'seo_local_rank_snap2')"
        )
