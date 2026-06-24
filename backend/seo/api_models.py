"""Pydantic request/response models for the SEO API (Mode A + Mode B).

These wrap the framework-agnostic engine (`seo.engine`) at the HTTP boundary and
are the deferred "Pydantic layer" the engine intentionally avoids. Pydantic v2.
No secrets ever live in these models.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


class UsageMeta(BaseModel):
    """Cost/latency envelope returned on every SEO response. Never holds secrets."""

    provider: str = "pixie-seo-engine"
    model: str = "deterministic-v1"
    estimated_cost: float = 0.0
    latency_ms: int = 0
    cache_hit: bool = False
    request_id: Optional[str] = None


class GenerateRequest(BaseModel):
    """Mode A — enrich a Pixie-controlled page. `page` is a loose, normalized dict
    handed straight to the tolerant engine normalizer."""

    model_config = ConfigDict(extra="ignore")

    tenant_id: str = Field(..., min_length=1)
    page: Dict[str, Any] = Field(default_factory=dict)
    idempotency_key: Optional[str] = None


class AuditUrlRequest(BaseModel):
    """Mode B — audit an external page. Provide a pre-normalized `page` to audit now;
    live URL crawling (SSRF-guarded) arrives in Wave 2 (`seo.mode_external`)."""

    model_config = ConfigDict(extra="ignore")

    tenant_id: str = Field(..., min_length=1)
    url: Optional[str] = None
    page: Optional[Dict[str, Any]] = None
    idempotency_key: Optional[str] = None


class KeywordsRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    tenant_id: str = Field(..., min_length=1)
    topic: str = Field(..., min_length=1)
    seed_keywords: List[str] = Field(default_factory=list)


class TrackRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    tenant_id: str = Field(..., min_length=1)
    url: str = Field(..., min_length=1)
    keywords: List[str] = Field(default_factory=list)
    idempotency_key: Optional[str] = None


class ReportResponse(BaseModel):
    """The full SEO result envelope for Mode A and Mode B."""

    report_id: str
    tenant_id: str
    mode: str
    url: str = ""
    score: Dict[str, Any]
    checks: List[Dict[str, Any]]
    issues: List[Dict[str, Any]]
    suggestions: List[str]
    fixes: List[Dict[str, Any]]
    usage: UsageMeta


class TrackedKeywordOut(BaseModel):
    id: str
    tenant_id: str
    keyword: str
    url: str


class TrackResponse(BaseModel):
    tenant_id: str
    tracked: List[TrackedKeywordOut]
    note: str = "Rank snapshots are produced by the Wave 3 rank-tracking job."
    usage: UsageMeta
