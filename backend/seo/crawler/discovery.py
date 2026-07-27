"""Link extraction / discovery for the Pixie SEO crawler.

Provides:
    LinkDiscovery(base_url, site)
        .extract(html_text, page_url) -> List[str]
            Parse HTML, extract all same-domain hrefs, normalize them,
            apply site include/exclude path policies, drop binaries,
            return a deduped list of candidate URLs.

Uses the existing ``seo.mode_external.parser.html_to_page`` parser for HTML
parsing so we don't reimplement the wheel.  All link normalization is done
via the co-located ``normalize`` module.
"""

from __future__ import annotations

import fnmatch
import logging
import re
from typing import List, Optional
from urllib.parse import urlsplit

from seo.mode_external.parser import html_to_page
from seo.crawler.normalize import normalize_url, same_domain, looks_like_binary
from seo.stores import Site

logger = logging.getLogger(__name__)

# Max path variants per path template (e.g. /product/?page=N)
# to guard against infinite paginated calendars / query-string traps.
MAX_PATH_VARIANTS: int = 20

# Regex patterns for paths that are almost certainly pagination/calendar traps
_TRAP_PATTERNS: list[re.Pattern] = [
    re.compile(r"/\d{4}/\d{2}/\d{2}/"),   # date archive /2024/01/15/
    re.compile(r"\?(?:page|p|offset|start|from|skip|cursor)=\d+"),  # pagination
]


def _path_template(url: str) -> str:
    """Return a 'template' of the URL path to group query-variant pages.

    Strips numeric segments and known query params to identify when we're
    seeing many variants of the same path structure.
    """
    try:
        parts = urlsplit(url)
        path = re.sub(r"/\d+", "/{n}", parts.path)
        return f"{parts.netloc}{path}"
    except Exception:
        return url


def _matches_policy(path: str, patterns: List[str]) -> bool:
    """Return True if *path* matches any of the glob/prefix patterns."""
    for pattern in patterns:
        # Support both prefix strings and fnmatch globs
        if pattern.endswith("*") or "*" in pattern or "?" in pattern:
            if fnmatch.fnmatch(path, pattern) or fnmatch.fnmatch(path.lstrip("/"), pattern.lstrip("/")):
                return True
        else:
            # Treat as a prefix
            if path.startswith(pattern) or path.startswith("/" + pattern.lstrip("/")):
                return True
    return False


class LinkDiscovery:
    """Extract and filter links from a fetched HTML page.

    Parameters
    ----------
    base_url:
        The site's canonical root URL (e.g. ``https://example.com``).
    site:
        The ``Site`` dataclass from stores.py — supplies ``included_paths``
        and ``excluded_paths``.
    """

    def __init__(self, base_url: str, site: Site) -> None:
        self._base_url = base_url.rstrip("/")
        self._site = site
        # Track path-variant counts to detect traps
        self._path_variant_counts: dict[str, int] = {}

    def extract(self, html_text: str, page_url: str) -> List[str]:
        """Parse *html_text* and return a list of candidate URLs to crawl.

        The returned list:
        - Contains only same-domain, normalized, HTTP/S URLs.
        - Excludes binary-extension URLs.
        - Excludes paths that violate site include/exclude policy.
        - Caps per-path-template variants to MAX_PATH_VARIANTS.
        - Is deduped (each URL appears at most once).
        """
        try:
            page_data = html_to_page(html_text, page_url)
        except Exception as exc:
            logger.debug("discovery: html_to_page error for %s: %s", page_url, exc)
            return []

        seen: set[str] = set()
        results: List[str] = []

        raw_links = page_data.get("links", [])
        for link in raw_links:
            href = ""
            if isinstance(link, dict):
                href = link.get("href", "") or ""
            elif isinstance(link, str):
                href = link

            if not href:
                continue

            normalized = normalize_url(page_url, href)
            if normalized is None:
                continue

            if not same_domain(normalized, self._base_url):
                continue

            if looks_like_binary(normalized):
                continue

            if not self._policy_allows(normalized):
                continue

            if normalized in seen:
                continue

            # Trap detection: cap per-path-template variants
            tmpl = _path_template(normalized)
            count = self._path_variant_counts.get(tmpl, 0)
            if count >= MAX_PATH_VARIANTS:
                logger.debug(
                    "discovery: skipping trap variant %s (template=%s count=%d)",
                    normalized, tmpl, count,
                )
                continue
            self._path_variant_counts[tmpl] = count + 1

            seen.add(normalized)
            results.append(normalized)

        return results

    def _policy_allows(self, url: str) -> bool:
        """Apply site include/exclude path policies."""
        try:
            path = urlsplit(url).path or "/"
        except Exception:
            return False

        excluded_paths = self._site.excluded_paths or []
        included_paths = self._site.included_paths or []

        # Excluded paths take precedence
        if excluded_paths and _matches_policy(path, excluded_paths):
            return False

        # If include list is set, URL must match at least one
        if included_paths and not _matches_policy(path, included_paths):
            return False

        return True
