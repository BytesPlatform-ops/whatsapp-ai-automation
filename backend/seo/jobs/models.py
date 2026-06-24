"""Dataclasses for the rank-tracking jobs unit.

Stdlib-only, deterministic, tenant-scoped. These mirror the durable
Prisma ``SeoKeywordSnapshot`` model (tenant-scoped) that a later wave will
back these with — until then everything lives in-process and is
fully offline-testable.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, Optional


@dataclass
class RankResult:
    """A single provider lookup result for one (keyword, url) pair.

    ``position`` is the SERP rank 1..100, or ``None`` when the url is not
    ranking in the inspected window. ``estimated_cost``/``latency_ms`` are
    provider telemetry (never secrets).
    """

    keyword: str
    url: str
    position: Optional[int]
    location: str = "us"
    device: str = "desktop"
    provider: str = "mock"
    estimated_cost: float = 0.0
    latency_ms: int = 0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "keyword": self.keyword,
            "url": self.url,
            "position": self.position,
            "location": self.location,
            "device": self.device,
            "provider": self.provider,
            "estimated_cost": self.estimated_cost,
            "latency_ms": self.latency_ms,
        }


@dataclass
class RankSnapshot:
    """A persisted rank observation for a tenant.

    Maps to the Prisma ``SeoKeywordSnapshot`` row (tenant-scoped). ``captured_seq``
    is a monotonic counter the STORE assigns on insert — deliberately NOT a
    wall-clock timestamp so that ordering/history tests stay deterministic.
    """

    tenant_id: str
    keyword: str
    url: str
    position: Optional[int]
    provider: str
    captured_seq: int = 0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "tenant_id": self.tenant_id,
            "keyword": self.keyword,
            "url": self.url,
            "position": self.position,
            "provider": self.provider,
            "captured_seq": self.captured_seq,
        }
