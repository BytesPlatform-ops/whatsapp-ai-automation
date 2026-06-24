"""Rank-provider abstraction with a deterministic mock fallback.

The real provider (``HttpRankProvider``) talks to a SERP API and is selected
ONLY when an API key is present in the environment; otherwise the deterministic
``MockRankProvider`` is used so the unit is fully offline-testable. Mock
positions derive from a hash of ``keyword + "|" + url`` — no randomness, no
time-based values — so the same input always yields the same rank. Secrets are
read from env at call time and never logged or returned.
"""

from __future__ import annotations

import hashlib
import os
import time
from typing import Optional

from seo.jobs.models import RankResult


class RankProvider:
    """Provider contract (structural ABC).

    Implementations expose a ``name`` and a ``lookup`` that NEVER raises on
    normal input — callers may rely on always receiving a ``RankResult``.
    """

    name: str = "base"

    def lookup(
        self,
        keyword: str,
        url: str,
        *,
        location: str = "us",
        device: str = "desktop",
    ) -> RankResult:  # pragma: no cover - abstract
        raise NotImplementedError


class MockRankProvider(RankProvider):
    """Deterministic, offline rank provider.

    Position is derived from ``sha1(keyword|url)``: most hashes map into the
    1..100 SERP window; a fixed deterministic bucket maps to ``None`` ("not
    ranking") so callers exercise the not-ranking path without randomness.
    """

    name = "mock"

    # Roughly 1-in-8 (keyword,url) pairs deterministically "not ranking".
    _NOT_RANKING_MODULUS = 8

    def lookup(
        self,
        keyword: str,
        url: str,
        *,
        location: str = "us",
        device: str = "desktop",
    ) -> RankResult:
        digest = hashlib.sha1(("%s|%s" % (keyword, url)).encode("utf-8")).hexdigest()
        n = int(digest, 16)

        if n % self._NOT_RANKING_MODULUS == 0:
            position: Optional[int] = None
        else:
            # Map into 1..100 inclusive, deterministically.
            position = (n % 100) + 1

        return RankResult(
            keyword=keyword,
            url=url,
            position=position,
            location=location,
            device=device,
            provider=self.name,
            estimated_cost=0.0,   # mock is free
            latency_ms=1,         # fixed, deterministic
        )


class HttpRankProvider(RankProvider):
    """Real SERP-backed provider (inert offline).

    Reads the API key from ``RANK_API_KEY`` (or legacy ``SERP_API_KEY``) at
    construction time. ``available()`` reports whether a key is present.
    ``lookup`` issues a urllib request to the SERP endpoint — it is NOT
    exercised in offline tests and ``get_rank_provider`` will not select this
    provider unless a key is present. On any network/parse failure it returns a
    safe ``RankResult`` with ``position=None`` rather than raising, preserving
    the "never raise on normal input" contract.
    """

    name = "http"

    # Documented default endpoint; a deployment can override via env.
    _DEFAULT_ENDPOINT = "https://serpapi.com/search.json"

    def __init__(self) -> None:
        self._api_key = os.getenv("RANK_API_KEY") or os.getenv("SERP_API_KEY")
        self._endpoint = os.getenv("RANK_API_ENDPOINT", self._DEFAULT_ENDPOINT)
        # Per-query cost estimate (USD); override via env without code change.
        try:
            self._cost = float(os.getenv("RANK_API_COST_PER_QUERY", "0.005"))
        except (TypeError, ValueError):
            self._cost = 0.005

    def available(self) -> bool:
        """True when an API key is configured (secret value never exposed)."""
        return bool(self._api_key)

    def lookup(
        self,
        keyword: str,
        url: str,
        *,
        location: str = "us",
        device: str = "desktop",
    ) -> RankResult:
        # Imported lazily so the module top-level stays pure stdlib and this
        # code path is never touched in offline tests.
        import json
        import urllib.parse
        import urllib.request

        started = time.monotonic()
        position: Optional[int] = None
        try:
            params = {
                "q": keyword,
                "location": location,
                "device": device,
                "engine": "google",
                "api_key": self._api_key or "",
            }
            query = urllib.parse.urlencode(params)
            request_url = "%s?%s" % (self._endpoint, query)
            req = urllib.request.Request(request_url, headers={"Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=15) as resp:  # noqa: S310 (trusted endpoint)
                payload = json.loads(resp.read().decode("utf-8"))
            position = self._extract_position(payload, url)
        except Exception:
            # Never raise on normal input — degrade to "not ranking".
            position = None

        latency_ms = int((time.monotonic() - started) * 1000)
        return RankResult(
            keyword=keyword,
            url=url,
            position=position,
            location=location,
            device=device,
            provider=self.name,
            estimated_cost=self._cost,
            latency_ms=latency_ms,
        )

    @staticmethod
    def _extract_position(payload: dict, url: str) -> Optional[int]:
        """Find the first organic result whose link matches ``url``.

        Tolerant of common SERP-API response shapes; returns ``None`` if the
        url does not appear in the first 100 organic results.
        """
        results = payload.get("organic_results") or []
        target = url.rstrip("/").lower()
        for item in results:
            link = (item.get("link") or "").rstrip("/").lower()
            if link and (link == target or target in link or link in target):
                pos = item.get("position")
                if isinstance(pos, int) and 1 <= pos <= 100:
                    return pos
        return None


def get_rank_provider() -> RankProvider:
    """Return the real provider when a key is configured, else the mock.

    Construction failures fall back to the deterministic mock so callers always
    receive a usable provider.
    """
    try:
        http = HttpRankProvider()
        if http.available():
            return http
    except Exception:
        pass
    return MockRankProvider()
