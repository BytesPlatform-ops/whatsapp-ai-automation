"""Bounded retry policy — exponential backoff with deterministic jitter.

Jitter is derived from a hash of (job_id, attempt) rather than a random source so
the schedule is reproducible in tests and identical across worker instances. A
platform-provided ``retry_after`` (rate-limit) overrides the computed backoff.
"""

from __future__ import annotations

import hashlib
from datetime import timedelta

from .scheduling import now_utc


def _jitter_ratio(job_id: str, attempt: int, spread: float = 0.2) -> float:
    """Deterministic jitter in [1-spread, 1+spread]."""
    h = hashlib.sha1(f"{job_id}:{attempt}".encode("utf-8")).hexdigest()
    frac = int(h[:8], 16) / 0xFFFFFFFF          # 0..1
    return (1.0 - spread) + frac * (2 * spread)


def backoff_seconds(attempt: int, base: int, job_id: str = "", *, retry_after: int = 0) -> int:
    """Seconds to wait before attempt ``attempt`` (1-indexed). Capped at 1 hour."""
    if retry_after and retry_after > 0:
        return min(int(retry_after), 3600)
    raw = base * (2 ** max(0, attempt - 1))
    return int(min(raw * _jitter_ratio(job_id, attempt), 3600))


def next_retry_iso(attempt: int, base: int, job_id: str = "", *, retry_after: int = 0) -> str:
    secs = backoff_seconds(attempt, base, job_id, retry_after=retry_after)
    return (now_utc() + timedelta(seconds=secs)).isoformat(timespec="seconds")


def should_retry(attempt_count: int, max_attempts: int, retryable: bool) -> bool:
    """Retry only when the failure is transient AND attempts remain."""
    return retryable and attempt_count < max_attempts
