import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from seo.engine import analyze
from seo.engine.checks import meta as meta_check
from seo.schemas import Mode, Severity, Status


def _ids(results):
    return {r.id: r for r in results}


def _run(raw, mode=Mode.BOTH):
    from seo.engine.normalize import normalize
    return meta_check.run(normalize(raw), mode)


class TestMeta(unittest.TestCase):
    def test_title_missing(self):
        res = _ids(_run({"content": "Hello world."}))
        c = res["meta.title.missing"]
        self.assertEqual(c.status, Status.FAIL)
        self.assertEqual(c.severity, Severity.CRITICAL)

    def test_title_too_short(self):
        res = _ids(_run({"title": "Short title"}))
        c = res["meta.title.too_short"]
        self.assertEqual(c.status, Status.WARN)
        self.assertEqual(c.severity, Severity.MEDIUM)

    def test_title_too_long(self):
        res = _ids(_run({"title": "X" * 70}))
        c = res["meta.title.too_long"]
        self.assertEqual(c.status, Status.WARN)
        self.assertEqual(c.severity, Severity.MEDIUM)

    def test_title_ideal(self):
        res = _ids(_run({"title": "A" * 55}))
        c = res["meta.title.ok"]
        self.assertEqual(c.status, Status.PASS)
        self.assertTrue(c.passed)
        self.assertTrue(c.evidence["ideal"])

    def test_description_missing(self):
        res = _ids(_run({"title": "A" * 55}))
        c = res["meta.description.missing"]
        self.assertEqual(c.status, Status.FAIL)
        self.assertEqual(c.severity, Severity.HIGH)

    def test_description_too_short(self):
        res = _ids(_run({"title": "A" * 55, "meta_description": "B" * 50}))
        c = res["meta.description.too_short"]
        self.assertEqual(c.status, Status.WARN)

    def test_description_too_long(self):
        res = _ids(_run({"title": "A" * 55, "meta_description": "B" * 200}))
        c = res["meta.description.too_long"]
        self.assertEqual(c.status, Status.WARN)

    def test_description_ideal(self):
        res = _ids(_run({"title": "A" * 55, "meta_description": "B" * 155}))
        c = res["meta.description.ok"]
        self.assertEqual(c.status, Status.PASS)
        self.assertTrue(c.passed)

    def test_identical_title_description(self):
        same = "Buy Premium Coffee Beans Online Fresh Roast"
        res = _ids(_run({"title": same, "meta_description": same}))
        c = res["meta.title_description.identical"]
        self.assertEqual(c.status, Status.WARN)
        self.assertEqual(c.severity, Severity.LOW)

    def test_og_missing(self):
        res = _ids(_run({"title": "A" * 55}))
        c = res["social.og.og_title"]
        self.assertEqual(c.status, Status.WARN)
        self.assertEqual(c.severity, Severity.LOW)

    def test_og_present(self):
        res = _ids(_run({"title": "A" * 55, "meta": {"og:title": "Hi"}}))
        c = res["social.og.og_title"]
        self.assertEqual(c.status, Status.PASS)

    def test_twitter_missing(self):
        res = _ids(_run({"title": "A" * 55}))
        c = res["social.twitter.twitter_card"]
        self.assertEqual(c.status, Status.WARN)
        self.assertEqual(c.severity, Severity.LOW)

    def test_pixie_generates_title_fix(self):
        res = _ids(_run({"content": "Welcome to our store."}, Mode.PIXIE))
        c = res["meta.title.missing"]
        self.assertIsNotNone(c.fix)
        self.assertIn("suggested_title", c.fix)

    def test_external_no_fix(self):
        res = _ids(_run({"content": "Welcome to our store."}, Mode.EXTERNAL))
        c = res["meta.title.missing"]
        self.assertIsNone(c.fix)

    def test_both_no_fix(self):
        res = _ids(_run({"content": "Welcome to our store."}, Mode.BOTH))
        c = res["meta.title.missing"]
        self.assertIsNone(c.fix)

    def test_suggested_title_trimmed(self):
        long_content = "word " * 100
        res = _ids(_run({"content": long_content}, Mode.PIXIE))
        c = res["meta.title.missing"]
        self.assertLessEqual(len(c.fix["suggested_title"]), 57)


if __name__ == "__main__":
    unittest.main()
