from __future__ import annotations

from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from .ssrf import is_safe_url

# A normal browser-ish UA so origins do not reject us outright. We never
# execute anything we fetch; the HTML is treated purely as untrusted text.
_USER_AGENT = (
    "Mozilla/5.0 (compatible; PixieSEOBot/1.0; "
    "+https://pixie.example/seo-audit)"
)


class FetchError(Exception):
    """Raised when an external page cannot be fetched safely."""


def _read_capped(resp, max_bytes: int) -> bytes:
    """Read at most max_bytes from resp without trusting Content-Length.

    Reads in chunks and stops as soon as the cap is exceeded so a malicious
    or huge response cannot exhaust memory.
    """
    chunks = []
    total = 0
    chunk_size = 65536
    while total < max_bytes:
        chunk = resp.read(min(chunk_size, max_bytes - total))
        if not chunk:
            break
        chunks.append(chunk)
        total += len(chunk)
    return b"".join(chunks)


def fetch_html(
    url: str,
    *,
    timeout: int = 10,
    max_bytes: int = 2_000_000,
    max_redirects: int = 3,
) -> str:
    """Fetch url over GET and return decoded HTML text.

    Performs real network I/O (NOT exercised by offline tests). Safety:
      * re-runs is_safe_url() on the initial URL and on every redirect hop,
        so a public URL that 30x-redirects to an internal IP is blocked;
      * GET only;
      * caps the body at max_bytes;
      * enforces a socket timeout;
      * decodes utf-8 with errors="replace".
    Raises FetchError on any failure or blocked target.
    """
    current = url
    redirects_left = max_redirects

    while True:
        ok, reason = is_safe_url(current)
        if not ok:
            raise FetchError("unsafe url: {} ({})".format(current, reason))

        req = Request(
            current,
            method="GET",
            headers={
                "User-Agent": _USER_AGENT,
                "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
            },
        )

        try:
            # We handle redirects manually so we can re-check each target,
            # so a 3xx surfaces as an HTTPError here rather than being
            # auto-followed by urllib's default opener.
            resp = urlopen(req, timeout=timeout)
        except HTTPError as exc:
            if exc.code in (301, 302, 303, 307, 308):
                location = exc.headers.get("Location")
                if not location:
                    raise FetchError(
                        "redirect with no Location from {}".format(current)
                    )
                if redirects_left <= 0:
                    raise FetchError("too many redirects from {}".format(url))
                redirects_left -= 1
                # Resolve relative redirects against the current URL.
                from urllib.parse import urljoin

                current = urljoin(current, location)
                continue
            raise FetchError(
                "http error {} for {}".format(exc.code, current)
            )
        except URLError as exc:
            raise FetchError("url error for {}: {}".format(current, exc.reason))
        except (TimeoutError, OSError) as exc:
            raise FetchError("io error for {}: {}".format(current, exc))

        try:
            # Defensive: if urllib's default opener silently followed a
            # redirect, re-check the final URL it landed on.
            final_url = resp.geturl()
            if final_url and final_url != current:
                ok, reason = is_safe_url(final_url)
                if not ok:
                    raise FetchError(
                        "unsafe redirect target: {} ({})".format(
                            final_url, reason
                        )
                    )
            raw = _read_capped(resp, max_bytes)
        finally:
            try:
                resp.close()
            except Exception:
                pass

        return raw.decode("utf-8", errors="replace")
