import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from seo.mode_external import audit_url, build_report, html_to_page, is_safe_url


CANNED_HTML = """
<!doctype html>
<html>
<head>
  <title>Acme Widgets — Best Widgets Online</title>
  <meta name="description" content="Acme sells premium widgets worldwide.">
  <meta property="og:title" content="Acme Widgets OG">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="canonical" href="https://acme.example/widgets">
  <script type="application/ld+json">
  {"@context": "https://schema.org", "@type": "Organization", "name": "Acme"}
  </script>
  <script>window.evil = function(){ /* must never run */ };</script>
</head>
<body>
  <h1>Acme Widgets</h1>
  <h2>Why choose us</h2>
  <img src="/logo.png">
  <img src="/team.png" alt="Our team photo">
  <a href="/about" rel="nofollow">About us</a>
  <p>We build great widgets.</p>
</body>
</html>
"""


class TestSsrf(unittest.TestCase):
    BLOCKED = [
        "http://localhost/",
        "http://127.0.0.1/",
        "http://0.0.0.0/",
        "http://169.254.169.254/latest/meta-data/",
        "http://10.0.0.5/",
        "http://192.168.1.1/",
        "http://[::1]/",
        "file:///etc/passwd",
        "ftp://x/",
        "http://intranet.local/",
    ]

    def test_blocked_urls(self):
        for url in self.BLOCKED:
            ok, reason = is_safe_url(url)
            self.assertFalse(ok, "expected BLOCKED: {} (reason={})".format(url, reason))
            self.assertTrue(reason, "blocked url should give a reason: {}".format(url))

    def test_allows_public_url(self):
        ok, reason = is_safe_url("https://example.com/page")
        self.assertTrue(ok, "expected ALLOWED, reason={}".format(reason))

    def test_blocks_empty_host(self):
        ok, _ = is_safe_url("http:///nopath")
        self.assertFalse(ok)

    def test_blocks_172_16_private(self):
        ok, _ = is_safe_url("http://172.16.5.5/")
        self.assertFalse(ok)

    def test_blocks_internal_suffix(self):
        ok, _ = is_safe_url("https://db.internal/")
        self.assertFalse(ok)


class TestParser(unittest.TestCase):
    def setUp(self):
        self.page = html_to_page(CANNED_HTML, "https://acme.example/widgets")

    def test_title(self):
        self.assertEqual(self.page["title"], "Acme Widgets — Best Widgets Online")

    def test_meta_description(self):
        self.assertEqual(
            self.page["meta_description"], "Acme sells premium widgets worldwide."
        )
        self.assertEqual(
            self.page["meta"]["description"], "Acme sells premium widgets worldwide."
        )

    def test_og_title(self):
        self.assertEqual(self.page["meta"]["og:title"], "Acme Widgets OG")

    def test_headings(self):
        levels = [(h["level"], h["text"]) for h in self.page["headings"]]
        self.assertIn((1, "Acme Widgets"), levels)
        self.assertIn((2, "Why choose us"), levels)

    def test_images_alt_handling(self):
        imgs = self.page["images"]
        by_src = {i["src"]: i for i in imgs}
        # img without alt -> "alt" key omitted so the engine flags it
        self.assertNotIn("alt", by_src["/logo.png"])
        # img with alt -> alt present
        self.assertEqual(by_src["/team.png"].get("alt"), "Our team photo")

    def test_canonical(self):
        self.assertEqual(self.page["canonical"], "https://acme.example/widgets")

    def test_links(self):
        hrefs = {l["href"]: l for l in self.page["links"]}
        self.assertIn("/about", hrefs)
        self.assertEqual(hrefs["/about"]["rel"], "nofollow")
        self.assertEqual(hrefs["/about"]["text"], "About us")

    def test_schema_jsonld(self):
        self.assertEqual(len(self.page["schema"]), 1)
        org = self.page["schema"][0]
        self.assertEqual(org["@type"], "Organization")
        self.assertEqual(org["name"], "Acme")


class TestBuildReport(unittest.TestCase):
    def test_report_shape(self):
        page = html_to_page(CANNED_HTML, "https://acme.example/widgets")
        report = build_report("https://acme.example/widgets", page)
        self.assertEqual(report["mode"], "external")
        self.assertEqual(report["url"], "https://acme.example/widgets")
        self.assertIn("score", report)
        self.assertIn("score", report["score"])  # score sub-dict
        self.assertIn("checks", report)
        self.assertEqual(
            report["cta"],
            {
                "headline": "Migrate to Pixie to auto-fix these issues",
                "action": "migrate_to_pixie",
            },
        )
        for bucket in ("critical", "high", "medium", "low"):
            self.assertIn(bucket, report["issues"])
            self.assertIsInstance(report["issues"][bucket], list)


class TestAuditUrl(unittest.TestCase):
    def test_end_to_end_with_injected_fetcher(self):
        url = "https://acme.example/widgets"
        report = audit_url(url, fetcher=lambda u: CANNED_HTML, skip_dns=True)
        self.assertNotIn("error", report)
        self.assertEqual(report["url"], url)
        self.assertIn("score", report)
        self.assertIn("issues", report)
        for bucket in ("critical", "high", "medium", "low"):
            self.assertIn(bucket, report["issues"])
        self.assertEqual(report["cta"]["action"], "migrate_to_pixie")

    def test_blocked_url_does_not_call_fetcher(self):
        def exploding_fetcher(u):
            raise AssertionError("fetcher must not be called for blocked URL")

        report = audit_url(
            "http://169.254.169.254/latest/meta-data/",
            fetcher=exploding_fetcher,
            skip_dns=True,
        )
        self.assertEqual(report["error"], "blocked")
        self.assertIn("reason", report)
        self.assertEqual(report["url"], "http://169.254.169.254/latest/meta-data/")


if __name__ == "__main__":
    unittest.main()
