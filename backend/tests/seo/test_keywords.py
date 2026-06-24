import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from seo.keywords import (
    Intent,
    MockKeywordProvider,
    analyze_content,
    get_keyword_provider,
    research_keywords,
)
from seo.keywords.analysis import analyze_content_keywords
from seo.keywords.local import gbp_hint, nap_consistency

_VALID_INTENTS = {i.value for i in Intent}


class TestMockProvider(unittest.TestCase):
    def test_determinism(self):
        p = MockKeywordProvider()
        a = p.research("plumber", ["emergency plumbing"])
        b = p.research("plumber", ["emergency plumbing"])
        self.assertEqual([i.to_dict() for i in a], [i.to_dict() for i in b])
        self.assertTrue(len(a) > 1)

    def test_metric_ranges_and_intent(self):
        for idea in MockKeywordProvider().research("dentist", ["teeth whitening"]):
            self.assertGreaterEqual(idea.volume, 50)
            self.assertLessEqual(idea.volume, 50000)
            self.assertGreaterEqual(idea.difficulty, 0)
            self.assertLessEqual(idea.difficulty, 100)
            self.assertIn(idea.intent, _VALID_INTENTS)
            self.assertEqual(idea.source, "mock")
            self.assertGreaterEqual(idea.confidence, 0.0)
            self.assertLessEqual(idea.confidence, 1.0)

    def test_factory_returns_mock_without_env(self):
        for k in ("DATAFORSEO_LOGIN", "DATAFORSEO_PASSWORD", "KEYWORD_API_KEY"):
            os.environ.pop(k, None)
        self.assertIsInstance(get_keyword_provider(), MockKeywordProvider)


class TestResearchService(unittest.TestCase):
    def test_research_keywords_shape(self):
        for k in ("DATAFORSEO_LOGIN", "DATAFORSEO_PASSWORD", "KEYWORD_API_KEY"):
            os.environ.pop(k, None)
        out = research_keywords("hvac repair", ["furnace install"])
        self.assertIn("ideas", out)
        self.assertIn("provider", out)
        self.assertGreater(len(out["ideas"]), 0)
        meta = out["provider"]
        self.assertEqual(meta["provider"], "mock")
        self.assertIn("estimated_cost", meta)
        self.assertIn("latency_ms", meta)
        self.assertIn("cache_hit", meta)
        # determinism of the idea payload
        out2 = research_keywords("hvac repair", ["furnace install"])
        self.assertEqual(out["ideas"], out2["ideas"])

    def test_research_never_raises_on_empty(self):
        out = research_keywords("", [])
        self.assertIsInstance(out["ideas"], list)


class TestContentAnalysis(unittest.TestCase):
    def test_thin_content_flag(self):
        res = analyze_content_keywords("Short content here.", ["roofing"])
        self.assertTrue(res["thin_content"]["thin"])
        self.assertLess(res["word_count"], 300)

    def test_not_thin(self):
        body = "word " * 350
        res = analyze_content_keywords(body, [])
        self.assertFalse(res["thin_content"]["thin"])
        self.assertEqual(res["word_count"], 350)

    def test_missing_keyword(self):
        res = analyze_content_keywords("We sell quality roofing for homes.", ["solar panels"])
        self.assertIn("solar panels", res["missing"])
        self.assertEqual(res["keywords"]["solar panels"]["count"], 0)

    def test_density_and_overuse(self):
        # "spam" appears 5 times out of 10 words => 50% density (> 3%).
        body = "spam spam spam spam spam filler filler filler filler filler"
        res = analyze_content_keywords(body, ["spam"])
        self.assertEqual(res["keywords"]["spam"]["count"], 5)
        self.assertAlmostEqual(res["keywords"]["spam"]["density"], 50.0, places=2)
        self.assertIn("spam", res["overuse"])

    def test_analyze_content_wrapper(self):
        res = analyze_content("Short body about plumbing.", ["plumbing", "drain cleaning"])
        self.assertIn("ai_suggestions", res)
        self.assertIn("ai_meta", res)
        self.assertIn("drain cleaning", res["missing"])


class TestLocal(unittest.TestCase):
    def test_nap_inconsistent_phone(self):
        records = [
            {"name": "Acme Plumbing", "address": "1 Main St", "phone": "(555) 123-4567"},
            {"name": "Acme Plumbing", "address": "1 Main St", "phone": "555-999-0000"},
        ]
        res = nap_consistency(records)
        self.assertFalse(res["consistent"])
        self.assertTrue(any("phone" in issue for issue in res["issues"]))

    def test_nap_consistent_with_formatting_noise(self):
        records = [
            {"name": "Acme Plumbing", "address": "1 Main St.", "phone": "+1 (555) 123-4567"},
            {"name": "acme  plumbing", "address": "1 main st", "phone": "5551234567"},
        ]
        res = nap_consistency(records)
        self.assertTrue(res["consistent"])

    def test_gbp_hint(self):
        hints = gbp_hint()
        self.assertIsInstance(hints, list)
        self.assertTrue(len(hints) >= 5)


if __name__ == "__main__":
    unittest.main()
