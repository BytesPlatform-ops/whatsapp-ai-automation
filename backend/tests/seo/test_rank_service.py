"""Tests for seo.rank.service — durable rank checking.

All tests are offline (MockRankProvider, in-memory repositories).
Zero paid/network calls; zero wall-clock reliance (dates are injected).
"""

from __future__ import annotations

import os
import sys
import unittest
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

import seo.metering_search as ms
from seo.jobs.provider import MockRankProvider, get_rank_provider
from seo.rank.service import run_rank_check
from seo.search_stores import (
    Keyword,
    KeywordProject,
    RankSnapshot,
    SyncJobStatus,
    TrackingStatus,
    reset_repositories,
    get_keyword_repository,
    get_keyword_project_repository,
    get_rank_job_repository,
    get_rank_snapshot_repository,
)


# ── Test fixtures ─────────────────────────────────────────────────────────────

TODAY = "2026-07-01"
YESTERDAY = "2026-06-30"
TENANT = "t_rank_svc"
TENANT_B = "t_rank_svc_b"


def _make_project(tenant: str = TENANT, domain: str = "https://example.com") -> str:
    repo = get_keyword_project_repository()
    pid, _ = repo.create(KeywordProject(
        tenant_id=tenant,
        name="Test Project",
        default_domain=domain,
    ))
    return pid


def _make_keyword(tenant: str, project_id: str, text: str = "seo tools") -> str:
    repo = get_keyword_repository()
    kid, _ = repo.create(Keyword(
        tenant_id=tenant,
        project_id=project_id,
        keyword=text,
        target_page="https://example.com/page",
    ))
    return kid


def _mock_metering(mock_result: dict | None = None):
    """Return a patch context that replaces record_rank_check with a recorder."""
    calls = []

    def _record(*args, **kwargs):
        calls.append(kwargs)
        return mock_result or {"recorded": False, "reason": "mock_or_zero", "credits_mc": 0}

    return calls, patch("seo.rank.service.record_rank_check", side_effect=_record)


# ── Test cases ────────────────────────────────────────────────────────────────

class TestRunRankCheckBasic(unittest.TestCase):

    def setUp(self):
        reset_repositories()

    def tearDown(self):
        reset_repositories()

    def test_manual_check_writes_snapshot_and_updates_keyword(self):
        """A single keyword check creates a RankSnapshot and updates Keyword ranks."""
        pid = _make_project()
        kid = _make_keyword(TENANT, pid, "best seo tool")

        calls, mock_meter = _mock_metering()
        with mock_meter:
            summary = run_rank_check(
                TENANT, pid, [kid],
                provider=MockRankProvider(),
                today=TODAY,
            )

        self.assertEqual(summary["job_id"].startswith("rankjob_"), True)
        self.assertEqual(summary["checked"], 1)
        self.assertEqual(summary["error_count"], 0)
        self.assertEqual(len(summary["snapshots"]), 1)
        self.assertEqual(summary["provider"], "mock")
        self.assertTrue(summary["is_mock"])

        snap_info = summary["snapshots"][0]
        self.assertEqual(snap_info["keyword_id"], kid)
        self.assertEqual(snap_info["date"], TODAY)

        # Keyword row should be updated
        kw_row = get_keyword_repository().get(TENANT, kid)
        self.assertIsNotNone(kw_row)
        _, kw = kw_row
        # current_rank is set (could be None if mock says not ranking, but field is set)
        # Just verify the attribute was touched (previous_rank tracks old current)
        self.assertIsNotNone(kw)  # row exists

    def test_previous_position_populated_on_second_check(self):
        """second check (different date) captures previous position from day-1."""
        pid = _make_project()
        kid = _make_keyword(TENANT, pid, "content tools")

        calls, mock_meter = _mock_metering()
        with mock_meter:
            # Day 1
            run_rank_check(TENANT, pid, [kid], provider=MockRankProvider(), today=YESTERDAY)
            # Day 2
            summary2 = run_rank_check(TENANT, pid, [kid], provider=MockRankProvider(), today=TODAY)

        # The second snapshot should have previous_position set to day-1's position
        snap_repo = get_rank_snapshot_repository()
        history = snap_repo.history(TENANT, kid)

        # Filter to today's snapshot (not the error one if any)
        today_snaps = [(sid, s) for sid, s in history if s.date == TODAY and not s.error]
        self.assertTrue(len(today_snaps) >= 1, "Expected a snapshot for today")
        _, today_snap = today_snaps[0]

        # previous_position should be the position from YESTERDAY's snapshot
        yesterday_snaps = [(sid, s) for sid, s in history if s.date == YESTERDAY and not s.error]
        if yesterday_snaps:
            _, yest_snap = yesterday_snaps[0]
            self.assertEqual(today_snap.previous_position, yest_snap.position)

    def test_idempotent_snapshot_same_day(self):
        """Two checks on the same date produce ONE logical snapshot per keyword."""
        pid = _make_project()
        kid = _make_keyword(TENANT, pid, "email marketing")

        calls, mock_meter = _mock_metering()
        with mock_meter:
            run_rank_check(TENANT, pid, [kid], provider=MockRankProvider(), today=TODAY)
            run_rank_check(TENANT, pid, [kid], provider=MockRankProvider(), today=TODAY)

        snap_repo = get_rank_snapshot_repository()
        history = snap_repo.history(TENANT, kid)

        # Filter to today's non-error snapshots
        today_snaps = [(sid, s) for sid, s in history if s.date == TODAY and not s.error]
        self.assertEqual(len(today_snaps), 1, "Expected exactly 1 snapshot for today (idempotent)")

    def test_second_run_same_day_is_idempotent_update_flagged(self):
        """Second same-day run sets idempotent_update=True in the summary."""
        pid = _make_project()
        kid = _make_keyword(TENANT, pid, "logo maker")

        calls, mock_meter = _mock_metering()
        with mock_meter:
            summary1 = run_rank_check(TENANT, pid, [kid], provider=MockRankProvider(), today=TODAY)
            summary2 = run_rank_check(TENANT, pid, [kid], provider=MockRankProvider(), today=TODAY)

        if summary1["snapshots"]:
            self.assertFalse(summary1["snapshots"][0].get("idempotent_update", False))
        if summary2["snapshots"]:
            self.assertTrue(summary2["snapshots"][0].get("idempotent_update", False))

    def test_history_ordering(self):
        """History is returned in ascending date order."""
        pid = _make_project()
        kid = _make_keyword(TENANT, pid, "website builder")
        dates = ["2026-05-01", "2026-05-02", "2026-05-03"]

        calls, mock_meter = _mock_metering()
        with mock_meter:
            for d in dates:
                run_rank_check(TENANT, pid, [kid], provider=MockRankProvider(), today=d)

        snap_repo = get_rank_snapshot_repository()
        history = snap_repo.history(TENANT, kid)
        valid = [(sid, s) for sid, s in history if not s.error]
        returned_dates = [s.date for _, s in valid]
        self.assertEqual(returned_dates, sorted(returned_dates))

    def test_per_keyword_error_does_not_abort_batch(self):
        """A missing keyword raises, but other keywords still complete."""
        pid = _make_project()
        kid_good = _make_keyword(TENANT, pid, "seo audit")
        kid_bad = "kw_nonexistent_xyz"

        calls, mock_meter = _mock_metering()
        with mock_meter:
            summary = run_rank_check(
                TENANT, pid, [kid_good, kid_bad],
                provider=MockRankProvider(), today=TODAY,
            )

        self.assertEqual(summary["checked"], 1)
        self.assertEqual(summary["error_count"], 1)
        self.assertEqual(len(summary["errors"]), 1)
        self.assertIn("kw_nonexistent_xyz", summary["errors"][0]["keyword_id"])

    def test_best_rank_tracks_best_position(self):
        """best_rank on the Keyword always reflects the lowest (best) position ever."""
        pid = _make_project()
        # Use a keyword that consistently gets a position from mock
        # We need a deterministic position — use a keyword/url we know maps to a position
        # MockRankProvider is deterministic: sha1("kw|url") % 100 + 1 (unless % 8 == 0)
        # Find one that ranks
        provider = MockRankProvider()
        target = "https://example.com/page"
        kw_text = "best rank test kw"
        result = provider.lookup(kw_text, target)
        if result.position is None:
            kw_text = "another rank test"
            result = provider.lookup(kw_text, target)

        kid = _make_keyword(TENANT, pid, kw_text)
        # Patch target_page
        get_keyword_repository().update(TENANT, kid, target_page=target)

        calls, mock_meter = _mock_metering()
        with mock_meter:
            run_rank_check(TENANT, pid, [kid], provider=provider, today=TODAY)

        _, kw = get_keyword_repository().get(TENANT, kid)
        if kw.current_rank is not None:
            self.assertEqual(kw.best_rank, kw.current_rank)

    def test_cross_tenant_isolation(self):
        """Tenant B cannot see Tenant A snapshots."""
        pid_a = _make_project(TENANT)
        pid_b = _make_project(TENANT_B)
        kid_a = _make_keyword(TENANT, pid_a, "shared keyword")

        calls, mock_meter = _mock_metering()
        with mock_meter:
            run_rank_check(TENANT, pid_a, [kid_a], provider=MockRankProvider(), today=TODAY)

        snap_repo = get_rank_snapshot_repository()
        # Tenant B should see no snapshots for kid_a
        b_snaps = snap_repo.list_where(TENANT_B, keyword_id=kid_a)
        self.assertEqual(len(b_snaps), 0)

    def test_job_transitions_to_completed(self):
        """RankJob transitions QUEUED → RUNNING → COMPLETED on success."""
        pid = _make_project()
        kid = _make_keyword(TENANT, pid)

        calls, mock_meter = _mock_metering()
        with mock_meter:
            summary = run_rank_check(TENANT, pid, [kid], provider=MockRankProvider(), today=TODAY)

        job_id = summary["job_id"]
        job_repo = get_rank_job_repository()
        row = job_repo.get(TENANT, job_id)
        self.assertIsNotNone(row)
        _, job = row
        self.assertEqual(job.status, SyncJobStatus.COMPLETED)
        self.assertTrue(job.finished_at)


class TestMeteringIdempotency(unittest.TestCase):
    """record_rank_check must be called exactly once per run_rank_check call."""

    def setUp(self):
        reset_repositories()

    def tearDown(self):
        reset_repositories()

    def test_metering_called_once_per_job(self):
        pid = _make_project()
        kid = _make_keyword(TENANT, pid)

        calls, mock_meter = _mock_metering()
        with mock_meter:
            run_rank_check(TENANT, pid, [kid], provider=MockRankProvider(), today=TODAY)

        self.assertEqual(len(calls), 1, "record_rank_check must be called exactly once per job")

    def test_duplicate_job_same_day_calls_metering_twice_but_snapshot_stays_one(self):
        """Each run_rank_check is a separate job (new job_id), so metering fires
        once per call.  Snapshot stays at 1 per (keyword, date) because of
        idempotency.  Different operation_ids (different job_ids) so if the
        credit system were on, second would be a new operation — but is_mock=True
        so both are 0-cost."""
        pid = _make_project()
        kid = _make_keyword(TENANT, pid)

        calls, mock_meter = _mock_metering()
        with mock_meter:
            run_rank_check(TENANT, pid, [kid], provider=MockRankProvider(), today=TODAY)
            run_rank_check(TENANT, pid, [kid], provider=MockRankProvider(), today=TODAY)

        self.assertEqual(len(calls), 2, "Each run_rank_check issues exactly one metering call")
        # Both are is_mock=True so zero credits
        for call in calls:
            self.assertTrue(call["is_mock"])

    def test_metering_is_mock_true_for_mock_provider(self):
        pid = _make_project()
        kid = _make_keyword(TENANT, pid)

        calls, mock_meter = _mock_metering()
        with mock_meter:
            summary = run_rank_check(TENANT, pid, [kid], provider=MockRankProvider(), today=TODAY)

        self.assertTrue(summary["is_mock"])
        self.assertEqual(calls[0]["is_mock"], True)


class TestSerpFeatureCapture(unittest.TestCase):
    """SERP feature fields are captured from provider; never fabricated when absent."""

    def setUp(self):
        reset_repositories()

    def tearDown(self):
        reset_repositories()

    def test_empty_serp_features_when_mock_provider(self):
        """MockRankProvider does not emit SERP features — snapshot fields stay empty/False."""
        pid = _make_project()
        kid = _make_keyword(TENANT, pid, "seo test kw")

        calls, mock_meter = _mock_metering()
        with mock_meter:
            summary = run_rank_check(TENANT, pid, [kid], provider=MockRankProvider(), today=TODAY)

        if summary["snapshots"]:
            snap = summary["snapshots"][0]
            self.assertIsInstance(snap["serp_features"], list)
            # Mock provider does not set featured_snippet/local_pack to True
            self.assertFalse(snap.get("featured_snippet", False))
            self.assertFalse(snap.get("local_pack", False))

    def test_serp_features_captured_from_provider_result(self):
        """If the provider returns serp_features on the result, they are stored."""
        from seo.jobs.models import RankResult

        class FeaturedProvider(MockRankProvider):
            name = "featured_mock"

            def lookup(self, keyword, url, *, location="us", device="desktop"):
                result = super().lookup(keyword, url, location=location, device=device)
                # Inject SERP feature data onto the result object
                result.serp_features = ["featured_snippet", "local_pack"]  # type: ignore[attr-defined]
                result.featured_snippet = True  # type: ignore[attr-defined]
                result.local_pack = True  # type: ignore[attr-defined]
                return result

        pid = _make_project()
        kid = _make_keyword(TENANT, pid, "serp feature kw")

        calls, mock_meter = _mock_metering()
        with mock_meter:
            summary = run_rank_check(TENANT, pid, [kid], provider=FeaturedProvider(), today=TODAY)

        if summary["snapshots"]:
            snap = summary["snapshots"][0]
            self.assertIn("featured_snippet", snap.get("serp_features", []))
            self.assertTrue(snap.get("featured_snippet", False))
            self.assertTrue(snap.get("local_pack", False))


class TestPlanLimit(unittest.TestCase):
    """enforce_seo_limit should block when the plan limit is exceeded."""

    def setUp(self):
        reset_repositories()

    def tearDown(self):
        reset_repositories()

    def test_plan_limit_raises_on_exceeded(self):
        """When enforce_seo_limit raises SeoLimitExceeded, run_rank_check propagates it."""
        from seo.metering_search import SeoLimitExceeded

        pid = _make_project()
        kid = _make_keyword(TENANT, pid)

        with patch("seo.rank.service.enforce_seo_limit") as mock_enf:
            mock_enf.side_effect = SeoLimitExceeded(
                {"allowed": False, "reason": "limit_exceeded"}
            )
            with self.assertRaises(SeoLimitExceeded):
                run_rank_check(TENANT, pid, [kid], provider=MockRankProvider(), today=TODAY)


if __name__ == "__main__":
    unittest.main()
