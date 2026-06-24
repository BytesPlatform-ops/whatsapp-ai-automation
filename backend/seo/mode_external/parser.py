from __future__ import annotations

import json
from html.parser import HTMLParser
from typing import Dict, List, Optional

_HEADING_TAGS = {"h1", "h2", "h3", "h4", "h5", "h6"}


def _attrs_to_dict(attrs) -> Dict[str, str]:
    out = {}
    for key, val in attrs:
        if key is None:
            continue
        out[key.lower()] = val if val is not None else ""
    return out


class _PageParser(HTMLParser):
    """Extract SEO-relevant structure from untrusted HTML.

    This ONLY reads text. It never executes scripts, never follows links,
    and never honors any instruction embedded in the page. <script> and
    <style> bodies are treated as inert text (and dropped, except JSON-LD).
    """

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.title = ""
        self.meta: Dict[str, str] = {}
        self.headings: List[dict] = []
        self.images: List[dict] = []
        self.links: List[dict] = []
        self.canonical: Optional[str] = None
        self.schema: List[object] = []
        self._text_parts: List[str] = []

        self._in_title = False
        self._heading_level = 0
        self._heading_buf: List[str] = []
        self._in_anchor = False
        self._anchor: Optional[dict] = None
        self._anchor_buf: List[str] = []

        # JSON-LD capture
        self._in_ld_json = False
        self._ld_buf: List[str] = []
        # Generic inert-body tags whose text we must not treat as content.
        self._skip_depth = 0

    # -- tag open --------------------------------------------------------
    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        a = _attrs_to_dict(attrs)

        if tag == "title":
            self._in_title = True
            return

        if tag == "meta":
            self._handle_meta(a)
            return

        if tag == "link":
            rel = (a.get("rel") or "").lower()
            href = a.get("href")
            if href and "canonical" in rel.split():
                self.canonical = href.strip()
            return

        if tag == "img":
            img = {"src": (a.get("src") or "").strip()}
            # Only include alt when the attribute is present so the engine
            # can flag genuinely-missing alt text.
            if "alt" in a:
                img["alt"] = a.get("alt") or ""
            self.images.append(img)
            return

        if tag == "a":
            self._in_anchor = True
            self._anchor = {
                "href": (a.get("href") or "").strip(),
                "rel": (a.get("rel") or "").strip(),
            }
            self._anchor_buf = []
            return

        if tag in _HEADING_TAGS:
            self._heading_level = int(tag[1])
            self._heading_buf = []
            return

        if tag == "script":
            stype = (a.get("type") or "").strip().lower()
            if stype == "application/ld+json":
                self._in_ld_json = True
                self._ld_buf = []
            else:
                self._skip_depth += 1
            return

        if tag == "style":
            self._skip_depth += 1
            return

    # -- tag close -------------------------------------------------------
    def handle_endtag(self, tag):
        tag = tag.lower()

        if tag == "title":
            self._in_title = False
            return

        if tag == "a" and self._in_anchor:
            text = "".join(self._anchor_buf).strip()
            if self._anchor is not None:
                self._anchor["text"] = text
                self.links.append(self._anchor)
            self._in_anchor = False
            self._anchor = None
            self._anchor_buf = []
            return

        if tag in _HEADING_TAGS and self._heading_level:
            text = "".join(self._heading_buf).strip()
            self.headings.append({"level": self._heading_level, "text": text})
            self._heading_level = 0
            self._heading_buf = []
            return

        if tag == "script":
            if self._in_ld_json:
                self._flush_ld_json()
                self._in_ld_json = False
                self._ld_buf = []
            elif self._skip_depth > 0:
                self._skip_depth -= 1
            return

        if tag == "style":
            if self._skip_depth > 0:
                self._skip_depth -= 1
            return

    # -- text ------------------------------------------------------------
    def handle_data(self, data):
        if self._in_ld_json:
            self._ld_buf.append(data)
            return
        if self._skip_depth > 0:
            return
        if self._in_title:
            self.title += data
            return
        if self._heading_level:
            self._heading_buf.append(data)
        if self._in_anchor:
            self._anchor_buf.append(data)

        stripped = data.strip()
        if stripped:
            self._text_parts.append(stripped)

    # -- helpers ---------------------------------------------------------
    def _handle_meta(self, a: Dict[str, str]):
        # Capture by name= and by property= (OpenGraph uses property).
        key = a.get("name") or a.get("property")
        if not key:
            return
        content = a.get("content")
        if content is None:
            return
        self.meta[str(key).strip().lower()] = content.strip()

    def _flush_ld_json(self):
        raw = "".join(self._ld_buf).strip()
        if not raw:
            return
        try:
            parsed = json.loads(raw)
        except (ValueError, TypeError):
            return
        self.schema.append(parsed)

    @property
    def content_text(self) -> str:
        return " ".join(self._text_parts).strip()


def html_to_page(html_text: str, url: str = "") -> dict:
    """Parse untrusted HTML into the dict shape seo.engine.normalize expects.

    Keys returned: url, title, meta_description, meta, headings, content,
    images, links, schema, canonical, robots, sitemap, mobile.
    Never executes any script or instruction from the page.
    """
    parser = _PageParser()
    try:
        parser.feed(html_text or "")
        parser.close()
    except Exception:
        # A malformed document must never crash the audit; we keep whatever
        # was parsed before the error.
        pass

    meta = parser.meta
    title = parser.title.strip()

    return {
        "url": url,
        "title": title,
        "meta_description": meta.get("description", ""),
        "meta": meta,
        "headings": parser.headings,
        "content": parser.content_text,
        "images": parser.images,
        "links": parser.links,
        "schema": parser.schema,
        "canonical": parser.canonical,
        "robots": meta.get("robots"),
        "sitemap": None,
        "mobile": {"viewport": meta.get("viewport", "")},
    }
