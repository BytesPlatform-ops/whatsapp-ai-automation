import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from seo.engine.checks import images as images_check
from seo.engine.normalize import normalize
from seo.schemas import Mode, Severity, Status


def _ids(raw, mode=Mode.BOTH):
    return {r.id: r for r in images_check.run(normalize(raw), mode)}


class TestImages(unittest.TestCase):
    def test_missing_alt_key(self):
        res = _ids({"images": [{"src": "a.jpg"}]})
        c = res["images.alt.missing"]
        self.assertEqual(c.status, Status.FAIL)
        self.assertEqual(c.severity, Severity.MEDIUM)
        self.assertIn("a.jpg", c.evidence["missing"])

    def test_alt_none(self):
        res = _ids({"images": [{"src": "b.png", "alt": None}]})
        c = res["images.alt.missing"]
        self.assertEqual(c.status, Status.FAIL)

    def test_empty_alt(self):
        res = _ids({"images": [{"src": "c.png", "alt": "   "}]})
        c = res["images.alt.empty"]
        self.assertEqual(c.status, Status.WARN)
        self.assertEqual(c.severity, Severity.LOW)

    def test_good_alt_passes(self):
        res = _ids({"images": [{"src": "d.png", "alt": "A red bicycle"}]})
        c = res["images.alt.ok"]
        self.assertEqual(c.status, Status.PASS)

    def test_no_images_not_applicable(self):
        res = _ids({"images": []})
        c = res["images.alt.none"]
        self.assertEqual(c.status, Status.NOT_APPLICABLE)

    def test_pixie_alt_suggestions(self):
        res = _ids({"images": [{"src": "/img/red-bike-photo.jpg"}]}, Mode.PIXIE)
        c = res["images.alt.missing"]
        self.assertIsNotNone(c.fix)
        self.assertIn("red bike photo", c.fix["alt_suggestions"]["/img/red-bike-photo.jpg"])

    def test_external_no_fix(self):
        res = _ids({"images": [{"src": "x.jpg"}]}, Mode.EXTERNAL)
        c = res["images.alt.missing"]
        self.assertIsNone(c.fix)


if __name__ == "__main__":
    unittest.main()
