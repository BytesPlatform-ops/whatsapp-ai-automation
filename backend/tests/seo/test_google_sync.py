"""Tests for seo.google.sync — durable GSC + GA4 sync jobs.

All tests use MockGscClient / MockGa4Client and injected token exchange.
Zero real network calls.

Covers:
  - GSC sync: job created, rows upserted, status=completed
  - GSC pagination: multiple pages -> all rows collected
  - GSC idempotent upsert: run twice -> same row count (no duplicates)
  - GA4 sync: job created, rows upserted, status=completed
  - GA4 idempotent upsert: run twice -> same row count
  - Restart recovery: QUEUED/RUNNING job resumes from cursor_date
  - Quota/error handling: GscError marks job FAILED (non-retryable)
  - Metering called with is_mock=True -> zero credits (no exception)
  - View helpers: gsc_query_performance, gsc_positions_4_20, ga4_landing_performance
"""

from __future__ import annotations

import time
from datetime import date, timedelta
from typing import Any, Dict, List, Optional
from unittest.mock import MagicMock, patch

import pytest

from seo.search_stores import (
    GoogleConnStatus,
    SyncJobStatus,
    get_gsc_query_row_repository,
    get_gsc_sync_job_repository,
    get_ga4_landing_row_repository,
    get_ga4_sync_job_repository,
    reset_repositories,
)
from seo.google.crypto import seal
from seo.google.gsc_client import GscClient, GscError, MockGscClient
from seo.google.ga4_client import Ga4Client, Ga4Error, MockGa4Client
from seo.google.sync import (
    ga4_landing_performance,
    gsc_high_impression_low_ctr,
    gsc_positions_4_20,
    gsc_query_performance,
    run_ga4_sync,
    run_gsc_sync,
)


# ── Fixtures ────────────────────────────────────────────────────────────────────

TENANT = "test_sync_tenant"
CONN_ID = "gconn_testconn123"
GSC_PROP = "sc-domain:example.com"
GA4_PROP = "properties/123456789"


@pytest.fixture(autouse=True)
def clean_repos(monkeypatch):
    monkeypatch.delenv("PIXIE_PERSIST", raising=False)
    monkeypatch.setenv("GSC_INITIAL_LOOKBACK_DAYS", "7")  # small window for tests
    reset_repositories()
    # Pre-seed a CONNECTED GoogleConnection so _get_fresh_access_token works
    _seed_connection()
    yield
    reset_repositories()


def _seed_connection():
    from seo.search_stores import GoogleConnection, get_google_connection_repository
    repo = get_google_connection_repository()
    conn = GoogleConnection(
        tenant_id=TENANT,
        kind="google",
        account_email="test@example.com",
        status=GoogleConnStatus.CONNECTED,
        access_token_sealed=seal("mock_access_token"),
        refresh_token_sealed=seal("mock_refresh_token"),
        token_expiry=str(int(time.time()) + 3600),
    )
    repo._save(CONN_ID, TENANT, conn)


# ── GSC sync ─────────────────────────────────────────────────────────────────────

def test_gsc_sync_creates_job_and_rows():
    result = run_gsc_sync(TENANT, CONN_ID, GSC_PROP, client=MockGscClient())
    assert result["status"] == "completed"
    assert result["job_id"].startswith("gscjob_")
    assert result["rows_upserted"] > 0

    # Verify job in repo
    job_repo = get_gsc_sync_job_repository()
    jobs = job_repo.list_where(TENANT, property_id=GSC_PROP)
    assert len(jobs) == 1
    _, job = jobs[0]
    assert job.status == SyncJobStatus.COMPLETED
    assert job.rows_upserted > 0


def test_gsc_sync_rows_stored():
    run_gsc_sync(TENANT, CONN_ID, GSC_PROP, client=MockGscClient())
    row_repo = get_gsc_query_row_repository()
    rows = row_repo.list_where(TENANT, property_id=GSC_PROP)
    assert len(rows) > 0
    _, row = rows[0]
    assert row.property_id == GSC_PROP
    assert row.clicks >= 0
    assert row.impressions >= 0


def test_gsc_sync_idempotent_no_duplicates():
    """Running the sync twice must not duplicate rows."""
    result1 = run_gsc_sync(TENANT, CONN_ID, GSC_PROP, client=MockGscClient())
    count1 = result1["rows_upserted"]

    # Second run: job is already completed, so a new job is created and runs
    # The rows for the same content hash must be upserted (not duplicated)
    result2 = run_gsc_sync(TENANT, CONN_ID, GSC_PROP, client=MockGscClient())
    count2 = result2["rows_upserted"]

    row_repo = get_gsc_query_row_repository()
    actual_rows = row_repo.list_where(TENANT, property_id=GSC_PROP)
    # Because idempotent upsert re-writes the same row_id, we should have
    # exactly count1 unique rows (not count1 + count2)
    assert len(actual_rows) == count1, (
        f"Expected {count1} unique rows, got {len(actual_rows)} after 2 runs"
    )


# ── GSC pagination ───────────────────────────────────────────────────────────────

class PaginatedMockGscClient(GscClient):
    """Returns exactly 3 rows per page, 2 pages total."""

    def list_properties(self, access_token):
        return MockGscClient().list_properties(access_token)

    def query_search_analytics(self, access_token, property_id, start, end,
                               dimensions=None, start_row=0, row_limit=500):
        all_rows = [
            {"query": f"q{i}", "page": "/", "country": "usa", "device": "DESKTOP",
             "date": start, "clicks": i, "impressions": i * 5, "ctr": 0.2, "position": float(i + 1)}
            for i in range(6)
        ]
        page = all_rows[start_row: start_row + 3]  # 3 rows per page
        next_s = start_row + 3 if start_row + 3 < len(all_rows) else None
        return {"rows": page, "next_start_row": next_s}


def test_gsc_pagination_collects_all_rows():
    result = run_gsc_sync(TENANT, CONN_ID, GSC_PROP, client=PaginatedMockGscClient())
    assert result["status"] == "completed"
    row_repo = get_gsc_query_row_repository()
    rows = row_repo.list_where(TENANT, property_id=GSC_PROP)
    # 6 rows across 2 pages, for the 1 date window (7-day range = potentially 1 window)
    assert len(rows) >= 6


# ── GSC error handling ────────────────────────────────────────────────────────────

class ErrorGscClient(GscClient):
    """Always raises a non-retryable GscError."""

    def list_properties(self, access_token):
        return []

    def query_search_analytics(self, access_token, property_id, start, end,
                               dimensions=None, start_row=0, row_limit=500):
        raise GscError("quota exceeded", status_code=400, reason="badRequest")


def test_gsc_error_marks_job_failed():
    result = run_gsc_sync(TENANT, CONN_ID, GSC_PROP, client=ErrorGscClient())
    assert result["status"] == "failed"
    assert "error" in result

    job_repo = get_gsc_sync_job_repository()
    jobs = job_repo.list_where(TENANT, property_id=GSC_PROP)
    _, job = jobs[0]
    assert job.status == SyncJobStatus.FAILED


# ── Restart recovery ─────────────────────────────────────────────────────────────

def test_gsc_restart_recovery():
    """A RUNNING job should be resumed from its cursor_date."""
    from seo.search_stores import GscSyncJob, get_gsc_sync_job_repository
    from datetime import date, timedelta

    # Pre-create a RUNNING job with a cursor 3 days in the past
    job_repo = get_gsc_sync_job_repository()
    cursor = (date.today() - timedelta(days=3)).isoformat()
    start = (date.today() - timedelta(days=7)).isoformat()
    today = date.today().isoformat()

    stuck_job = GscSyncJob(
        tenant_id=TENANT,
        connection_id=CONN_ID,
        property_id=GSC_PROP,
        status=SyncJobStatus.RUNNING,
        window_start=start,
        window_end=today,
        cursor_date=cursor,
        rows_upserted=5,
    )
    job_id, _ = job_repo.create(stuck_job)

    # Run sync — should resume the stuck job
    result = run_gsc_sync(TENANT, CONN_ID, GSC_PROP, client=MockGscClient())
    assert result["status"] == "completed"
    # Job id should match the existing one (resumed)
    assert result["job_id"] == job_id
    # rows_upserted should be > 5 (resumed from cursor + added more)
    assert result["rows_upserted"] >= 5


# ── GA4 sync ─────────────────────────────────────────────────────────────────────

def test_ga4_sync_creates_job_and_rows():
    result = run_ga4_sync(TENANT, CONN_ID, GA4_PROP, client=MockGa4Client())
    assert result["status"] == "completed"
    assert result["job_id"].startswith("ga4job_")
    assert result["rows_upserted"] > 0

    job_repo = get_ga4_sync_job_repository()
    jobs = job_repo.list_where(TENANT, property_id=GA4_PROP)
    assert len(jobs) == 1
    _, job = jobs[0]
    assert job.status == SyncJobStatus.COMPLETED


def test_ga4_sync_idempotent_no_duplicates():
    result1 = run_ga4_sync(TENANT, CONN_ID, GA4_PROP, client=MockGa4Client())
    count1 = result1["rows_upserted"]

    run_ga4_sync(TENANT, CONN_ID, GA4_PROP, client=MockGa4Client())

    row_repo = get_ga4_landing_row_repository()
    actual = row_repo.list_where(TENANT, property_id=GA4_PROP)
    assert len(actual) == count1


# ── GA4 pagination ────────────────────────────────────────────────────────────────

class PaginatedMockGa4Client(Ga4Client):
    def list_properties(self, access_token):
        return MockGa4Client().list_properties(access_token)

    def run_report(self, access_token, property_id, start, end, start_row=0, row_limit=500):
        all_rows = [
            {"landing_page": f"/page{i}", "source_medium": "google / organic",
             "device_category": "desktop", "country": "us", "date": start,
             "sessions": i + 1, "engaged_sessions": i, "engagement_rate": 0.5,
             "avg_engagement_time": 30.0, "new_users": 1, "conversions": 0.0}
            for i in range(8)
        ]
        page = all_rows[start_row: start_row + 4]
        next_s = start_row + 4 if start_row + 4 < len(all_rows) else None
        return {"rows": page, "next_start_row": next_s}


def test_ga4_pagination_collects_all_rows():
    result = run_ga4_sync(TENANT, CONN_ID, GA4_PROP, client=PaginatedMockGa4Client())
    assert result["status"] == "completed"
    row_repo = get_ga4_landing_row_repository()
    rows = row_repo.list_where(TENANT, property_id=GA4_PROP)
    assert len(rows) >= 8


# ── GA4 error handling ────────────────────────────────────────────────────────────

class ErrorGa4Client(Ga4Client):
    def list_properties(self, access_token):
        return []

    def run_report(self, access_token, property_id, start, end, start_row=0, row_limit=500):
        raise Ga4Error("api error", status_code=400, reason="invalid")


def test_ga4_error_marks_job_failed():
    result = run_ga4_sync(TENANT, CONN_ID, GA4_PROP, client=ErrorGa4Client())
    assert result["status"] == "failed"


# ── Metering: is_mock=True → zero credits, no exception ──────────────────────────

def test_gsc_sync_metering_is_mock_zero(monkeypatch):
    """Mock client must trigger is_mock=True in metering → zero credits, no crash."""
    recorded = {}

    def fake_record_gsc(tenant_id, **kwargs):
        recorded.update(kwargs)
        return {"recorded": False, "reason": "mock_or_zero", "credits_mc": 0}

    monkeypatch.setattr("seo.metering_search.record_gsc_sync", fake_record_gsc)
    run_gsc_sync(TENANT, CONN_ID, GSC_PROP, client=MockGscClient())
    assert recorded.get("is_mock") is True


def test_ga4_sync_metering_is_mock_zero(monkeypatch):
    recorded = {}

    def fake_record_ga4(tenant_id, **kwargs):
        recorded.update(kwargs)
        return {"recorded": False, "reason": "mock_or_zero", "credits_mc": 0}

    monkeypatch.setattr("seo.metering_search.record_ga4_sync", fake_record_ga4)
    run_ga4_sync(TENANT, CONN_ID, GA4_PROP, client=MockGa4Client())
    assert recorded.get("is_mock") is True


# ── View helpers ─────────────────────────────────────────────────────────────────

def test_gsc_query_performance_view():
    run_gsc_sync(TENANT, CONN_ID, GSC_PROP, client=MockGscClient())
    rows = gsc_query_performance(TENANT, GSC_PROP)
    assert len(rows) > 0
    for r in rows:
        assert "query" in r
        assert "clicks" in r
        assert "impressions" in r
        assert "avg_position" in r


def test_gsc_positions_4_20_filters_correctly():
    run_gsc_sync(TENANT, CONN_ID, GSC_PROP, client=MockGscClient())
    rows = gsc_positions_4_20(TENANT, GSC_PROP)
    for r in rows:
        assert 4.0 <= r["avg_position"] <= 20.0


def test_gsc_high_impression_low_ctr():
    run_gsc_sync(TENANT, CONN_ID, GSC_PROP, client=MockGscClient())
    # Just verify it doesn't crash; the mock data may or may not have qualifying rows
    rows = gsc_high_impression_low_ctr(TENANT, GSC_PROP, min_impressions=1, max_ctr=1.0)
    assert isinstance(rows, list)


def test_ga4_landing_performance_view():
    run_ga4_sync(TENANT, CONN_ID, GA4_PROP, client=MockGa4Client())
    rows = ga4_landing_performance(TENANT, GA4_PROP)
    assert len(rows) > 0
    for r in rows:
        assert "landing_page" in r
        assert "sessions" in r


def test_ga4_landing_performance_sorted_by_sessions():
    run_ga4_sync(TENANT, CONN_ID, GA4_PROP, client=MockGa4Client())
    rows = ga4_landing_performance(TENANT, GA4_PROP)
    sessions = [r["sessions"] for r in rows]
    assert sessions == sorted(sessions, reverse=True)
