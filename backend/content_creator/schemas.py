"""Pydantic v2 contract models for the Content Creator HTTP boundary.

These mirror the additive Prisma models (every model tenant-scoped) and are the
typed surface the demo/API layer uses. The core pipeline (gates/cost/providers/
quality) works in plain dicts/dataclasses and does NOT import this module, so it
stays stdlib-testable. Enums are re-exported from the stdlib `enums` module.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field

from .enums import (  # noqa: F401  (re-exported for the API layer)
    ApprovalGate,
    ApprovalStatus,
    IdentitySource,
    JobStatus,
    PipelineStage,
    PlatformType,
    PostStatus,
    ProviderMode,
    QualityStatus,
    VideoStatus,
)


class _Base(BaseModel):
    model_config = ConfigDict(extra="ignore")


class CreatorProfile(_Base):
    tenant_id: str = Field(..., min_length=1)
    business_name: str = ""
    business_type: str = ""
    product_or_service: str = ""
    target_audience: str = ""
    niche: str = ""
    content_goal: str = ""
    brand_tone: str = ""
    language: str = "en"
    selling_points: List[str] = Field(default_factory=list)
    competitors: List[str] = Field(default_factory=list)
    cta_style: str = ""
    compliance_notes: str = ""


class InfluencerIdentity(_Base):
    tenant_id: str = Field(..., min_length=1)
    source: IdentitySource
    active: bool = True
    reference_ref: str = ""              # stored reference: a hosted image URL, a pre-hosted URL, or a generated-character ref
    reference_hosted: bool = False       # True when we uploaded/hosted the image ourselves
    reference_asset_id: str = ""         # content-asset id when hosted (audit/cleanup)
    characteristics: Dict[str, Any] = Field(default_factory=dict)
    locked: bool = True


class ProviderConnection(_Base):
    tenant_id: str = Field(..., min_length=1)
    user_id: str = ""
    mode: ProviderMode = ProviderMode.PIXIE_MANAGED
    connection_type: str = "mock"        # api_key | pixie_env | prompt_export | mock
    connected: bool = False
    configured: bool = False             # mode is usable (creds/model present, or export)
    model_id: str = ""                   # per-tenant model (client_own); env model for pixie_managed
    account_ref: str = ""                # never a secret value (masked hint only)
    provider: str = "higgsfield"
    status: str = ""                     # connected | invalid_credentials | provider_not_configured | prompt_export | ...
    capabilities: Dict[str, Any] = Field(default_factory=dict)
    estimated_credits: int = 0
    estimated_provider_cost: float = 0.0
    pixie_markup: float = 0.0
    final_price: float = 0.0


class Idea(_Base):
    tenant_id: str = Field(..., min_length=1)
    title: str = ""
    angle: str = ""
    hook: str = ""
    score: int = 0
    source: str = "mock"
    approval_status: ApprovalStatus = ApprovalStatus.PENDING


class Script(_Base):
    tenant_id: str = Field(..., min_length=1)
    idea_ref: str = ""
    hook: str = ""
    body: str = ""
    cta: str = ""
    word_count: int = 0
    approx_seconds: int = 15
    approval_status: ApprovalStatus = ApprovalStatus.PENDING


class CostEstimate(_Base):
    tenant_id: str = Field(..., min_length=1)
    provider_mode: ProviderMode = ProviderMode.PIXIE_ACCOUNT
    model: str = ""
    estimated_credits: int = 0
    estimated_provider_cost: float = 0.0
    pixie_markup: float = 0.0
    final_user_price: float = 0.0
    duration_seconds: int = 15
    retry_budget: int = 2


class Video(_Base):
    tenant_id: str = Field(..., min_length=1)
    script_ref: str = ""
    status: VideoStatus = VideoStatus.MOCK
    asset_ref: str = ""
    preview_ref: str = ""
    identity_ref: str = ""  # the locked influencer identity baked into this video
    aspect_ratio: str = "9:16"
    duration_seconds: int = 15
    model: str = ""
    prompt_version: str = ""
    # --- real async-job fields (empty in mock mode) ---
    provider: str = ""                # "higgsfield" | "mock"
    provider_mode: str = ""           # client_own_account | pixie_managed (canonical)
    provider_job_id: str = ""         # the provider's request id (poll handle)
    result_url: str = ""              # provider's (temporary) result media URL
    storage_url: str = ""             # re-hosted, durable URL (Supabase) — what we serve
    progress: float = 0.0             # 0.0..1.0 while generating
    error: str = ""                   # safe error string on failure (no secrets)


class QualityCheck(_Base):
    tenant_id: str = Field(..., min_length=1)
    video_ref: str = ""
    status: QualityStatus = QualityStatus.PASS
    deterministic_flags: List[str] = Field(default_factory=list)
    llm_flags: List[str] = Field(default_factory=list)
    retry_count: int = 0


class Post(_Base):
    tenant_id: str = Field(..., min_length=1)
    video_ref: str = ""
    platform: PlatformType = PlatformType.META
    status: PostStatus = PostStatus.DRY_RUN
    scheduled_time: str = ""
    dry_run: bool = True
    external_ref: str = ""


class Metric(_Base):
    tenant_id: str = Field(..., min_length=1)
    post_ref: str = ""
    views: int = 0
    likes: int = 0
    comments: int = 0
    shares: int = 0
    saves: int = 0
    watch_time: float = 0.0
    completion_rate: float = 0.0
    clicks: int = 0
    follows: int = 0
    leads: int = 0


class Learning(_Base):
    tenant_id: str = Field(..., min_length=1)
    samples: int = 0
    insights: List[str] = Field(default_factory=list)
    next_focus: str = ""


class ApprovalRecord(_Base):
    tenant_id: str = Field(..., min_length=1)
    gate: ApprovalGate
    target_ref: str = ""
    status: ApprovalStatus = ApprovalStatus.PENDING
    note: str = ""


class PixieUsage(_Base):
    """Billable-usage record for pixie_managed generation (Pixie fronts the credits).

    Client-own generation records no Pixie provider cost. If a wallet/billing system
    isn't wired yet, this is stored as a pending billable record and marked clearly."""
    tenant_id: str = Field(..., min_length=1)
    user_id: str = ""
    provider: str = "higgsfield"
    provider_mode: str = "pixie_managed"
    video_ref: str = ""
    provider_job_id: str = ""
    estimated_credits: int = 0
    actual_credits: int = 0
    estimated_cost: float = 0.0
    client_price: float = 0.0
    markup: float = 0.0
    status: str = "pending_billable"  # pending_billable | submitted | completed | failed
    note: str = ""
