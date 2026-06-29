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
    reference_ref: str = ""              # stored reference (image ref or generated character ref)
    characteristics: Dict[str, Any] = Field(default_factory=dict)
    locked: bool = True


class ProviderConnection(_Base):
    tenant_id: str = Field(..., min_length=1)
    mode: ProviderMode = ProviderMode.PIXIE_ACCOUNT
    connection_type: str = "mock"        # api_key | mcp | cli | oauth_placeholder | mock
    connected: bool = False
    account_ref: str = ""                # never a secret value
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
    aspect_ratio: str = "9:16"
    duration_seconds: int = 15
    model: str = ""
    prompt_version: str = ""


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
