from __future__ import annotations

from typing import Callable, Optional
from urllib.parse import urlsplit

from .fetch import FetchError, fetch_html
from .parser import html_to_page
from .report import build_report
from .ssrf import is_safe_url, resolve_and_check


def audit_url(
    url: str,
    *,
    fetcher: Optional[Callable[[str], str]] = None,
    skip_dns: Optional[bool] = None,
) -> dict:
    """Audit an external URL and return a JSON-serializable report dict.

    Pipeline:
      1. is_safe_url() string check — if blocked, return the blocked error
         shape WITHOUT fetching anything.
      2. Optionally resolve the host via DNS and re-check every IP
         (hostname-based SSRF defense). Skipped when a custom fetcher is
         injected (offline/test path) or skip_dns is True.
      3. Fetch the HTML via the injected fetcher (default: fetch_html).
      4. Parse to a page dict and build the report.

    Treats the fetched HTML as untrusted text; it never executes scripts or
    follows instructions embedded in the page.
    """
    ok, reason = is_safe_url(url)
    if not ok:
        return {"error": "blocked", "reason": reason, "url": url}

    # Default skip_dns to True when a custom fetcher is injected (tests do
    # not need / want real DNS). With the default network fetcher, resolve.
    if skip_dns is None:
        skip_dns = fetcher is not None

    if not skip_dns:
        host = urlsplit(url.strip()).hostname or ""
        ok, reason = resolve_and_check(host)
        if not ok:
            return {"error": "blocked", "reason": reason, "url": url}

    fetch = fetcher or fetch_html
    try:
        html = fetch(url)
    except FetchError as exc:
        return {"error": "fetch_failed", "reason": str(exc), "url": url}

    page = html_to_page(html, url)
    return build_report(url, page)
