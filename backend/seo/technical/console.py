from __future__ import annotations

import hashlib
from typing import List

from .models import ConsoleError


def _bucket(url: str) -> int:
    """Deterministic 0-9 bucket derived from sha1(url)."""
    digest = hashlib.sha1((url or "").encode("utf-8")).digest()
    return digest[0] % 10


class ConsoleProvider:
    """Abstract provider capturing browser-console errors for a url."""

    name = "abstract"

    def capture(self, url: str) -> List[ConsoleError]:  # pragma: no cover - abstract
        raise NotImplementedError


class MockConsoleProvider(ConsoleProvider):
    """Deterministic console capture derived from sha1(url).

    "Clean" urls (most buckets) yield an empty list. Urls hashing into a
    specific bucket yield a representative sample error so downstream grouping
    has data to exercise. No randomness, no network.
    """

    name = "mock"

    def capture(self, url: str) -> List[ConsoleError]:
        bucket = _bucket(url)
        if bucket < 7:
            return []  # clean
        if bucket == 9:
            return [
                ConsoleError(
                    level="error",
                    text="Uncaught TypeError: Cannot read properties of undefined",
                    source="main.js:42",
                ),
                ConsoleError(
                    level="warning",
                    text="Image was downloaded but never used; consider lazy-loading",
                    source="index.html",
                ),
            ]
        return [
            ConsoleError(
                level="error",
                text="Failed to load resource: the server responded with a status of 404",
                source="app.bundle.js",
            )
        ]


class PlaywrightConsoleProvider(ConsoleProvider):
    """Playwright-backed console capture.

    Playwright is intentionally NOT installed in this environment. The import is
    guarded inside `capture`; when Playwright is absent (always, offline) this
    provider transparently delegates to the mock and never launches a browser.
    """

    name = "playwright"

    def capture(self, url: str) -> List[ConsoleError]:
        try:
            from playwright.sync_api import sync_playwright  # type: ignore  # noqa: F401
        except Exception:
            # Playwright not installed -> deterministic mock fallback.
            return MockConsoleProvider().capture(url)

        # pragma: no cover - real browser path, never reached offline.
        errors: List[ConsoleError] = []
        try:  # pragma: no cover
            with sync_playwright() as p:
                browser = p.chromium.launch()
                page = browser.new_page()
                page.on(
                    "console",
                    lambda msg: errors.append(
                        ConsoleError(level=msg.type, text=msg.text, source=str(msg.location))
                    ),
                )
                page.goto(url, wait_until="networkidle")
                browser.close()
        except Exception:  # pragma: no cover
            return MockConsoleProvider().capture(url)
        return errors


def get_console_provider() -> ConsoleProvider:
    """Return the console provider. Playwright is disabled by default -> mock."""
    return MockConsoleProvider()
