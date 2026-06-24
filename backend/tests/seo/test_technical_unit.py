import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from seo.technical.competitor import compare
from seo.technical.console import MockConsoleProvider, get_console_provider
from seo.technical.crawlability import check_crawlability
from seo.technical.models import CoreWebVitals
from seo.technical.pagespeed import (
    MockPageSpeedProvider,
    evaluate_cwv,
    get_pagespeed_provider,
)
from seo.technical.validators import (
    detect_failed_resources,
    validate_html,
    validate_jsonld,
)


class TestPageSpeed(unittest.TestCase):
    def test_mock_determinism_and_ranges(self):
        prov = MockPageSpeedProvider()
        url = "https://example.com/page"
        a = prov.fetch(url)
        b = prov.fetch(url)
        self.assertEqual(a.to_dict(), b.to_dict())  # deterministic
        # ranges
        self.assertTrue(1500 <= a.lcp_ms <= 5000)
        self.assertTrue(0.0 <= a.cls <= 0.4)
        self.assertTrue(100 <= a.inp_ms <= 500)
        self.assertTrue(50 <= a.performance_score <= 100)
        self.assertTrue(50 <= a.accessibility_score <= 100)
        self.assertEqual(a.provider, "mock")

    def test_evaluate_cwv_flags_poor_lcp(self):
        cwv = CoreWebVitals(lcp_ms=4500, cls=0.05, inp_ms=150, performance_score=60, accessibility_score=90)
        issues = evaluate_cwv(cwv)
        ids = {i.id for i in issues}
        self.assertIn("cwv.lcp.poor", ids)

    def test_get_pagespeed_provider_returns_mock_without_key(self):
        os.environ.pop("PAGESPEED_API_KEY", None)
        prov = get_pagespeed_provider()
        self.assertEqual(prov.name, "mock")


class TestConsole(unittest.TestCase):
    def test_mock_returns_list(self):
        prov = MockConsoleProvider()
        result = prov.capture("https://console-err.test")
        self.assertIsInstance(result, list)

    def test_get_console_provider_returns_mock(self):
        self.assertEqual(get_console_provider().name, "mock")


class TestValidators(unittest.TestCase):
    def test_validate_html_flags_missing_title_and_multiple_h1(self):
        html = "<html><body><h1>One</h1><h1>Two</h1></body></html>"
        ids = {i.id for i in validate_html(html)}
        self.assertIn("html.title.missing", ids)
        self.assertIn("html.h1.multiple", ids)

    def test_validate_jsonld_flags_missing_type(self):
        blocks = [{"@context": "https://schema.org"}]  # missing @type
        ids = {i.id for i in validate_jsonld(blocks)}
        self.assertIn("jsonld.missing_fields", ids)

    def test_detect_failed_resources_flags_404(self):
        issues = detect_failed_resources([{"url": "https://x.com/a.js", "status": 404}])
        self.assertEqual(len(issues), 1)
        self.assertEqual(issues[0].id, "resource.failed")


class TestCrawlability(unittest.TestCase):
    def test_flags_all_four(self):
        page = {
            "url": "https://x.com/p",
            "robots": "noindex, nofollow",
            "canonical": "https://x.com/other",
        }
        issues = check_crawlability(
            page,
            redirects=["a", "b", "c"],  # length 3 > 2
            internal_link_status=[{"url": "https://x.com/dead", "status": 404}],
        )
        ids = {i.id for i in issues}
        self.assertIn("crawl.robots.noindex", ids)
        self.assertIn("crawl.canonical.conflict", ids)
        self.assertIn("crawl.redirect.chain", ids)
        self.assertIn("crawl.internal_links.broken", ids)


class TestCompetitor(unittest.TestCase):
    def test_score_gap_sign(self):
        base = {"score": 80}
        comp = {"score": 60}
        result = compare(base, comp)
        self.assertEqual(result["score_gap"], 20)
        self.assertEqual(result["winner"], "base")
        # reversed
        result2 = compare({"score": 40}, {"score": 70})
        self.assertEqual(result2["score_gap"], -30)
        self.assertEqual(result2["winner"], "competitor")


if __name__ == "__main__":
    unittest.main()
