"""Working HTTP fetch for the SEO agent — hardened via url_guard.

The ``fetch_full`` function delegates to ``url_guard.safe_fetch`` which:
  - validates the URL (scheme, no credentials, port whitelist, SSRF check)
  - resolves DNS and rejects hostnames that point to private IPs
  - handles redirects manually and re-validates each target
  - caps the body at 2 MB and enforces timeouts

The legacy ``seo/mode_external/fetch.py`` uses urllib and is kept for
the deprecated ``/api/seo/audit-url`` path only.  New code must use
``fetch_full`` from this module (or ``url_guard.safe_fetch`` directly).

Return shape is unchanged so existing callers and monkeypatches continue
to work:
    {"html": str, "headers": dict, "final_url": str, "status": int}
"""

from __future__ import annotations

from seo.url_guard import UrlRejected, safe_fetch  # noqa: F401 — re-export for convenience


def fetch_full(url: str, timeout: float = 20.0) -> dict:
    """Fetch a page via the hardened url_guard.safe_fetch.

    Returns ``{"html": str, "headers": dict, "final_url": str, "status": int}``.

    Raises ``UrlRejected`` when the URL or a redirect target violates the
    SSRF policy, or on content-type / size violations.  Raises
    ``httpx.HTTPError`` / ``OSError`` for genuine network failures.

    The ``timeout`` parameter is forwarded to ``safe_fetch`` as
    ``timeout_s``.  The ``require_html=True`` flag ensures the final
    response is HTML (text/html or application/xhtml+xml), consistent
    with the purpose of this fetcher (HTML SEO analysis).
    """
    result = safe_fetch(url, timeout_s=timeout, require_html=True)
    return {
        "html": result["text"],
        "headers": result["headers"],
        "final_url": result["final_url"],
        "status": result["status"],
    }


def html_fetcher(cached_html: str):
    """A fetcher(url)->html that returns already-fetched HTML (single network hit)."""
    def _f(_url: str) -> str:
        return cached_html
    return _f
