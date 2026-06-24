import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from seo.engine import analyze
from seo.engine.scorer import score_checks
from seo.schemas import (
    Category,
    CheckResult,
    Mode,
    Severity,
    Status,
)


PERFECT_PAGE = {
    "url": "https://example.com/great-page",
    "title": "A" * 55,
    "meta_description": "B" * 155,
    "meta": {
        "og:title": "x", "og:description": "x", "og:image": "x", "og:url": "x",
        "twitter:card": "x", "twitter:title": "x", "twitter:description": "x", "twitter:image": "x",
        "viewport": "width=device-width, initial-scale=1",
    },
    "headings": [{"level": 1, "text": "H1"}, {"level": 2, "text": "H2"}],
    "images": [{"src": "a.jpg", "alt": "desc"}],
    "links": [{"href": "/about"}],
    "schema": [{"@type": "Organization", "name": "Acme", "url": "https://example.com"}],
    "canonical": "https://example.com/great-page",
    "robots": "index, follow",
    "sitemap": "https://example.com/sitemap.xml",
}

MINIMAL_PAGE = {"url": "https://example.com/page", "title": "Short"}


class TestScorer(unittest.TestCase):
    def test_empty_checks_is_100(self):
        s = score_checks([])
        self.assertEqual(s.score, 100)

    def test_only_not_applicable_is_100(self):
        c = CheckResult(
            id="na", category=Category.IMAGES, title="t", description="d",
            severity=Severity.INFO, status=Status.NOT_APPLICABLE, weight=6, passed=False,
        )
        s = score_checks([c])
        self.assertEqual(s.score, 100)
        self.assertEqual(s.applicable_count, 0)

    def test_known_weighted_score(self):
        passed = CheckResult(
            id="p", category=Category.META, title="t", description="d",
            severity=Severity.INFO, status=Status.PASS, weight=10, passed=True,
        )
        failed = CheckResult(
            id="f", category=Category.META, title="t", description="d",
            severity=Severity.HIGH, status=Status.FAIL, weight=10, passed=False,
        )
        s = score_checks([passed, failed])
        self.assertEqual(s.score, 50)
        self.assertEqual(s.passed_count, 1)
        self.assertEqual(s.failed_count, 1)
        self.assertEqual(s.applicable_count, 2)

    def test_by_category(self):
        passed = CheckResult(
            id="p", category=Category.META, title="t", description="d",
            severity=Severity.INFO, status=Status.PASS, weight=10, passed=True,
        )
        s = score_checks([passed])
        self.assertEqual(s.by_category["meta"]["score"], 100)
        self.assertEqual(s.by_category["meta"]["passed"], 1)
        self.assertEqual(s.by_category["meta"]["total"], 1)

    def test_perfect_page_scores_100(self):
        r = analyze(PERFECT_PAGE, Mode.EXTERNAL)
        self.assertEqual(r.score.score, 100)
        self.assertEqual(r.score.failed_count, 0)

    def test_minimal_fixture_exact_score(self):
        r = analyze(MINIMAL_PAGE, Mode.EXTERNAL)
        self.assertEqual(r.score.score, 16)
        self.assertEqual(r.score.applicable_count, 20)

    def test_determinism_same_input_same_score(self):
        a = analyze(MINIMAL_PAGE, Mode.EXTERNAL)
        b = analyze(MINIMAL_PAGE, Mode.EXTERNAL)
        self.assertEqual(a.score.score, b.score.score)
        self.assertEqual(a.score.to_dict(), b.score.to_dict())


if __name__ == "__main__":
    unittest.main()
