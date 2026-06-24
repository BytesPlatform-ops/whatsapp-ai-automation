"""Content factory — AI writes the copy, deterministic code formats it.

The model layer writes hook/copy/caption/script; a deterministic pass fills
hashtags, cta, tone, audience and a risk-score heuristic. Fake mode produces
real-looking items at $0 via the synthesizer fallback.
"""

from __future__ import annotations

from .factory import generate_content
from .schemas import (
    ContentItem,
    ContentRequest,
    ContentType,
)
from .store import (
    InMemoryContentRepository,
    get_content_repository,
)

__all__ = [
    "generate_content",
    "ContentItem",
    "ContentRequest",
    "ContentType",
    "InMemoryContentRepository",
    "get_content_repository",
]
