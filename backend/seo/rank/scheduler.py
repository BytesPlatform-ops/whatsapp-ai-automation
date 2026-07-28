"""Durable rank-job scheduler primitives.

This module provides the scheduling machinery that a real cron/APScheduler/Celery
beat would call.  It does NOT wire a live background thread — it exposes two
plain callables:

  claim_due_jobs(now)  → List of (job_id, RankJob) that are ready to run and
                         have been atomically locked for this worker.
  run_claimed_job(job_id, job, *, worker_id, now, provider, today)
                       → summary dict (delegates to service.run_rank_check).

Design decisions
----------------
JOB LOCKING:   Before running, a job's lock_owner and lock_expires_at are set.
               claim_due_jobs() skips any job whose lock has not yet expired.
RESTART RECOVERY: A RUNNING job whose lock_expires_at is in the past (expired)
               is treated as abandoned and re-claimed — run_rank_check is
               idempotent for (keyword_id, date) so re-running is safe.
RETRY/BACKOFF: On error the job transitions back to QUEUED with retry_count+1
               and a scheduled_for that is capped-exponential backed off from
               the failure time.
PLAN FREQUENCY: daily / weekly / manual.  Daily cadence is rejected via
               check_seo_limit when the plan does not allow it.
BATCH:         claim_due_jobs() returns all claimable jobs; the caller controls
               concurrency (e.g. ThreadPoolExecutor).

All time comparisons use injected ``now`` (ISO-8601 string) for determinism.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from seo.jobs.provider import RankProvider, get_rank_provider
from seo.metering_search import LIMIT_TRACKED_KEYWORDS, check_seo_limit
from seo.search_stores import (
    RankJob,
    SyncJobStatus,
    _now,
    get_rank_job_repository,
)

_log = logging.getLogger("pixie.seo.rank.scheduler")

# ── Constants ─────────────────────────────────────────────────────────────────

# How long a lock is held before it is considered expired and the job reclaimable.
LOCK_TTL_SECONDS: int = 300  # 5 minutes

# Retry cap — after this many failures the job is left in FAILED permanently.
MAX_RETRY_COUNT: int = 5

# Backoff base in seconds (doubles per retry, capped at MAX_BACKOFF_SECONDS).
BASE_BACKOFF_SECONDS: int = 60
MAX_BACKOFF_SECONDS: int = 3600  # 1 hour


# ── Internal helpers ──────────────────────────────────────────────────────────

def _parse_dt(iso: str) -> Optional[datetime]:
    """Parse an ISO-8601 string to a UTC-aware datetime; return None on failure."""
    if not iso:
        return None
    try:
        dt = datetime.fromisoformat(iso)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except (ValueError, TypeError):
        return None


def _now_dt(now: Optional[str]) -> datetime:
    """Return the current time as a UTC datetime, from injected ``now`` or real clock."""
    if now:
        parsed = _parse_dt(now)
        if parsed:
            return parsed
    return datetime.now(timezone.utc)


def _add_seconds(iso_base: str, seconds: int) -> str:
    """Return iso_base + seconds as an ISO string (UTC)."""
    base = _parse_dt(iso_base) or datetime.now(timezone.utc)
    return (base + timedelta(seconds=seconds)).isoformat()


def _backoff_seconds(retry_count: int) -> int:
    seconds = BASE_BACKOFF_SECONDS * (2 ** max(0, retry_count - 1))
    return min(seconds, MAX_BACKOFF_SECONDS)


def _is_lock_expired(job: RankJob, now_dt: datetime) -> bool:
    """True when the job has no lock OR its lock_expires_at is in the past."""
    if not job.lock_owner or not job.lock_expires_at:
        return True
    expiry = _parse_dt(job.lock_expires_at)
    if expiry is None:
        return True
    return now_dt >= expiry


def _is_due(job: RankJob, now_dt: datetime) -> bool:
    """True when scheduled_for is empty (immediate) or in the past."""
    if not job.scheduled_for:
        return True
    sched = _parse_dt(job.scheduled_for)
    if sched is None:
        return True
    return now_dt >= sched


def _frequency_allowed(tenant_id: str, frequency: str) -> bool:
    """Check whether the tenant's plan allows the requested run frequency.

    ``daily`` cadence is gated behind ``LIMIT_TRACKED_KEYWORDS``; if the plan
    has no cap or explicitly allows the resource, we treat the frequency as
    permitted.  This is intentionally permissive — the hard enforcement lives
    in enforce_seo_limit() inside service.run_rank_check().
    """
    if frequency not in ("daily", "weekly"):
        # "manual" and unknown frequencies are always allowed
        return True
    result = check_seo_limit(tenant_id, LIMIT_TRACKED_KEYWORDS, used=0)
    # If the plan doesn't allow this resource at all, block daily cadence.
    return result.get("allowed", True)


# ── Public API ────────────────────────────────────────────────────────────────

def claim_due_jobs(
    now: Optional[str] = None,
    *,
    worker_id: Optional[str] = None,
) -> List[Tuple[str, RankJob]]:
    """Discover and atomically lock all rank jobs that are due to run.

    A job is claimable when:
      - status is QUEUED, OR
      - status is RUNNING but lock_expires_at is in the past (restart recovery).
    AND:
      - scheduled_for is empty or in the past.
      - The job's frequency is allowed by the tenant's plan.
      - The job has not exceeded MAX_RETRY_COUNT.

    Returns a list of ``(job_id, RankJob)`` that have been locked by this worker.
    Other workers will not claim the same jobs until the lock TTL expires.
    """
    worker_id = worker_id or ("worker-%s" % uuid.uuid4().hex[:12])
    now_dt = _now_dt(now)
    lock_expiry = (now_dt + timedelta(seconds=LOCK_TTL_SECONDS)).isoformat()

    job_repo = get_rank_job_repository()
    claimed: List[Tuple[str, RankJob]] = []

    # Gather candidate tenants from all stored jobs (memory/file mode).
    # In production Supabase mode a SQL query would be more efficient.
    all_jobs: List[Tuple[str, RankJob]] = []

    # The _AutoRepo wraps a persistence.Repo whose in-memory backend stores
    # all rows in a plain list ``_rows`` (see persistence._MemoryRepo).
    # We scan that list directly when available; Supabase deployments would
    # use a SQL query instead. This works for both memory and file backends.
    try:
        repo_backend = job_repo._repo  # the persistence.Repo instance
        # Memory/File: _rows is a flat list of all rows across all tenants
        raw_rows = getattr(repo_backend, "_rows", None)
        if raw_rows is not None:
            for row in list(raw_rows):  # snapshot to avoid mutation-while-iterating
                built = job_repo._build(row)
                if built:
                    built_id, built_obj = built
                    all_jobs.append((row["id"], built_obj))
        else:
            # Fallback: nothing to iterate (Supabase would handle via SQL)
            all_jobs = []
    except Exception as exc:
        _log.warning("claim_due_jobs: could not scan jobs: %s", exc)
        all_jobs = []

    for job_id, job in all_jobs:
        try:
            # Status filter
            if job.status not in (SyncJobStatus.QUEUED, SyncJobStatus.RUNNING):
                continue

            # For RUNNING, only reclaim if lock is expired (restart recovery)
            if job.status == SyncJobStatus.RUNNING and not _is_lock_expired(job, now_dt):
                continue

            # For QUEUED with an active lock (shouldn't happen, but guard)
            if job.status == SyncJobStatus.QUEUED and not _is_lock_expired(job, now_dt):
                continue

            # Retry cap
            if job.retry_count >= MAX_RETRY_COUNT:
                _log.info(
                    "claim_due_jobs: skipping job=%s retry_count=%d (capped)",
                    job_id, job.retry_count,
                )
                continue

            # Due-time check
            if not _is_due(job, now_dt):
                continue

            # Frequency / plan check
            if not _frequency_allowed(job.tenant_id, job.frequency):
                _log.info(
                    "claim_due_jobs: skipping job=%s frequency=%s (plan disallows)",
                    job_id, job.frequency,
                )
                continue

            # Atomically acquire the lock
            job_repo.update(
                job.tenant_id,
                job_id,
                status=SyncJobStatus.RUNNING,
                lock_owner=worker_id,
                lock_expires_at=lock_expiry,
                started_at=_now(),
            )
            # Re-fetch to confirm lock was set (best-effort in memory mode)
            locked_row = job_repo.get(job.tenant_id, job_id)
            if not locked_row:
                continue
            _, locked_job = locked_row
            if locked_job.lock_owner != worker_id:
                # Another worker beat us (shouldn't happen in single-process, but
                # guard for multi-process/multi-instance deployments)
                continue

            claimed.append((job_id, locked_job))

        except Exception as exc:
            _log.warning("claim_due_jobs: error processing job=%s: %s", job_id, exc)

    return claimed


def run_claimed_job(
    job_id: str,
    job: RankJob,
    *,
    worker_id: Optional[str] = None,
    now: Optional[str] = None,
    provider: Optional[RankProvider] = None,
    today: Optional[str] = None,
) -> Dict[str, Any]:
    """Run a previously-claimed rank job (i.e. one returned by claim_due_jobs).

    On success: job transitions to COMPLETED.
    On failure: job transitions back to QUEUED with retry_count++ and backoff
                (or to FAILED when MAX_RETRY_COUNT is reached).

    Parameters
    ----------
    job_id:    The RankJob row ID.
    job:       The RankJob dataclass (as returned by claim_due_jobs).
    worker_id: The worker identity string used when locking (for logging).
    now:       Override "current time" (ISO-8601) for deterministic tests.
    provider:  Override the rank provider (for tests).
    today:     Override the check date (YYYY-MM-DD) — inject in tests only.
    """
    # Lazy import to avoid circular dependency at module level (scheduler is
    # imported by __init__.py which also imports service).  Patching works
    # via ``seo.rank.service.run_rank_check``.
    import seo.rank.service as _svc
    run_rank_check = _svc.run_rank_check

    job_repo = get_rank_job_repository()
    now_str = now or _now()

    try:
        summary = run_rank_check(
            job.tenant_id,
            job.project_id,
            job.keyword_ids,
            location=getattr(job, "location", "us") or "us",
            device=getattr(job, "device", "desktop") or "desktop",
            provider=provider,
            today=today,
        )

        # Success — mark COMPLETED; clear the lock
        job_repo.update(
            job.tenant_id,
            job_id,
            status=SyncJobStatus.COMPLETED,
            checked_count=summary.get("checked", 0),
            error_count=summary.get("error_count", 0),
            lock_owner="",
            lock_expires_at="",
            finished_at=_now(),
            error="",
        )
        return {"job_id": job_id, "status": "completed", "summary": summary}

    except Exception as exc:
        new_retry = job.retry_count + 1
        _log.warning(
            "run_claimed_job: job=%s attempt=%d error: %s", job_id, new_retry, exc
        )

        if new_retry >= MAX_RETRY_COUNT:
            # Permanently failed
            job_repo.update(
                job.tenant_id,
                job_id,
                status=SyncJobStatus.FAILED,
                retry_count=new_retry,
                lock_owner="",
                lock_expires_at="",
                error=str(exc),
                finished_at=_now(),
            )
            return {"job_id": job_id, "status": "failed", "error": str(exc)}

        # Schedule a backoff retry
        backoff_s = _backoff_seconds(new_retry)
        next_run = _add_seconds(now_str, backoff_s)
        job_repo.update(
            job.tenant_id,
            job_id,
            status=SyncJobStatus.QUEUED,
            retry_count=new_retry,
            lock_owner="",
            lock_expires_at="",
            scheduled_for=next_run,
            error=str(exc),
        )
        return {
            "job_id": job_id,
            "status": "retrying",
            "retry_count": new_retry,
            "next_run": next_run,
            "error": str(exc),
        }
