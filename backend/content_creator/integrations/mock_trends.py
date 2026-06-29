"""Deterministic, offline mock trend sources.

Each :class:`MockTrendSource` derives 2-3 plausible, channel-flavoured trend
items from ``sha1(name|topic)``. There is no randomness, no clock, and no
network — the same ``(name, topic)`` always yields the same items, which keeps
the content pipeline and its tests reproducible.
"""

from __future__ import annotations

import hashlib
import urllib.parse
from typing import Dict, List, Optional

from content_creator.integrations.trends import TrendSource, gather_trends


# Names of the mock channels we simulate.
MOCK_CHANNEL_NAMES = (
    "google_news",
    "reddit",
    "youtube",
    "tiktok",
    "instagram",
    "articles",
    "competitors",
)


def _seed_bytes(name: str, topic: str) -> bytes:
    return hashlib.sha1("{name}|{topic}".format(name=name, topic=topic).encode("utf-8")).digest()


def _pick(seed: bytes, index: int, options: List[str]) -> str:
    """Deterministically pick one option using a byte of the sha1 seed."""
    if not options:
        return ""
    return options[seed[index % len(seed)] % len(options)]


def _search_url(domain: str, topic: str) -> str:
    return "https://{domain}/search?q={q}".format(
        domain=domain, q=urllib.parse.quote_plus(topic)
    )


# Per-channel title templates. ``{topic}`` is the niche/topic; ``{flavour}`` is a
# deterministically-picked adjective/angle. Each channel has >=3 templates so we
# can surface 2-3 distinct items per topic.
_TEMPLATES = {
    "google_news": [
        "{topic} sees {flavour} surge as new players enter the space",
        "Report: why {topic} is the {flavour} story of the quarter",
        "Analysts say {topic} demand is {flavour} this season",
    ],
    "reddit": [
        "r/{slug} is arguing about the {flavour} way to do {topic}",
        "[Discussion] Nobody warned me {topic} would be this {flavour}",
        "r/{slug}: my {flavour} {topic} setup finally clicked",
    ],
    "youtube": [
        "{topic}: the 10-min explainer blowing up",
        "I tried the {flavour} {topic} method for 30 days",
        "Why everyone's {topic} videos look the same ({flavour} edition)",
    ],
    "tiktok": [
        "POV: your {topic} routine but make it {flavour}",
        "this {topic} hack is {flavour} and i can't unsee it",
        "{topic} check — {flavour} or nah?",
    ],
    "instagram": [
        "{flavour} {topic} carousel everyone is saving",
        "Reel: 3 {topic} mistakes that scream '{flavour}'",
        "Before/after {topic} — the {flavour} glow-up",
    ],
    "articles": [
        "The {flavour} guide to {topic} nobody asked for (but needed)",
        "{topic} in 2026: a {flavour} field guide",
        "How to make {topic} feel {flavour} again",
    ],
    "competitors": [
        "Competitor just dropped a {flavour} {topic} campaign",
        "Rival brand's {topic} angle is suspiciously {flavour}",
        "Teardown: the {flavour} {topic} funnel everyone copies",
    ],
}

_FLAVOURS = [
    "underrated",
    "explosive",
    "minimalist",
    "chaotic",
    "premium",
    "scrappy",
    "viral",
    "nostalgic",
]

# Domain used to build a plausible (non-network) search URL per channel.
_DOMAINS = {
    "google_news": "news.google.com",
    "reddit": "reddit.com",
    "youtube": "youtube.com",
    "tiktok": "tiktok.com",
    "instagram": "instagram.com",
    "articles": "medium.com",
    "competitors": "google.com",
}


def _slugify(topic: str) -> str:
    return "".join(ch for ch in topic.lower() if ch.isalnum()) or "topic"


class MockTrendSource(TrendSource):
    """A single deterministic mock channel (e.g. ``reddit``)."""

    def __init__(self, name: str) -> None:
        self.name = name
        self._templates = _TEMPLATES.get(name, _TEMPLATES["articles"])
        self._domain = _DOMAINS.get(name, "example.com")

    def _item_count(self, seed: bytes) -> int:
        # 2 or 3 items, deterministically.
        return 2 + (seed[0] % 2)

    def fetch(self, topic: str, profile: Dict) -> List[Dict]:
        topic = (topic or "content").strip() or "content"
        seed = _seed_bytes(self.name, topic)
        slug = _slugify(topic)
        flavour = _pick(seed, 1, _FLAVOURS)
        count = self._item_count(seed)

        items: List[Dict] = []
        used_titles = set()
        # Walk templates deterministically starting at a seed-derived offset so
        # different topics emphasise different angles, but the same topic is
        # always identical.
        start = seed[2] % len(self._templates)
        for offset in range(len(self._templates)):
            if len(items) >= count:
                break
            template = self._templates[(start + offset) % len(self._templates)]
            # Vary flavour slightly per slot for visual variety, deterministically.
            slot_flavour = _pick(seed, 3 + offset, _FLAVOURS)
            title = template.format(topic=topic, slug=slug, flavour=slot_flavour or flavour)
            if title in used_titles:
                continue
            used_titles.add(title)
            items.append(
                {
                    "source": self.name,
                    "topic": topic,
                    "title": title,
                    "url": _search_url(self._domain, topic),
                    "raw": {
                        "mock": True,
                        "channel": self.name,
                        "slug": slug,
                        "flavour": slot_flavour or flavour,
                    },
                }
            )
        return items


# Instantiated mock sources, one per channel name.
MOCK_SOURCES = [MockTrendSource(name) for name in MOCK_CHANNEL_NAMES]


def mock_gather(topic: str, profile: Optional[Dict] = None, seeds: Optional[List] = None) -> List[Dict]:
    """Convenience helper: aggregate mock trends for ``topic``.

    Builds (or augments) a profile carrying ``topic`` and defers to the shared
    :func:`gather_trends` so the mock path and the production path share one
    aggregation/dedup/ranking implementation.
    """
    merged: Dict = dict(profile or {})
    merged.setdefault("topic", topic)
    return gather_trends(merged, seeds=seeds)
