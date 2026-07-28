"""Tests for seo.rank.analytics — computed analytics from stored snapshots.

Uses seeded in-memory snapshots to verify deterministic computations.
Zero paid/network calls; zero wall-clock reliance.
"""

from __future__ import annotations

import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from seo.rank.analytics import (
    compare_competitors,
    keyword_detail,
    rank_history,
    rank_overview,
)
from seo.search_stores import (
    RankSnapshot,
    reset_repositories,
    get_rank_snapshot_repository,
)


# ── Fixtures ──────────────────────────────────────────────────────────────────

TENANT = "t_analytics"
TENANT_B = "t_analytics_b"
PROJECT = "proj_analytics_1"


def _make_snap(
    keyword_id: str,
    date: str,
    position,
    previous_position=None,
    ranking_url: str = "",
    serp_features=None,
    featured_snippet: bool = False,
    local_pack: bool = False,
    competitor_positions=None,
    error: str = "",
    tenant: str = TENANT,
    project: str = PROJECT,
    keyword: str = "test keyword",
) -> str:
    repo = get_rank_snapshot_repository()
    snap = RankSnapshot(
        tenant_id=tenant,
        project_id=project,
        keyword_id=keyword_id,
        keyword=keyword,
        date=date,
        position=position,
        previous_position=previous_position,
        ranking_url=ranking_url or "https://example.com/page",
        serp_features=serp_features or [],
        featured_snippet=featured_snippet,
        local_pack=local_pack,
        competitor_positions=competitor_positions or {},
        error=error,
    )
    snap_id, _ = repo.create(snap)
    return snap_id


# ── Tests: rank_history ───────────────────────────────────────────────────────

class TestRankHistory(unittest.TestCase):

    def setUp(self):
        reset_repositories()

    def tearDown(self):
        reset_repositories()

    def test_returns_history_in_date_order(self):
        _make_snap("kw_h1", "2026-06-01", 10)
        _make_snap("kw_h1", "2026-06-03", 8)
        _make_snap("kw_h1", "2026-06-02", 9)

        history = rank_history(TENANT, "kw_h1")
        dates = [h["date"] for h in history]
        self.assertEqual(dates, sorted(dates))
        self.assertEqual(len(history), 3)

    def test_date_range_filter(self):
        _make_snap("kw_h2", "2026-05-01", 5)
        _make_snap("kw_h2", "2026-05-15", 6)
        _make_snap("kw_h2", "2026-05-30", 7)

        history = rank_history(TENANT, "kw_h2", date_from="2026-05-10", date_to="2026-05-20")
        dates = [h["date"] for h in history]
        self.assertEqual(len(history), 1)
        self.assertEqual(dates[0], "2026-05-15")

    def test_cross_tenant_isolation(self):
        _make_snap("kw_iso", "2026-06-01", 3, tenant=TENANT)
        _make_snap("kw_iso", "2026-06-01", 3, tenant=TENANT_B)

        hist_a = rank_history(TENANT, "kw_iso")
        hist_b = rank_history(TENANT_B, "kw_iso")
        self.assertEqual(len(hist_a), 1)
        self.assertEqual(len(hist_b), 1)
        # Cross-tenant: tenant B's snapshots should not appear in tenant A
        for h in hist_a:
            self.assertNotEqual(h.get("tenant_id"), TENANT_B)


# ── Tests: rank_overview ──────────────────────────────────────────────────────

class TestRankOverview(unittest.TestCase):

    def setUp(self):
        reset_repositories()

    def tearDown(self):
        reset_repositories()

    def test_winners_and_losers(self):
        # kw_win: improved from 20 → 5 (delta = +15 = winner)
        _make_snap("kw_win", "2026-06-01", 20, keyword="winner keyword")
        _make_snap("kw_win", "2026-06-30", 5, keyword="winner keyword")
        # kw_lose: dropped from 5 → 20 (delta = -15 = loser)
        _make_snap("kw_lose", "2026-06-01", 5, keyword="loser keyword")
        _make_snap("kw_lose", "2026-06-30", 20, keyword="loser keyword")

        overview = rank_overview(TENANT, PROJECT)
        winner_ids = [w["keyword_id"] for w in overview["winners"]]
        loser_ids = [l["keyword_id"] for l in overview["losers"]]
        self.assertIn("kw_win", winner_ids)
        self.assertIn("kw_lose", loser_ids)

    def test_new_rankings(self):
        # kw_new: went from None → 10
        _make_snap("kw_new", "2026-06-01", None, keyword="new ranking")
        _make_snap("kw_new", "2026-06-30", 10, keyword="new ranking")

        overview = rank_overview(TENANT, PROJECT)
        new_ids = [n["keyword_id"] for n in overview["new_rankings"]]
        self.assertIn("kw_new", new_ids)

    def test_lost_rankings(self):
        # kw_lost: went from 10 → None
        _make_snap("kw_lost", "2026-06-01", 10, keyword="lost ranking")
        _make_snap("kw_lost", "2026-06-30", None, keyword="lost ranking")

        overview = rank_overview(TENANT, PROJECT)
        lost_ids = [l["keyword_id"] for l in overview["lost_rankings"]]
        self.assertIn("kw_lost", lost_ids)

    def test_position_buckets(self):
        _make_snap("kw_top3", "2026-06-30", 2, keyword="top3 kw")
        _make_snap("kw_top10", "2026-06-30", 7, keyword="top10 kw")
        _make_snap("kw_top20", "2026-06-30", 15, keyword="top20 kw")
        _make_snap("kw_beyond", "2026-06-30", 50, keyword="beyond20 kw")
        _make_snap("kw_unrank", "2026-06-30", None, keyword="unranked kw")

        overview = rank_overview(TENANT, PROJECT)
        buckets = overview["buckets"]
        self.assertGreaterEqual(buckets.get("top3", 0), 1)
        self.assertGreaterEqual(buckets.get("top10", 0), 1)
        self.assertGreaterEqual(buckets.get("top20", 0), 1)
        self.assertGreaterEqual(buckets.get("beyond20", 0), 1)
        self.assertGreaterEqual(buckets.get("unranked", 0), 1)

    def test_serp_feature_changes(self):
        _make_snap("kw_serp", "2026-06-01", 5,
                   serp_features=["local_pack"], keyword="serp changes")
        _make_snap("kw_serp", "2026-06-30", 4,
                   serp_features=["local_pack", "featured_snippet"], keyword="serp changes")

        overview = rank_overview(TENANT, PROJECT)
        serp_ids = [s["keyword_id"] for s in overview["serp_changes"]]
        self.assertIn("kw_serp", serp_ids)

        change = next(s for s in overview["serp_changes"] if s["keyword_id"] == "kw_serp")
        self.assertIn("featured_snippet", change["added_features"])
        self.assertNotIn("local_pack", change["added_features"])

    def test_cannibalisation_candidates(self):
        _make_snap("kw_cann", "2026-06-01", 5,
                   ranking_url="https://example.com/page1", keyword="cann kw")
        _make_snap("kw_cann", "2026-06-15", 6,
                   ranking_url="https://example.com/page2", keyword="cann kw")
        _make_snap("kw_cann", "2026-06-30", 4,
                   ranking_url="https://example.com/page1", keyword="cann kw")

        overview = rank_overview(TENANT, PROJECT)
        cann_ids = [c["keyword_id"] for c in overview["cannibalisation"]]
        self.assertIn("kw_cann", cann_ids)

        entry = next(c for c in overview["cannibalisation"] if c["keyword_id"] == "kw_cann")
        self.assertGreater(len(entry["ranking_urls"]), 1)

    def test_url_changes(self):
        _make_snap("kw_url", "2026-06-01", 5,
                   ranking_url="https://example.com/page1", keyword="url change kw")
        _make_snap("kw_url", "2026-06-30", 4,
                   ranking_url="https://example.com/page2", keyword="url change kw")

        overview = rank_overview(TENANT, PROJECT)
        url_ids = [u["keyword_id"] for u in overview["url_changes"]]
        self.assertIn("kw_url", url_ids)

    def test_winners_sorted_descending_by_delta(self):
        # kw_small: delta 2, kw_big: delta 10
        _make_snap("kw_small", "2026-06-01", 12, keyword="small gainer")
        _make_snap("kw_small", "2026-06-30", 10, keyword="small gainer")
        _make_snap("kw_big", "2026-06-01", 30, keyword="big gainer")
        _make_snap("kw_big", "2026-06-30", 20, keyword="big gainer")

        overview = rank_overview(TENANT, PROJECT)
        if len(overview["winners"]) >= 2:
            deltas = [w["delta"] for w in overview["winners"]]
            self.assertEqual(deltas, sorted(deltas, reverse=True))

    def test_cross_tenant_isolation_overview(self):
        """Tenant B data doesn't appear in Tenant A's overview."""
        _make_snap("kw_a", "2026-06-01", 5, tenant=TENANT, project=PROJECT)
        _make_snap("kw_b_only", "2026-06-01", 5, tenant=TENANT_B, project=PROJECT)

        overview = rank_overview(TENANT, PROJECT)
        all_keyword_ids = set()
        for cat in ("winners", "losers", "new_rankings", "lost_rankings",
                    "serp_changes", "url_changes", "cannibalisation"):
            for item in overview.get(cat, []):
                all_keyword_ids.add(item.get("keyword_id", ""))
        self.assertNotIn("kw_b_only", all_keyword_ids)


# ── Tests: keyword_detail ─────────────────────────────────────────────────────

class TestKeywordDetail(unittest.TestCase):

    def setUp(self):
        reset_repositories()

    def tearDown(self):
        reset_repositories()

    def test_detail_history_and_latest(self):
        _make_snap("kw_det", "2026-06-01", 10, competitor_positions={"comp.com": 3})
        _make_snap("kw_det", "2026-06-15", 8, competitor_positions={"comp.com": 2})

        detail = keyword_detail(TENANT, "kw_det")
        self.assertEqual(len(detail["history"]), 2)
        self.assertIsNotNone(detail["latest"])
        self.assertEqual(detail["latest"]["date"], "2026-06-15")
        self.assertEqual(detail["latest"]["position"], 8)

    def test_competitor_positions_from_latest(self):
        _make_snap("kw_comp", "2026-06-01", 5,
                   competitor_positions={"rival.com": 4, "other.com": 7})

        detail = keyword_detail(TENANT, "kw_comp")
        self.assertIn("rival.com", detail["competitor_positions"])
        self.assertIn("other.com", detail["competitor_positions"])

    def test_empty_keyword_returns_safe_defaults(self):
        detail = keyword_detail(TENANT, "kw_nonexistent")
        self.assertEqual(detail["history"], [])
        self.assertIsNone(detail["latest"])
        self.assertEqual(detail["competitor_positions"], {})


class TestCompareCompetitors(unittest.TestCase):

    def setUp(self):
        reset_repositories()

    def tearDown(self):
        reset_repositories()

    def test_competitor_timeline(self):
        _make_snap("kw_ct", "2026-06-01", 10,
                   competitor_positions={"a.com": 3, "b.com": 7})
        _make_snap("kw_ct", "2026-06-30", 8,
                   competitor_positions={"a.com": 2, "b.com": 9})

        result = compare_competitors(TENANT, "kw_ct")
        self.assertIn("a.com", result["competitors"])
        self.assertIn("b.com", result["competitors"])
        self.assertEqual(len(result["timeline"]), 2)

    def test_no_data_returns_empty(self):
        result = compare_competitors(TENANT, "kw_no_comp")
        self.assertEqual(result["competitors"], [])
        self.assertEqual(result["timeline"], [])


if __name__ == "__main__":
    unittest.main()
