"""Pydantic request/response models for the SEO API (Mode A + Mode B).

These wrap the framework-agnostic engine (`seo.engine`) and the Mode A/B layers
at the HTTP boundary — the deferred "Pydantic layer" the engine avoids on
purpose. Pydantic v2. No secrets ever live in these models.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


class UsageMeta(BaseModel):
    """Cost/latency envelope returned on SEO responses. Never holds secrets."""

    provider: str = "pixie-seo-engine"
    model: str = "deterministic-v1"
    estimated_cost: float = 0.0
    latency_ms: int = 0
    cache_hit: bool = False
    request_id: Optional[str] = None


class GenerateRequest(BaseModel):
    """Mode A — enrich a Pixie-controlled page. `page` is a loose, normalized dict
    handed straight to the tolerant engine normalizer / injector."""

    model_config = ConfigDict(extra="ignore")

    tenant_id: str = Field(..., min_length=1)
    page: Dict[str, Any] = Field(default_factory=dict)
    business_type: str = ""
    brand: str = ""
    idempotency_key: Optional[str] = None


class AuditUrlRequest(BaseModel):
    """Mode B — audit an external page. Supply `url` for a live SSRF-guarded
    crawl, or a pre-normalized `page` to audit without fetching."""

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


class GenerateResponse(BaseModel):
    """Mode A result — the enriched site plus before/after scores."""

    report_id: str
    tenant_id: str
    mode: str
    url: str = ""
    site: Dict[str, Any]
    suggested_slug: str = ""
    score_before: Dict[str, Any]
    score_after: Dict[str, Any]
    applied: List[str]
    ai_fallback: bool
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
