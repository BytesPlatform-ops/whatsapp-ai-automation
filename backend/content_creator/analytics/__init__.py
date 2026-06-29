"""Content Creator analytics — metrics sync + learning loop (Wave 3).

This package collects per-post performance metrics (mock by default, real Meta
Insights when env-gated) and feeds them into a learning loop that summarizes
what's working so future content ideas, hooks, CTAs, posting times, niche
angles, and formats can be tuned.

PURE STDLIB at module top level (Python 3.9). Every public function is
deterministic (sha1-seeded) and NEVER raises — failures degrade to the
deterministic mock fallback (``content_creator.agents.mock_ai.mock_learning``).
The model-layer import in the learning loop is lazy and guarded.
"""

from __future__ import annotations

from content_creator.analytics.learning_loop import LearningLoop
from content_creator.analytics.metrics import (
    HttpMetricsProvider,
    MetricsProvider,
    MockMetricsProvider,
    get_metrics_provider,
    sync_metrics,
)

__all__ = [
    "MetricsProvider",
    "MockMetricsProvider",
    "HttpMetricsProvider",
    "get_metrics_provider",
    "sync_metrics",
    "LearningLoop",
]
