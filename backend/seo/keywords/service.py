"""Service layer: orchestrates providers + analysis. Public funcs never raise."""

from __future__ import annotations

import time
from typing import Dict, List, Optional

from .analysis import analyze_content_keywords
from .models import ProviderMeta
from .provider import MockKeywordProvider, get_keyword_provider


def research_keywords(topic: str, seed_keywords: Optional[list] = None) -> Dict[str, object]:
    """Research keyword ideas for ``topic``. Times the call, records provider
    metadata, and falls back to the deterministic mock on any provider failure.
    Never raises on normal input.
    """
    seeds = list(seed_keywords or [])
    cache_hit = False

    provider = get_keyword_provider()
    start = time.monotonic()
    try:
        ideas = provider.research(topic, seeds)
        provider_name = getattr(provider, "name", "unknown")
    except Exception:
        # Fall back to the mock; flag it so callers can see a degraded result.
        provider = MockKeywordProvider()
        ideas = provider.research(topic, seeds)
        provider_name = provider.name
        cache_hit = True
    latency_ms = int((time.monotonic() - start) * 1000)

    # Mock is free; the real provider would report a real cost upstream.
    estimated_cost = 0.0 if provider_name == "mock" else 0.0

    meta = ProviderMeta(
        provider=provider_name,
        estimated_cost=estimated_cost,
        latency_ms=latency_ms,
        cache_hit=cache_hit,
    )
    return {
        "ideas": [idea.to_dict() for idea in ideas],
        "provider": meta.to_dict(),
    }


def analyze_content(content: str, target_keywords: Optional[list] = None) -> Dict[str, object]:
    """On-page analysis + fallback-safe AI usage suggestions. Never raises."""
    targets = list(target_keywords or [])
    result = analyze_content_keywords(content, targets)

    ai_items: List[str] = []
    ai_meta: Dict[str, object] = {"provider": "", "fallback": True}
    try:
        from seo.ai import SeoAiClient  # lazy: stdlib-safe, falls back locally

        ai = SeoAiClient().keyword_usage_suggestions(content=content, target_keywords=targets)
        ai_items = list(getattr(ai, "items", []) or [])
        ai_meta = {
            "provider": getattr(ai, "provider", "") or "",
            "fallback": bool(getattr(ai, "fallback", True)),
        }
    except Exception:
        ai_items = []

    result["ai_suggestions"] = ai_items
    result["ai_meta"] = ai_meta
    return result
