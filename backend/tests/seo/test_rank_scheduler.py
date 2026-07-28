"""Tests for seo.rank.scheduler — job locking, retry/backoff, restart recovery, batch.

All tests are offline (MockRankProvider, in-memory repos).
Time is injected via the ``now`` and ``today`` parameters — no wall-clock reliance.
"""

from __future__ import annotations

import os
import sys
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from seo.jobs.provider import MockRankProvider
from seo.rank.scheduler import (
    BASE_BACKOFF_SECONDS,
    LOCK_TTL_SECONDS,
    MAX_RETRY_COUNT,
    claim_due_jobs,
    run_claimed_job,
    _backoff_seconds,
)
from seo.search_stores import (
    Keyword,
    KeywordProject,
    RankJob,
    SyncJobStatus,
    _now,
    reset_repositories,
    get_keyword_repository,
    get_keyword_project_repository,
    get_rank_job_repository,
)


# ── Constants / helpers ───────────────────────────────────────────────────────

TENANT = "t_sched"
PROJECT_NAME = "proj_sched_1"
TODAY = "2026-07-01"

T0 = "2026-07-01T10:00:00+00:00"
T1_PAST_LOCK = (
    datetime(2026, 7, 1, 10, 0, 0, tzinfo=timezone.utc)
    + timedelta(seconds=LOCK_TTL_SECONDS + 60)
).isoformat()


def _make_project(tenant: str = TENANT) -> str:
    repo = get_keyword_project_repository()
    pid, _ = repo.create(KeywordProject(
        tenant_id=tenant,
        name="Sched Project",
        default_domain="https://example.com",
    ))
    return pid


def _make_keyword(tenant: str, project_id: str, text: str = "scheduler kw") -> str:
    repo = get_keyword_repository()
    kid, _ = repo.create(Keyword(
        tenant_id=tenant,
        project_id=project_id,
        keyword=text,
        target_page="https://example.com/page",
    ))
    return kid


def _create_rank_job(
    project_id: str,
    tenant: str = TENANT,
    frequency: str = "daily",
    status: SyncJobStatus = SyncJobStatus.QUEUED,
    scheduled_for: str = "",
    retry_count: int = 0,
    lock_owner: str = "",
    lock_expires_at: str = "",
    keyword_ids=None,
) -> str:
    repo = get_rank_job_repository()
    job = RankJob(
        tenant_id=tenant,
        project_id=project_id,
        status=status,
        frequency=frequency,
        keyword_ids=keyword_ids or [],
        scheduled_for=scheduled_for,
        retry_count=retry_count,
        lock_owner=lock_owner,
        lock_expires_at=lock_expires_at,
        queued_at=_now(),
    )
    jid, _ = repo.create(job)
    return jid


# ── Tests: claim_due_jobs ─────────────────────────────────────────────────────

class TestClaimDueJobs(unittest.TestCase):

    def setUp(self):
        reset_repositories()

    def tearDown(self):
        reset_repositories()

    def _setup(self):
        pid = _make_project()
        kid = _make_keyword(TENANT, pid)
        return pid, kid

    def test_queued_job_is_claimed(self):
        pid, kid = self._setup()
        jid = _create_rank_job(project_id=pid, keyword_ids=[kid])
        claimed = claim_due_jobs(T0, worker_id="w1")
        job_ids = [j for j, _ in claimed]
        self.assertIn(jid, job_ids)

    def test_locked_job_not_claimed_twice(self):
        """A job claimed by worker-1 must not be claimed by worker-2 before TTL expires."""
        pid, kid = self._setup()
        jid = _create_rank_job(project_id=pid, keyword_ids=[kid])

        claimed1 = claim_due_jobs(T0, worker_id="w1")
        # T0 is before lock expiry — a second worker should not claim the same job
        claimed2 = claim_due_jobs(T0, worker_id="w2")
        ids1 = {j for j, _ in claimed1}
        ids2 = {j for j, _ in claimed2}
        self.assertIn(jid, ids1)
        self.assertNotIn(jid, ids2)

    def test_expired_lock_running_job_reclaimed(self):
        """A RUNNING job whose lock is expired (past lock_expires_at) is reclaimed."""
        pid, kid = self._setup()
        # Create a RUNNING job with a lock that expired well before T1_PAST_LOCK
        jid = _create_rank_job(
            project_id=pid,
            keyword_ids=[kid],
            status=SyncJobStatus.RUNNING,
            lock_owner="dead-worker",
            lock_expires_at="2026-07-01T09:00:00+00:00",
        )
        claimed = claim_due_jobs(T1_PAST_LOCK, worker_id="w_new")
        ids = [j for j, _ in claimed]
        self.assertIn(jid, ids, "Expired-lock RUNNING job should be reclaimed")

    def test_completed_job_not_claimed(self):
        """A COMPLETED job is never re-claimed."""
        pid, kid = self._setup()
        jid = _create_rank_job(project_id=pid, keyword_ids=[kid], status=SyncJobStatus.COMPLETED)
        claimed = claim_due_jobs(T0, worker_id="w1")
        ids = [j for j, _ in claimed]
        self.assertNotIn(jid, ids)

    def test_failed_job_not_claimed(self):
        """A FAILED job (max retries exhausted) is not re-claimed."""
        pid, kid = self._setup()
        jid = _create_rank_job(
            project_id=pid, keyword_ids=[kid],
            status=SyncJobStatus.FAILED, retry_count=MAX_RETRY_COUNT,
        )
        claimed = claim_due_jobs(T0, worker_id="w1")
        ids = [j for j, _ in claimed]
        self.assertNotIn(jid, ids)

    def test_scheduled_future_job_not_claimed(self):
        """A job scheduled for the future is NOT claimed yet."""
        pid, kid = self._setup()
        future = "2026-07-02T10:00:00+00:00"
        jid = _create_rank_job(project_id=pid, keyword_ids=[kid], scheduled_for=future)
        claimed = claim_due_jobs(T0, worker_id="w1")
        ids = [j for j, _ in claimed]
        self.assertNotIn(jid, ids)

    def test_scheduled_past_job_is_claimed(self):
        """A job whose scheduled_for is in the past IS claimed."""
        pid, kid = self._setup()
        past = "2026-06-30T10:00:00+00:00"
        jid = _create_rank_job(project_id=pid, keyword_ids=[kid], scheduled_for=past)
        claimed = claim_due_jobs(T0, worker_id="w1")
        ids = [j for j, _ in claimed]
        self.assertIn(jid, ids)

    def test_batch_claims_multiple_jobs(self):
        """claim_due_jobs returns multiple due jobs in one call."""
        pid, kid = self._setup()
        jids = []
        for _ in range(3):
            jids.append(_create_rank_job(project_id=pid, keyword_ids=[kid]))
        claimed = claim_due_jobs(T0, worker_id="w1")
        claimed_ids = {j for j, _ in claimed}
        for jid in jids:
            self.assertIn(jid, claimed_ids)

    def test_retry_capped_job_not_claimed(self):
        """Job at MAX_RETRY_COUNT is not claimed even if QUEUED."""
        pid, kid = self._setup()
        jid = _create_rank_job(
            project_id=pid, keyword_ids=[kid],
            status=SyncJobStatus.QUEUED, retry_count=MAX_RETRY_COUNT,
        )
        claimed = claim_due_jobs(T0, worker_id="w1")
        ids = [j for j, _ in claimed]
        self.assertNotIn(jid, ids)


# ── Tests: run_claimed_job ────────────────────────────────────────────────────

class TestRunClaimedJob(unittest.TestCase):

    def setUp(self):
        reset_repositories()

    def tearDown(self):
        reset_repositories()

    def _setup(self):
        pid = _make_project()
        kid = _make_keyword(TENANT, pid)
        return pid, kid

    def test_successful_run_marks_completed(self):
        pid, kid = self._setup()

        meter_calls = []

        def fake_meter(*args, **kwargs):
            meter_calls.append(kwargs)
            return {"recorded": False, "reason": "mock_or_zero", "credits_mc": 0}

        with patch("seo.rank.service.record_rank_check", side_effect=fake_meter):
            jid = _create_rank_job(
                project_id=pid, keyword_ids=[kid],
                status=SyncJobStatus.RUNNING,
                lock_owner="w1",
                lock_expires_at=T1_PAST_LOCK,
            )
            job_repo = get_rank_job_repository()
            _, job = job_repo.get(TENANT, jid)

            result = run_claimed_job(
                jid, job,
                worker_id="w1",
                now=T0,
                provider=MockRankProvider(),
                today=TODAY,
            )

        self.assertEqual(result["status"], "completed")
        _, updated_job = job_repo.get(TENANT, jid)
        self.assertEqual(updated_job.status, SyncJobStatus.COMPLETED)
        self.assertEqual(updated_job.lock_owner, "")
        self.assertTrue(updated_job.finished_at)

    def test_failed_run_increments_retry_with_backoff(self):
        pid, kid = self._setup()

        def bad_run(*args, **kwargs):
            raise RuntimeError("simulated provider failure")

        jid = _create_rank_job(
            project_id=pid, keyword_ids=[kid],
            status=SyncJobStatus.RUNNING, lock_owner="w1",
            lock_expires_at=T1_PAST_LOCK, retry_count=0,
        )
        job_repo = get_rank_job_repository()
        _, job = job_repo.get(TENANT, jid)

        with patch("seo.rank.service.run_rank_check", side_effect=bad_run):
            result = run_claimed_job(jid, job, worker_id="w1", now=T0, today=TODAY)

        self.assertEqual(result["status"], "retrying")
        self.assertEqual(result["retry_count"], 1)
        self.assertIn("next_run", result)

        _, updated_job = job_repo.get(TENANT, jid)
        self.assertEqual(updated_job.status, SyncJobStatus.QUEUED)
        self.assertEqual(updated_job.retry_count, 1)
        self.assertTrue(updated_job.scheduled_for)
        self.assertEqual(updated_job.lock_owner, "")

    def test_max_retry_marks_failed(self):
        pid, kid = self._setup()

        def bad_run(*args, **kwargs):
            raise RuntimeError("persistent failure")

        jid = _create_rank_job(
            project_id=pid, keyword_ids=[kid],
            status=SyncJobStatus.RUNNING, lock_owner="w1",
            lock_expires_at=T1_PAST_LOCK, retry_count=MAX_RETRY_COUNT - 1,
        )
        job_repo = get_rank_job_repository()
        _, job = job_repo.get(TENANT, jid)

        with patch("seo.rank.service.run_rank_check", side_effect=bad_run):
            result = run_claimed_job(jid, job, worker_id="w1", now=T0, today=TODAY)

        self.assertEqual(result["status"], "failed")
        _, updated_job = job_repo.get(TENANT, jid)
        self.assertEqual(updated_job.status, SyncJobStatus.FAILED)
        self.assertEqual(updated_job.retry_count, MAX_RETRY_COUNT)

    def test_restart_recovery_end_to_end(self):
        """An expired-lock RUNNING job is claimed and run successfully (idempotent re-run)."""
        pid, kid = self._setup()

        meter_calls = []

        def fake_meter(*args, **kwargs):
            meter_calls.append(kwargs)
            return {"recorded": False, "credits_mc": 0}

        with patch("seo.rank.service.record_rank_check", side_effect=fake_meter):
            # Simulate a job that was started by a dead worker
            jid = _create_rank_job(
                project_id=pid, keyword_ids=[kid],
                status=SyncJobStatus.RUNNING,
                lock_owner="dead-worker",
                lock_expires_at="2026-07-01T09:00:00+00:00",
            )

            # New worker claims it
            claimed = claim_due_jobs(T1_PAST_LOCK, worker_id="rescuer")
            self.assertTrue(
                any(j == jid for j, _ in claimed),
                "Expired-lock job should be reclaimed",
            )

            if claimed:
                pair = next(((j, jb) for j, jb in claimed if j == jid), None)
                if pair:
                    claimed_jid, claimed_job = pair
                    result = run_claimed_job(
                        claimed_jid, claimed_job,
                        worker_id="rescuer",
                        now=T1_PAST_LOCK,
                        provider=MockRankProvider(),
                        today=TODAY,
                    )
                    self.assertEqual(result["status"], "completed")


# ── Tests: backoff calculation ────────────────────────────────────────────────

class TestBackoffCalculation(unittest.TestCase):

    def test_backoff_doubles_per_retry(self):
        b1 = _backoff_seconds(1)
        b2 = _backoff_seconds(2)
        b3 = _backoff_seconds(3)
        self.assertEqual(b1, BASE_BACKOFF_SECONDS)
        self.assertEqual(b2, BASE_BACKOFF_SECONDS * 2)
        self.assertEqual(b3, BASE_BACKOFF_SECONDS * 4)

    def test_backoff_is_capped(self):
        from seo.rank.scheduler import MAX_BACKOFF_SECONDS
        b_high = _backoff_seconds(100)
        self.assertEqual(b_high, MAX_BACKOFF_SECONDS)

    def test_retry_0_gives_base_backoff(self):
        # retry_count=0 means first error, should give BASE_BACKOFF_SECONDS
        self.assertEqual(_backoff_seconds(0), BASE_BACKOFF_SECONDS)


if __name__ == "__main__":
    unittest.main()
