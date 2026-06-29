"""Trend-source abstraction + aggregation.

A *trend source* answers one question: "what is trending for this topic, for a
creator with this profile?" Sources return a flat list of trend dicts shaped
like::

    {
        "source": "reddit",          # channel/source name
        "topic": "vegan baking",     # the topic the trend was fetched for
        "title": "r/veganbaking ...",# human-readable trend title
        "url": "https://...",        # best-effort link (may be a search URL)
        "raw": {...},                # source-specific payload for debugging
    }

The default sources are deterministic mocks (no network, no randomness, no
clock) so the pipeline and its tests are reproducible. A real HTTP source is
provided as an env-gated placeholder; it is never exercised offline and always
degrades to the mock on any failure.
"""

from __future__ import annotations

import hashlib
import os
from abc import ABC, abstractmethod
from typing import Dict, List, Optional


# Keys that may appear on a trend dict. ``gather_trends`` guarantees all of
# these are present on every returned item.
TREND_KEYS = ("source", "topic", "title", "url", "raw")


def _stable_int(*parts: str) -> int:
    """Deterministic non-negative int derived from the given string parts.

    Used for sha1-seeded ordering so we never reach for ``random`` or the clock.
    """
    digest = hashlib.sha1("|".join(parts).encode("utf-8")).hexdigest()
    return int(digest[:12], 16)


def _profile_topic(profile: Dict) -> str:
    """Best-effort extraction of the primary topic from a creator profile.

    Looks at common keys (``topic``, ``niche``, ``industry``, ``keyword``) and
    falls back to a generic label so a sparse profile still yields trends.
    """
    if not isinstance(profile, dict):
        return "content"
    for key in ("topic", "niche", "industry", "keyword", "category"):
        value = profile.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return "content"


class TrendSource(ABC):
    """Abstract trend source.

    Subclasses set ``name`` and implement :meth:`fetch`.
    """

    name: str = "trend-source"

    @abstractmethod
    def fetch(self, topic: str, profile: Dict) -> List[Dict]:
        """Return a list of trend dicts for ``topic`` given ``profile``."""
        raise NotImplementedError


class HttpTrendSource(TrendSource):
    """Env-gated, real HTTP trend source (placeholder).

    This is a *documented* implementation of how a real source would call out
    over the network. It is intentionally never run offline: the network branch
    of :meth:`fetch` is marked ``# pragma: no cover`` and any failure (including
    "no API key configured") degrades to an empty list so the aggregator falls
    back to the mock sources. The API key is read from the environment and is
    NEVER logged or embedded in returned data.
    """

    name = "http"

    #: Environment variable that holds the upstream API key.
    api_key_env = "TRENDS_API_KEY"
    #: Environment variable that holds the upstream base URL (optional).
    base_url_env = "TRENDS_API_URL"

    def __init__(self, name: Optional[str] = None) -> None:
        if name:
            self.name = name

    def _api_key(self) -> Optional[str]:
        key = os.getenv(self.api_key_env)
        if key and key.strip():
            return key.strip()
        return None

    def available(self) -> bool:
        """True only when an API key is configured in the environment."""
        return self._api_key() is not None

    def fetch(self, topic: str, profile: Dict) -> List[Dict]:
        """Fetch trends over HTTP, degrading to ``[]`` on any failure.

        Real network access only happens inside the ``# pragma: no cover``
        block, which is never executed in tests or offline. Returning ``[]``
        signals the aggregator to rely on mock sources instead.
        """
        if not self.available():
            return []
        try:  # pragma: no cover - network path, never run offline
            import json
            import urllib.parse
            import urllib.request

            key = self._api_key()
            if key is None:
                return []
            base_url = os.getenv(self.base_url_env) or "https://trends.example.com/v1/search"
            query = urllib.parse.urlencode(
                {"q": topic, "niche": _profile_topic(profile)}
            )
            request = urllib.request.Request(
                "{base}?{query}".format(base=base_url, query=query),
                headers={
                    # Key travels in the header only; it is never logged or
                    # placed into any returned ``raw`` payload.
                    "Authorization": "Bearer {key}".format(key=key),
                    "Accept": "application/json",
                },
            )
            with urllib.request.urlopen(request, timeout=10) as response:
                payload = json.loads(response.read().decode("utf-8"))
            items: List[Dict] = []
            for entry in payload.get("results", []):
                items.append(
                    {
                        "source": self.name,
                        "topic": topic,
                        "title": entry.get("title", ""),
                        "url": entry.get("url", ""),
                        # Deliberately exclude any auth material from ``raw``.
                        "raw": {"id": entry.get("id"), "score": entry.get("score")},
                    }
                )
            return items
        except Exception:  # pragma: no cover - defensive degrade-to-mock
            return []


def get_trend_sources() -> List[TrendSource]:
    """Return the active trend sources.

    Returns the deterministic mock sources by default. A real HTTP source is
    only added when an API key is configured AND the explicit mock override
    (``TRENDS_FORCE_MOCK``) is not set — so production can light up real trends
    via env without a code change, while tests/offline stay on mocks.
    """
    # Imported lazily to avoid a circular import at module load time.
    from content_creator.integrations.mock_trends import MOCK_SOURCES

    sources: List[TrendSource] = list(MOCK_SOURCES)

    force_mock = (os.getenv("TRENDS_FORCE_MOCK") or "").strip().lower() in (
        "1",
        "true",
        "yes",
    )
    http_source = HttpTrendSource()
    if http_source.available() and not force_mock:
        sources.append(http_source)

    return sources


def _seed_items(seeds: Optional[List], topic: str) -> List[Dict]:
    """Normalize manual ``seeds`` into trend dicts.

    Seeds may be plain strings (treated as titles) or already-shaped dicts.
    """
    items: List[Dict] = []
    if not seeds:
        return items
    for seed in seeds:
        if isinstance(seed, dict):
            items.append(
                {
                    "source": str(seed.get("source", "manual")),
                    "topic": str(seed.get("topic", topic)),
                    "title": str(seed.get("title", "")),
                    "url": str(seed.get("url", "")),
                    "raw": seed.get("raw", {"seed": True}),
                }
            )
        elif isinstance(seed, str) and seed.strip():
            items.append(
                {
                    "source": "manual",
                    "topic": topic,
                    "title": seed.strip(),
                    "url": "",
                    "raw": {"seed": True},
                }
            )
    return items


def gather_trends(profile: Dict, seeds: Optional[List] = None) -> List[Dict]:
    """Aggregate trends across all active sources for ``profile``.

    Pulls trends for the profile's niche/topic from every active source, folds
    in any manually supplied ``seeds``, de-duplicates by ``(source, title)``,
    and returns a deterministic, ranked-ish list.

    The function is pure: same inputs -> identical output (no randomness, no
    clock, no network in the default/offline configuration).
    """
    topic = _profile_topic(profile)

    collected: List[Dict] = []

    # Manual seeds rank first — the user explicitly asked for them.
    collected.extend(_seed_items(seeds, topic))

    for source in get_trend_sources():
        try:
            results = source.fetch(topic, profile)
        except Exception:
            # A misbehaving source must never sink the whole aggregation.
            results = []
        for item in results or []:
            # Normalize to guarantee the full key set is present.
            collected.append(
                {
                    "source": str(item.get("source", source.name)),
                    "topic": str(item.get("topic", topic)),
                    "title": str(item.get("title", "")),
                    "url": str(item.get("url", "")),
                    "raw": item.get("raw", {}),
                }
            )

    # De-duplicate by (source, title), keeping first occurrence.
    seen = set()
    deduped: List[Dict] = []
    for item in collected:
        key = (item["source"], item["title"])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)

    # Deterministic, ranked-ish ordering: seeds keep their lead (rank 0), the
    # rest are ordered by a stable sha1-derived score then by (source, title)
    # to fully break ties.
    def rank_key(entry):
        is_seed = isinstance(entry.get("raw"), dict) and entry["raw"].get("seed")
        seed_rank = 0 if is_seed else 1
        score = _stable_int(entry["source"], entry["title"], topic)
        return (seed_rank, score, entry["source"], entry["title"])

    deduped.sort(key=rank_key)
    return deduped
