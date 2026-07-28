"""Migration-coverage + contract tests for the SEO outreach stores.

Mirrors tests/seo/test_search_stores.py:
- Parametrised memory/file backends.
- Create + read-back for every entity.
- Enum round-trip.
- Cross-tenant isolation.
- Migration coverage: every table_name in ALL_REPOSITORIES appears in the SQL.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

import seo.outreach.stores as s
from seo.outreach.stores import (
    ALL_REPOSITORIES,
    BounceStatus,
    Campaign,
    CampaignStatus,
    CampaignType,
    Contact,
    Draft,
    DraftStatus,
    Followup,
    FollowupStatus,
    LinkPlacement,
    PlacementOutcome,
    RelationshipStatus,
    SuppressionEntry,
    SuppressionReason,
    VerificationStatus,
)

REPO = Path(__file__).resolve().parent.parent.parent.parent
MIGRATION = REPO / "supabase" / "migrations" / "20260801_seo_outreach.sql"


@pytest.fixture(params=["memory", "file"])
def backend(request, tmp_path, monkeypatch):
    if request.param == "file":
        monkeypatch.setenv("PIXIE_PERSIST", "file")
        monkeypatch.setenv("PIXIE_DATA_DIR", str(tmp_path))
    else:
        monkeypatch.delenv("PIXIE_PERSIST", raising=False)
    s.reset_repositories()
    yield request.param
    s.reset_repositories()
    monkeypatch.delenv("PIXIE_PERSIST", raising=False)


# ── Migration coverage ────────────────────────────────────────────────────────

def test_migration_file_exists():
    assert MIGRATION.exists(), f"Migration file not found: {MIGRATION}"


def test_migration_covers_all_tables():
    """Every table_name in ALL_REPOSITORIES must appear in the migration SQL."""
    sql = MIGRATION.read_text()
    missing = []
    for cls in ALL_REPOSITORIES:
        table = cls.table_name
        # Remove digits from table name (digit-blind regex matching).
        pattern = re.sub(r"\d", "", table)
        if pattern not in sql:
            missing.append(table)
    assert not missing, f"Tables missing from migration: {missing}"


# ── Contact roundtrip ─────────────────────────────────────────────────────────

def test_contact_create_and_read(backend):
    repo = s.get_contact_repository()
    c = Contact(
        tenant_id="t1",
        domain="example.com",
        name="Alice",
        role="Editor",
        email="alice@example.com",
        source="manual",
        verification_status=VerificationStatus.VERIFIED,
        relationship_status=RelationshipStatus.CONTACTED,
        bounce_status=BounceStatus.NONE,
    )
    cid, saved = repo.create(c)
    assert cid.startswith("oc_")
    result = repo.get("t1", cid)
    assert result is not None
    rid, loaded = result
    assert loaded.email == "alice@example.com"
    assert isinstance(loaded.verification_status, VerificationStatus)
    assert loaded.verification_status == VerificationStatus.VERIFIED
    assert isinstance(loaded.relationship_status, RelationshipStatus)
    assert isinstance(loaded.bounce_status, BounceStatus)


def test_contact_cross_tenant_isolation(backend):
    repo = s.get_contact_repository()
    c = Contact(tenant_id="t1", domain="a.com", email="x@a.com")
    cid, _ = repo.create(c)
    assert repo.get("t2", cid) is None
    assert not [p for p in repo.list("t2")]


def test_contact_find_by_email(backend):
    repo = s.get_contact_repository()
    c = Contact(tenant_id="t1", domain="b.com", email="bob@b.com")
    cid, _ = repo.create(c)
    result = repo.find_by_email("t1", "bob@b.com")
    assert result is not None
    assert result[0] == cid
    assert repo.find_by_email("t1", "other@b.com") is None


# ── Campaign roundtrip ─────────────────────────────────────────────────────────

def test_campaign_create_and_read(backend):
    repo = s.get_campaign_repository()
    camp = Campaign(
        tenant_id="t1",
        name="Test Campaign",
        site_id="site_abc",
        status=CampaignStatus.DRAFT,
        campaign_type=CampaignType.LINK_GAP,
        contact_ids=["oc_123"],
    )
    cid, saved = repo.create(camp)
    assert cid.startswith("camp_")
    result = repo.get("t1", cid)
    assert result is not None
    rid, loaded = result
    assert loaded.name == "Test Campaign"
    assert isinstance(loaded.status, CampaignStatus)
    assert loaded.status == CampaignStatus.DRAFT
    assert isinstance(loaded.campaign_type, CampaignType)
    assert loaded.campaign_type == CampaignType.LINK_GAP
    assert "oc_123" in loaded.contact_ids


def test_campaign_cross_tenant_isolation(backend):
    repo = s.get_campaign_repository()
    c = Campaign(tenant_id="t1", name="private")
    cid, _ = repo.create(c)
    assert repo.get("t2", cid) is None


# ── Draft roundtrip ───────────────────────────────────────────────────────────

def test_draft_create_and_read(backend):
    repo = s.get_draft_repository()
    d = Draft(
        tenant_id="t1",
        campaign_id="camp_abc",
        contact_id="oc_abc",
        subject="Test Subject",
        body="Hello world",
        version=1,
        status=DraftStatus.DRAFT,
        approved=False,
    )
    did, _ = repo.create(d)
    assert did.startswith("odraft_")
    result = repo.get("t1", did)
    assert result is not None
    _, loaded = result
    assert loaded.subject == "Test Subject"
    assert isinstance(loaded.status, DraftStatus)
    assert not loaded.approved


def test_draft_cross_tenant_isolation(backend):
    repo = s.get_draft_repository()
    d = Draft(tenant_id="t1", campaign_id="c", contact_id="ct", subject="private")
    did, _ = repo.create(d)
    assert repo.get("t2", did) is None


# ── Followup roundtrip ────────────────────────────────────────────────────────

def test_followup_create_and_read(backend):
    repo = s.get_followup_repository()
    fu = Followup(
        tenant_id="t1",
        campaign_id="camp_abc",
        contact_id="oc_abc",
        sequence_index=0,
        scheduled_for="2026-09-01T09:00:00+00:00",
        status=FollowupStatus.SCHEDULED,
    )
    fid, _ = repo.create(fu)
    assert fid.startswith("ofu_")
    result = repo.get("t1", fid)
    assert result is not None
    _, loaded = result
    assert isinstance(loaded.status, FollowupStatus)
    assert loaded.status == FollowupStatus.SCHEDULED
    assert loaded.sequence_index == 0


def test_followup_list_scheduled(backend):
    repo = s.get_followup_repository()
    fu = Followup(
        tenant_id="t1",
        campaign_id="c1",
        contact_id="ct1",
        sequence_index=0,
        scheduled_for="2026-08-01T00:00:00+00:00",
        status=FollowupStatus.SCHEDULED,
    )
    fid, _ = repo.create(fu)
    due = repo.list_scheduled("t1", "2026-08-02T00:00:00+00:00")
    assert any(i == fid for i, _ in due)
    not_due = repo.list_scheduled("t1", "2026-07-31T00:00:00+00:00")
    assert not any(i == fid for i, _ in not_due)


# ── LinkPlacement roundtrip ────────────────────────────────────────────────────

def test_link_placement_create_and_read(backend):
    repo = s.get_link_placement_repository()
    lp = LinkPlacement(
        tenant_id="t1",
        campaign_id="camp_abc",
        contact_id="oc_abc",
        outcome=PlacementOutcome.LINK_WON,
        target_url="https://myclient.com/page",
        source_url="https://example.com/resources",
        anchor="great resource",
        rel="dofollow",
    )
    pid, _ = repo.create(lp)
    assert pid.startswith("lp_")
    result = repo.get("t1", pid)
    assert result is not None
    _, loaded = result
    assert isinstance(loaded.outcome, PlacementOutcome)
    assert loaded.outcome == PlacementOutcome.LINK_WON
    assert loaded.anchor == "great resource"


def test_link_placement_cross_tenant_isolation(backend):
    repo = s.get_link_placement_repository()
    lp = LinkPlacement(tenant_id="t1", campaign_id="c", contact_id="ct")
    pid, _ = repo.create(lp)
    assert repo.get("t2", pid) is None


def test_link_placement_list_won(backend):
    repo = s.get_link_placement_repository()
    won = LinkPlacement(tenant_id="t1", campaign_id="c", contact_id="ct",
                        outcome=PlacementOutcome.LINK_WON)
    pending = LinkPlacement(tenant_id="t1", campaign_id="c", contact_id="ct2",
                            outcome=PlacementOutcome.PENDING)
    repo.create(won)
    repo.create(pending)
    won_list = repo.list_won("t1")
    assert len(won_list) == 1
    assert won_list[0][1].outcome == PlacementOutcome.LINK_WON


# ── SuppressionEntry roundtrip ────────────────────────────────────────────────

def test_suppression_create_and_read(backend):
    repo = s.get_suppression_repository()
    se = SuppressionEntry(
        tenant_id="t1",
        email="bad@example.com",
        domain="example.com",
        reason=SuppressionReason.BOUNCE,
        notes="Hard bounce",
    )
    sid, _ = repo.create(se)
    assert sid.startswith("supp_")
    result = repo.get("t1", sid)
    assert result is not None
    _, loaded = result
    assert isinstance(loaded.reason, SuppressionReason)
    assert loaded.reason == SuppressionReason.BOUNCE
    assert loaded.email == "bad@example.com"


def test_suppression_is_suppressed_by_email(backend):
    repo = s.get_suppression_repository()
    se = SuppressionEntry(tenant_id="t1", email="x@y.com", domain="y.com",
                          reason=SuppressionReason.UNSUBSCRIBE)
    repo.create(se)
    assert repo.is_suppressed("t1", "x@y.com")
    assert not repo.is_suppressed("t1", "other@y.com")
    assert not repo.is_suppressed("t2", "x@y.com")


def test_suppression_is_suppressed_by_domain(backend):
    repo = s.get_suppression_repository()
    # Domain-wide suppression (no specific email).
    se = SuppressionEntry(tenant_id="t1", email="", domain="blocked.com",
                          reason=SuppressionReason.MANUAL)
    repo.create(se)
    assert repo.is_suppressed("t1", "anyone@blocked.com")
    assert not repo.is_suppressed("t1", "anyone@other.com")
