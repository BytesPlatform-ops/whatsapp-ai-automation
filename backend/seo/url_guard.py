"""Single hardened SSRF-safe URL fetch service for the Pixie SEO backend.

All live HTTP fetches that touch user-supplied URLs MUST go through
``safe_fetch`` (or ``assert_safe_url`` + your own transport).  The
``UrlRejected`` exception carries only a safe *category* string so
callers can surface it in API responses without leaking internal
network topology.

Design notes
------------
- Redirect handling is manual (``follow_redirects=False``).  Every
  redirect target is re-validated with ``assert_safe_url`` before
  following, which is the primary defence against DNS-rebinding and
  open-redirect-to-internal attacks.
- DNS resolution is delegated to the existing ``resolve_and_check``
  from ``seo.mode_external.ssrf``.  We never reimplement that logic.
- Body size is enforced both via ``Content-Length`` (early exit) and
  via actual streamed bytes (hard cap), so a lying server cannot
  exhaust memory.
- ``UrlRejected.reason`` is a fixed-vocabulary category string.  It
  MUST NOT contain resolved IP addresses, internal hostnames, or any
  other topology detail.
"""

from __future__ import annotations

import logging
from typing import Optional
from urllib.parse import urljoin, urlsplit

import httpx

from seo.mode_external.ssrf import is_safe_url, resolve_and_check

logger = logging.getLogger(__name__)

# Ports that are explicitly allowed.  Default ports (scheme-defined) are
# always allowed even when not listed here.
_ALLOWED_PORTS = frozenset({80, 443})

# Safe-reason vocabulary — these strings are the ONLY values that must
# ever appear in ``UrlRejected.reason``.  Add a new constant here when
# adding a new rejection category; never build the string inline.
REASON_BAD_SCHEME = "bad_scheme"
REASON_EMBEDDED_CREDENTIALS = "embedded_credentials"
REASON_BLOCKED_PORT = "blocked_port"
REASON_BLOCKED_PRIVATE_IP = "blocked_private_ip"
REASON_TOO_MANY_REDIRECTS = "too_many_redirects"
REASON_RESPONSE_TOO_LARGE = "response_too_large"
REASON_UNSUPPORTED_CONTENT_TYPE = "unsupported_content_type"
REASON_DNS_RESOLUTION_FAILED = "dns_resolution_failed"
REASON_FETCH_ERROR = "fetch_error"


class UrlRejected(Exception):
    """Raised when a URL is rejected for SSRF-safety reasons.

    ``reason`` is a fixed-category string from the REASON_* constants
    above.  It is safe to include in API error responses.  It MUST
    NOT contain resolved IP addresses, internal host details, or any
    network-topology information.
    """

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


def assert_safe_url(url: str) -> None:
    """Validate *url* and raise ``UrlRejected`` if it must not be fetched.

    Checks (in order):
    1. Scheme must be http or https.
    2. No embedded credentials (userinfo in URL).
    3. Explicit port must be 80 or 443 (or the scheme default — no port).
    4. String-level SSRF checks via ``is_safe_url`` from
       ``seo.mode_external.ssrf`` (blocks localhost/.local/.internal,
       loopback/private/link-local IPs, obfuscated numeric IPv4).
    5. DNS resolution via ``resolve_and_check`` so a public hostname
       that points to a private IP is also rejected.

    Raises ``UrlRejected`` on any failure.  The reason is always a
    safe category string — never a resolved IP or internal detail.
    """
    if not isinstance(url, str) or not url.strip():
        raise UrlRejected(REASON_BAD_SCHEME)

    parts = urlsplit(url.strip())
    scheme = (parts.scheme or "").lower()

    # 1. Scheme check.
    if scheme not in ("http", "https"):
        logger.info("url_guard: rejected bad scheme url=%s reason=%s", _safe_log(url), REASON_BAD_SCHEME)
        raise UrlRejected(REASON_BAD_SCHEME)

    # 2. Embedded credentials.
    if parts.username is not None or parts.password is not None:
        logger.info("url_guard: rejected embedded credentials url=%s reason=%s", _safe_log(url), REASON_EMBEDDED_CREDENTIALS)
        raise UrlRejected(REASON_EMBEDDED_CREDENTIALS)

    # 3. Port restriction.  urlsplit gives None when no port is in the URL
    #    (meaning the scheme default is used), which is always fine.
    if parts.port is not None and parts.port not in _ALLOWED_PORTS:
        logger.info("url_guard: rejected non-standard port url=%s reason=%s", _safe_log(url), REASON_BLOCKED_PORT)
        raise UrlRejected(REASON_BLOCKED_PORT)

    # 4. String-level SSRF guard (existing logic, not reimplemented).
    ok, _reason = is_safe_url(url)
    if not ok:
        logger.info("url_guard: rejected by is_safe_url url=%s reason=%s", _safe_log(url), REASON_BLOCKED_PRIVATE_IP)
        raise UrlRejected(REASON_BLOCKED_PRIVATE_IP)

    # 5. DNS-resolution guard (blocks public names pointing to private IPs).
    host = parts.hostname or ""
    ok, _reason = resolve_and_check(host)
    if not ok:
        logger.info("url_guard: rejected by resolve_and_check url=%s reason=%s", _safe_log(url), REASON_BLOCKED_PRIVATE_IP)
        raise UrlRejected(REASON_BLOCKED_PRIVATE_IP)


def safe_fetch(
    url: str,
    *,
    timeout_s: float = 10.0,
    max_bytes: int = 2_000_000,
    max_redirects: int = 5,
    require_html: bool = False,
    user_agent: str = "PixieSEOBot/1.0 (+https://pixie.example/bot)",
) -> dict:
    """Fetch *url* safely and return a result dict.

    Returned dict keys:
      ``final_url``   — URL actually fetched (after any redirects).
      ``status``      — HTTP status code (int).
      ``headers``     — dict of lower-cased response header names → values
                        (subset: content-type, content-length, server,
                        x-powered-by, x-generator, x-cms).
      ``text``        — decoded response body (UTF-8, errors replaced).
      ``content_type`` — value of the Content-Type header (or ``""``).

    Raises ``UrlRejected`` for any SSRF, size, redirect, or content-type
    violation.  Raises ``httpx.HTTPError`` / ``OSError`` for genuine
    network failures (callers should handle both).

    Security model
    --------------
    - ``assert_safe_url`` is called on the initial URL AND on every
      redirect target before following.  This is the redirect-to-internal
      / DNS-rebinding defence.
    - ``follow_redirects=False`` on the httpx client ensures httpx never
      silently follows a redirect without our re-validation.
    - ``Content-Length`` is checked eagerly; body bytes are counted while
      streaming and the connection is dropped the instant the cap is hit.
    - If ``require_html`` is True, the final Content-Type must be
      ``text/html`` or ``application/xhtml+xml``; anything else raises
      ``UrlRejected(REASON_UNSUPPORTED_CONTENT_TYPE)``.
    """
    # Validate the initial URL before opening any socket.
    assert_safe_url(url)

    _SAFE_HEADERS = frozenset({
        "content-type", "content-length", "server",
        "x-powered-by", "x-generator", "x-cms",
    })

    timeout = httpx.Timeout(connect=timeout_s, read=timeout_s, write=timeout_s, pool=timeout_s)
    headers = {
        "User-Agent": user_agent,
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
    }

    current_url = url
    redirects_left = max_redirects

    with httpx.Client(follow_redirects=False, timeout=timeout, headers=headers) as client:
        while True:
            resp = client.get(current_url)

            if resp.is_redirect:
                location = resp.headers.get("location", "")
                if not location:
                    raise UrlRejected(REASON_FETCH_ERROR)

                if redirects_left <= 0:
                    logger.warning(
                        "url_guard: too many redirects url=%s reason=%s",
                        _safe_log(url), REASON_TOO_MANY_REDIRECTS,
                    )
                    raise UrlRejected(REASON_TOO_MANY_REDIRECTS)
                redirects_left -= 1

                # Resolve relative Location against the current URL.
                next_url = urljoin(current_url, location)

                # Validate the redirect target — this is the core
                # redirect-revalidation defence.
                assert_safe_url(next_url)
                current_url = next_url
                continue

            # Non-redirect response: read the body with size enforcement.
            content_type = resp.headers.get("content-type", "")

            # Early-exit on Content-Length if present and over cap.
            cl_str = resp.headers.get("content-length", "")
            if cl_str:
                try:
                    cl = int(cl_str)
                    if cl > max_bytes:
                        logger.warning(
                            "url_guard: content-length exceeds cap url=%s cl=%d cap=%d reason=%s",
                            _safe_log(url), cl, max_bytes, REASON_RESPONSE_TOO_LARGE,
                        )
                        raise UrlRejected(REASON_RESPONSE_TOO_LARGE)
                except (ValueError, TypeError):
                    pass  # malformed Content-Length: proceed and cap by bytes

            # Stream body and enforce hard byte cap.
            chunks: list[bytes] = []
            total = 0
            for chunk in resp.iter_bytes(chunk_size=65536):
                total += len(chunk)
                if total > max_bytes:
                    logger.warning(
                        "url_guard: streamed bytes exceeded cap url=%s total=%d cap=%d reason=%s",
                        _safe_log(url), total, max_bytes, REASON_RESPONSE_TOO_LARGE,
                    )
                    raise UrlRejected(REASON_RESPONSE_TOO_LARGE)
                chunks.append(chunk)

            raw = b"".join(chunks)
            text = raw.decode("utf-8", errors="replace")

            if require_html:
                ct_lower = content_type.lower()
                if not (
                    ct_lower.startswith("text/html")
                    or ct_lower.startswith("application/xhtml+xml")
                ):
                    logger.info(
                        "url_guard: rejected non-html content-type url=%s ct=%r reason=%s",
                        _safe_log(url), content_type, REASON_UNSUPPORTED_CONTENT_TYPE,
                    )
                    raise UrlRejected(REASON_UNSUPPORTED_CONTENT_TYPE)

            filtered_headers = {
                k.lower(): v
                for k, v in resp.headers.items()
                if k.lower() in _SAFE_HEADERS
            }

            return {
                "final_url": str(resp.url),
                "status": resp.status_code,
                "headers": filtered_headers,
                "text": text,
                "content_type": content_type,
            }


def _safe_log(url: str, max_len: int = 80) -> str:
    """Return a truncated, safe-to-log representation of a URL.

    Strips userinfo so passwords are never written to logs even if
    assert_safe_url hasn't run yet.
    """
    try:
        parts = urlsplit(url)
        # Rebuild without userinfo.
        safe = parts._replace(netloc=parts.hostname or "")
        s = safe.geturl()
    except Exception:
        s = url
    return s[:max_len]
