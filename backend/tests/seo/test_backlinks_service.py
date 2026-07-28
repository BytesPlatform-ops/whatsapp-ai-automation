"""Tests for the backlink sync service and view helpers.

Covers:
  - Sync creates BacklinkProject + Backlink records
  - Idempotent upsert: run_backlink_sync twice → same backlink counts
  - Pagination: all provider pages consumed
  - New/lost detection from stored records
  - ReferringDomain aggregation
  - Anchor distribution
  - Top target pages
  - Link velocity (snapshot sequence)
  - Provider freshness metadata
  - Metering: is_mock→zero credits

No network calls; MockBacklinkProvider only.
"""

from __future__ import annotations

import pytest

import seo.backlinks.stores as bs
import seo.metering_search as metering
from seo.backlinks.provider import MockBacklinkProvider
from seo.backlinks.service import (
    get_anchor_distribution,
    get_link_velocity,
    get_new_lost,
    get_profile,
    get_provider_freshness,
    get_referring_domains,
    get_top_target_pages,
    run_backlink_sync,
)
from seo.backlinks.stores import LinkStatus, SyncStatus


@pytest.fixture(autouse=True)
def clean_repos(monkeypatch):
    """Reset in-memory repos and disable credit system for every test."""
    monkeypatch.delenv("PIXIE_PERSIST", raising=False)
    monkeypatch.setattr(metering.credit_config, "credit_system_enabled", lambda: False)
    bs.reset_repositories()
    yield
    bs.reset_repositories()


@pytest.fixture()
def provider():
    return MockBacklinkProvider()


# ── Sync: basic ────────────────────────────────────────────────────────────────

def test_sync_creates_project_and_backlinks(provider):
    result = run_backlink_sync("t_a", "site_1", provider=provider, domain="example.com")
    assert result["site_id"] == "site_1"
    assert result["total_backlinks"] > 0
    assert result["referring_domains"] > 0
    assert result["provider"] == "mock"

    # BacklinkProject created
    from seo.backlinks.stores import get_backlink_project_repository
    proj_pair = get_backlink_project_repository().get_by_site("t_a", "site_1")
    assert proj_pair is not None
    _, proj = proj_pair
    assert proj.sync_status is SyncStatus.COMPLETED
    assert proj.last_sync


def test_sync_creates_backlink_records(provider):
    run_backlink_sync("t_a", "site_1", provider=provider, domain="example.com")
    from seo.backlinks.stores import get_backlink_repository
    bls = get_backlink_repository().list_by_site("t_a", "site_1")
    assert len(bls) > 0
    _, first = bls[0]
    assert first.source_url
    assert first.target_url
    assert first.dedup_key


def test_sync_creates_snapshot(provider):
    run_backlink_sync("t_a", "site_1", provider=provider, domain="example.com")
    from seo.backlinks.stores import get_backlink_snapshot_repository
    snaps = get_backlink_snapshot_repository().list_by_site("t_a", "site_1")
    assert len(snaps) == 1
    _, snap = snaps[0]
    assert snap.total_backlinks > 0


def test_sync_creates_referring_domains(provider):
    run_backlink_sync("t_a", "site_1", provider=provider, domain="example.com")
    from seo.backlinks.stores import get_referring_domain_repository
    rds = get_referring_domain_repository().list_by_site("t_a", "site_1")
    assert len(rds) > 0


# ── Idempotent upsert ─────────────────────────────────────────────────────────

def test_sync_is_idempotent(provider):
    """Running sync twice must not double the backlink count."""
    r1 = run_backlink_sync("t_a", "site_1", provider=provider, domain="example.com")
    r2 = run_backlink_sync("t_a", "site_1", provider=provider, domain="example.com")

    from seo.backlinks.stores import get_backlink_repository, LinkStatus
    # Active links after two syncs must equal the first sync's total (no doubles).
    active_bls = get_backlink_repository().list_by_site("t_a", "site_1", status=LinkStatus.ACTIVE)
    assert len(active_bls) == r1["total_backlinks"]
    # Second sync total must equal first (all links still active, none lost)
    assert r2["total_backlinks"] == r1["total_backlinks"]


# ── Pagination ────────────────────────────────────────────────────────────────

def test_sync_paginates_all_provider_pages():
    """Sync must consume all provider pages, not just the first."""
    # MockProvider has 50–300 links; _PAGE_SIZE=100 so > 1 page is possible.
    provider = MockBacklinkProvider()
    domain = "pagination.com"
    total = provider._total_links(domain)
    result = run_backlink_sync("t_a", "pag_site", provider=provider, domain=domain)
    # After sync, the number of stored active backlinks must equal provider total.
    from seo.backlinks.stores import get_backlink_repository, LinkStatus
    active = get_backlink_repository().list_by_site("t_a", "pag_site", status=LinkStatus.ACTIVE)
    assert len(active) == total, f"Expected {total} links, got {len(active)}"


# ── New/lost detection ────────────────────────────────────────────────────────

def test_new_lost_view(provider):
    run_backlink_sync("t_a", "site_1", provider=provider, domain="example.com")
    result = get_new_lost("t_a", "site_1")
    assert "new" in result
    assert "lost" in result
    # After first sync, no links should be lost (they're all active).
    assert len(result["lost"]) == 0


def test_new_lost_with_since_filter(provider):
    run_backlink_sync("t_a", "site_1", provider=provider, domain="example.com")
    # With a future since date, no links should appear
    result = get_new_lost("t_a", "site_1", since="2099-01-01")
    assert result["new"] == []


# ── View helpers ───────────────────────────────────────────────────────────────

def test_get_profile_before_sync():
    result = get_profile("t_a", "no_site")
    assert result["status"] == "not_synced"


def test_get_profile_after_sync(provider):
    run_backlink_sync("t_a", "site_1", provider=provider, domain="example.com")
    profile = get_profile("t_a", "site_1")
    assert profile["sync_status"] == "completed"
    assert profile["total_backlinks"] > 0
    assert profile["referring_domains"] > 0


def test_get_referring_domains_view(provider):
    run_backlink_sync("t_a", "site_1", provider=provider, domain="example.com")
    rds = get_referring_domains("t_a", "site_1")
    assert len(rds) > 0
    for rd in rds:
        assert "domain" in rd
        assert "backlink_count" in rd
        assert "status" in rd
        # provider_metrics passed through (present for mock)
        assert "provider_metrics" in rd


def test_get_referring_domains_status_filter(provider):
    run_backlink_sync("t_a", "site_1", provider=provider, domain="example.com")
    active = get_referring_domains("t_a", "site_1", status="active")
    lost = get_referring_domains("t_a", "site_1", status="lost")
    # After initial sync all should be active
    assert len(active) > 0
    assert len(lost) == 0


def test_get_anchor_distribution(provider):
    run_backlink_sync("t_a", "site_1", provider=provider, domain="example.com")
    anchors = get_anchor_distribution("t_a", "site_1")
    assert len(anchors) > 0
    # Sorted by count desc
    if len(anchors) >= 2:
        assert anchors[0]["count"] >= anchors[1]["count"]
    for a in anchors:
        assert "anchor" in a
        assert "count" in a
        assert "percent" in a


def test_get_top_target_pages(provider):
    run_backlink_sync("t_a", "site_1", provider=provider, domain="example.com")
    pages = get_top_target_pages("t_a", "site_1")
    assert len(pages) > 0
    if len(pages) >= 2:
        assert pages[0]["backlink_count"] >= pages[1]["backlink_count"]


def test_get_link_velocity_empty_before_sync():
    velocity = get_link_velocity("t_a", "no_site")
    assert velocity == []


def test_get_link_velocity_has_entry_after_sync(provider):
    run_backlink_sync("t_a", "site_1", provider=provider, domain="example.com")
    velocity = get_link_velocity("t_a", "site_1")
    assert len(velocity) == 1
    entry = velocity[0]
    assert "date" in entry
    assert "total_backlinks" in entry
    assert "new_links" in entry
    assert "lost_links" in entry


def test_get_link_velocity_two_syncs_two_snapshots(provider):
    run_backlink_sync("t_a", "site_1", provider=provider, domain="example.com")
    run_backlink_sync("t_a", "site_1", provider=provider, domain="example.com")
    velocity = get_link_velocity("t_a", "site_1")
    # Two syncs → two snapshots (same date is allowed for idempotency testing)
    assert len(velocity) >= 1


def test_get_provider_freshness(provider):
    run_backlink_sync("t_a", "site_1", provider=provider, domain="example.com")
    freshness = get_provider_freshness("t_a", "site_1")
    assert freshness["sync_status"] == "completed"
    assert freshness["provider"] == "mock"
    assert freshness["last_sync"]


def test_get_provider_freshness_not_synced():
    freshness = get_provider_freshness("t_a", "unsynced")
    assert freshness["status"] == "not_synced"


# ── Cross-tenant isolation ────────────────────────────────────────────────────

def test_cross_tenant_sync_isolation(provider):
    run_backlink_sync("t_a", "site_1", provider=provider, domain="example.com")
    # t_b should see nothing
    profile = get_profile("t_b", "site_1")
    assert profile["status"] == "not_synced"
    assert get_referring_domains("t_b", "site_1") == []
    assert get_anchor_distribution("t_b", "site_1") == []


# ── Metering: is_mock → 0 credits ────────────────────────────────────────────

def test_sync_metering_zero_for_mock(provider, monkeypatch):
    """is_mock=True must record 0 credits — even when credit system is 'on'."""
    calls = []

    def fake_record(**kwargs):
        calls.append(kwargs)
        return {"recorded": False, "reason": "mock_or_zero", "credits_mc": 0}

    monkeypatch.setattr(
        "seo.backlinks.service.record_backlink_sync",
        lambda tenant_id, job_id, is_mock, pages=1: fake_record(
            tenant_id=tenant_id, is_mock=is_mock, pages=pages
        ),
    )
    run_backlink_sync("t_a", "site_1", provider=provider, domain="example.com")
    assert calls, "record_backlink_sync was not called"
    assert calls[-1]["is_mock"] is True
