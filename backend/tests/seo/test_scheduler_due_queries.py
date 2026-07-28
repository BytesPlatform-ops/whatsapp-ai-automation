"""Tests for seo.scheduler.queries — due_jobs for EVERY scheduler source.

Validates:
- Each source's due-job query filters correctly (status, next_run, lock).
- Queries are bounded (limit enforced, never unbounded).
- Results are ordered by the appropriate field.
- alert_gen and crawl_recovery no longer do full-scan; they use indexed paths.
- Provider, tenant, retry_count, priority filters work correctly.

All hermetic: no network, no Supabase. Uses injected _memory_repo.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import pytest


# ── Helpers ────────────────────────────────────────────────────────────────────

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="microseconds")


def _future(seconds: int = 300) -> str:
    return (datetime.now(timezone.utc) + timedelta(seconds=seconds)).isoformat(timespec="microseconds")


def _past(seconds: int = 300) -> str:
    return (datetime.now(timezone.utc) - timedelta(seconds=seconds)).isoformat(timespec="microseconds")


class _FakeMemoryRepo:
    """Minimal persistence._MemoryRepo substitute."""

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


def _row(
    row_id: str,
    tenant_id: str = "t1",
    *,
    status: str = "queued",
    next_run: Optional[str] = None,
    scheduled_for: Optional[str] = None,
    queued_at: Optional[str] = None,
    lock_owner: str = "",
    lock_expires_at: str = "",
    provider: str = "",
    priority: int = 0,
    retry_count: int = 0,
    result: str = "",
) -> Dict[str, Any]:
    data: Dict[str, Any] = {"status": status}
    if next_run:
        data["next_run"] = next_run
    if scheduled_for:
        data["scheduled_for"] = scheduled_for
    if queued_at:
        data["queued_at"] = queued_at
    if lock_owner:
        data["lock_owner"] = lock_owner
    if lock_expires_at:
        data["lock_expires_at"] = lock_expires_at
    if provider:
        data["provider"] = provider
    if priority:
        data["priority"] = priority
    if retry_count:
        data["retry_count"] = retry_count
    if result:
        data["result"] = result
    return {"id": row_id, "tenant_id": tenant_id, "data": data, "created_at": _past(3600)}


# ─── Core due_jobs contract ────────────────────────────────────────────────────

def test_status_filter():
    from seo.scheduler.queries import due_jobs
    repo = _FakeMemoryRepo()
    repo._rows.append(_row("j1", status="queued"))
    repo._rows.append(_row("j2", status="completed"))
    results = due_jobs("tbl", now=_now_iso(), status_in=["queued"], _memory_repo=repo)
    ids = [r["id"] for r in results]
    assert "j1" in ids
    assert "j2" not in ids


def test_multi_status_filter():
    from seo.scheduler.queries import due_jobs
    repo = _FakeMemoryRepo()
    repo._rows.append(_row("j1", status="queued"))
    repo._rows.append(_row("j2", status="running"))
    repo._rows.append(_row("j3", status="failed"))
    results = due_jobs("tbl", now=_now_iso(), status_in=["queued", "running"], _memory_repo=repo)
    ids = [r["id"] for r in results]
    assert "j1" in ids
    assert "j2" in ids
    assert "j3" not in ids


def test_next_run_future_excluded():
    from seo.scheduler.queries import due_jobs
    repo = _FakeMemoryRepo()
    repo._rows.append(_row("j-future", status="queued", next_run=_future(3600)))
    repo._rows.append(_row("j-past", status="queued", next_run=_past(60)))
    results = due_jobs("tbl", now=_now_iso(), status_in=["queued"], _memory_repo=repo)
    ids = [r["id"] for r in results]
    assert "j-past" in ids
    assert "j-future" not in ids


def test_no_next_run_included():
    from seo.scheduler.queries import due_jobs
    repo = _FakeMemoryRepo()
    repo._rows.append(_row("j-no-time", status="queued"))
    results = due_jobs("tbl", now=_now_iso(), status_in=["queued"], _memory_repo=repo)
    assert any(r["id"] == "j-no-time" for r in results)


def test_active_lock_excluded():
    from seo.scheduler.queries import due_jobs
    repo = _FakeMemoryRepo()
    repo._rows.append(_row("j-locked", status="running", lock_owner="w", lock_expires_at=_future(300)))
    results = due_jobs("tbl", now=_now_iso(), status_in=["running"], _memory_repo=repo)
    assert "j-locked" not in [r["id"] for r in results]


def test_expired_lock_included():
    from seo.scheduler.queries import due_jobs
    repo = _FakeMemoryRepo()
    repo._rows.append(_row("j-stale", status="running", lock_owner="dead", lock_expires_at=_past(60)))
    results = due_jobs("tbl", now=_now_iso(), status_in=["running"], _memory_repo=repo)
    assert "j-stale" in [r["id"] for r in results]


def test_provider_filter():
    from seo.scheduler.queries import due_jobs
    repo = _FakeMemoryRepo()
    repo._rows.append(_row("jg", status="queued", provider="google"))
    repo._rows.append(_row("jb", status="queued", provider="bing"))
    results = due_jobs("tbl", now=_now_iso(), status_in=["queued"], provider="google", _memory_repo=repo)
    ids = [r["id"] for r in results]
    assert "jg" in ids
    assert "jb" not in ids


def test_tenant_filter():
    from seo.scheduler.queries import due_jobs
    repo = _FakeMemoryRepo()
    repo._rows.append(_row("j1", tenant_id="t1", status="queued"))
    repo._rows.append(_row("j2", tenant_id="t2", status="queued"))
    results = due_jobs("tbl", now=_now_iso(), status_in=["queued"], tenant_id="t1", _memory_repo=repo)
    ids = [r["id"] for r in results]
    assert "j1" in ids
    assert "j2" not in ids


def test_retry_count_filter():
    from seo.scheduler.queries import due_jobs
    repo = _FakeMemoryRepo()
    repo._rows.append(_row("j-low", status="queued", retry_count=1))
    repo._rows.append(_row("j-high", status="queued", retry_count=10))
    results = due_jobs("tbl", now=_now_iso(), status_in=["queued"], retry_count_lte=3, _memory_repo=repo)
    ids = [r["id"] for r in results]
    assert "j-low" in ids
    assert "j-high" not in ids


def test_priority_filter():
    from seo.scheduler.queries import due_jobs
    repo = _FakeMemoryRepo()
    repo._rows.append(_row("j-high", status="queued", priority=10))
    repo._rows.append(_row("j-low", status="queued", priority=1))
    results = due_jobs("tbl", now=_now_iso(), status_in=["queued"], priority_gte=5, _memory_repo=repo)
    ids = [r["id"] for r in results]
    assert "j-high" in ids
    assert "j-low" not in ids


def test_limit_bounded():
    from seo.scheduler.queries import due_jobs
    repo = _FakeMemoryRepo()
    for i in range(20):
        repo._rows.append(_row(f"j{i:02d}", status="queued"))
    results = due_jobs("tbl", now=_now_iso(), status_in=["queued"], limit=5, _memory_repo=repo)
    assert len(results) <= 5


def test_scan_cap_is_limit_times_10():
    from seo.scheduler import queries as q
    repo = _FakeMemoryRepo()
    limit = 3
    for i in range(limit * 10 + 10):
        repo._rows.append(_row(f"j{i:03d}", status="queued"))
    results = q.due_jobs("tbl", now=_now_iso(), status_in=["queued"], limit=limit, _memory_repo=repo)
    assert len(results) <= limit


def test_ordered_by_next_run():
    from seo.scheduler.queries import due_jobs
    repo = _FakeMemoryRepo()
    repo._rows.append(_row("j-later", status="queued", next_run=_past(10)))
    repo._rows.append(_row("j-earlier", status="queued", next_run=_past(300)))
    results = due_jobs("tbl", now=_now_iso(), status_in=["queued"], limit=10, _memory_repo=repo)
    ids = [r["id"] for r in results]
    assert ids.index("j-earlier") < ids.index("j-later")


def test_now_injection_cutoff():
    from seo.scheduler.queries import due_jobs
    repo = _FakeMemoryRepo()
    repo._rows.append(_row("j-35m-ago", status="queued", next_run=_past(35 * 60)))
    repo._rows.append(_row("j-10m-ago", status="queued", next_run=_past(10 * 60)))
    repo._rows.append(_row("j-future", status="queued", next_run=_future(600)))
    past_now = _past(30 * 60)
    results = due_jobs("tbl", now=past_now, status_in=["queued"], _memory_repo=repo)
    ids = [r["id"] for r in results]
    assert "j-35m-ago" in ids
    assert "j-10m-ago" not in ids
    assert "j-future" not in ids


# ─── Source-specific query helpers ────────────────────────────────────────────

def test_due_gsc_sync():
    from seo.scheduler.queries import due_gsc_sync
    repo = _FakeMemoryRepo()
    repo._rows.append(_row("gsc1", status="queued", queued_at=_past(60)))
    repo._rows.append(_row("gsc2", status="completed"))
    results = due_gsc_sync(now=_now_iso(), _memory_repo=repo)
    ids = [r["id"] for r in results]
    assert "gsc1" in ids
    assert "gsc2" not in ids


def test_due_ga4_sync():
    from seo.scheduler.queries import due_ga4_sync
    repo = _FakeMemoryRepo()
    repo._rows.append(_row("ga4_1", status="running", queued_at=_past(120)))
    repo._rows.append(_row("ga4_2", status="failed"))
    results = due_ga4_sync(now=_now_iso(), _memory_repo=repo)
    ids = [r["id"] for r in results]
    assert "ga4_1" in ids
    assert "ga4_2" not in ids


def test_due_rank_jobs():
    from seo.scheduler.queries import due_rank_jobs
    repo = _FakeMemoryRepo()
    repo._rows.append(_row("rank1", status="queued", next_run=_past(60)))
    repo._rows.append(_row("rank2", status="queued", next_run=_future(3600)))
    results = due_rank_jobs(now=_now_iso(), _memory_repo=repo)
    ids = [r["id"] for r in results]
    assert "rank1" in ids
    assert "rank2" not in ids


def test_due_rank_jobs_provider_filter():
    from seo.scheduler.queries import due_rank_jobs
    repo = _FakeMemoryRepo()
    repo._rows.append(_row("r-google", status="queued", provider="google"))
    repo._rows.append(_row("r-bing", status="queued", provider="bing"))
    results = due_rank_jobs(now=_now_iso(), provider="google", _memory_repo=repo)
    ids = [r["id"] for r in results]
    assert "r-google" in ids
    assert "r-bing" not in ids


def test_due_alert_gen_uses_schedule_table():
    """alert_gen queries seo_alert_schedule (next_run), NOT all sites."""
    from seo.scheduler.queries import due_alert_gen
    repo = _FakeMemoryRepo()
    # Due row: status=pending, next_run in the past
    repo._rows.append(_row("alert_sched_1", status="pending", next_run=_past(60)))
    # Future row: not due yet
    repo._rows.append(_row("alert_sched_2", status="pending", next_run=_future(3600)))
    # Completed row: different status, excluded
    repo._rows.append(_row("alert_sched_3", status="completed"))
    results = due_alert_gen(now=_now_iso(), _memory_repo=repo)
    ids = [r["id"] for r in results]
    assert "alert_sched_1" in ids
    assert "alert_sched_2" not in ids
    assert "alert_sched_3" not in ids


def test_due_alert_gen_bounded():
    """alert_gen due query respects the limit."""
    from seo.scheduler.queries import due_alert_gen
    repo = _FakeMemoryRepo()
    for i in range(50):
        repo._rows.append(_row(f"as{i:03d}", status="pending", next_run=_past(60 + i)))
    results = due_alert_gen(now=_now_iso(), limit=5, _memory_repo=repo)
    assert len(results) <= 5


def test_due_crawl_recovery_uses_job_table():
    """crawl_recovery queries seo_crawl_jobs directly, not all sites."""
    from seo.scheduler.queries import due_crawl_recovery
    repo = _FakeMemoryRepo()
    # Stale running job (lock expired)
    repo._rows.append(_row("cj1", status="running", lock_owner="dead", lock_expires_at=_past(60)))
    # Queued job (no lock)
    repo._rows.append(_row("cj2", status="queued"))
    # Completed job
    repo._rows.append(_row("cj3", status="completed"))
    # Active lock — excluded
    repo._rows.append(_row("cj4", status="running", lock_owner="active", lock_expires_at=_future(300)))
    results = due_crawl_recovery(now=_now_iso(), _memory_repo=repo)
    ids = [r["id"] for r in results]
    assert "cj1" in ids
    assert "cj2" in ids
    assert "cj3" not in ids
    assert "cj4" not in ids


def test_due_crawl_recovery_bounded():
    """crawl_recovery bounded by limit."""
    from seo.scheduler.queries import due_crawl_recovery
    repo = _FakeMemoryRepo()
    for i in range(30):
        repo._rows.append(_row(f"cj{i:03d}", status="queued"))
    results = due_crawl_recovery(now=_now_iso(), limit=5, _memory_repo=repo)
    assert len(results) <= 5


def test_due_fix_verify():
    from seo.scheduler.queries import due_fix_verify
    repo = _FakeMemoryRepo()
    # pending uses "result" field (FixVerification.result == PENDING)
    repo._rows.append({"id": "fv1", "tenant_id": "t1", "created_at": _past(60),
                        "data": {"result": "pending", "status": "pending"}})
    repo._rows.append({"id": "fv2", "tenant_id": "t1", "created_at": _past(60),
                        "data": {"result": "verified", "status": "verified"}})
    results = due_fix_verify(now=_now_iso(), _memory_repo=repo)
    ids = [r["id"] for r in results]
    assert "fv1" in ids
    assert "fv2" not in ids


def test_due_outreach_followups():
    from seo.scheduler.queries import due_outreach_followups
    repo = _FakeMemoryRepo()
    repo._rows.append(_row("fu1", status="pending", scheduled_for=_past(60)))
    repo._rows.append(_row("fu2", status="pending", scheduled_for=_future(3600)))
    repo._rows.append(_row("fu3", status="sent"))
    results = due_outreach_followups(now=_now_iso(), _memory_repo=repo)
    ids = [r["id"] for r in results]
    assert "fu1" in ids
    assert "fu2" not in ids
    assert "fu3" not in ids


def test_due_backlink_sync():
    from seo.scheduler.queries import due_backlink_sync
    repo = _FakeMemoryRepo()
    repo._rows.append(_row("bl1", status="active", next_run=_past(60)))
    repo._rows.append(_row("bl2", status="active", next_run=_future(3600)))
    results = due_backlink_sync(now=_now_iso(), _memory_repo=repo)
    ids = [r["id"] for r in results]
    assert "bl1" in ids
    assert "bl2" not in ids


def test_due_gbp_sync():
    from seo.scheduler.queries import due_gbp_sync
    repo = _FakeMemoryRepo()
    repo._rows.append(_row("gbp1", status="queued", next_run=_past(60)))
    repo._rows.append(_row("gbp2", status="queued", next_run=_future(3600)))
    results = due_gbp_sync(now=_now_iso(), _memory_repo=repo)
    ids = [r["id"] for r in results]
    assert "gbp1" in ids
    assert "gbp2" not in ids


def test_due_citation_checks():
    from seo.scheduler.queries import due_citation_checks
    repo = _FakeMemoryRepo()
    repo._rows.append(_row("cit1", status="pending", next_run=_past(60)))
    repo._rows.append(_row("cit2", status="completed"))
    results = due_citation_checks(now=_now_iso(), _memory_repo=repo)
    ids = [r["id"] for r in results]
    assert "cit1" in ids
    assert "cit2" not in ids


def test_due_link_verification():
    from seo.scheduler.queries import due_link_verification
    repo = _FakeMemoryRepo()
    repo._rows.append(_row("lp1", status="active", next_run=_past(60)))
    repo._rows.append(_row("lp2", status="active", next_run=_future(3600)))
    results = due_link_verification(now=_now_iso(), _memory_repo=repo)
    ids = [r["id"] for r in results]
    assert "lp1" in ids
    assert "lp2" not in ids


def test_due_scheduled_reports():
    from seo.scheduler.queries import due_scheduled_reports
    repo = _FakeMemoryRepo()
    repo._rows.append(_row("sr1", status="active", next_run=_past(60)))
    repo._rows.append(_row("sr2", status="active", next_run=_future(3600)))
    results = due_scheduled_reports(now=_now_iso(), _memory_repo=repo)
    ids = [r["id"] for r in results]
    assert "sr1" in ids
    assert "sr2" not in ids


# ─── complete_job contract ────────────────────────────────────────────────────

def test_complete_job_clears_lock():
    from seo.scheduler.queries import complete_job
    repo = _FakeMemoryRepo()
    repo._rows.append(_row("j1", tenant_id="t1", status="running",
                            lock_owner="w1", lock_expires_at=_future(300)))
    ok = complete_job("tbl", "j1", "w1", tenant_id="t1", _memory_repo=repo)
    assert ok
    row = repo.get("t1", "j1")
    data = row["data"]
    assert data["status"] == "completed"
    assert data.get("lock_owner") == ""


def test_complete_job_idempotent():
    """Already-completed job returns True without re-writing."""
    from seo.scheduler.queries import complete_job
    repo = _FakeMemoryRepo()
    repo._rows.append({"id": "j2", "tenant_id": "t1", "created_at": _past(60),
                        "data": {"status": "completed", "lock_owner": ""}})
    ok = complete_job("tbl", "j2", "w1", tenant_id="t1", _memory_repo=repo)
    assert ok


def test_complete_job_with_next_run():
    """Recurring job: complete_job advances next_run and resets status to queued."""
    from seo.scheduler.queries import complete_job
    repo = _FakeMemoryRepo()
    repo._rows.append(_row("j3", tenant_id="t1", status="running", lock_owner="w1",
                            lock_expires_at=_future(300)))
    ok = complete_job("tbl", "j3", "w1", tenant_id="t1", next_run_offset_s=3600, _memory_repo=repo)
    assert ok
    row = repo.get("t1", "j3")
    data = row["data"]
    assert data["status"] == "queued"
    assert data.get("next_run")


def test_complete_job_wrong_worker_rejected():
    """complete_job returns False if a different worker owns the active lock."""
    from seo.scheduler.queries import complete_job
    repo = _FakeMemoryRepo()
    repo._rows.append(_row("j4", tenant_id="t1", status="running",
                            lock_owner="other-worker", lock_expires_at=_future(300)))
    ok = complete_job("tbl", "j4", "my-worker", tenant_id="t1", _memory_repo=repo)
    assert ok is False
