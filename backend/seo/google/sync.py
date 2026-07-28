"""Durable, idempotent GSC + GA4 sync jobs for the SEO agent.

run_gsc_sync(tenant, connection_id, property_id, ...)
run_ga4_sync(tenant, connection_id, property_id, ...)

Both functions:
  1. Create or resume a sync job from the repos in seo.search_stores.
  2. Iterate date windows from the cursor (incremental) up to today.
  3. Paginate the provider client.
  4. IDEMPOTENT upsert rows keyed by a stable hash so re-running doesn't duplicate.
  5. Update rows_upserted, cursor_date, job status on the fly.
  6. Retry/backoff on transient errors (up to MAX_RETRIES).
  7. RESTART RECOVERY: a job already in QUEUED or RUNNING state resumes from cursor_date.
  8. Call metering after a successful sync.

View helpers (read from stored rows, no network):
  gsc_query_performance(tenant, property_id, ...)
  gsc_positions_4_20(tenant, property_id, ...)
  gsc_high_impression_low_ctr(tenant, property_id, ...)
  ga4_landing_performance(tenant, property_id, ...)

Environment variables:
  GSC_INITIAL_LOOKBACK_DAYS   (default 90) — initial window when no cursor exists
  GSC_SYNC_INTERVAL_SECONDS   (not enforced here; used by external scheduler)
  GA4_SYNC_INTERVAL_SECONDS   (not enforced here; used by external scheduler)
"""

from __future__ import annotations

import hashlib
import logging
import os
import time
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, TYPE_CHECKING

from seo.search_stores import (
    GscQueryRow,
    GscSyncJob,
    Ga4LandingRow,
    Ga4SyncJob,
    SyncJobStatus,
    get_gsc_sync_job_repository,
    get_gsc_query_row_repository,
    get_ga4_sync_job_repository,
    get_ga4_landing_row_repository,
)
from seo.google.connections import _get_fresh_access_token, ConnectionError
from seo.google.gsc_client import GscClient, GscError, get_gsc_client
from seo.google.ga4_client import Ga4Client, Ga4Error, get_ga4_client
import seo.metering_search as metering_search

if TYPE_CHECKING:
    pass

_log = logging.getLogger("pixie.seo.google.sync")

MAX_RETRIES = 3
BACKOFF_BASE = 2  # seconds
DATE_WINDOW_DAYS = 7  # sync in 7-day windows
MAX_PAGES_PER_WINDOW = 20  # safety ceiling per date window
ROW_LIMIT = 500


def _today() -> str:
    return date.today().isoformat()


def _initial_lookback() -> int:
    try:
        return int(os.getenv("GSC_INITIAL_LOOKBACK_DAYS", "90"))
    except (ValueError, TypeError):
        return 90


def _stable_hash(*parts: str) -> str:
    """Stable content-hash for idempotent upsert keying."""
    raw = "\x00".join(parts)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="microseconds")


# ── GSC sync ───────────────────────────────────────────────────────────────────

def run_gsc_sync(
    tenant: str,
    connection_id: str,
    property_id: str,
    *,
    site_id: str = "",
    initial_lookback_days: Optional[int] = None,
    client: Optional[GscClient] = None,
) -> Dict[str, Any]:
    """Run (or resume) a GSC sync job for one property.

    Returns a summary dict with job_id, rows_upserted, status.
    """
    if initial_lookback_days is None:
        initial_lookback_days = _initial_lookback()

    gsc = client if client is not None else get_gsc_client()
    is_mock = isinstance(gsc, __import__("seo.google.gsc_client", fromlist=["MockGscClient"]).MockGscClient)

    job_repo = get_gsc_sync_job_repository()
    row_repo = get_gsc_query_row_repository()

    # ── RESTART RECOVERY: find an existing QUEUED/RUNNING job for this property ──
    existing_jobs = job_repo.list_where(
        tenant, connection_id=connection_id, property_id=property_id
    )
    job_id: Optional[str] = None
    job: Optional[GscSyncJob] = None

    for eid, ejob in existing_jobs:
        if ejob.status in (SyncJobStatus.QUEUED, SyncJobStatus.RUNNING):
            job_id, job = eid, ejob
            _log.info("seo.google.sync: resuming GSC job %s from cursor=%s", job_id, job.cursor_date)
            break

    today_str = _today()
    start_dt = (date.today() - timedelta(days=initial_lookback_days)).isoformat()

    if job is None:
        # Create new job
        new_job = GscSyncJob(
            tenant_id=tenant,
            connection_id=connection_id,
            property_id=property_id,
            site_id=site_id,
            status=SyncJobStatus.QUEUED,
            window_start=start_dt,
            window_end=today_str,
            cursor_date=start_dt,
            queued_at=_now_iso(),
        )
        job_id, job = job_repo.create(new_job)
        _log.info("seo.google.sync: created GSC job %s", job_id)

    # Mark as running
    job_repo.update(tenant, job_id, status=SyncJobStatus.RUNNING, started_at=_now_iso())

    total_upserted = job.rows_upserted
    cursor_date = job.cursor_date or start_dt
    error_msg = ""

    try:
        access_token = _get_fresh_access_token(tenant, connection_id)
    except ConnectionError as exc:
        job_repo.update(tenant, job_id, status=SyncJobStatus.FAILED, error=str(exc), finished_at=_now_iso())
        return {"job_id": job_id, "status": "failed", "error": str(exc), "rows_upserted": total_upserted}

    # ── Iterate date windows ────────────────────────────────────────────────────
    window_start = date.fromisoformat(cursor_date)
    end_dt = date.today()

    while window_start < end_dt:
        window_end = min(window_start + timedelta(days=DATE_WINDOW_DAYS - 1), end_dt)
        start_str = window_start.isoformat()
        end_str = window_end.isoformat()

        retries = 0
        page_count = 0
        start_row = 0

        while page_count < MAX_PAGES_PER_WINDOW:
            try:
                result = gsc.query_search_analytics(
                    access_token,
                    property_id,
                    start=start_str,
                    end=end_str,
                    start_row=start_row,
                    row_limit=ROW_LIMIT,
                )
            except GscError as exc:
                if retries >= MAX_RETRIES or exc.status_code not in (429, 500, 503):
                    error_msg = str(exc)
                    job_repo.update(
                        tenant, job_id,
                        status=SyncJobStatus.FAILED,
                        error=error_msg,
                        cursor_date=start_str,
                        rows_upserted=total_upserted,
                        finished_at=_now_iso(),
                    )
                    return {
                        "job_id": job_id, "status": "failed",
                        "error": error_msg, "rows_upserted": total_upserted,
                    }
                retries += 1
                time.sleep(BACKOFF_BASE ** retries)
                continue

            rows = result.get("rows", [])
            for row_data in rows:
                # Idempotent upsert key
                key = _stable_hash(
                    property_id,
                    row_data.get("date", start_str),
                    row_data.get("query", ""),
                    row_data.get("page", ""),
                    row_data.get("country", ""),
                    row_data.get("device", ""),
                )
                gsc_row = GscQueryRow(
                    tenant_id=tenant,
                    property_id=property_id,
                    site_id=site_id,
                    date=row_data.get("date", start_str),
                    query=row_data.get("query", ""),
                    page=row_data.get("page", ""),
                    country=row_data.get("country", ""),
                    device=row_data.get("device", ""),
                    search_appearance=row_data.get("search_appearance", ""),
                    clicks=int(row_data.get("clicks", 0)),
                    impressions=int(row_data.get("impressions", 0)),
                    ctr=float(row_data.get("ctr", 0.0)),
                    position=float(row_data.get("position", 0.0)),
                )
                # Idempotent: use the content hash as row_id prefix to dedupe
                idempotent_id = "gscrow_" + key
                _upsert_gsc_row(row_repo, tenant, idempotent_id, gsc_row)
                total_upserted += 1

            next_start = result.get("next_start_row")
            page_count += 1

            if next_start is None:
                break
            start_row = next_start

        # Advance cursor
        window_start = window_end + timedelta(days=1)
        job_repo.update(
            tenant, job_id,
            cursor_date=window_start.isoformat(),
            rows_upserted=total_upserted,
        )

    # Completed
    job_repo.update(
        tenant, job_id,
        status=SyncJobStatus.COMPLETED,
        rows_upserted=total_upserted,
        cursor_date=today_str,
        last_success_at=_now_iso() if not error_msg else "",
        finished_at=_now_iso(),
        error=error_msg,
    )

    metering_search.record_gsc_sync(
        tenant,
        property_count=1,
        job_id=job_id,
        is_mock=is_mock,
    )

    return {
        "job_id": job_id,
        "status": "completed",
        "rows_upserted": total_upserted,
        "cursor_date": today_str,
    }


def _upsert_gsc_row(repo, tenant_id: str, idempotent_id: str, row: GscQueryRow) -> None:
    """Idempotent upsert: use the hash-based id to avoid duplicates.

    The repo's _save uses upsert semantics on the row_id, so calling with the
    same idempotent_id twice is a no-op (same data, same key).
    """
    repo._save(idempotent_id, tenant_id, row)


# ── GA4 sync ───────────────────────────────────────────────────────────────────

def run_ga4_sync(
    tenant: str,
    connection_id: str,
    property_id: str,
    *,
    site_id: str = "",
    initial_lookback_days: Optional[int] = None,
    client: Optional[Ga4Client] = None,
) -> Dict[str, Any]:
    """Run (or resume) a GA4 sync job for one property.

    Returns a summary dict with job_id, rows_upserted, status.
    """
    if initial_lookback_days is None:
        initial_lookback_days = _initial_lookback()

    ga4 = client if client is not None else get_ga4_client()
    is_mock = isinstance(ga4, __import__("seo.google.ga4_client", fromlist=["MockGa4Client"]).MockGa4Client)

    job_repo = get_ga4_sync_job_repository()
    row_repo = get_ga4_landing_row_repository()

    # ── RESTART RECOVERY ────────────────────────────────────────────────────────
    existing_jobs = job_repo.list_where(
        tenant, connection_id=connection_id, property_id=property_id
    )
    job_id: Optional[str] = None
    job: Optional[Ga4SyncJob] = None

    for eid, ejob in existing_jobs:
        if ejob.status in (SyncJobStatus.QUEUED, SyncJobStatus.RUNNING):
            job_id, job = eid, ejob
            _log.info("seo.google.sync: resuming GA4 job %s from cursor=%s", job_id, job.cursor_date)
            break

    today_str = _today()
    start_dt = (date.today() - timedelta(days=initial_lookback_days)).isoformat()

    if job is None:
        new_job = Ga4SyncJob(
            tenant_id=tenant,
            connection_id=connection_id,
            property_id=property_id,
            site_id=site_id,
            status=SyncJobStatus.QUEUED,
            window_start=start_dt,
            window_end=today_str,
            cursor_date=start_dt,
            queued_at=_now_iso(),
        )
        job_id, job = job_repo.create(new_job)
        _log.info("seo.google.sync: created GA4 job %s", job_id)

    job_repo.update(tenant, job_id, status=SyncJobStatus.RUNNING, started_at=_now_iso())

    total_upserted = job.rows_upserted
    cursor_date = job.cursor_date or start_dt
    error_msg = ""

    try:
        access_token = _get_fresh_access_token(tenant, connection_id)
    except ConnectionError as exc:
        job_repo.update(tenant, job_id, status=SyncJobStatus.FAILED, error=str(exc), finished_at=_now_iso())
        return {"job_id": job_id, "status": "failed", "error": str(exc), "rows_upserted": total_upserted}

    # ── Iterate date windows ────────────────────────────────────────────────────
    window_start = date.fromisoformat(cursor_date)
    end_dt = date.today()

    while window_start < end_dt:
        window_end = min(window_start + timedelta(days=DATE_WINDOW_DAYS - 1), end_dt)
        start_str = window_start.isoformat()
        end_str = window_end.isoformat()

        retries = 0
        page_count = 0
        start_row = 0

        while page_count < MAX_PAGES_PER_WINDOW:
            try:
                result = ga4.run_report(
                    access_token,
                    property_id,
                    start=start_str,
                    end=end_str,
                    start_row=start_row,
                    row_limit=ROW_LIMIT,
                )
            except Ga4Error as exc:
                if retries >= MAX_RETRIES or exc.status_code not in (429, 500, 503):
                    error_msg = str(exc)
                    job_repo.update(
                        tenant, job_id,
                        status=SyncJobStatus.FAILED,
                        error=error_msg,
                        cursor_date=start_str,
                        rows_upserted=total_upserted,
                        finished_at=_now_iso(),
                    )
                    return {
                        "job_id": job_id, "status": "failed",
                        "error": error_msg, "rows_upserted": total_upserted,
                    }
                retries += 1
                time.sleep(BACKOFF_BASE ** retries)
                continue

            rows = result.get("rows", [])
            for row_data in rows:
                key = _stable_hash(
                    property_id,
                    row_data.get("date", start_str),
                    row_data.get("landing_page", ""),
                    row_data.get("device_category", ""),
                    row_data.get("country", ""),
                    row_data.get("source_medium", ""),
                )
                ga4_row = Ga4LandingRow(
                    tenant_id=tenant,
                    property_id=property_id,
                    site_id=site_id,
                    date=row_data.get("date", start_str),
                    landing_page=row_data.get("landing_page", ""),
                    channel="Organic Search",
                    source_medium=row_data.get("source_medium", ""),
                    device_category=row_data.get("device_category", ""),
                    country=row_data.get("country", ""),
                    sessions=int(row_data.get("sessions", 0)),
                    engaged_sessions=int(row_data.get("engaged_sessions", 0)),
                    engagement_rate=float(row_data.get("engagement_rate", 0.0)),
                    avg_engagement_time=float(row_data.get("avg_engagement_time", 0.0)),
                    new_users=int(row_data.get("new_users", 0)),
                    conversions=float(row_data.get("conversions", 0.0)),
                )
                idempotent_id = "ga4row_" + key
                _upsert_ga4_row(row_repo, tenant, idempotent_id, ga4_row)
                total_upserted += 1

            next_start = result.get("next_start_row")
            page_count += 1

            if next_start is None:
                break
            start_row = next_start

        window_start = window_end + timedelta(days=1)
        job_repo.update(
            tenant, job_id,
            cursor_date=window_start.isoformat(),
            rows_upserted=total_upserted,
        )

    job_repo.update(
        tenant, job_id,
        status=SyncJobStatus.COMPLETED,
        rows_upserted=total_upserted,
        cursor_date=today_str,
        finished_at=_now_iso(),
        error=error_msg,
    )

    metering_search.record_ga4_sync(
        tenant,
        property_count=1,
        job_id=job_id,
        is_mock=is_mock,
    )

    return {
        "job_id": job_id,
        "status": "completed",
        "rows_upserted": total_upserted,
        "cursor_date": today_str,
    }


def _upsert_ga4_row(repo, tenant_id: str, idempotent_id: str, row: Ga4LandingRow) -> None:
    repo._save(idempotent_id, tenant_id, row)


# ── View helpers ───────────────────────────────────────────────────────────────

def gsc_query_performance(
    tenant: str,
    property_id: str,
    *,
    start: Optional[str] = None,
    end: Optional[str] = None,
    limit: int = 100,
) -> List[Dict[str, Any]]:
    """Aggregate GSC rows by query; sort by impressions desc."""
    repo = get_gsc_query_row_repository()
    all_rows = repo.list_where(tenant, property_id=property_id)
    buckets: Dict[str, Dict[str, Any]] = {}

    for _, row in all_rows:
        if start and row.date < start:
            continue
        if end and row.date > end:
            continue
        q = row.query
        if q not in buckets:
            buckets[q] = {"query": q, "clicks": 0, "impressions": 0, "ctr_sum": 0.0, "pos_sum": 0.0, "count": 0}
        b = buckets[q]
        b["clicks"] += row.clicks
        b["impressions"] += row.impressions
        b["ctr_sum"] += row.ctr
        b["pos_sum"] += row.position
        b["count"] += 1

    out = []
    for b in buckets.values():
        count = b["count"] or 1
        out.append({
            "query": b["query"],
            "clicks": b["clicks"],
            "impressions": b["impressions"],
            "avg_ctr": round(b["ctr_sum"] / count, 4),
            "avg_position": round(b["pos_sum"] / count, 2),
        })

    out.sort(key=lambda r: r["impressions"], reverse=True)
    return out[:limit]


def gsc_positions_4_20(
    tenant: str,
    property_id: str,
    *,
    start: Optional[str] = None,
    end: Optional[str] = None,
    limit: int = 50,
) -> List[Dict[str, Any]]:
    """GSC rows with average position between 4 and 20 (striking-distance opportunities)."""
    rows = gsc_query_performance(tenant, property_id, start=start, end=end, limit=10000)
    out = [r for r in rows if 4.0 <= r["avg_position"] <= 20.0]
    return out[:limit]


def gsc_high_impression_low_ctr(
    tenant: str,
    property_id: str,
    *,
    start: Optional[str] = None,
    end: Optional[str] = None,
    min_impressions: int = 100,
    max_ctr: float = 0.02,
    limit: int = 50,
) -> List[Dict[str, Any]]:
    """Queries with high impressions but low CTR — title/meta optimisation opportunities."""
    rows = gsc_query_performance(tenant, property_id, start=start, end=end, limit=10000)
    out = [r for r in rows if r["impressions"] >= min_impressions and r["avg_ctr"] <= max_ctr]
    out.sort(key=lambda r: r["impressions"], reverse=True)
    return out[:limit]


def ga4_landing_performance(
    tenant: str,
    property_id: str,
    *,
    start: Optional[str] = None,
    end: Optional[str] = None,
    limit: int = 100,
) -> List[Dict[str, Any]]:
    """Aggregate GA4 rows by landing page; sort by sessions desc."""
    repo = get_ga4_landing_row_repository()
    all_rows = repo.list_where(tenant, property_id=property_id)
    buckets: Dict[str, Dict[str, Any]] = {}

    for _, row in all_rows:
        if start and row.date < start:
            continue
        if end and row.date > end:
            continue
        lp = row.landing_page
        if lp not in buckets:
            buckets[lp] = {
                "landing_page": lp,
                "sessions": 0, "engaged_sessions": 0,
                "new_users": 0, "conversions": 0.0,
                "eng_rate_sum": 0.0, "eng_time_sum": 0.0, "count": 0,
            }
        b = buckets[lp]
        b["sessions"] += row.sessions
        b["engaged_sessions"] += row.engaged_sessions
        b["new_users"] += row.new_users
        b["conversions"] += row.conversions
        b["eng_rate_sum"] += row.engagement_rate
        b["eng_time_sum"] += row.avg_engagement_time
        b["count"] += 1

    out = []
    for b in buckets.values():
        count = b["count"] or 1
        out.append({
            "landing_page": b["landing_page"],
            "sessions": b["sessions"],
            "engaged_sessions": b["engaged_sessions"],
            "new_users": b["new_users"],
            "conversions": round(b["conversions"], 4),
            "avg_engagement_rate": round(b["eng_rate_sum"] / count, 4),
            "avg_engagement_time": round(b["eng_time_sum"] / count, 2),
        })

    out.sort(key=lambda r: r["sessions"], reverse=True)
    return out[:limit]
