"""URL normalization for the Pixie SEO crawler.

Provides:
    normalize_url(base, href) -> str | None
        Resolve *href* relative to *base*, normalize, return canonical string.
        Returns None for non-HTTP/S schemes (mailto, tel, javascript, data …).

    same_domain(a, b) -> bool
        True when two normalized URLs share the same registrable host
        (scheme-insensitive comparison of the effective host).

Normalization steps applied:
    1. Resolve *href* relative to *base* (handles relative / absolute / protocol-relative).
    2. Lowercase scheme and host.
    3. Strip URL fragment (#…).
    4. Remove default ports (80 for http, 443 for https).
    5. Filter / sort query parameters:
       - Drop known tracking params (utm_*, gclid, fbclid, _ga, _gl, mc_*,
         ref, source, campaign, medium, content, term) by default.
       - If query_policy='drop_all' remove all query params.
       - If query_policy='keep_all' keep everything (sorted).
       - Default: 'drop_tracking' — sort and keep non-tracking params.
    6. Collapse trailing-slash: for paths beyond '/' a trailing '/' is stripped
       unless the URL has no path component or path == '/'.
    7. Percent-encoding: leave existing encoded chars as-is; do not double-encode.
"""

from __future__ import annotations

import re
from typing import Optional
from urllib.parse import (
    ParseResult,
    parse_qsl,
    urlencode,
    urljoin,
    urlsplit,
    urlunsplit,
)

# ---------------------------------------------------------------------------
# Tracking parameter patterns — drop these by default
# ---------------------------------------------------------------------------
_TRACKING_EXACT: frozenset[str] = frozenset({
    "gclid", "fbclid", "_ga", "_gl", "dclid", "msclkid", "ttclid",
    "ref", "source", "campaign", "medium", "content", "term",
})

_TRACKING_PREFIXES: tuple[str, ...] = (
    "utm_",
    "mc_",
    "hsa_",
    "yclid",
)

# Extensions that signal binary / non-HTML assets we should skip
BINARY_EXTENSIONS: frozenset[str] = frozenset({
    ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".ico",
    ".bmp", ".tiff", ".avif",
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
    ".zip", ".tar", ".gz", ".bz2", ".rar", ".7z",
    ".mp3", ".mp4", ".avi", ".mov", ".mkv", ".webm", ".ogg", ".wav",
    ".woff", ".woff2", ".ttf", ".otf", ".eot",
    ".css", ".js", ".ts", ".map",
    ".exe", ".dmg", ".apk", ".deb", ".rpm",
    ".json", ".xml",   # sitemap.xml is handled separately via discovery
})

# Default allowed ports per scheme
_DEFAULT_PORTS: dict[str, int] = {"http": 80, "https": 443}


def _is_tracking_param(key: str) -> bool:
    """Return True if *key* is a known tracking query parameter."""
    k = key.lower()
    if k in _TRACKING_EXACT:
        return True
    for prefix in _TRACKING_PREFIXES:
        if k.startswith(prefix):
            return True
    return False


def _normalize_query(query: str, policy: str) -> str:
    """Filter and sort query parameters according to *policy*.

    policy values:
        'drop_tracking'  — remove tracking params, sort remainder (default)
        'drop_all'       — remove all query params
        'keep_all'       — keep all params, sorted for canonical form
    """
    if not query:
        return ""
    if policy == "drop_all":
        return ""
    pairs = parse_qsl(query, keep_blank_values=True)
    if policy != "keep_all":  # drop_tracking (default)
        pairs = [(k, v) for k, v in pairs if not _is_tracking_param(k)]
    # Sort for a stable canonical form
    pairs.sort(key=lambda kv: (kv[0].lower(), kv[1]))
    return urlencode(pairs) if pairs else ""


def normalize_url(
    base: str,
    href: str,
    *,
    query_policy: str = "drop_tracking",
) -> Optional[str]:
    """Resolve *href* against *base* and return a canonical URL string.

    Returns ``None`` for:
    - Non-HTTP/S schemes (mailto, tel, javascript, data, ftp, …)
    - Empty / whitespace-only hrefs
    - Fragments-only (#…) — these aren't real pages
    - Malformed URLs that cannot be parsed
    """
    if not href:
        return None
    href = href.strip()
    if not href or href.startswith("#"):
        return None

    # Resolve relative URL against base
    try:
        absolute = urljoin(base, href) if base else href
        parts = urlsplit(absolute)
    except Exception:
        return None

    scheme = (parts.scheme or "").lower()
    if scheme not in ("http", "https"):
        return None

    host = (parts.hostname or "").lower()
    if not host:
        return None

    # Reconstruct netloc without default port
    port = parts.port
    if port is not None and _DEFAULT_PORTS.get(scheme) == port:
        port = None

    netloc = host
    if port is not None:
        netloc = f"{host}:{port}"

    # Strip fragment, normalize query
    normalized_query = _normalize_query(parts.query, query_policy)

    # Trailing-slash policy: strip trailing slash from paths that are not
    # the root '/' — this avoids treating /foo/ and /foo as different URLs.
    path = parts.path or "/"
    if path != "/" and path.endswith("/"):
        path = path.rstrip("/") or "/"

    return urlunsplit((scheme, netloc, path, normalized_query, ""))


def same_domain(a: str, b: str) -> bool:
    """Return True if URLs *a* and *b* share the same host (case-insensitive).

    Ignores scheme, port, path, query — only compares the effective hostname.
    Both arguments should already be absolute URLs.
    """
    try:
        ha = (urlsplit(a).hostname or "").lower().lstrip("www.")
        hb = (urlsplit(b).hostname or "").lower().lstrip("www.")
        return bool(ha and ha == hb)
    except Exception:
        return False


def looks_like_binary(url: str) -> bool:
    """Heuristic: return True if the URL path ends with a binary extension."""
    try:
        path = urlsplit(url).path.lower()
        # Find last dot in the path segment
        last_slash = path.rfind("/")
        segment = path[last_slash + 1:] if last_slash >= 0 else path
        if "." in segment:
            ext = "." + segment.rsplit(".", 1)[1].split("?")[0]
            return ext in BINARY_EXTENSIONS
    except Exception:
        pass
    return False
