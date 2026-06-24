import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from seo.jobs import (
    MockRankProvider,
    get_rank_provider,
    rank_history,
    run_rank_tracking_job,
)
from seo.jobs.store import InMemoryRankStore


class TestMockProvider(unittest.TestCase):
    def test_lookup_is_deterministic(self):
        p = MockRankProvider()
        a = p.lookup("best plumber", "https://acme.example")
        b = p.lookup("best plumber", "https://acme.example")
        self.assertEqual(a.position, b.position)
        self.assertEqual(a.provider, "mock")

    def test_position_in_range_or_none(self):
        p = MockRankProvider()
        # Sweep many inputs; every position must be 1..100 or None.
        for i in range(200):
            r = p.lookup("kw%d" % i, "https://site%d.example" % i)
            if r.position is not None:
                self.assertGreaterEqual(r.position, 1)
                self.assertLessEqual(r.position, 100)

    def test_get_rank_provider_falls_back_to_mock(self):
        # Ensure no key in env so the mock is selected.
        saved = {k: os.environ.pop(k, None) for k in ("RANK_API_KEY", "SERP_API_KEY")}
        try:
            provider = get_rank_provider()
            self.assertEqual(provider.name, "mock")
        finally:
            for k, v in saved.items():
                if v is not None:
                    os.environ[k] = v


class TestRankJob(unittest.TestCase):
    def test_job_checks_all_targets(self):
        store = InMemoryRankStore()
        targets = [
            {"keyword": "logo design", "url": "https://a.example"},
            {"keyword": "seo audit", "url": "https://b.example"},
            {"keyword": "ai chatbot", "url": "https://c.example", "device": "mobile"},
        ]
        out = run_rank_tracking_job("t1", targets, store=store)
        self.assertEqual(out["checked"], len(targets))
        self.assertEqual(len(out["snapshots"]), len(targets))
        self.assertIsInstance(out["estimated_cost"], float)
        self.assertIsInstance(out["latency_ms"], int)
        self.assertEqual(out["provider"], "mock")
        self.assertEqual(out["tenant_id"], "t1")

    def test_tenant_isolation(self):
        store = InMemoryRankStore()
        target = {"keyword": "website builder", "url": "https://x.example"}
        run_rank_tracking_job("t1", [target], store=store)

        # Same keyword+url under t1 must NOT appear in t2's history.
        t1_hist = rank_history("t1", "website builder", "https://x.example", store=store)
        t2_hist = rank_history("t2", "website builder", "https://x.example", store=store)
        self.assertEqual(len(t1_hist), 1)
        self.assertEqual(len(t2_hist), 0)
        self.assertEqual(t1_hist[0]["tenant_id"], "t1")

    def test_captured_seq_monotonic_and_order_preserved(self):
        store = InMemoryRankStore()
        target = {"keyword": "custom software", "url": "https://y.example"}
        # Three runs append three snapshots for the same key.
        run_rank_tracking_job("t1", [target], store=store)
        run_rank_tracking_job("t1", [target], store=store)
        run_rank_tracking_job("t1", [target], store=store)

        hist = rank_history("t1", "custom software", "https://y.example", store=store)
        self.assertEqual(len(hist), 3)
        seqs = [s["captured_seq"] for s in hist]
        # Strictly increasing -> monotonic and insertion order preserved.
        self.assertEqual(seqs, sorted(seqs))
        self.assertEqual(len(set(seqs)), 3)
        for i in range(1, len(seqs)):
            self.assertGreater(seqs[i], seqs[i - 1])

    def test_missing_url_is_recorded_as_error_without_raising(self):
        store = InMemoryRankStore()
        targets = [
            {"keyword": "good one", "url": "https://ok.example"},
            {"keyword": "broken", "device": "desktop"},  # no url
        ]
        out = run_rank_tracking_job("t1", targets, store=store)
        self.assertEqual(out["checked"], 1)
        self.assertEqual(len(out["snapshots"]), 1)
        self.assertEqual(len(out["errors"]), 1)
        self.assertEqual(out["errors"][0]["index"], 1)


if __name__ == "__main__":
    unittest.main()
