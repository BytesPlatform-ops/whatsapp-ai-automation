import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from seo.engine.checks import technical_basics as tech_check
from seo.engine.normalize import normalize
from seo.schemas import Mode, Severity, Status


def _ids(raw, mode=Mode.BOTH):
    return {r.id: r for r in tech_check.run(normalize(raw), mode)}


class TestTechnical(unittest.TestCase):
    def test_canonical_missing(self):
        res = _ids({"url": "https://x.com/p"})
        c = res["canonical.missing"]
        self.assertEqual(c.status, Status.WARN)
        self.assertEqual(c.severity, Severity.MEDIUM)

    def test_canonical_missing_pixie_fix(self):
        res = _ids({"url": "https://x.com/p"}, Mode.PIXIE)
        c = res["canonical.missing"]
        self.assertEqual(c.fix["suggested_canonical"], "https://x.com/p")

    def test_canonical_match_ignoring_trailing_slash(self):
        res = _ids({"url": "https://x.com/p/", "canonical": "https://x.com/p"})
        self.assertIn("canonical.ok", res)

    def test_canonical_mismatch_is_info(self):
        res = _ids({"url": "https://x.com/p", "canonical": "https://x.com/other"})
        c = res["canonical.mismatch"]
        self.assertEqual(c.status, Status.PASS)
        self.assertEqual(c.severity, Severity.INFO)

    def test_sitemap_present(self):
        res = _ids({"sitemap": "https://x.com/sitemap.xml"})
        self.assertEqual(res["technical.sitemap.present"].status, Status.PASS)

    def test_sitemap_missing(self):
        res = _ids({})
        c = res["technical.sitemap.missing"]
        self.assertEqual(c.status, Status.WARN)
        self.assertEqual(c.severity, Severity.LOW)

    def test_robots_noindex_fails(self):
        res = _ids({"robots": "noindex, nofollow"})
        c = res["technical.robots.noindex"]
        self.assertEqual(c.status, Status.FAIL)
        self.assertEqual(c.severity, Severity.HIGH)

    def test_robots_index_ok(self):
        res = _ids({"robots": "index, follow"})
        self.assertEqual(res["technical.robots.ok"].status, Status.PASS)

    def test_robots_absent_info(self):
        res = _ids({})
        c = res["technical.robots.absent"]
        self.assertEqual(c.status, Status.PASS)
        self.assertEqual(c.severity, Severity.INFO)

    def test_viewport_missing_fails(self):
        res = _ids({})
        c = res["mobile.viewport.missing"]
        self.assertEqual(c.status, Status.FAIL)
        self.assertEqual(c.severity, Severity.HIGH)

    def test_viewport_present_passes(self):
        res = _ids({"meta": {"viewport": "width=device-width, initial-scale=1"}})
        self.assertEqual(res["mobile.viewport.ok"].status, Status.PASS)

    def test_viewport_from_mobile_dict(self):
        res = _ids({"mobile": {"viewport": "width=device-width"}})
        self.assertEqual(res["mobile.viewport.ok"].status, Status.PASS)


if __name__ == "__main__":
    unittest.main()
