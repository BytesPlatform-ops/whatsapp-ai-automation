"""Cross-module end-to-end integration tests for the SEO service.

These tests are the only ones that exercise the FULL wiring across modules
rather than a single unit:

  * EXTERNAL audit path:
        mode_external.html_to_page -> engine.analyze -> mode_external.build_report
    (also reached via mode_external.audit_url with an injected fetcher)

  * PIXIE enrichment path:
        mode_pixie.enrich_site -> (engine re-score) -> engine.analyze
    confirming the enriched site re-scored by the engine reproduces the
    reported improvement.

Everything here is deterministic, offline (no network, injected fetcher),
pure-stdlib, and Python 3.9-compatible.
"""

import json
import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from seo.engine import analyze
from seo.mode_external import audit_url, build_report, html_to_page
from seo.mode_pixie import enrich_site
from seo.schemas import Mode, Severity, Status


# A deliberately weak page: missing meta description, two H1s, an image with
# no alt, no canonical, no schema, and an inert (never-executed) <script>.
WEAK_HTML = """
<!doctype html>
<html>
<head>
  <title>Acme Widgets</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <script>window.__pwned = function(){ /* must never run */ };</script>
</head>
<body>
  <h1>Acme</h1>
  <h1>Second Heading That Should Not Be An H1</h1>
  <img src="/logo.png">
  <a href="/about">About us</a>
  <p>We build great widgets for great businesses everywhere.</p>
</body>
</html>
"""

EXTERNAL_URL = "https://acme.example/widgets"


class TestExternalAuditEndToEnd(unittest.TestCase):
    """html_to_page -> engine.analyze -> build_report produces a sane,
    severity-grouped report with a migration CTA."""

    def setUp(self):
        self.page = html_to_page(WEAK_HTML, EXTERNAL_URL)
        self.report = build_report(EXTERNAL_URL, self.page)

    def test_report_top_level_shape(self):
        self.assertEqual(self.report["mode"], "external")
        self.assertEqual(self.report["url"], EXTERNAL_URL)
        self.assertIn("score", self.report)
        self.assertIn("score", self.report["score"])  # nested score dict
        self.assertIn("checks", self.report)
        self.assertIn("issues", self.report)

    def test_score_is_sane_for_weak_page(self):
        score = self.report["score"]["score"]
        self.assertIsInstance(score, int)
        # A weak page must score below 100 but the engine must still produce
        # a defined, in-range number.
        self.assertGreaterEqual(score, 0)
        self.assertLess(score, 100)
        self.assertLessEqual(score, 100)

    def test_issues_grouped_into_all_severity_buckets(self):
        for bucket in ("critical", "high", "medium", "low"):
            self.assertIn(bucket, self.report["issues"])
            self.assertIsInstance(self.report["issues"][bucket], list)
        # A weak page must surface at least one real issue somewhere.
        total = sum(len(v) for v in self.report["issues"].values())
        self.assertGreater(total, 0)

    def test_grouped_issue_count_matches_engine_issue_count(self):
        # build_report must not silently drop or duplicate issues: the sum of
        # grouped issues equals the engine's issue list length (INFO folds
        # into 'low', so nothing is lost).
        result = analyze(self.page, Mode.EXTERNAL)
        grouped_total = sum(len(v) for v in self.report["issues"].values())
        self.assertEqual(grouped_total, len(result.issues))

    def test_every_grouped_issue_is_fail_or_warn(self):
        for bucket in self.report["issues"].values():
            for issue in bucket:
                self.assertIn(issue["status"], (Status.FAIL.value, Status.WARN.value))

    def test_bucket_matches_issue_severity(self):
        # Each non-INFO issue must land in the bucket named by its severity;
        # INFO is intentionally folded into 'low'.
        for bucket_name, issues in self.report["issues"].items():
            for issue in issues:
                sev = issue["severity"]
                if sev == Severity.INFO.value:
                    self.assertEqual(bucket_name, "low")
                else:
                    self.assertEqual(bucket_name, sev)

    def test_external_report_has_no_fixes_leaked(self):
        # EXTERNAL mode must never propose applying fixes to the remote site.
        result = analyze(self.page, Mode.EXTERNAL)
        self.assertEqual(result.fixes, [])

    def test_cta_is_migration_invite(self):
        self.assertEqual(
            self.report["cta"],
            {
                "headline": "Migrate to Pixie to auto-fix these issues",
                "action": "migrate_to_pixie",
            },
        )

    def test_report_is_json_serializable(self):
        # The full report must round-trip through JSON (enums unwrapped).
        s = json.dumps(self.report)
        round_tripped = json.loads(s)
        self.assertEqual(round_tripped["url"], EXTERNAL_URL)

    def test_audit_url_matches_direct_build_report(self):
        # The audit_url front door (with an injected offline fetcher) must
        # produce an equivalent report to the direct parse+build path.
        via_audit = audit_url(EXTERNAL_URL, fetcher=lambda u: WEAK_HTML, skip_dns=True)
        self.assertNotIn("error", via_audit)
        self.assertEqual(via_audit["score"]["score"], self.report["score"]["score"])
        self.assertEqual(
            {k: len(v) for k, v in via_audit["issues"].items()},
            {k: len(v) for k, v in self.report["issues"].items()},
        )
        self.assertEqual(via_audit["cta"], self.report["cta"])

    def test_inert_script_never_treated_as_content(self):
        # SSRF-adjacent safety: script body must not leak into parsed content.
        self.assertNotIn("__pwned", self.page.get("content", ""))

    def test_external_audit_is_deterministic(self):
        r1 = build_report(EXTERNAL_URL, html_to_page(WEAK_HTML, EXTERNAL_URL))
        r2 = build_report(EXTERNAL_URL, html_to_page(WEAK_HTML, EXTERNAL_URL))
        self.assertEqual(r1["score"], r2["score"])
        self.assertEqual(
            {k: len(v) for k, v in r1["issues"].items()},
            {k: len(v) for k, v in r2["issues"].items()},
        )


class TestPixieEnrichRescoreRoundTrip(unittest.TestCase):
    """enrich_site output, re-scored by the engine, confirms the reported
    improvement is real (not a fabricated number)."""

    def setUp(self):
        # Drive enrich_site from the SAME weak HTML parsed by the external
        # path, so both flows share one input shape end to end.
        self.source_page = html_to_page(WEAK_HTML, EXTERNAL_URL)
        self.result = enrich_site(
            self.source_page,
            business_type="online widget shop",
            brand="Acme",
        )
        self.site = self.result["site"]

    def test_reported_after_matches_independent_rescore(self):
        # The crux: re-run the engine on the enriched site and confirm it
        # reproduces the score the injector reported. If these diverge, the
        # injector's reported improvement is untrustworthy.
        rescored = analyze(self.site, Mode.PIXIE)
        self.assertEqual(rescored.score.score, self.result["score_after"]["score"])
        self.assertEqual(rescored.score.to_dict(), self.result["score_after"])

    def test_score_strictly_improves(self):
        before = self.result["score_before"]["score"]
        after = self.result["score_after"]["score"]
        self.assertGreater(after, before)

    def test_enriched_site_has_exactly_one_h1(self):
        # The weak page had two H1s; enrichment must leave exactly one.
        h1s = [h for h in self.site["headings"] if h.get("level") == 1]
        self.assertEqual(len(h1s), 1)

    def test_input_page_not_mutated_by_enrichment(self):
        # The parsed source page must be untouched (non-mutating contract).
        self.assertEqual(self.source_page.get("title"), "Acme Widgets")
        self.assertNotIn("schema_added_marker", self.source_page)
        # Original still has two H1s.
        self.assertEqual(
            sum(1 for h in self.source_page["headings"] if h.get("level") == 1),
            2,
        )
        # Original image still has no alt key.
        self.assertNotIn("alt", self.source_page["images"][0])

    def test_enrichment_is_deterministic(self):
        r1 = enrich_site(
            html_to_page(WEAK_HTML, EXTERNAL_URL),
            business_type="online widget shop",
            brand="Acme",
        )
        r2 = enrich_site(
            html_to_page(WEAK_HTML, EXTERNAL_URL),
            business_type="online widget shop",
            brand="Acme",
        )
        self.assertEqual(r1["score_after"], r2["score_after"])
        self.assertEqual(r1["site"]["meta"], r2["site"]["meta"])
        self.assertEqual(r1["site"]["schema"], r2["site"]["schema"])

    def test_external_then_pixie_score_lift(self):
        # Full service narrative: the same page audited externally scores low,
        # and after Pixie enrichment scores strictly higher. This ties the two
        # cross-module flows together on one input.
        external = build_report(EXTERNAL_URL, html_to_page(WEAK_HTML, EXTERNAL_URL))
        external_score = external["score"]["score"]
        pixie_after = self.result["score_after"]["score"]
        self.assertGreater(pixie_after, external_score)


if __name__ == "__main__":
    unittest.main()
