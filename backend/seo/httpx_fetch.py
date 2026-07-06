"""Working HTTP fetch for the SEO agent (httpx + certifi).

The legacy `seo/mode_external/fetch.py` uses urllib, which fails TLS verification
on some Python builds. This httpx fetcher is used by the audit agent + platform
detector so real public pages fetch reliably. `audit_url` accepts an injected
fetcher, so the entire existing audit engine is reused unchanged.
"""

from __future__ import annotations

import httpx

_UA = "PixieSEO/1.0 (+https://pixie.app)"


def fetch_full(url: str, timeout: float = 20.0) -> dict:
    """Fetch a page: returns {html, headers, final_url, status}. Raises httpx errors."""
    with httpx.Client(timeout=timeout, follow_redirects=True,
                      headers={"User-Agent": _UA, "Accept": "text/html,*/*"}) as http:
        r = http.get(url)
        return {
            "html": r.text,
            "headers": {k.lower(): v for k, v in r.headers.items()},
            "final_url": str(r.url),
            "status": r.status_code,
        }


def html_fetcher(cached_html: str):
    """A fetcher(url)->html that returns already-fetched HTML (single network hit)."""
    def _f(_url: str) -> str:
        return cached_html
    return _f
