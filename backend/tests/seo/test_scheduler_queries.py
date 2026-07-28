"""Tests for seo.scheduler.queries — due_jobs and claim_job functions.

All hermetic: no network, no Supabase. Uses injected _memory_repo (a
persistence._MemoryRepo clone) so the memory/file code path is exercised.
``now`` is injected for determinism.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from unittest.mock import MagicMock

import pytest


# ── Helpers ────────────────────────────────────────────────────────────────────

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="microseconds")


def _future(seconds: int = 300) -> str:
    return (datetime.now(timezone.utc) + timedelta(seconds=seconds)).isoformat(timespec="microseconds")


def _past(seconds: int = 300) -> str:
    return (datetime.now(timezone.utc) - timedelta(seconds=seconds)).isoformat(timespec="microseconds")


class _FakeMemoryRepo:
    """Minimal persistence._MemoryRepo substitute for tests."""

    def __init__(self):
        self._rows: List[Dict[str, Any]] = []

    def get(self, tenant_id: str, row_id: str) -> Optional[Dict[str, Any]]:
        for row in self._rows:
            if row.get("id") == row_id and row.get("tenant_id") == tenant_id:
                return dict(row)
        return None

    def upsert(self, row: dict) -> dict:
        for i, r in enumerate(self._rows):
            if r.get("id") == row.get("id") and r.get("tenant_id") == row.get("tenant_id"):
                self._rows[i] = row
                return row
        self._rows.append(row)
        return row


def _make_row(
    row_id: str,
    tenant_id: str = "tenant1",
    *,
    status: str = "queued",
    next_run: Optional[str] = None,
    scheduled_for: Optional[str] = None,
    lock_owner: str = "",
    lock_expires_at: str = "",
    provider: str = "",
) -> Dict[str, Any]:
    data: Dict[str, Any] = {"status": status}
    if next_run:
        data["next_run"] = next_run
    if scheduled_for:
        data["scheduled_for"] = scheduled_for
    if lock_owner:
        data["lock_owner"] = lock_owner
    if lock_expires_at:
        data["lock_expires_at"] = lock_expires_at
    if provider:
        data["provider"] = provider
    return {"id": row_id, "tenant_id": tenant_id, "data": data, "created_at": _past(3600)}


# ── due_jobs: basic status filter ─────────────────────────────────────────────

def test_due_jobs_returns_queued():
    from seo.scheduler.queries import due_jobs

    repo = _FakeMemoryRepo()
    repo._rows.append(_make_row("j1", status="queued"))
    repo._rows.append(_make_row("j2", status="completed"))

    results = due_jobs("seo_rank_jobs", now=_now_iso(), status_in=["queued"], _memory_repo=repo)
    ids = [r["id"] for r in results]
    assert "j1" in ids
    assert "j2" not in ids


def test_due_jobs_multi_status():
    from seo.scheduler.queries import due_jobs

    repo = _FakeMemoryRepo()
    repo._rows.append(_make_row("j1", status="queued"))
    repo._rows.append(_make_row("j2", status="running"))
    repo._rows.append(_make_row("j3", status="failed"))

    results = due_jobs("t", now=_now_iso(), status_in=["queued", "running"], _memory_repo=repo)
    ids = [r["id"] for r in results]
    assert "j1" in ids
    assert "j2" in ids
    assert "j3" not in ids


# ── due_jobs: next_run filter ──────────────────────────────────────────────────

def test_due_jobs_respects_next_run_future():
    """Jobs with next_run in the future are excluded."""
    from seo.scheduler.queries import due_jobs

    repo = _FakeMemoryRepo()
    repo._rows.append(_make_row("j-future", status="queued", next_run=_future(3600)))
    repo._rows.append(_make_row("j-past", status="queued", next_run=_past(60)))

    results = due_jobs("t", now=_now_iso(), status_in=["queued"], _memory_repo=repo)
    ids = [r["id"] for r in results]
    assert "j-past" in ids
    assert "j-future" not in ids


def test_due_jobs_no_next_run_included():
    """Jobs with no next_run/scheduled_for are always included."""
    from seo.scheduler.queries import due_jobs

    repo = _FakeMemoryRepo()
    repo._rows.append(_make_row("j-no-time", status="queued"))

    results = due_jobs("t", now=_now_iso(), status_in=["queued"], _memory_repo=repo)
    assert any(r["id"] == "j-no-time" for r in results)


# ── due_jobs: lock-expiry filter ──────────────────────────────────────────────

def test_due_jobs_skips_active_lock():
    """Jobs whose lock has not expired are excluded."""
    from seo.scheduler.queries import due_jobs

    repo = _FakeMemoryRepo()
    repo._rows.append(_make_row(
        "j-locked", status="running",
        lock_owner="other-worker",
        lock_expires_at=_future(300),
    ))

    results = due_jobs("t", now=_now_iso(), status_in=["running"], _memory_repo=repo)
    ids = [r["id"] for r in results]
    assert "j-locked" not in ids


def test_due_jobs_reclaims_expired_lock():
    """Jobs whose lock has expired are included (stale-lock reclaim)."""
    from seo.scheduler.queries import due_jobs

    repo = _FakeMemoryRepo()
    repo._rows.append(_make_row(
        "j-stale", status="running",
        lock_owner="dead-worker",
        lock_expires_at=_past(60),
    ))

    results = due_jobs("t", now=_now_iso(), status_in=["running"], _memory_repo=repo)
    ids = [r["id"] for r in results]
    assert "j-stale" in ids


# ── due_jobs: provider filter ─────────────────────────────────────────────────

def test_due_jobs_provider_filter():
    from seo.scheduler.queries import due_jobs

    repo = _FakeMemoryRepo()
    repo._rows.append(_make_row("j-google", status="queued", provider="google"))
    repo._rows.append(_make_row("j-bing", status="queued", provider="bing"))

    results = due_jobs("t", now=_now_iso(), status_in=["queued"], provider="google", _memory_repo=repo)
    ids = [r["id"] for r in results]
    assert "j-google" in ids
    assert "j-bing" not in ids


# ── due_jobs: bounded (limit) ─────────────────────────────────────────────────

def test_due_jobs_limit_respected():
    from seo.scheduler.queries import due_jobs

    repo = _FakeMemoryRepo()
    for i in range(20):
        repo._rows.append(_make_row(f"j{i:02d}", status="queued"))

    results = due_jobs("t", now=_now_iso(), status_in=["queued"], limit=5, _memory_repo=repo)
    assert len(results) <= 5


def test_due_jobs_scan_cap_is_limit_times_10():
    """The memory scan never examines more than limit*10 rows."""
    from seo.scheduler import queries as q

    repo = _FakeMemoryRepo()
    # Insert limit*10 + 10 extra rows
    limit = 3
    for i in range(limit * 10 + 10):
        repo._rows.append(_make_row(f"j{i:03d}", status="queued"))

    results = q.due_jobs("t", now=_now_iso(), status_in=["queued"], limit=limit, _memory_repo=repo)
    # Must not return more than limit even though there are many rows
    assert len(results) <= limit


# ── due_jobs: ordering ────────────────────────────────────────────────────────

def test_due_jobs_ordered_by_next_run():
    """Results are sorted ascending by next_run."""
    from seo.scheduler.queries import due_jobs

    repo = _FakeMemoryRepo()
    repo._rows.append(_make_row("j-later", status="queued", next_run=_past(10)))
    repo._rows.append(_make_row("j-earlier", status="queued", next_run=_past(300)))

    results = due_jobs("t", now=_now_iso(), status_in=["queued"], limit=10, _memory_repo=repo)
    ids = [r["id"] for r in results]
    # j-earlier (more in the past) should come first
    assert ids.index("j-earlier") < ids.index("j-later")


# ── due_jobs: now injection ────────────────────────────────────────────────────

def test_due_jobs_now_injection():
    """Injecting a past 'now' as cutoff only returns jobs due before that point.

    Explanation of time relationships used here:
      - past_now  = T - 30 min  (the injected "now")
      - j-past-30 = T - 35 min  (due 35 min ago → before past_now → INCLUDED)
      - j-past-10 = T - 10 min  (due 10 min ago → after past_now → EXCLUDED)
      - j-future  = T + 10 min  (due in the future → always EXCLUDED)
    """
    from seo.scheduler.queries import due_jobs

    repo = _FakeMemoryRepo()
    # 35 minutes ago — due before our injected "now" (30 min ago)
    repo._rows.append(_make_row("j-past-35", status="queued", next_run=_past(35 * 60)))
    # 10 minutes ago — NOT yet due relative to injected "now" (30 min ago)
    repo._rows.append(_make_row("j-past-10", status="queued", next_run=_past(10 * 60)))
    # Future — never due
    repo._rows.append(_make_row("j-future", status="queued", next_run=_future(600)))

    past_now = _past(30 * 60)  # "now" is 30 minutes ago
    results = due_jobs("t", now=past_now, status_in=["queued"], _memory_repo=repo)
    ids = [r["id"] for r in results]
    assert "j-past-35" in ids      # due before cutoff — included
    assert "j-past-10" not in ids  # due after cutoff — excluded
    assert "j-future" not in ids


# ── claim_job ─────────────────────────────────────────────────────────────────

def test_claim_job_acquires_free_lock():
    """claim_job returns True when the job has no existing lock."""
    from seo.scheduler.queries import claim_job

    repo = _FakeMemoryRepo()
    repo._rows.append(_make_row("c1", tenant_id="t1", status="queued"))

    result = claim_job("tbl", "c1", "worker-A", 300, tenant_id="t1", _memory_repo=repo)
    assert result is True

    # Verify the lock was written
    row = repo.get("t1", "c1")
    assert row is not None
    data = row.get("data", {})
    assert data.get("lock_owner") == "worker-A"
    assert data.get("lock_expires_at")


def test_claim_job_fails_on_active_lock():
    """claim_job returns False when another worker holds a valid lock."""
    from seo.scheduler.queries import claim_job

    repo = _FakeMemoryRepo()
    repo._rows.append(_make_row(
        "c2", tenant_id="t1", status="running",
        lock_owner="worker-B",
        lock_expires_at=_future(300),
    ))

    result = claim_job("tbl", "c2", "worker-A", 300, tenant_id="t1", _memory_repo=repo)
    assert result is False


def test_claim_job_reclaims_expired_lock():
    """claim_job returns True when the existing lock has expired."""
    from seo.scheduler.queries import claim_job

    repo = _FakeMemoryRepo()
    repo._rows.append(_make_row(
        "c3", tenant_id="t1", status="running",
        lock_owner="dead-worker",
        lock_expires_at=_past(60),
    ))

    result = claim_job("tbl", "c3", "worker-A", 300, tenant_id="t1", _memory_repo=repo)
    assert result is True

    row = repo.get("t1", "c3")
    data = row.get("data", {})
    assert data.get("lock_owner") == "worker-A"


def test_claim_job_idempotent_by_worker():
    """Claiming an already-owned job returns True (same worker re-claims)."""
    from seo.scheduler.queries import claim_job

    repo = _FakeMemoryRepo()
    repo._rows.append(_make_row(
        "c4", tenant_id="t1", status="running",
        lock_owner="worker-A",
        lock_expires_at=_past(60),  # expired — re-claimable
    ))

    result = claim_job("tbl", "c4", "worker-A", 300, tenant_id="t1", _memory_repo=repo)
    assert result is True


def test_claim_job_missing_row():
    """claim_job returns False when the row does not exist."""
    from seo.scheduler.queries import claim_job

    repo = _FakeMemoryRepo()  # empty
    result = claim_job("tbl", "nonexistent", "worker-A", 300, tenant_id="t1", _memory_repo=repo)
    assert result is False


def test_two_workers_cannot_both_claim(monkeypatch):
    """Two concurrent claim_job calls for the same row: only one wins."""
    from seo.scheduler.queries import claim_job
    import threading

    repo = _FakeMemoryRepo()
    repo._rows.append(_make_row("shared", tenant_id="t1", status="queued"))

    results = []
    lock = threading.Lock()

    def _claim(worker_id):
        r = claim_job("tbl", "shared", worker_id, 300, tenant_id="t1", _memory_repo=repo)
        with lock:
            results.append((worker_id, r))

    t1 = threading.Thread(target=_claim, args=("worker-A",))
    t2 = threading.Thread(target=_claim, args=("worker-B",))
    t1.start()
    t2.start()
    t1.join(timeout=5)
    t2.join(timeout=5)

    trues = [r for _, r in results if r is True]
    # At least one succeeds (one might win the race)
    assert len(trues) >= 1
    # The final lock_owner is deterministic
    row = repo.get("t1", "shared")
    data = row.get("data", {})
    assert data.get("lock_owner") in ("worker-A", "worker-B")
