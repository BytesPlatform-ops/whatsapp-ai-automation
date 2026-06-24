"""Deterministic JSON-LD (schema.org) builder for Mode-A SEO injection.

Pure stdlib. Maps a free-text ``business_type`` to a schema.org ``@type`` and
populates only the fields it can derive from the page dict. It NEVER invents
prices, phones, addresses, or cuisines — unknown fields are simply omitted so
the engine's schema check reports them as "missing required" rather than
treating fabricated data as truth.
"""

from __future__ import annotations

import re
from typing import Dict, List


# Ordered keyword -> schema.org @type mapping. First substring match wins, so
# more specific buckets (restaurant, shop, blog) are checked before the
# LocalBusiness catch-all of trade keywords.
_RESTAURANT_KEYWORDS: List[str] = [
    "restaurant", "cafe", "café", "coffee", "bistro", "diner", "eatery",
    "bakery", "pizzeria", "food truck", "catering",
]

_LOCALBUSINESS_KEYWORDS: List[str] = [
    "hvac", "plumber", "plumbing", "contractor", "construction", "roofer",
    "roofing", "electrician", "electrical", "salon", "spa", "barber",
    "clinic", "dental", "dentist", "doctor", "medical", "vet", "veterinary",
    "lawyer", "attorney", "law firm", "real estate", "realtor", "agency",
    "gym", "fitness", "auto", "mechanic", "landscaping", "cleaning",
    "locksmith", "painter", "handyman", "pest control", "moving", "movers",
]

_PRODUCT_KEYWORDS: List[str] = [
    "shop", "store", "product", "ecommerce", "e-commerce", "boutique",
    "retail", "marketplace",
]

_ARTICLE_KEYWORDS: List[str] = [
    "blog", "article", "news", "magazine", "journal", "post", "editorial",
]


def schema_type_for(business_type: str) -> str:
    """Map a free-text business type to a schema.org @type. Deterministic.

    Falls back to ``Organization`` for anything unrecognized (including empty).
    """
    bt = (business_type or "").strip().lower()
    if not bt:
        return "Organization"
    for kw in _RESTAURANT_KEYWORDS:
        if kw in bt:
            return "Restaurant"
    for kw in _PRODUCT_KEYWORDS:
        if kw in bt:
            return "Product"
    for kw in _ARTICLE_KEYWORDS:
        if kw in bt:
            return "Article"
    for kw in _LOCALBUSINESS_KEYWORDS:
        if kw in bt:
            return "LocalBusiness"
    return "Organization"


def _s(value) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    return str(value).strip()


def _meta_get(page: dict, key: str) -> str:
    meta = page.get("meta")
    if isinstance(meta, dict):
        return _s(meta.get(key))
    return ""


def _name_for(page: dict, brand: str) -> str:
    if _s(brand):
        return _s(brand)
    if _s(page.get("title")):
        return _s(page.get("title"))
    og = _meta_get(page, "og:site_name") or _meta_get(page, "og:title")
    if og:
        return og
    return ""


def _url_for(page: dict) -> str:
    canonical = page.get("canonical")
    if _s(canonical):
        return _s(canonical)
    return _s(page.get("url"))


def _description_for(page: dict) -> str:
    desc = _s(page.get("meta_description"))
    if desc:
        return desc
    return _meta_get(page, "og:description")


def _first_image(page: dict) -> str:
    images = page.get("images")
    if isinstance(images, (list, tuple)):
        for img in images:
            if isinstance(img, dict):
                src = _s(img.get("src"))
                if src:
                    return src
            elif isinstance(img, str) and img.strip():
                return img.strip()
    return ""


def build_schema(business_type: str, page: dict) -> dict:
    """Return a single JSON-LD dict for ``page`` given its ``business_type``.

    Deterministic. Only fills fields it can derive; leaves unknown required
    fields out (never fabricates prices/phones/addresses).
    """
    if not isinstance(page, dict):
        page = {}

    schema_type = schema_type_for(business_type)
    name = _name_for(page, brand=_s(page.get("brand")))
    url = _url_for(page)
    description = _description_for(page)
    image = _first_image(page)

    block: Dict[str, object] = {
        "@context": "https://schema.org",
        "@type": schema_type,
    }

    if name:
        # Article uses "headline" as its required name-like field.
        if schema_type == "Article":
            block["headline"] = name
        block["name"] = name
    if url:
        block["url"] = url
    if description:
        block["description"] = description
    if image:
        block["image"] = image

    return block
