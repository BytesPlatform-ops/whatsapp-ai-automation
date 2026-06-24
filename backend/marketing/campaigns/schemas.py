"""Campaign schemas — the planner's output contract + its request shape.

Pydantic v2, tenant-scoped (``tenant_id`` is the isolation key), tolerant of extra
keys so model-adjacent code that adds a field never breaks parsing.

A ``Campaign`` is the deterministic assembly the planner produces from the Brain's
strategy: a posting schedule, required assets, KPI targets, and compliance notes.
The AI provides the *strategy*; everything stored here is plain-code assembly.
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field

from ..schemas import MarketingProfile, Platform


class CampaignType(str, Enum):
    BRAND_AWARENESS = "brand_awareness"
    PRODUCT_LAUNCH = "product_launch"
    SOFT_LAUNCH = "soft_launch"
    LEAD_GEN = "lead_gen"
    OFFER = "offer"
    EVENT = "event"
    RETARGETING = "retargeting"
    RE_ENGAGEMENT = "re_engagement"
    REVIEW = "review"
    BOOKING = "booking"
    MISSED_LEAD_RECOVERY = "missed_lead_recovery"
    REFERRAL = "referral"
    LOCAL = "local"
    UGC_INFLUENCER = "ugc_influencer"
    SEASONAL = "seasonal"
    GIVEAWAY = "giveaway"
    EDUCATIONAL = "educational"
    TRUST_BUILDING = "trust_building"
    COMPARISON = "comparison"
    PROBLEM_SOLUTION = "problem_solution"


class CampaignStatus(str, Enum):
    DRAFT = "draft"
    NEEDS_REVIEW = "needs_review"
    APPROVED = "approved"
    SCHEDULED = "scheduled"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    ARCHIVED = "archived"


class Campaign(BaseModel):
    """A planned campaign. Tenant-scoped; tolerant of extra keys."""

    model_config = ConfigDict(extra="ignore", use_enum_values=True)

    id: str | None = Field(default=None, description="Stable id (set by the store on save).")
    tenant_id: str = Field(..., description="Isolation key — which account this campaign belongs to.")

    name: str = Field(default="")
    goal: str = Field(default="")
    campaign_type: CampaignType = CampaignType.BRAND_AWARENESS
    audience: str = Field(default="")

    platforms: list[str] = Field(default_factory=list)
    formats: list[str] = Field(default_factory=list)
    messaging_angle: str = Field(default="")
    hooks: list[str] = Field(default_factory=list)
    cta: str = Field(default="")

    # Each schedule item: {day, platform, format, topic}
    schedule: list[dict] = Field(default_factory=list)
    required_assets: list[str] = Field(default_factory=list)

    approval_status: CampaignStatus = CampaignStatus.NEEDS_REVIEW
    start_date: str | None = None
    end_date: str | None = None

    kpi_targets: dict = Field(default_factory=dict)
    risks: list[str] = Field(default_factory=list)
    compliance_notes: list[str] = Field(default_factory=list)
    follow_up: str = Field(default="")

    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class CampaignPlanRequest(BaseModel):
    """Input to ``plan_campaign``. The profile is read; the goal drives the Brain."""

    model_config = ConfigDict(extra="ignore")

    tenant_id: str = Field(..., description="Isolation key.")
    profile: MarketingProfile
    goal: str = Field(..., min_length=1, max_length=2000)
    campaign_type: CampaignType | None = None
    platform_focus: list[Platform] | None = None
    duration_days: int = Field(default=14, ge=1, le=365)
