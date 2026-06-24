import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from seo.engine import analyze
from seo.schemas import EngineResult, Mode, Severity, Status


class TestEngine(unittest.TestCase):
    def test_returns_engine_result(self):
        r = analyze({"url": "https://x.com/p"})
        self.assertIsInstance(r, EngineResult)

    def test_mode_string_coercion(self):
        r = analyze({"url": "https://x.com/p"}, "pixie")
        # pixie mode should produce at least one fix for this incomplete page
        self.assertTrue(len(r.fixes) > 0)

    def test_unknown_mode_string_defaults_to_both(self):
        r = analyze({"url": "https://x.com/p"}, "nonsense")
        self.assertEqual(len(r.fixes), 0)

    def test_issues_sorted_by_severity_then_weight(self):
        r = analyze({})  # very incomplete page -> many issues
        ranks = {
            Severity.CRITICAL: 0, Severity.HIGH: 1, Severity.MEDIUM: 2,
            Severity.LOW: 3, Severity.INFO: 4,
        }
        keys = [(ranks[c.severity], -c.weight) for c in r.issues]
        self.assertEqual(keys, sorted(keys))

    def test_issues_only_fail_or_warn(self):
        r = analyze({})
        for c in r.issues:
            self.assertIn(c.status, (Status.FAIL, Status.WARN))

    def test_suggestions_from_issues(self):
        r = analyze({})
        self.assertTrue(all(isinstance(s, str) and s for s in r.suggestions))
        self.assertEqual(len(r.suggestions), len([c for c in r.issues if c.recommendation]))

    def test_fixes_have_check_id(self):
        r = analyze({"content": "Welcome here."}, Mode.PIXIE)
        self.assertTrue(len(r.fixes) > 0)
        for f in r.fixes:
            self.assertIn("check_id", f)

    def test_external_mode_no_fixes(self):
        r = analyze({"content": "Welcome here."}, Mode.EXTERNAL)
        self.assertEqual(r.fixes, [])

    def test_to_dict_json_serializable(self):
        import json
        r = analyze({"url": "https://x.com/My_Page", "title": "Hi"}, Mode.PIXIE)
        d = r.to_dict()
        # must round-trip through json without error
        s = json.dumps(d)
        self.assertIn("score", json.loads(s))
        # enums must be unwrapped to plain strings
        self.assertIsInstance(d["checks"][0]["category"], str)
        self.assertIsInstance(d["checks"][0]["severity"], str)

    def test_empty_input_does_not_raise(self):
        r = analyze({})
        self.assertIsInstance(r.score.score, int)


if __name__ == "__main__":
    unittest.main()
