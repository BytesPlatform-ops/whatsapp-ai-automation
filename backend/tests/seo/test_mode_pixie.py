from __future__ import annotations

import copy
import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from seo.mode_pixie import build_schema, enrich_site
from seo.mode_pixie.schema_builder import schema_type_for

_TITLE_MAX = 60
_DESC_MAX = 160


def _weak_page():
    """A deliberately weak page: no title/description/canonical/schema,
    one image with no alt, two H1s, and an underscored URL."""
    return {
        "url": "https://example.com/My_Page",
        "title": "",
        "meta_description": "",
        "content": (
            "Authentic wood-fired Neapolitan pizza in downtown. "
            "Fresh dough made daily and family owned since 1998. "
            "Come taste the best margherita in town."
        ),
        "images": [
            {"src": "https://example.com/images/wood_fired_oven.jpg"},
        ],
        "headings": [
            {"level": 1, "text": "Welcome"},
            {"level": 1, "text": "Our Menu"},
        ],
        # no canonical, no schema, no meta
    }


class TestModePixieInjector(unittest.TestCase):
    def setUp(self):
        self.page = _weak_page()
        self.result = enrich_site(
            self.page,
            business_type="restaurant",
            brand="Mario's Pizzeria",
        )
        self.site = self.result["site"]

    def test_title_filled_within_max(self):
        title = self.site.get("title", "")
        self.assertTrue(title.strip(), "title should be non-empty after enrichment")
        self.assertLessEqual(len(title), _TITLE_MAX)

    def test_description_filled_within_max(self):
        desc = self.site.get("meta_description", "")
        self.assertTrue(desc.strip(), "meta_description should be non-empty")
        self.assertLessEqual(len(desc), _DESC_MAX)

    def test_canonical_set_to_url(self):
        self.assertEqual(self.site.get("canonical"), "https://example.com/My_Page")

    def test_social_tags_present(self):
        meta = self.site.get("meta", {})
        for key in ("og:title", "og:description", "og:url", "og:image",
                    "twitter:card", "twitter:title", "twitter:description", "twitter:image"):
            self.assertTrue(str(meta.get(key, "")).strip(), "missing social tag {0}".format(key))
        self.assertEqual(meta.get("twitter:card"), "summary_large_image")

    def test_schema_non_empty_with_sensible_type(self):
        schema = self.site.get("schema", [])
        self.assertTrue(schema, "schema should be non-empty")
        block = schema[0]
        self.assertEqual(block.get("@context"), "https://schema.org")
        self.assertEqual(block.get("@type"), "Restaurant")
        self.assertTrue(str(block.get("name", "")).strip())

    def test_image_alt_filled(self):
        img = self.site["images"][0]
        self.assertTrue(str(img.get("alt", "")).strip(), "image alt should be filled")

    def test_exactly_one_h1(self):
        h1s = [h for h in self.site["headings"] if h.get("level") == 1]
        self.assertEqual(len(h1s), 1, "expected exactly one H1")

    def test_suggested_slug(self):
        self.assertEqual(self.result["suggested_slug"], "my-page")

    def test_score_increases(self):
        before = self.result["score_before"]["score"]
        after = self.result["score_after"]["score"]
        self.assertGreaterEqual(after, before)
        self.assertGreater(after, before, "weak page should score strictly higher after enrichment")

    def test_input_not_mutated(self):
        # Original input dict must be untouched.
        self.assertEqual(self.page.get("title"), "")
        self.assertIsNone(self.page.get("canonical"))
        self.assertNotIn("schema", self.page)
        self.assertNotIn("brand", self.page)
        # original image still has no alt key
        self.assertNotIn("alt", self.page["images"][0])
        # original still has two H1s
        self.assertEqual(sum(1 for h in self.page["headings"] if h.get("level") == 1), 2)

    def test_determinism(self):
        r1 = enrich_site(_weak_page(), business_type="restaurant", brand="Mario's Pizzeria")
        r2 = enrich_site(_weak_page(), business_type="restaurant", brand="Mario's Pizzeria")
        self.assertEqual(r1["score_after"], r2["score_after"])
        self.assertEqual(r1["site"]["meta"], r2["site"]["meta"])
        self.assertEqual(r1["suggested_slug"], r2["suggested_slug"])

    def test_ai_fallback_flag_is_true_offline(self):
        # Locally (pydantic absent) every AI call should use the heuristic.
        self.assertTrue(self.result["ai_fallback"])


class TestSchemaBuilder(unittest.TestCase):
    def test_type_mapping(self):
        self.assertEqual(schema_type_for("restaurant"), "Restaurant")
        self.assertEqual(schema_type_for("cozy cafe"), "Restaurant")
        self.assertEqual(schema_type_for("hvac"), "LocalBusiness")
        self.assertEqual(schema_type_for("plumber"), "LocalBusiness")
        self.assertEqual(schema_type_for("online shop"), "Product")
        self.assertEqual(schema_type_for("tech blog"), "Article")
        self.assertEqual(schema_type_for("something weird"), "Organization")
        self.assertEqual(schema_type_for(""), "Organization")

    def test_build_schema_omits_unknown_fields(self):
        page = {"url": "https://x.com", "title": "Acme"}
        block = build_schema("plumber", page)
        self.assertEqual(block["@type"], "LocalBusiness")
        self.assertEqual(block["@context"], "https://schema.org")
        self.assertEqual(block.get("name"), "Acme")
        self.assertEqual(block.get("url"), "https://x.com")
        # never fabricated:
        self.assertNotIn("telephone", block)
        self.assertNotIn("address", block)
        self.assertNotIn("offers", block)

    def test_article_uses_headline(self):
        block = build_schema("news", {"title": "Big Story", "url": "https://n.com"})
        self.assertEqual(block["@type"], "Article")
        self.assertEqual(block.get("headline"), "Big Story")


if __name__ == "__main__":
    unittest.main()
