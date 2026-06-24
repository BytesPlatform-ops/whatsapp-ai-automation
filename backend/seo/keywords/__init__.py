"""Keyword research + content analysis unit (Wave 3, SEO service)."""

from __future__ import annotations

from .analysis import analyze_content_keywords
from .local import gbp_hint, nap_consistency
from .models import Intent, KeywordIdea, ProviderMeta
from .provider import MockKeywordProvider, get_keyword_provider
from .service import analyze_content, research_keywords

__all__ = [
    "research_keywords",
    "analyze_content",
    "get_keyword_provider",
    "MockKeywordProvider",
    "KeywordIdea",
    "Intent",
    "ProviderMeta",
    "analyze_content_keywords",
    "nap_consistency",
    "gbp_hint",
]
