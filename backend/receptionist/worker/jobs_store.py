"""Durable job and attempt stores for the receptionist worker.

Two tables via persistence.table():
  - receptionist_worker_jobs     — one row per job
  - receptionist_worker_attempts — one row per execution attempt

Job lifecycle
-------------
  queued → claimed → running → completed
                             ↘ retry   (back to queued after backoff)
                             ↘ failed  (terminal, max_attempts exhausted)
                             ↘ cancelled (terminal, soft cancel)

Claim mechanism (multi-instance safe)
--------------------------------------
claim() re-reads the row immediately after writing. If the row still shows
this owner the claim succeeded; if another writer raced in first, the re-read
shows a different owner and we return False (no lock acquired). This is the
same optimistic write + re-read pattern used by seo.scheduler.queries.

Stale-lock recovery: due_jobs() includes rows whose lock_expires_at is in the
past, so a crashed worker's jobs naturally re-surface as candidates.

Backoff + jitter
----------------
next_run_at for retries uses exponential back-off: base_seconds * 2^attempt
capped at 3600s, plus a deterministic jitter derived from the job-id hash
(avoids thundering-herd without os.urandom and stays reproducible in tests).
"""

from __future__ import annotations

import hashlib
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

import persistence

_log = logging.getLogger("pixie.receptionist.worker.jobs_store")

T_JOBS = "receptionist_worker_jobs"
T_ATTEMPTS = "receptionist_worker_attempts"

# Valid status values
STATUS_QUEUED = "queued"
STATUS_CLAIMED = "claimed"
STATUS_RUNNING = "running"
STATUS_COMPLETED = "completed"
STATUS_RETRY = "retry"
STATUS_FAILED = "failed"
STATUS_CANCELLED = "cancelled"

TERMINAL_STATUSES = {STATUS_COMPLETED, STATUS_FAILED, STATUS_CANCELLED}

DEFAULT_MAX_ATTEMPTS = 5
BACKOFF_BASE_SECONDS = 15
BACKOFF_CAP_SECONDS = 3600


# ── time helpers ──────────────────────────────────────────────────────────────

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _parse_iso(s: str) -> Optional[datetime]:
    if not s:
        return None
    try:
        # Python 3.7+ fromisoformat doesn't accept trailing 'Z'
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None


# ── backoff helper ────────────────────────────────────────────────────────────

def _jitter_seconds(job_id: str, cap: int = 30) -> int:
    """Deterministic jitter in [0, cap) derived from the job_id hash.

    Using a hash makes tests reproducible (no os.urandom / random.random).
    """
    digest = int(hashlib.sha1(job_id.encode()).hexdigest(), 16)
    return digest % max(1, cap)


def _backoff_seconds(attempt: int, base: int = BACKOFF_BASE_SECONDS) -> int:
    """Exponential backoff: base * 2^(attempt-1), capped at BACKOFF_CAP_SECONDS."""
    delay = base * (2 ** max(0, attempt - 1))
    return min(delay, BACKOFF_CAP_SECONDS)


def _next_run_at(job_id: str, attempt: int) -> str:
    """ISO timestamp for the next retry, including deterministic jitter."""
    delay = _backoff_seconds(attempt) + _jitter_seconds(job_id)
    return (_now_utc() + timedelta(seconds=delay)).isoformat(timespec="seconds")


# ── row builders ──────────────────────────────────────────────────────────────

def _job_row(job: dict) -> dict:
    """Wrap a job dict as a persistence.envelope row for T_JOBS."""
    return persistence.envelope(
        row_id=job["id"],
        tenant_id=job["tenant_id"],
        data=job,
        created_at=job.get("created_at"),
    )


def _attempt_row(attempt: dict) -> dict:
    """Wrap an attempt dict as a persistence.envelope row for T_ATTEMPTS."""
    return persistence.envelope(
        row_id=attempt["id"],
        tenant_id=attempt["tenant_id"],
        data=attempt,
        created_at=attempt.get("created_at"),
    )


# ── repo singletons (same pattern as stores.py) ───────────────────────────────

_jobs_repo: Optional[Any] = None
_attempts_repo: Optional[Any] = None


def _jobs() -> Any:
    global _jobs_repo
    if _jobs_repo is None:
        _jobs_repo = persistence.table(T_JOBS)
    return _jobs_repo


def _attempts() -> Any:
    global _attempts_repo
    if _attempts_repo is None:
        _attempts_repo = persistence.table(T_ATTEMPTS)
    return _attempts_repo


def reset_stores() -> None:
    """Drop repo singletons — used by tests for hermetic isolation."""
    global _jobs_repo, _attempts_repo
    _jobs_repo = None
    _attempts_repo = None


# ── public API ────────────────────────────────────────────────────────────────

def enqueue(
    tenant_id: str,
    job_type: str,
    payload: Dict[str, Any],
    run_at: Optional[str] = None,
    max_attempts: int = DEFAULT_MAX_ATTEMPTS,
) -> str:
    """Enqueue a new durable job. Returns the new job_id.

    run_at defaults to now (immediately due). Pass an ISO timestamp to schedule
    for a future time (e.g. reminder at remind_at).
    """
    job_id = f"rj_{uuid.uuid4().hex[:12]}"
    now = _now_iso()
    job: Dict[str, Any] = {
        "id": job_id,
        "tenant_id": tenant_id,
        "job_type": job_type,
        "status": STATUS_QUEUED,
        "payload": payload,
        "run_at": run_at or now,
        "attempts": 0,
        "max_attempts": max_attempts,
        "lock_owner": "",
        "lock_expires_at": "",
        "last_error": "",
        "created_at": now,
        "updated_at": now,
    }
    _jobs().upsert(_job_row(job))
    _log.debug("enqueue job_id=%s type=%s tenant=%s run_at=%s", job_id, job_type, tenant_id, job.get("run_at"))
    return job_id


def _is_due(run_at_str: str, now_dt: datetime) -> bool:
    """Return True if run_at_str represents a time at or before now_dt.

    Handles both ISO format ("2026-08-02T10:00:00+00:00") and space-separated
    datetime strings ("2026-08-02 10:00") that the brain may produce.
    Falls back to string comparison if parsing fails.
    """
    if not run_at_str:
        return False
    # Try to parse as a datetime (handles both T-separator and space-separator)
    normalized = run_at_str.replace(" ", "T")
    # Append UTC if no timezone info
    if "+" not in normalized and normalized.count("Z") == 0 and "-" not in normalized[10:]:
        normalized += "+00:00"
    try:
        run_dt = datetime.fromisoformat(normalized.replace("Z", "+00:00"))
        if run_dt.tzinfo is None:
            run_dt = run_dt.replace(tzinfo=timezone.utc)
        return run_dt <= now_dt
    except (ValueError, AttributeError):
        pass
    # Fallback: string compare (works for well-formed ISO strings only)
    now_str = now_dt.isoformat(timespec="seconds")
    return run_at_str <= now_str


def due_jobs(now: Optional[datetime] = None, limit: int = 20) -> List[Tuple[str, dict]]:
    """Return jobs that are due to run (run_at <= now, status queued or retry,
    or claimed/running with expired lock).

    Returns a list of (job_id, job_dict) pairs.
    """
    now_dt = now or _now_utc()
    now_str = now_dt.isoformat(timespec="seconds")
    results: List[Tuple[str, dict]] = []

    # Scan all tenants — same approach as receptionist stores.RecordStore.list()
    repo = _jobs()
    try:
        all_rows = list(getattr(repo, "_rows", []))
    except Exception:
        all_rows = []

    for row in all_rows:
        job = row.get("data") or row
        if not isinstance(job, dict):
            continue
        status = job.get("status", "")
        run_at = job.get("run_at", "")
        lock_expires = job.get("lock_expires_at", "")

        if status in TERMINAL_STATUSES or status == STATUS_CANCELLED:
            continue

        if not _is_due(run_at, now_dt):
            continue

        if status in (STATUS_QUEUED, STATUS_RETRY):
            results.append((job["id"], dict(job)))
        elif status in (STATUS_CLAIMED, STATUS_RUNNING):
            # Stale lock — lock_expires_at is in the past
            if lock_expires and lock_expires < now_str:
                results.append((job["id"], dict(job)))

        if len(results) >= limit:
            break

    return results


def claim(
    job_id: str,
    tenant_id: str,
    owner: str,
    ttl: int = 60,
) -> bool:
    """Atomically claim a job for this worker instance.

    Reads the current row; claims only if:
      - status is queued/retry, OR
      - status is claimed/running but lock_expires_at is in the past (stale lock reclaim).

    Returns True on success, False if another owner holds a live lock.
    """
    repo = _jobs()
    now_str = _now_iso()
    row = repo.get(tenant_id, job_id)
    if row is None:
        return False
    job = row.get("data") or row
    if not isinstance(job, dict):
        return False

    status = job.get("status", "")
    lock_expires = job.get("lock_expires_at", "")

    if status in TERMINAL_STATUSES:
        return False

    # Is the current lock live (owned by someone else)?
    if status in (STATUS_CLAIMED, STATUS_RUNNING):
        if lock_expires and lock_expires >= now_str:
            if job.get("lock_owner") != owner:
                return False  # another live owner
            # same owner — idempotent success
            return True

    # Write our claim
    expires_at = (_now_utc() + timedelta(seconds=ttl)).isoformat(timespec="seconds")
    job["status"] = STATUS_CLAIMED
    job["lock_owner"] = owner
    job["lock_expires_at"] = expires_at
    job["updated_at"] = now_str
    repo.upsert(_job_row(job))

    # Re-read to verify we won the race
    row2 = repo.get(tenant_id, job_id)
    if row2 is None:
        return False
    job2 = row2.get("data") or row2
    if not isinstance(job2, dict):
        return False

    if job2.get("lock_owner") != owner:
        return False  # another writer overwrote us

    return True


def heartbeat(job_id: str, tenant_id: str, owner: str, ttl: int = 60) -> bool:
    """Extend the lock TTL for a running job. Returns False if we no longer own it."""
    repo = _jobs()
    row = repo.get(tenant_id, job_id)
    if row is None:
        return False
    job = row.get("data") or row
    if not isinstance(job, dict):
        return False
    if job.get("lock_owner") != owner:
        return False
    expires_at = (_now_utc() + timedelta(seconds=ttl)).isoformat(timespec="seconds")
    job["lock_expires_at"] = expires_at
    job["status"] = STATUS_RUNNING
    job["updated_at"] = _now_iso()
    repo.upsert(_job_row(job))
    return True


def complete(job_id: str, tenant_id: str, owner: str, result: Optional[Dict[str, Any]] = None) -> bool:
    """Mark a job completed (terminal). Returns False if we don't own it."""
    repo = _jobs()
    row = repo.get(tenant_id, job_id)
    if row is None:
        return False
    job = row.get("data") or row
    if not isinstance(job, dict):
        return False
    if job.get("lock_owner") != owner:
        return False

    now_str = _now_iso()
    job["status"] = STATUS_COMPLETED
    job["lock_owner"] = ""
    job["lock_expires_at"] = ""
    job["last_error"] = ""
    job["updated_at"] = now_str
    if result:
        job.setdefault("result", {}).update(result)

    # Record attempt
    attempt_id = f"ra_{uuid.uuid4().hex[:10]}"
    _attempts().upsert(_attempt_row({
        "id": attempt_id,
        "tenant_id": tenant_id,
        "job_id": job_id,
        "attempt_number": job.get("attempts", 0),
        "status": "completed",
        "result": result or {},
        "created_at": now_str,
    }))

    repo.upsert(_job_row(job))
    return True


def retry(
    job_id: str,
    tenant_id: str,
    owner: str,
    error: str = "",
    next_run_at: Optional[str] = None,
) -> bool:
    """Schedule a retry. If max_attempts exhausted, transitions to failed instead.

    Returns True if retry was scheduled, False if terminal-failed or ownership lost.
    """
    repo = _jobs()
    row = repo.get(tenant_id, job_id)
    if row is None:
        return False
    job = row.get("data") or row
    if not isinstance(job, dict):
        return False
    if job.get("lock_owner") != owner:
        return False

    now_str = _now_iso()
    attempts = (job.get("attempts") or 0) + 1
    max_attempts = job.get("max_attempts") or DEFAULT_MAX_ATTEMPTS

    # Record attempt
    attempt_id = f"ra_{uuid.uuid4().hex[:10]}"
    _attempts().upsert(_attempt_row({
        "id": attempt_id,
        "tenant_id": tenant_id,
        "job_id": job_id,
        "attempt_number": attempts,
        "status": "failed",
        "error": error,
        "created_at": now_str,
    }))

    job["attempts"] = attempts
    job["last_error"] = error
    job["lock_owner"] = ""
    job["lock_expires_at"] = ""
    job["updated_at"] = now_str

    if attempts >= max_attempts:
        job["status"] = STATUS_FAILED
        _log.warning("job_id=%s terminal failed after %d attempts: %s", job_id, attempts, error)
    else:
        job["status"] = STATUS_RETRY
        job["run_at"] = next_run_at or _next_run_at(job_id, attempts)
        _log.info("job_id=%s retry %d/%d run_at=%s", job_id, attempts, max_attempts, job["run_at"])

    repo.upsert(_job_row(job))
    return job["status"] == STATUS_RETRY


def fail(job_id: str, tenant_id: str, owner: str, error: str = "") -> bool:
    """Force-terminal a job as failed (regardless of remaining attempts)."""
    repo = _jobs()
    row = repo.get(tenant_id, job_id)
    if row is None:
        return False
    job = row.get("data") or row
    if not isinstance(job, dict):
        return False
    if job.get("lock_owner") != owner:
        return False

    now_str = _now_iso()
    job["status"] = STATUS_FAILED
    job["lock_owner"] = ""
    job["lock_expires_at"] = ""
    job["last_error"] = error
    job["updated_at"] = now_str
    repo.upsert(_job_row(job))
    return True


def cancel(job_id: str, tenant_id: str) -> bool:
    """Cancel a queued/retry job. No-op on terminal or claimed/running jobs."""
    repo = _jobs()
    row = repo.get(tenant_id, job_id)
    if row is None:
        return False
    job = row.get("data") or row
    if not isinstance(job, dict):
        return False

    if job.get("status") in TERMINAL_STATUSES:
        return False
    if job.get("status") in (STATUS_CLAIMED, STATUS_RUNNING):
        # Don't cancel a live running job — force fail via fail() instead
        return False

    job["status"] = STATUS_CANCELLED
    job["updated_at"] = _now_iso()
    repo.upsert(_job_row(job))
    return True


def get_job(job_id: str, tenant_id: str) -> Optional[dict]:
    """Retrieve a single job dict by id."""
    repo = _jobs()
    row = repo.get(tenant_id, job_id)
    if row is None:
        return None
    return row.get("data") or row


def health() -> Dict[str, Any]:
    """Return a summary of job counts by status (no secrets, safe to serialize)."""
    counts: Dict[str, int] = {}
    try:
        repo = _jobs()
        all_rows = list(getattr(repo, "_rows", []))
        for row in all_rows:
            job = row.get("data") or row
            s = job.get("status", "unknown") if isinstance(job, dict) else "unknown"
            counts[s] = counts.get(s, 0) + 1
    except Exception as exc:
        return {"error": str(exc), "counts": {}}
    return {
        "table": T_JOBS,
        "counts": counts,
        "total": sum(counts.values()),
    }
