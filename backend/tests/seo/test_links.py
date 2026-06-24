import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from seo.engine.checks import links as links_check
from seo.engine.normalize import normalize
from seo.schemas import Mode, Severity, Status


def _ids(raw, mode=Mode.BOTH):
    return {r.id: r for r in links_check.run(normalize(raw), mode)}


class TestLinks(unittest.TestCase):
    def test_underscores_flagged(self):
        res = _ids({"url": "https://x.com/my_cool_page"})
        c = res["links.slug.suboptimal"]
        self.assertEqual(c.status, Status.WARN)
        self.assertIn("underscores", c.evidence["violations"])

    def test_uppercase_flagged(self):
        res = _ids({"url": "https://x.com/MyPage"})
        c = res["links.slug.suboptimal"]
        self.assertIn("uppercase", c.evidence["violations"])

    def test_spaces_flagged(self):
        res = _ids({"url": "https://x.com/my%20page"})
        c = res["links.slug.suboptimal"]
        self.assertIn("spaces", c.evidence["violations"])

    def test_query_heavy_flagged(self):
        res = _ids({"url": "https://x.com/page?a=1&b=2"})
        c = res["links.slug.suboptimal"]
        self.assertIn("query_heavy", c.evidence["violations"])

    def test_clean_slug_passes(self):
        res = _ids({"url": "https://x.com/my-clean-page"})
        c = res["links.slug.ok"]
        self.assertEqual(c.status, Status.PASS)

    def test_pixie_suggested_slug(self):
        res = _ids({"url": "https://x.com/My_Cool_Page"}, Mode.PIXIE)
        c = res["links.slug.suboptimal"]
        self.assertEqual(c.fix["suggested_slug"], "/my-cool-page")

    def test_external_no_slug_fix(self):
        res = _ids({"url": "https://x.com/My_Cool_Page"}, Mode.EXTERNAL)
        c = res["links.slug.suboptimal"]
        self.assertIsNone(c.fix)

    def test_internal_external_counts(self):
        raw = {
            "url": "https://x.com/page",
            "links": [
                {"href": "/about"},
                {"href": "https://x.com/contact"},
                {"href": "https://other.com/thing"},
                {"href": "#section"},
            ],
        }
        res = _ids(raw)
        c = res["links.counts"]
        self.assertEqual(c.status, Status.PASS)
        self.assertEqual(c.evidence["internal"], 3)
        self.assertEqual(c.evidence["external"], 1)

    def test_internal_flag_respected(self):
        raw = {"url": "https://x.com/p", "links": [{"href": "https://other.com", "internal": True}]}
        res = _ids(raw)
        self.assertEqual(res["links.counts"].evidence["internal"], 1)


if __name__ == "__main__":
    unittest.main()
