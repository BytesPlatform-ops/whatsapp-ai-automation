from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict


@dataclass
class CoreWebVitals:
    """Field/lab Core Web Vitals plus headline scores from a PageSpeed provider."""

    lcp_ms: int = 0
    cls: float = 0.0
    inp_ms: int = 0
    performance_score: int = 0  # 0-100
    accessibility_score: int = 0  # 0-100
    provider: str = "mock"
    estimated_cost: float = 0.0
    latency_ms: int = 0
    cache_hit: bool = False

    def to_dict(self) -> Dict:
        return {
            "lcp_ms": self.lcp_ms,
            "cls": self.cls,
            "inp_ms": self.inp_ms,
            "performance_score": self.performance_score,
            "accessibility_score": self.accessibility_score,
            "provider": self.provider,
            "estimated_cost": self.estimated_cost,
            "latency_ms": self.latency_ms,
            "cache_hit": self.cache_hit,
        }


@dataclass
class ConsoleError:
    """A single browser-console message captured while loading the page."""

    level: str = "error"  # error | warning
    text: str = ""
    source: str = ""

    def to_dict(self) -> Dict:
        return {"level": self.level, "text": self.text, "source": self.source}


@dataclass
class TechnicalIssue:
    """A normalized technical-SEO finding, shaped for grouped reporting."""

    id: str = ""
    category: str = "technical"
    severity: str = "info"
    title: str = ""
    description: str = ""
    recommendation: str = ""
    evidence: Dict = field(default_factory=dict)

    def to_dict(self) -> Dict:
        return {
            "id": self.id,
            "category": self.category,
            "severity": self.severity,
            "title": self.title,
            "description": self.description,
            "recommendation": self.recommendation,
            "evidence": self.evidence,
        }
