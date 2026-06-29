"""Trend-source integrations for the Content Creator service (Wave 2).

This package exposes a small abstraction over "trend sources" — anything that
can surface trending topics/titles for a creator's niche. The default
implementation is fully deterministic and offline (see ``mock_trends``); a real
HTTP-backed source is provided as an env-gated placeholder that degrades to the
mock when no credentials are configured.
"""

from __future__ import annotations

from content_creator.integrations.trends import (
    HttpTrendSource,
    TrendSource,
    gather_trends,
    get_trend_sources,
)

__all__ = [
    "TrendSource",
    "HttpTrendSource",
    "get_trend_sources",
    "gather_trends",
]
