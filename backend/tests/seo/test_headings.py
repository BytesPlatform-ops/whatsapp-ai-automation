import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from seo.engine.checks import headings as headings_check
from seo.engine.normalize import normalize
from seo.schemas import Mode, Severity, Status


def _ids(raw):
    return {r.id: r for r in headings_check.run(normalize(raw), Mode.BOTH)}


class TestHeadings(unittest.TestCase):
    def test_missing_h1(self):
        res = _ids({"headings": [{"level": 2, "text": "Sub"}]})
        c = res["headings.h1.missing"]
        self.assertEqual(c.status, Status.FAIL)
        self.assertEqual(c.severity, Severity.HIGH)

    def test_multiple_h1(self):
        res = _ids({"headings": [{"level": 1, "text": "A"}, {"level": 1, "text": "B"}]})
        c = res["headings.h1.multiple"]
        self.assertEqual(c.status, Status.FAIL)
        self.assertEqual(c.severity, Severity.MEDIUM)
        self.assertEqual(c.evidence["h1_count"], 2)

    def test_exactly_one_h1(self):
        res = _ids({"headings": [{"level": 1, "text": "A"}, {"level": 2, "text": "B"}]})
        c = res["headings.h1.ok"]
        self.assertEqual(c.status, Status.PASS)
        self.assertTrue(c.passed)

    def test_skipped_levels(self):
        res = _ids({"headings": [{"level": 1, "text": "A"}, {"level": 2, "text": "B"}, {"level": 4, "text": "D"}]})
        c = res["headings.skipped_levels"]
        self.assertEqual(c.status, Status.WARN)
        self.assertEqual(c.severity, Severity.MEDIUM)
        self.assertEqual(c.evidence["skips"], [{"from": 2, "to": 4}])

    def test_no_skip_passes(self):
        res = _ids({"headings": [{"level": 1, "text": "A"}, {"level": 2, "text": "B"}, {"level": 3, "text": "C"}]})
        c = res["headings.hierarchy.ok"]
        self.assertEqual(c.status, Status.PASS)

    def test_dict_form_headings(self):
        res = _ids({"headings": {"h1": ["Title"], "h2": ["Sub"]}})
        self.assertIn("headings.h1.ok", res)
        self.assertEqual(res["headings.h1.ok"].status, Status.PASS)


if __name__ == "__main__":
    unittest.main()
