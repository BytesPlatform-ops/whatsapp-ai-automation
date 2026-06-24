import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from seo.engine.checks import schema as schema_check
from seo.engine.normalize import normalize
from seo.schemas import Mode, Severity, Status


def _run(raw):
    return schema_check.run(normalize(raw), Mode.BOTH)


def _ids(raw):
    return {r.id: r for r in _run(raw)}


class TestSchema(unittest.TestCase):
    def test_missing_structured_data(self):
        res = _ids({"schema": []})
        c = res["schema.missing"]
        self.assertEqual(c.status, Status.WARN)
        self.assertEqual(c.severity, Severity.MEDIUM)

    def test_localbusiness_missing_fields(self):
        res = _run({"schema": [{"@type": "LocalBusiness", "name": "Joe's"}]})
        c = [r for r in res if "localbusiness.missing_fields" in r.id][0]
        self.assertEqual(c.status, Status.WARN)
        self.assertEqual(c.severity, Severity.LOW)
        self.assertEqual(set(c.evidence["missing"]), {"address", "telephone"})

    def test_localbusiness_complete(self):
        res = _run({"schema": [{"@type": "LocalBusiness", "name": "Joe's", "address": "123 St", "telephone": "555"}]})
        c = [r for r in res if r.id.endswith("localbusiness.ok")][0]
        self.assertEqual(c.status, Status.PASS)

    def test_product_missing_fields(self):
        res = _run({"schema": [{"@type": "Product", "name": "Widget"}]})
        c = [r for r in res if "product.missing_fields" in r.id][0]
        self.assertEqual(c.status, Status.WARN)
        self.assertEqual(c.evidence["missing"], ["offers"])

    def test_unknown_type_is_info_pass(self):
        res = _run({"schema": [{"@type": "SomethingWeird"}]})
        c = [r for r in res if "unrecognized" in r.id][0]
        self.assertEqual(c.status, Status.PASS)
        self.assertEqual(c.severity, Severity.INFO)

    def test_type_as_list(self):
        res = _run({"schema": [{"@type": ["Product", "Thing"], "name": "W", "offers": {}}]})
        # offers present (non-empty? empty dict counts as missing) -> name ok, offers empty -> missing
        c = [r for r in res if "product" in r.id][0]
        self.assertEqual(c.evidence.get("type"), "Product")


if __name__ == "__main__":
    unittest.main()
