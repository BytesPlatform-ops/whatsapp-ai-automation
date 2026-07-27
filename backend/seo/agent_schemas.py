"""Schemas for the platform-aware SEO agent.

``tenant_id`` is kept Optional with a ``"demo_tenant"`` default so existing
tests (which POST a body without an ``X-Pixie-Tenant`` header) continue to
work.  In production the ``resolve_tenant`` dependency in ``agent_routes.py``
overrides ``body.tenant_id`` with the header-derived value before the handler
uses it.
"""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class AuditStartBody(BaseModel):
    tenant_id: Optional[str] = "demo_tenant"
    website_url: str = Field(..., min_length=3)
    crawl_limit: int = 1
    include_pagespeed: bool = False
    now: str = ""


class ConnectWordPressBody(BaseModel):
    tenant_id: Optional[str] = "demo_tenant"
    site_url: str
    username: str
    application_password: str


class ConnectTokenBody(BaseModel):
    model_config = ConfigDict(extra="ignore")
    tenant_id: Optional[str] = "demo_tenant"
    platform: str
    token: str = ""
    site_id: str = ""


class OptimizePrepareBody(BaseModel):
    tenant_id: Optional[str] = "demo_tenant"
    audit_id: str
    issue_id: str
    new_value: str = ""       # optional override for the suggested fix
    now: str = ""


# ── Durable pipeline schemas ───────────────────────────────────────────────────

class CreateSiteBody(BaseModel):
    """Body for POST /sites — register a new site."""
    model_config = ConfigDict(extra="ignore")
    tenant_id: Optional[str] = "demo_tenant"
    domain: str = Field(..., min_length=3, description="Bare domain, e.g. 'example.com'")
    canonical_base_url: str = ""
    display_name: str = ""
    country: str = "us"
    language: str = "en"
    target_location: str = ""
    # crawl_limit is clamped server-side to CRAWL_LIMIT_MAX; no schema-level cap
    # so the handler controls the bound and can return a real clamped value.
    crawl_limit: int = Field(default=500, ge=1)
    crawl_frequency: str = "weekly"
    robots_policy: str = "respect"
    sitemap_urls: List[str] = Field(default_factory=list)
    included_paths: List[str] = Field(default_factory=list)
    excluded_paths: List[str] = Field(default_factory=list)


class PatchSiteBody(BaseModel):
    """Body for PATCH /sites/{site_id} — edit crawl settings."""
    model_config = ConfigDict(extra="ignore")
    tenant_id: Optional[str] = "demo_tenant"
    crawl_limit: Optional[int] = Field(default=None, ge=1)
    crawl_frequency: Optional[str] = None
    country: Optional[str] = None
    language: Optional[str] = None
    target_location: Optional[str] = None
    included_paths: Optional[List[str]] = None
    excluded_paths: Optional[List[str]] = None
    sitemap_urls: Optional[List[str]] = None
    robots_policy: Optional[str] = None
    display_name: Optional[str] = None
    canonical_base_url: Optional[str] = None


# Maximum number of pages the server will honour regardless of browser input.
CRAWL_LIMIT_MAX: int = 500


class CrawlStartBody(BaseModel):
    """Body for POST /crawl/start."""
    model_config = ConfigDict(extra="ignore")
    tenant_id: Optional[str] = "demo_tenant"
    site_id: Optional[str] = None          # required when url not supplied
    url: Optional[str] = None              # seed URL (overrides site.canonical_base_url)
    crawl_type: str = "site"               # "site" | "single"
    requested_limit: Optional[int] = None  # server-side clamped to CRAWL_LIMIT_MAX
    include_pagespeed: bool = False        # when True, run PSI for homepage + representative pages


class PageSpeedBody(BaseModel):
    """Body for POST /pagespeed — on-demand CWV for a single URL."""
    model_config = ConfigDict(extra="ignore")
    tenant_id: Optional[str] = "demo_tenant"
    url: str = Field(..., min_length=4)
    strategy: str = "both"   # "mobile" | "desktop" | "both"


class CrawlEstimateBody(BaseModel):
    """Body for POST /crawl/estimate — preview cost before starting a crawl."""
    model_config = ConfigDict(extra="ignore")
    tenant_id: Optional[str] = "demo_tenant"
    requested_limit: int = Field(default=100, ge=1)
    include_pagespeed: bool = False


class IssueResolveBody(BaseModel):
    """Body for POST /issues/{issue_id}/resolve."""
    model_config = ConfigDict(extra="ignore")
    tenant_id: Optional[str] = "demo_tenant"
