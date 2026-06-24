"""Data models for the keyword research + content analysis unit.

Pure stdlib. ``from __future__ import annotations`` keeps all annotations as
strings so no ``X | Y`` runtime unions are evaluated (Python 3.9.6 safe).
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Dict


class Intent(str, Enum):
    """Search intent classification for a keyword."""

    INFORMATIONAL = "informational"
    COMMERCIAL = "commercial"
    TRANSACTIONAL = "transactional"
    NAVIGATIONAL = "navigational"


@dataclass
class KeywordIdea:
    """A single keyword suggestion with estimated metrics."""

    keyword: str
    volume: int
    difficulty: int  # 0-100
    intent: str
    source: str
    confidence: float

    def to_dict(self) -> Dict[str, object]:
        return {
            "keyword": self.keyword,
            "volume": int(self.volume),
            "difficulty": int(self.difficulty),
            "intent": self.intent,
            "source": self.source,
            "confidence": round(float(self.confidence), 4),
        }


@dataclass
class ProviderMeta:
    """Cost / latency / provenance metadata attached to a research call."""

    provider: str
    estimated_cost: float = 0.0
    latency_ms: int = 0
    cache_hit: bool = False

    def to_dict(self) -> Dict[str, object]:
        return {
            "provider": self.provider,
            "estimated_cost": round(float(self.estimated_cost), 6),
            "latency_ms": int(self.latency_ms),
            "cache_hit": bool(self.cache_hit),
        }
