from __future__ import annotations

from typing import Optional

from ..schemas import SeoPage


def _s(value) -> str:
    """Coerce to a stripped string; None -> ''."""
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    return str(value).strip()


def _opt_s(value):
    """Coerce to a stripped string or None when empty/missing."""
    if value is None:
        return None
    text = _s(value)
    return text if text else None


def _normalize_meta(raw_meta) -> dict:
    out = {}
    if isinstance(raw_meta, dict):
        for key, val in raw_meta.items():
            if key is None:
                continue
            lk = str(key).strip().lower()
            if isinstance(val, str):
                out[lk] = val.strip()
            else:
                out[lk] = val
    return out


def _normalize_headings(raw_headings) -> list:
    out = []
    if isinstance(raw_headings, dict):
        # form like {"h1": ["..."], "h2": [...]}
        for key in sorted(raw_headings.keys(), key=lambda k: str(k)):
            ks = str(key).strip().lower()
            level = None
            if ks.startswith("h") and ks[1:].isdigit():
                level = int(ks[1:])
            else:
                continue
            vals = raw_headings[key]
            if isinstance(vals, (list, tuple)):
                for v in vals:
                    out.append({"level": level, "text": _s(v)})
            else:
                out.append({"level": level, "text": _s(vals)})
    elif isinstance(raw_headings, (list, tuple)):
        for item in raw_headings:
            if isinstance(item, dict):
                lvl = item.get("level")
                try:
                    lvl = int(lvl)
                except (TypeError, ValueError):
                    lvl = 0
                out.append({"level": lvl, "text": _s(item.get("text"))})
            elif isinstance(item, (list, tuple)) and len(item) >= 2:
                try:
                    lvl = int(item[0])
                except (TypeError, ValueError):
                    lvl = 0
                out.append({"level": lvl, "text": _s(item[1])})
    return out


def _normalize_images(raw_images) -> list:
    out = []
    if isinstance(raw_images, (list, tuple)):
        for item in raw_images:
            if isinstance(item, dict):
                alt = item.get("alt") if "alt" in item else None
                if alt is not None and isinstance(alt, str):
                    alt = alt  # preserve (do not strip — empty/whitespace is meaningful)
                out.append({"src": _s(item.get("src")), "alt": alt})
            elif isinstance(item, str):
                out.append({"src": item.strip(), "alt": None})
    return out


def _normalize_links(raw_links) -> list:
    out = []
    if isinstance(raw_links, (list, tuple)):
        for item in raw_links:
            if isinstance(item, dict):
                internal = item.get("internal")
                if internal is not None and not isinstance(internal, bool):
                    internal = bool(internal)
                out.append({
                    "href": _s(item.get("href")),
                    "rel": _s(item.get("rel")),
                    "text": _s(item.get("text")),
                    "internal": internal,
                })
            elif isinstance(item, str):
                out.append({"href": item.strip(), "rel": "", "text": "", "internal": None})
    return out


def _normalize_schema(raw_schema) -> list:
    out = []
    if isinstance(raw_schema, dict):
        out.append(raw_schema)
    elif isinstance(raw_schema, (list, tuple)):
        for item in raw_schema:
            if isinstance(item, dict):
                out.append(item)
    return out


def normalize(raw: dict) -> SeoPage:
    """Accept a loosely-structured dict and return a fully-populated SeoPage.

    Tolerant of missing keys; never raises. Pure function, no side effects.
    """
    if not isinstance(raw, dict):
        raw = {}

    meta = _normalize_meta(raw.get("meta"))

    title = _s(raw.get("title"))
    if not title and meta.get("title"):
        title = _s(meta.get("title"))

    meta_description = _s(raw.get("meta_description"))
    if not meta_description:
        meta_description = _s(raw.get("description"))
    if not meta_description and meta.get("description"):
        meta_description = _s(meta.get("description"))

    canonical = _opt_s(raw.get("canonical"))
    if canonical is None and meta.get("canonical"):
        canonical = _opt_s(meta.get("canonical"))

    robots = _opt_s(raw.get("robots"))
    if robots is None and meta.get("robots"):
        robots = _opt_s(meta.get("robots"))

    mobile = raw.get("mobile")
    mobile = dict(mobile) if isinstance(mobile, dict) else {}
    # surface viewport into meta if only present in mobile, and vice versa
    if "viewport" not in meta:
        vp = None
        if raw.get("viewport") is not None:
            vp = _opt_s(raw.get("viewport"))
        elif mobile.get("viewport") is not None:
            vp = _opt_s(mobile.get("viewport"))
        if vp:
            meta["viewport"] = vp

    technical = raw.get("technical")
    technical = dict(technical) if isinstance(technical, dict) else {}

    extra = raw.get("extra")
    extra = dict(extra) if isinstance(extra, dict) else {}

    return SeoPage(
        url=_s(raw.get("url")),
        title=title,
        meta_description=meta_description,
        meta=meta,
        headings=_normalize_headings(raw.get("headings")),
        content=_s(raw.get("content")),
        images=_normalize_images(raw.get("images")),
        links=_normalize_links(raw.get("links")),
        schema=_normalize_schema(raw.get("schema")),
        canonical=canonical,
        robots=robots,
        sitemap=_opt_s(raw.get("sitemap")),
        mobile=mobile,
        technical=technical,
        extra=extra,
    )
