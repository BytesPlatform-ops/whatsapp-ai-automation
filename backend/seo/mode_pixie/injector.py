"""Mode-A SEO injection layer.

Takes a (possibly weak) page dict and returns a NEW, enriched page dict plus
before/after scoring. Deterministic and offline-safe: the AI calls go through
``SeoAiClient`` which falls back to stable heuristics when the model layer is
unavailable (the local stdlib-only case).

This module NEVER calls the network and NEVER mutates the caller's input dict.
"""

from __future__ import annotations

import copy
import re
import urllib.parse
from typing import Dict, List, Optional

from seo.ai import SeoAiClient
from seo.engine import analyze
from seo.schemas import Mode

from .schema_builder import build_schema

_TITLE_MAX = 60
_DESC_MAX = 160


def _s(value) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    return str(value).strip()


def _ensure_meta(page: dict) -> dict:
    meta = page.get("meta")
    if not isinstance(meta, dict):
        meta = {}
        page["meta"] = meta
    return meta


def _ensure_list(page: dict, key: str) -> list:
    val = page.get(key)
    if not isinstance(val, list):
        val = []
        page[key] = val
    return val


def _normalize_headings_inplace(headings: list) -> list:
    """Coerce headings into a list of {"level": int, "text": str} dicts."""
    out: List[Dict[str, object]] = []
    for h in headings:
        if isinstance(h, dict):
            try:
                lvl = int(h.get("level"))
            except (TypeError, ValueError):
                lvl = 0
            out.append({"level": lvl, "text": _s(h.get("text"))})
        elif isinstance(h, (list, tuple)) and len(h) >= 2:
            try:
                lvl = int(h[0])
            except (TypeError, ValueError):
                lvl = 0
            out.append({"level": lvl, "text": _s(h[1])})
    return out


def _slug_from_url(url: str) -> str:
    """Lowercase, hyphenated slug derived from the URL path's last segment."""
    raw = _s(url)
    if not raw:
        return ""
    netloc = ""
    try:
        parsed = urllib.parse.urlsplit(raw)
        path = parsed.path or ""
        netloc = parsed.netloc or ""
    except ValueError:
        path = raw
    segment = path.rstrip("/").rsplit("/", 1)[-1] if path else ""
    if not segment:
        segment = netloc or raw
    # strip a file extension
    segment = re.sub(r"\.[A-Za-z0-9]{1,6}$", "", segment)
    # non-alphanumerics -> hyphen
    segment = re.sub(r"[^A-Za-z0-9]+", "-", segment)
    segment = segment.strip("-").lower()
    return segment


def _first_image_src(images: list) -> str:
    for img in images:
        if isinstance(img, dict):
            src = _s(img.get("src"))
            if src:
                return src
        elif isinstance(img, str) and img.strip():
            return img.strip()
    return ""


def enrich_site(
    page: dict,
    *,
    business_type: str = "",
    brand: str = "",
    ai: Optional[SeoAiClient] = None,
) -> dict:
    """Enrich ``page`` for SEO and return a NEW dict (input is never mutated)."""
    if not isinstance(page, dict):
        page = {}
    if ai is None:
        ai = SeoAiClient()

    applied: List[str] = []
    fallback_used = False

    # 1. Baseline.
    before = analyze(page, Mode.PIXIE)

    # 2. Deep copy so the caller's object is untouched.
    enriched = copy.deepcopy(page)
    if brand and not _s(enriched.get("brand")):
        # Make brand available to schema_builder without altering caller's dict.
        enriched["brand"] = brand

    meta = _ensure_meta(enriched)
    images = _ensure_list(enriched, "images")
    headings = _normalize_headings_inplace(_ensure_list(enriched, "headings"))
    enriched["headings"] = headings

    content = _s(enriched.get("content"))

    # 3. Meta title / description (only if missing/empty).
    title = _s(enriched.get("title"))
    if not title:
        res = ai.meta_title(title=title, content=content, brand=brand, business_type=business_type)
        fallback_used = fallback_used or bool(res.fallback)
        new_title = _s(res.text)[:_TITLE_MAX].rstrip()
        if new_title:
            enriched["title"] = new_title
            title = new_title
            applied.append("Generated meta title: '{0}'".format(new_title))

    description = _s(enriched.get("meta_description"))
    if not description:
        res = ai.meta_description(description=description, content=content, business_type=business_type)
        fallback_used = fallback_used or bool(res.fallback)
        new_desc = _s(res.text)[:_DESC_MAX].rstrip()
        if new_desc:
            enriched["meta_description"] = new_desc
            description = new_desc
            applied.append("Generated meta description ({0} chars)".format(len(new_desc)))

    # 4. Canonical = existing canonical or the page url.
    canonical = _s(enriched.get("canonical"))
    if not canonical:
        canonical = _s(enriched.get("url"))
        if canonical:
            enriched["canonical"] = canonical
            applied.append("Set canonical URL: {0}".format(canonical))

    # 5. Open Graph + Twitter (only fill absent keys).
    first_img = _first_image_src(images)
    social_defaults = [
        ("og:title", title),
        ("og:description", description),
        ("og:url", canonical or _s(enriched.get("url"))),
        ("og:image", first_img),
        ("twitter:card", "summary_large_image"),
        ("twitter:title", title),
        ("twitter:description", description),
        ("twitter:image", first_img),
    ]
    for key, value in social_defaults:
        if value and not _s(meta.get(key)):
            meta[key] = value
            applied.append("Added social tag {0}".format(key))

    # 6. Schema (only if empty).
    schema = enriched.get("schema")
    if not isinstance(schema, list) or len([b for b in schema if isinstance(b, dict)]) == 0:
        block = build_schema(business_type, enriched)
        enriched["schema"] = [block]
        applied.append("Added {0} JSON-LD structured data".format(block.get("@type", "Organization")))

    # 7. Image alt text for images missing/empty alt.
    for img in images:
        if not isinstance(img, dict):
            continue
        has_key = "alt" in img
        alt = img.get("alt")
        needs_alt = (not has_key) or (alt is None) or (isinstance(alt, str) and not alt.strip())
        if needs_alt:
            src = _s(img.get("src"))
            res = ai.image_alt(src=src, context=content)
            fallback_used = fallback_used or bool(res.fallback)
            new_alt = _s(res.text)
            if new_alt:
                img["alt"] = new_alt
                applied.append("Added alt text for image: {0}".format(src or "(no src)"))

    # 8. Enforce exactly one H1.
    h1_indexes = [i for i, h in enumerate(headings) if h.get("level") == 1]
    if not h1_indexes:
        if headings:
            headings[0]["level"] = 1
            applied.append("Promoted first heading to H1")
        else:
            h1_text = title or _s(brand) or "Home"
            headings.append({"level": 1, "text": h1_text})
            applied.append("Synthesized H1 from title")
    elif len(h1_indexes) > 1:
        for idx in h1_indexes[1:]:
            headings[idx]["level"] = 2
        applied.append("Demoted {0} extra H1(s) to H2".format(len(h1_indexes) - 1))

    # 9. Suggested slug (does NOT rewrite url).
    suggested_slug = _slug_from_url(_s(enriched.get("url")))

    # 10. Re-score.
    after = analyze(enriched, Mode.PIXIE)

    return {
        "site": enriched,
        "business_type": business_type,
        "suggested_slug": suggested_slug,
        "score_before": before.score.to_dict(),
        "score_after": after.score.to_dict(),
        "applied": applied,
        "ai_fallback": fallback_used,
    }
