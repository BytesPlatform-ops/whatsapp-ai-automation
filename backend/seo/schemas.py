from __future__ import annotations

import dataclasses
from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Optional


class Mode(str, Enum):
    PIXIE = "pixie"
    EXTERNAL = "external"
    BOTH = "both"


class Severity(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


class Status(str, Enum):
    PASS = "pass"
    FAIL = "fail"
    WARN = "warn"
    NOT_APPLICABLE = "not_applicable"


class Category(str, Enum):
    META = "meta"
    SOCIAL = "social"
    SCHEMA = "schema"
    HEADINGS = "headings"
    IMAGES = "images"
    LINKS = "links"
    TECHNICAL = "technical"
    MOBILE = "mobile"
    CANONICAL = "canonical"


def _unwrap(value):
    """Convert enum values to their .value, recursively for dicts/lists."""
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, dict):
        return {k: _unwrap(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_unwrap(v) for v in value]
    return value


@dataclass
class SeoPage:
    url: str = ""
    title: str = ""
    meta_description: str = ""
    meta: dict = field(default_factory=dict)
    headings: list = field(default_factory=list)
    content: str = ""
    images: list = field(default_factory=list)
    links: list = field(default_factory=list)
    schema: list = field(default_factory=list)
    canonical: Optional[str] = None
    robots: Optional[str] = None
    sitemap: Optional[str] = None
    mobile: dict = field(default_factory=dict)
    technical: dict = field(default_factory=dict)
    extra: dict = field(default_factory=dict)

    def to_dict(self):
        return _unwrap(dataclasses.asdict(self))


@dataclass
class CheckResult:
    id: str
    category: Category
    title: str
    description: str
    severity: Severity
    status: Status
    weight: int
    passed: bool
    recommendation: str = ""
    fix: Optional[dict] = None
    mode: Mode = Mode.BOTH
    evidence: dict = field(default_factory=dict)

    def to_dict(self):
        return _unwrap(dataclasses.asdict(self))


@dataclass
class SeoScore:
    score: int
    max_score: int = 100
    passed_count: int = 0
    failed_count: int = 0
    applicable_count: int = 0
    by_category: dict = field(default_factory=dict)

    def to_dict(self):
        return _unwrap(dataclasses.asdict(self))


@dataclass
class EngineResult:
    page: SeoPage
    checks: list
    score: SeoScore
    issues: list
    suggestions: list
    fixes: list

    def to_dict(self):
        return {
            "page": self.page.to_dict(),
            "checks": [c.to_dict() for c in self.checks],
            "score": self.score.to_dict(),
            "issues": [c.to_dict() for c in self.issues],
            "suggestions": list(self.suggestions),
            "fixes": [_unwrap(f) for f in self.fixes],
        }
