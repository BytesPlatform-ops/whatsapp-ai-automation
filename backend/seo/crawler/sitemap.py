"""Sitemap discovery and parsing for the Pixie SEO crawler.

Provides:
    SitemapDiscovery(base_url, *, fetch=safe_fetch, robots_handler=None)
        .discover() -> List[str]
            Returns the full set of page URLs found across all sitemaps,
            bounded by MAX_SITEMAP_URLS and MAX_SITEMAP_DEPTH.

Design:
    1. Seed URLs = robots_handler.sitemap_urls + common locations.
    2. Parse each sitemap via the injected fetch callable.
    3. Handle <sitemapindex> (recursive) up to MAX_SITEMAP_DEPTH levels.
    4. Handle <urlset> — extract <loc> entries.
    5. All fetches guarded (UrlRejected → skip, not crash).
    6. Off-domain sitemap index entries are skipped.
    7. Dedup by URL string.
"""

from __future__ import annotations

import logging
import xml.etree.ElementTree as ET
from collections import deque
from typing import Callable, List, Optional, Set
from urllib.parse import urlsplit

from seo.url_guard import UrlRejected, safe_fetch

logger = logging.getLogger(__name__)

# Hard caps to prevent memory exhaustion
MAX_SITEMAP_URLS: int = 50_000
MAX_SITEMAP_DEPTH: int = 5
MAX_SITEMAPS_PER_LEVEL: int = 100

# Common sitemap locations to probe if robots.txt has no Sitemap: directive
_COMMON_SITEMAP_PATHS: list[str] = [
    "/sitemap.xml",
    "/sitemap_index.xml",
    "/sitemap-index.xml",
    "/sitemaps/sitemap.xml",
    "/wp-sitemap.xml",
    "/news-sitemap.xml",
    "/post-sitemap.xml",
    "/page-sitemap.xml",
]

# XML namespace for sitemaps
_NS = {
    "sm": "http://www.sitemaps.org/schemas/sitemap/0.9",
    "xhtml": "http://www.w3.org/1999/xhtml",
}


def _strip_ns(tag: str) -> str:
    """Strip XML namespace from a tag name."""
    if "}" in tag:
        return tag.split("}", 1)[1]
    return tag


def _parse_sitemap_xml(text: str) -> dict:
    """Parse sitemap XML; return {'type': 'urlset'|'sitemapindex'|'unknown', 'urls': [...]}."""
    try:
        root = ET.fromstring(text.strip())
    except ET.ParseError as exc:
        logger.debug("sitemap: XML parse error: %s", exc)
        return {"type": "unknown", "urls": []}

    local = _strip_ns(root.tag).lower()
    urls: List[str] = []

    if local == "urlset":
        for url_el in root:
            local_child = _strip_ns(url_el.tag).lower()
            if local_child == "url":
                for loc_el in url_el:
                    if _strip_ns(loc_el.tag).lower() == "loc" and loc_el.text:
                        urls.append(loc_el.text.strip())
        return {"type": "urlset", "urls": urls}

    if local == "sitemapindex":
        for sitemap_el in root:
            if _strip_ns(sitemap_el.tag).lower() == "sitemap":
                for loc_el in sitemap_el:
                    if _strip_ns(loc_el.tag).lower() == "loc" and loc_el.text:
                        urls.append(loc_el.text.strip())
        return {"type": "sitemapindex", "urls": urls}

    return {"type": "unknown", "urls": []}


class SitemapDiscovery:
    """Discover and parse all sitemaps for a site.

    Parameters
    ----------
    base_url:
        The site's canonical root URL (e.g. ``https://example.com``).
    fetch:
        Injectable fetch callable (defaults to ``safe_fetch``).
    robots_handler:
        An already-constructed ``RobotsHandler`` instance.  If supplied,
        ``sitemap_urls`` from robots.txt are used as seed URLs.
    user_agent:
        UA string forwarded to the fetcher.
    """

    def __init__(
        self,
        base_url: str,
        *,
        fetch: Callable = safe_fetch,
        robots_handler=None,
        user_agent: str = "PixieSEOBot/1.0 (+https://pixie.example/bot)",
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._fetch = fetch
        self._robots_handler = robots_handler
        self._ua = user_agent

        self._discovered: bool = False
        self._page_urls: List[str] = []
        self._sitemap_urls_found: List[str] = []

    def discover(self) -> List[str]:
        """Return all page URLs found across all sitemaps (deduplicated).

        Idempotent — caches result after first call.
        """
        if self._discovered:
            return list(self._page_urls)
        self._discovered = True
        self._page_urls = self._run()
        return list(self._page_urls)

    @property
    def sitemap_urls_found(self) -> List[str]:
        """List of sitemap URLs actually found and parsed."""
        self.discover()
        return list(self._sitemap_urls_found)

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _run(self) -> List[str]:
        # Collect seed sitemap URLs
        seed_urls: List[str] = []

        if self._robots_handler is not None:
            seed_urls.extend(self._robots_handler.sitemap_urls)

        if not seed_urls:
            # Probe common locations
            seed_urls = self._probe_common_locations()

        # BFS over sitemapindex entries, bounded by depth and count
        visited_sitemaps: Set[str] = set()
        page_urls: Set[str] = set()
        all_page_urls: List[str] = []  # preserve first-seen order

        # Queue items: (sitemap_url, depth)
        queue: deque[tuple[str, int]] = deque()
        for url in seed_urls:
            if url not in visited_sitemaps:
                queue.append((url, 0))
                visited_sitemaps.add(url)

        while queue:
            if len(all_page_urls) >= MAX_SITEMAP_URLS:
                break

            sitemap_url, depth = queue.popleft()

            if depth > MAX_SITEMAP_DEPTH:
                continue

            text = self._fetch_sitemap(sitemap_url)
            if text is None:
                continue

            self._sitemap_urls_found.append(sitemap_url)
            result = _parse_sitemap_xml(text)

            if result["type"] == "urlset":
                for loc in result["urls"]:
                    if len(all_page_urls) >= MAX_SITEMAP_URLS:
                        break
                    if loc not in page_urls:
                        page_urls.add(loc)
                        all_page_urls.append(loc)

            elif result["type"] == "sitemapindex":
                added = 0
                for child_url in result["urls"]:
                    if added >= MAX_SITEMAPS_PER_LEVEL:
                        break
                    if child_url not in visited_sitemaps:
                        # Only follow sitemaps on the same domain
                        if self._same_host(child_url):
                            visited_sitemaps.add(child_url)
                            queue.append((child_url, depth + 1))
                            added += 1

        return all_page_urls

    def _probe_common_locations(self) -> List[str]:
        """Try common sitemap paths; return those that respond with 200."""
        found: List[str] = []
        for path in _COMMON_SITEMAP_PATHS:
            url = self._base_url + path
            try:
                result = self._fetch(
                    url,
                    timeout_s=10.0,
                    max_bytes=1_048_576,  # 1 MB for a sitemap index
                    require_html=False,
                    user_agent=self._ua,
                )
                if result["status"] == 200:
                    ct = result.get("content_type", "").lower()
                    # Accept XML and text/plain (some servers mis-serve)
                    if "xml" in ct or "text" in ct or not ct:
                        found.append(url)
                        break  # one seed is enough to start; sitemapindex handles rest
            except (UrlRejected, Exception):
                continue
        return found

    def _fetch_sitemap(self, url: str) -> Optional[str]:
        """Fetch one sitemap URL; return text or None on error."""
        try:
            result = self._fetch(
                url,
                timeout_s=15.0,
                max_bytes=5_242_880,  # 5 MB per sitemap file
                require_html=False,
                user_agent=self._ua,
            )
            if result["status"] == 200:
                return result.get("text", "")
        except UrlRejected as exc:
            logger.info("sitemap: UrlRejected %s reason=%s", url, exc.reason)
        except Exception as exc:
            logger.debug("sitemap: fetch error %s: %s", url, exc)
        return None

    def _same_host(self, url: str) -> bool:
        """True if *url* is on the same host as the base URL."""
        try:
            base_host = urlsplit(self._base_url).hostname or ""
            url_host = urlsplit(url).hostname or ""
            return base_host.lower() == url_host.lower()
        except Exception:
            return False
