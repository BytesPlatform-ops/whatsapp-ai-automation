"""Tests for Content Creator analytics — metrics sync + learning loop.

PURE STDLIB unittest. The model path is inert locally (importing ``models`` pulls
in pydantic, which is absent), so the learning loop falls back to the
deterministic mock; we also force ``mode="fallback"`` for fully deterministic
assertions. Mock metrics are sha1-seeded, so every assertion is reproducible.

Run from ``backend/``:
    python3 -m unittest tests.content_creator.test_analytics -v
"""

from __future__ import annotations

import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from content_creator.analytics.learning_loop import LearningLoop
from content_creator.analytics.metrics import (
    HttpMetricsProvider,
    MockMetricsProvider,
    get_metrics_provider,
    sync_metrics,
)


TENANT = "tenant-glow"

_METRIC_FIELDS = (
    "views", "likes", "comments", "shares", "saves",
    "watch_time", "completion_rate", "clicks", "follows", "leads",
)


class TestMockMetricsProvider(unittest.TestCase):
    def test_all_fields_present(self):
        m = MockMetricsProvider().fetch(TENANT, "post-1")
        for field in _METRIC_FIELDS:
            self.assertIn(field, m, "missing metric field: {0}".format(field))

    def test_deterministic(self):
        p = MockMetricsProvider()
        a = p.fetch(TENANT, "post-1")
        b = p.fetch(TENANT, "post-1")
        self.assertEqual(a, b)

    def test_distinct_inputs_differ(self):
        p = MockMetricsProvider()
        self.assertNotEqual(
            p.fetch(TENANT, "post-1")["views"],
            p.fetch(TENANT, "post-99")["views"],
        )

    def test_plausible_ranges(self):
        # Sweep several refs so we exercise a range of seeds.
        p = MockMetricsProvider()
        for i in range(25):
            m = p.fetch(TENANT, "post-{0}".format(i))
            self.assertGreaterEqual(m["views"], 100)
            self.assertLessEqual(m["views"], 50000)
            self.assertGreaterEqual(m["completion_rate"], 0.2)
            self.assertLessEqual(m["completion_rate"], 0.95)
            # Engagement counts stay coherent / non-negative.
            self.assertGreaterEqual(m["watch_time"], 0.0)
            for field in ("likes", "comments", "shares", "saves",
                          "clicks", "follows", "leads"):
                self.assertGreaterEqual(m[field], 0)
            self.assertLessEqual(m["likes"], m["views"])
            self.assertLessEqual(m["clicks"], m["views"])


class TestProviderSelection(unittest.TestCase):
    def test_default_is_mock(self):
        # No META_INSIGHTS_TOKEN in the test env → mock provider.
        prev = os.environ.pop("META_INSIGHTS_TOKEN", None)
        try:
            self.assertIsInstance(get_metrics_provider(), MockMetricsProvider)
        finally:
            if prev is not None:
                os.environ["META_INSIGHTS_TOKEN"] = prev

    def test_http_unavailable_without_token(self):
        self.assertFalse(HttpMetricsProvider(token=None).available())

    def test_http_degrades_to_mock(self):
        http = HttpMetricsProvider(token=None)
        mock = MockMetricsProvider()
        self.assertEqual(
            http.fetch(TENANT, "post-1"),
            mock.fetch(TENANT, "post-1"),
        )

    def test_http_available_with_token(self):
        self.assertTrue(HttpMetricsProvider(token="x").available())


class TestSyncMetrics(unittest.TestCase):
    def test_returns_one_row_per_ref(self):
        rows = sync_metrics(TENANT, ["p1", "p2"])
        self.assertEqual(len(rows), 2)

    def test_rows_are_tenant_and_post_scoped(self):
        rows = sync_metrics(TENANT, ["p1", "p2"])
        self.assertEqual(rows[0]["tenant_id"], TENANT)
        self.assertEqual(rows[0]["post_ref"], "p1")
        self.assertEqual(rows[1]["post_ref"], "p2")
        for row in rows:
            for field in _METRIC_FIELDS:
                self.assertIn(field, row)

    def test_deterministic(self):
        self.assertEqual(
            sync_metrics(TENANT, ["p1", "p2"]),
            sync_metrics(TENANT, ["p1", "p2"]),
        )

    def test_never_raises_on_bad_input(self):
        self.assertEqual(sync_metrics(TENANT, []), [])
        # None / non-list post_refs degrade to empty, no raise.
        self.assertEqual(sync_metrics(TENANT, None), [])
        rows = sync_metrics(TENANT, [None])
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["post_ref"], "")


class TestLearningLoop(unittest.TestCase):
    def _metrics(self):
        return sync_metrics(TENANT, ["p1", "p2", "p3"])

    def test_fallback_summary(self):
        metrics = self._metrics()
        out = LearningLoop(mode="fallback").summarize(TENANT, metrics)
        self.assertEqual(out["tenant_id"], TENANT)
        self.assertEqual(out["samples"], len(metrics))
        self.assertTrue(out["fallback"])
        self.assertTrue(out["insights"])
        self.assertTrue(out["next_focus"])

    def test_insights_cover_spec_dimensions(self):
        out = LearningLoop(mode="fallback").summarize(TENANT, self._metrics())
        blob = " ".join(out["insights"]).lower()
        for token in ("idea", "scoring", "hook", "cta",
                      "posting", "angle", "format"):
            self.assertIn(token, blob, "insights missing dimension: {0}".format(token))

    def test_empty_input_never_raises(self):
        out = LearningLoop(mode="fallback").summarize(TENANT, [])
        self.assertEqual(out["samples"], 0)
        self.assertTrue(out["insights"])
        self.assertTrue(out["next_focus"])
        self.assertTrue(out["fallback"])

    def test_none_input_never_raises(self):
        out = LearningLoop(mode="fallback").summarize(TENANT, None)
        self.assertEqual(out["samples"], 0)
        self.assertTrue(out["fallback"])

    def test_default_mode_falls_back_locally(self):
        # Model layer is inert locally (no pydantic) → fallback True.
        out = LearningLoop().summarize(TENANT, self._metrics())
        self.assertTrue(out["fallback"])
        self.assertTrue(out["insights"])

    def test_deterministic(self):
        loop = LearningLoop(mode="fallback")
        self.assertEqual(
            loop.summarize(TENANT, self._metrics()),
            loop.summarize(TENANT, self._metrics()),
        )


if __name__ == "__main__":
    unittest.main()
