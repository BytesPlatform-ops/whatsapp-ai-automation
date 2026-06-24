"""Keyword research providers.

Provider abstraction with a deterministic mock fallback. The real HTTP provider
reads credentials from the environment via ``os.getenv``; when they are absent
the factory returns the mock. The real HTTP path uses ``urllib.request`` and is
NEVER exercised offline (guarded behind ``available()`` + the factory).

The mock derives every number from ``hashlib.sha1`` of the keyword — no
randomness and no time-based values — so the same input always yields the same
output (essential for offline regression tests).
"""

from __future__ import annotations

import hashlib
import json
import os
import urllib.parse
import urllib.request
from typing import List, Optional

from .models import Intent, KeywordIdea


# Generated modifiers appended to the topic to widen the idea set.
_MODIFIERS = ("best", "near me", "services", "cost", "vs", "reviews")

# Modifier -> dominant intent hint (used to bias the deterministic intent pick).
_INTENT_HINTS = {
    "best": Intent.COMMERCIAL,
    "near me": Intent.TRANSACTIONAL,
    "services": Intent.COMMERCIAL,
    "cost": Intent.TRANSACTIONAL,
    "vs": Intent.COMMERCIAL,
    "reviews": Intent.INFORMATIONAL,
}

_INTENTS = (
    Intent.INFORMATIONAL,
    Intent.COMMERCIAL,
    Intent.TRANSACTIONAL,
    Intent.NAVIGATIONAL,
)


def _digest_ints(keyword: str) -> List[int]:
    """Return a stable list of ints derived from sha1(keyword)."""
    norm = " ".join((keyword or "").lower().split())
    h = hashlib.sha1(norm.encode("utf-8")).hexdigest()
    # Slice the 40-hex digest into 8 chunks of 5 hex chars -> 8 ints.
    return [int(h[i : i + 5], 16) for i in range(0, 40, 5)]


def _derive_metrics(keyword: str, intent_hint: Optional[Intent] = None):
    """Deterministically derive (volume, difficulty, intent, confidence)."""
    a, b, c, d, *_ = _digest_ints(keyword)
    # volume in [50, 50000]
    volume = 50 + (a % 49951)
    # difficulty in [0, 100]
    difficulty = b % 101
    if intent_hint is not None:
        intent = intent_hint
    else:
        intent = _INTENTS[c % len(_INTENTS)]
    # confidence in [0.50, 0.99]
    confidence = 0.50 + (d % 50) / 100.0
    return volume, difficulty, intent.value, round(confidence, 4)


class KeywordProvider:
    """Provider interface. Subclasses set ``name`` and implement ``research``."""

    name: str = "base"

    def research(self, topic: str, seed_keywords: list) -> list:  # pragma: no cover
        raise NotImplementedError


class MockKeywordProvider(KeywordProvider):
    """Deterministic, offline keyword provider.

    Builds ideas from: the topic itself, each seed keyword, and a set of
    topic+modifier combinations. Every metric is a pure function of the
    keyword string, so output is reproducible.
    """

    name = "mock"

    def research(self, topic: str, seed_keywords: list) -> List[KeywordIdea]:
        topic = (topic or "").strip()
        seeds = [str(s).strip() for s in (seed_keywords or []) if str(s).strip()]

        # Preserve insertion order while de-duplicating (kw, hint) candidates.
        candidates: List[tuple] = []
        seen = set()

        def _add(kw: str, hint: Optional[Intent]) -> None:
            kw = " ".join((kw or "").split())
            if not kw:
                return
            key = kw.lower()
            if key in seen:
                return
            seen.add(key)
            candidates.append((kw, hint))

        if topic:
            _add(topic, None)
        for s in seeds:
            _add(s, None)
        if topic:
            for mod in _MODIFIERS:
                _add("{0} {1}".format(topic, mod), _INTENT_HINTS.get(mod))

        ideas: List[KeywordIdea] = []
        for kw, hint in candidates:
            volume, difficulty, intent, confidence = _derive_metrics(kw, hint)
            ideas.append(
                KeywordIdea(
                    keyword=kw,
                    volume=volume,
                    difficulty=difficulty,
                    intent=intent,
                    source=self.name,
                    confidence=confidence,
                )
            )
        return ideas


class HttpKeywordProvider(KeywordProvider):
    """Generic credentialed HTTP keyword provider (e.g. DataForSEO).

    Credentials come from the environment. If they are missing the provider is
    not ``available()`` and the factory falls back to the mock. The ``research``
    network path is documented and guarded; it is NEVER executed offline.
    """

    name = "dataforseo"

    # Endpoint kept as an attribute so it stays inert/overridable; the real
    # call is only reachable when credentials are present (never in tests).
    endpoint = "https://api.dataforseo.com/v3/keywords_data/google_ads/keywords_for_keywords/live"

    def __init__(self) -> None:
        self.login = os.getenv("DATAFORSEO_LOGIN")
        self.password = os.getenv("DATAFORSEO_PASSWORD")
        self.api_key = os.getenv("KEYWORD_API_KEY")
        if not self.available():
            raise RuntimeError(
                "HttpKeywordProvider requires DATAFORSEO_LOGIN/DATAFORSEO_PASSWORD "
                "or KEYWORD_API_KEY in the environment."
            )

    def available(self) -> bool:
        return bool((self.login and self.password) or self.api_key)

    def _auth_header(self) -> str:
        if self.api_key:
            return "Bearer {0}".format(self.api_key)
        import base64

        raw = "{0}:{1}".format(self.login, self.password).encode("utf-8")
        return "Basic {0}".format(base64.b64encode(raw).decode("ascii"))

    def research(self, topic: str, seed_keywords: list) -> List[KeywordIdea]:  # pragma: no cover
        # NOTE: Real network path. Never reached offline (no creds in tests).
        keywords = [topic] + [str(s) for s in (seed_keywords or [])]
        payload = json.dumps([{"keywords": [k for k in keywords if k]}]).encode("utf-8")
        req = urllib.request.Request(
            self.endpoint,
            data=payload,
            headers={
                "Authorization": self._auth_header(),
                "Content-Type": "application/json",
            },
            method="POST",
        )
        ideas: List[KeywordIdea] = []
        with urllib.request.urlopen(req, timeout=20) as resp:  # noqa: S310
            data = json.loads(resp.read().decode("utf-8"))
        for task in data.get("tasks", []) or []:
            for result in task.get("result", []) or []:
                kw = result.get("keyword")
                if not kw:
                    continue
                volume = int(result.get("search_volume") or 0)
                difficulty = int(result.get("competition_index") or 0)
                ideas.append(
                    KeywordIdea(
                        keyword=kw,
                        volume=volume,
                        difficulty=max(0, min(100, difficulty)),
                        intent=Intent.COMMERCIAL.value,
                        source=self.name,
                        confidence=0.9,
                    )
                )
        return ideas


def get_keyword_provider() -> KeywordProvider:
    """Return the real provider when creds exist and it constructs cleanly,
    otherwise the deterministic mock."""
    has_creds = bool(
        (os.getenv("DATAFORSEO_LOGIN") and os.getenv("DATAFORSEO_PASSWORD"))
        or os.getenv("KEYWORD_API_KEY")
    )
    if has_creds:
        try:
            return HttpKeywordProvider()
        except Exception:
            return MockKeywordProvider()
    return MockKeywordProvider()
