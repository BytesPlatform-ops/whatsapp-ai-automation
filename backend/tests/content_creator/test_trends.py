import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from content_creator.integrations.trends import (
    HttpTrendSource,
    TrendSource,
    gather_trends,
    get_trend_sources,
    TREND_KEYS,
)
from content_creator.integrations.mock_trends import (
    MOCK_CHANNEL_NAMES,
    MOCK_SOURCES,
    MockTrendSource,
    mock_gather,
)


PROFILE = {
    "niche": "vegan baking",
    "handle": "@batter",
    "voice": "warm",
}


class TestTrendsDeterminism(unittest.TestCase):
    def test_same_profile_twice_is_identical(self):
        first = gather_trends(PROFILE)
        second = gather_trends(dict(PROFILE))
        self.assertEqual(first, second)
        self.assertGreater(len(first), 0)

    def test_mock_source_fetch_is_deterministic(self):
        source = MockTrendSource("reddit")
        a = source.fetch("vegan baking", PROFILE)
        b = source.fetch("vegan baking", PROFILE)
        self.assertEqual(a, b)
        self.assertIn(len(a), (2, 3))


class TestTrendsShape(unittest.TestCase):
    def test_every_item_has_required_keys(self):
        items = gather_trends(PROFILE)
        self.assertTrue(items)
        for item in items:
            for key in TREND_KEYS:
                self.assertIn(key, item)

    def test_items_come_from_multiple_named_sources(self):
        items = gather_trends(PROFILE)
        sources = {item["source"] for item in items}
        # At least several distinct mock channels should be represented.
        self.assertGreaterEqual(len(sources), 3)
        # And they should be drawn from the known mock channel names.
        self.assertTrue(sources.issubset(set(MOCK_CHANNEL_NAMES) | {"manual"}))

    def test_mock_sources_cover_all_channels(self):
        self.assertEqual(
            [s.name for s in MOCK_SOURCES], list(MOCK_CHANNEL_NAMES)
        )
        for source in MOCK_SOURCES:
            self.assertIsInstance(source, TrendSource)


class TestTrendsDedup(unittest.TestCase):
    def test_dedup_by_source_and_title(self):
        items = gather_trends(PROFILE)
        keys = [(i["source"], i["title"]) for i in items]
        self.assertEqual(len(keys), len(set(keys)))

    def test_duplicate_seed_is_collapsed(self):
        seeds = ["Spring launch idea", "Spring launch idea"]
        items = gather_trends(PROFILE, seeds=seeds)
        titles = [i["title"] for i in items if i["source"] == "manual"]
        self.assertEqual(titles.count("Spring launch idea"), 1)


class TestTrendsSeeds(unittest.TestCase):
    def test_manual_seeds_are_incorporated_and_lead(self):
        seeds = ["My handcrafted seed trend"]
        items = gather_trends(PROFILE, seeds=seeds)
        titles = [i["title"] for i in items]
        self.assertIn("My handcrafted seed trend", titles)
        # Seeds rank first.
        self.assertEqual(items[0]["title"], "My handcrafted seed trend")
        self.assertEqual(items[0]["source"], "manual")

    def test_dict_seed_supported(self):
        seeds = [{"source": "newsletter", "title": "Q3 push", "url": "http://x"}]
        items = gather_trends(PROFILE, seeds=seeds)
        match = [i for i in items if i["title"] == "Q3 push"]
        self.assertEqual(len(match), 1)
        self.assertEqual(match[0]["source"], "newsletter")
        self.assertEqual(match[0]["url"], "http://x")

    def test_mock_gather_matches_gather_trends(self):
        a = mock_gather("vegan baking", PROFILE)
        b = gather_trends({"topic": "vegan baking", **PROFILE})
        self.assertEqual(a, b)


class TestNoNetwork(unittest.TestCase):
    def test_default_sources_are_mock_only(self):
        # Without an API key configured, only mock sources are active.
        os.environ.pop("TRENDS_API_KEY", None)
        sources = get_trend_sources()
        self.assertTrue(all(isinstance(s, MockTrendSource) for s in sources))

    def test_http_source_unavailable_without_key(self):
        os.environ.pop("TRENDS_API_KEY", None)
        http = HttpTrendSource()
        self.assertFalse(http.available())
        # fetch degrades to empty list, never touching the network.
        self.assertEqual(http.fetch("anything", PROFILE), [])

    def test_mock_fetch_performs_no_io(self):
        # urllib is only used to *format* a URL string in the mocks; assert that
        # fetching never opens a connection by monkeypatching urlopen to raise.
        import urllib.request

        original = urllib.request.urlopen

        def _boom(*args, **kwargs):  # pragma: no cover - should never be called
            raise AssertionError("mock sources must not perform network I/O")

        urllib.request.urlopen = _boom
        try:
            items = gather_trends(PROFILE)
        finally:
            urllib.request.urlopen = original
        self.assertTrue(items)


if __name__ == "__main__":
    unittest.main()
