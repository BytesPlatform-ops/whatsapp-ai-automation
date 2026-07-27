"""robots.txt fetcher and parser for the Pixie SEO crawler.

Provides:
    RobotsHandler(base_url, *, fetch=safe_fetch, user_agent="PixieSEOBot/1.0")
        .fetch()          — fetches and parses robots.txt (idempotent)
        .is_allowed(path) — True when the path is allowed for our UA
        .sitemap_urls     — list of Sitemap: directives found

Design notes:
    - Fetches /robots.txt via the injected *fetch* callable (same signature as
      url_guard.safe_fetch) so SSRF protection applies.
    - Fails open: if robots.txt is unreachable (UrlRejected, network error, 4xx)
      all paths are treated as allowed (standard crawler convention).
    - Respects the RobotsPolicy from stores.py:
        RESPECT — honour Disallow/Allow directives
        IGNORE  — treat all paths as allowed (skip parsing)
    - Parses per RFC 9309 (User-agent groups, Disallow, Allow, Sitemap).
      Matching is case-insensitive on the path.
"""

from __future__ import annotations

import logging
from typing import Callable, List, Optional
from urllib.parse import urljoin, urlsplit

from seo.url_guard import UrlRejected, safe_fetch
from seo.stores import RobotsPolicy

logger = logging.getLogger(__name__)


class RobotsHandler:
    """Fetch and query robots.txt for a given site.

    Parameters
    ----------
    base_url:
        The site's root URL (e.g. ``https://example.com``).  Used to build
        the robots.txt URL and to validate that the policy matches this host.
    fetch:
        Injectable fetch callable; defaults to ``safe_fetch``.  Must accept
        ``(url, *, timeout_s, max_bytes, require_html, user_agent)`` and
        return ``{text, status, content_type, headers, final_url}``.
    robots_policy:
        ``RobotsPolicy.RESPECT`` (default) or ``RobotsPolicy.IGNORE``.
    user_agent:
        The bot's UA string used for matching User-agent groups.
    """

    def __init__(
        self,
        base_url: str,
        *,
        fetch: Callable = safe_fetch,
        robots_policy: RobotsPolicy = RobotsPolicy.RESPECT,
        user_agent: str = "PixieSEOBot",
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._fetch = fetch
        self._policy = robots_policy
        self._ua = user_agent

        # Parsed state
        self._fetched: bool = False
        self._fetch_ok: bool = False
        self._raw_text: str = ""
        # List of (prefix, allow:bool) tuples for matching; more specific first
        self._rules: List[tuple[str, bool]] = []
        self._sitemap_urls: List[str] = []

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    def fetch(self) -> None:
        """Fetch and parse robots.txt. Idempotent — only fetches once."""
        if self._fetched:
            return
        self._fetched = True

        if self._policy == RobotsPolicy.IGNORE:
            self._fetch_ok = True
            return

        robots_url = self._robots_url()
        try:
            result = self._fetch(
                robots_url,
                timeout_s=10.0,
                max_bytes=512_000,  # 512 KB is more than enough for robots.txt
                require_html=False,
                user_agent=f"{self._ua}/1.0 (+https://pixie.example/bot)",
            )
            if result["status"] == 200:
                self._raw_text = result.get("text", "")
                self._parse(self._raw_text)
                self._fetch_ok = True
            else:
                # 4xx / 5xx → fail open
                logger.debug(
                    "robots.txt: HTTP %s for %s → fail open",
                    result["status"], robots_url,
                )
                self._fetch_ok = False
        except UrlRejected as exc:
            logger.info(
                "robots.txt: UrlRejected for %s reason=%s → fail open",
                robots_url, exc.reason,
            )
            self._fetch_ok = False
        except Exception as exc:
            logger.debug("robots.txt: fetch error for %s: %s → fail open", robots_url, exc)
            self._fetch_ok = False

    def is_allowed(self, path: str) -> bool:
        """Return True when the path may be crawled.

        Callers must call ``fetch()`` first (or use ``ensure_fetched``).
        If robots.txt was unreachable, returns True (fail-open).
        If policy is IGNORE, always returns True.
        """
        self.fetch()  # ensure fetched (idempotent)

        if self._policy == RobotsPolicy.IGNORE:
            return True
        if not self._fetch_ok:
            return True  # fail open

        return self._match(path)

    @property
    def sitemap_urls(self) -> List[str]:
        """List of sitemap URLs extracted from Sitemap: directives."""
        self.fetch()
        return list(self._sitemap_urls)

    @property
    def fetch_ok(self) -> bool:
        """True if robots.txt was fetched and parsed successfully."""
        self.fetch()
        return self._fetch_ok

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _robots_url(self) -> str:
        parts = urlsplit(self._base_url)
        return f"{parts.scheme}://{parts.netloc}/robots.txt"

    def _parse(self, text: str) -> None:
        """Parse robots.txt text into self._rules and self._sitemap_urls."""
        # We collect rules for our specific UA and for '*' (wildcard).
        # Rules in a more-specific matching group take precedence.
        specific_rules: List[tuple[str, bool]] = []
        wildcard_rules: List[tuple[str, bool]] = []
        sitemap_urls: List[str] = []

        current_group_uas: List[str] = []
        current_rules: List[tuple[str, bool]] = []
        in_relevant_group = False
        in_wildcard_group = False
        in_any_group = False

        def _flush_group():
            nonlocal in_relevant_group, in_wildcard_group, in_any_group
            if in_relevant_group:
                specific_rules.extend(current_rules)
            if in_wildcard_group:
                wildcard_rules.extend(current_rules)
            current_group_uas.clear()
            current_rules.clear()
            in_relevant_group = False
            in_wildcard_group = False
            in_any_group = False

        ua_lower = self._ua.lower()

        for raw_line in text.splitlines():
            line = raw_line.split("#", 1)[0].strip()
            if not line:
                # Blank line ends a group
                if in_any_group:
                    _flush_group()
                continue

            if ":" not in line:
                continue
            field, _, value = line.partition(":")
            field = field.strip().lower()
            value = value.strip()

            if field == "user-agent":
                if not in_any_group:
                    # Start of a new group
                    in_any_group = True
                    current_rules.clear()
                # A group can have multiple User-agent lines
                ua_val = value.lower()
                if ua_val == "*":
                    in_wildcard_group = True
                elif ua_lower in ua_val or ua_val in ua_lower:
                    in_relevant_group = True
            elif field == "disallow":
                if in_any_group:
                    current_rules.append((value, False))
            elif field == "allow":
                if in_any_group:
                    current_rules.append((value, True))
            elif field == "sitemap":
                sitemap_url = value
                # Resolve relative sitemap URLs
                if sitemap_url and not sitemap_url.startswith(("http://", "https://")):
                    sitemap_url = urljoin(self._base_url + "/", sitemap_url)
                if sitemap_url:
                    sitemap_urls.append(sitemap_url)
            else:
                pass  # unknown directive, ignore

        # Flush the last group
        if in_any_group:
            _flush_group()

        # Specific UA rules take precedence over wildcard
        rules = specific_rules if specific_rules else wildcard_rules
        # Sort: longer (more specific) prefixes first, Allow before Disallow on ties
        rules.sort(key=lambda r: (-len(r[0]), 0 if r[1] else 1))
        self._rules = rules
        self._sitemap_urls = list(dict.fromkeys(sitemap_urls))  # dedup, preserve order

    def _match(self, path: str) -> bool:
        """Apply the parsed rules to *path*. Returns True if allowed."""
        if not self._rules:
            return True  # no rules → allowed

        # Normalize path for matching
        test_path = path if path.startswith("/") else "/" + path

        for prefix, allow in self._rules:
            if not prefix:
                # Empty Disallow means "allow everything"
                if not allow:
                    return True
                continue
            # Wildcard matching: treat '*' in pattern and '$' at end
            if self._pattern_match(prefix, test_path):
                return allow

        return True  # default: allowed

    @staticmethod
    def _pattern_match(pattern: str, path: str) -> bool:
        """Simple robots.txt wildcard matching (* and $ supported)."""
        import re
        try:
            # Escape everything then replace \* → .* and \$ → $
            regex_pattern = re.escape(pattern)
            regex_pattern = regex_pattern.replace(r"\*", ".*")
            regex_pattern = regex_pattern.replace(r"\$", "$")
            # Must match from the start
            if not regex_pattern.endswith("$"):
                regex_pattern += ".*"
            return bool(re.match(regex_pattern, path, re.IGNORECASE))
        except re.error:
            # Fall back to simple prefix match
            return path.startswith(pattern)
