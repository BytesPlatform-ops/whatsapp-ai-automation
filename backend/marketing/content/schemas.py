"""Content schemas — the content factory's output items + its request shape.

Pydantic v2, tenant-scoped, tolerant of extra keys. A ``ContentItem`` is a single
piece of ready-to-review creative (hook, copy, caption, script, visual direction,
hashtags, cta, risk score). The AI writes the copy; a deterministic formatting
pass fills the structural fields and a risk heuristic.
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field

from ..schemas import MarketingProfile, Platform


class ContentType(str, Enum):
    REEL_SCRIPT = "reel_script"
    TIKTOK_SCRIPT = "tiktok_script"
    SHORTS_SCRIPT = "shorts_script"
    POST = "post"
    CAROUSEL = "carousel"
    STORY = "story"
    AD_COPY = "ad_copy"
    LANDING_COPY = "landing_copy"
    EMAIL = "email"
    WHATSAPP = "whatsapp"
    SMS = "sms"
    UGC_BRIEF = "ugc_brief"
    TESTIMONIAL_REQUEST = "testimonial_request"
    OFFER_ANNOUNCEMENT = "offer_announcement"
    TEASER = "teaser"
    HOOK_LIST = "hook_list"
    CTA_LIST = "cta_list"
    CAPTION = "caption"


class ContentItem(BaseModel):
    """A single piece of generated content. Tenant-scoped; tolerant of extra keys."""

    model_config = ConfigDict(extra="ignore", use_enum_values=True)

    id: str | None = Field(default=None, description="Stable id (set by the store on save).")
    tenant_id: str = Field(..., description="Isolation key.")

    platform: str = Field(default="")
    content_type: ContentType = ContentType.POST
    campaign_id: str | None = None

    hook: str = Field(default="")
    main_copy: str = Field(default="")
    caption: str = Field(default="")
    script: str = Field(default="")
    visual_direction: str = Field(default="")
    shot_list: list[str] = Field(default_factory=list)
    carousel_slides: list[str] = Field(default_factory=list)
    cta: str = Field(default="")
    hashtags: list[str] = Field(default_factory=list)

    tone: str = Field(default="")
    target_audience: str = Field(default="")

    approval_status: str = Field(default="needs_review")
    risk_score: int = Field(default=0, ge=0, le=100)
    created_by_agent: str = Field(default="content_factory")
    version: int = Field(default=1)
    scheduled_time: str | None = None
    notes: str = Field(default="")

    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class ContentRequest(BaseModel):
    """Input to ``generate_content``. The profile is read; ``topic`` hints the copy."""

    model_config = ConfigDict(extra="ignore")

    tenant_id: str = Field(..., description="Isolation key.")
    profile: MarketingProfile
    campaign_id: str | None = None
    platform: Platform = Platform.INSTAGRAM
    content_type: ContentType = ContentType.POST
    topic: str = Field(default="", description="Topic / hook hint for the copy.")
    count: int = Field(default=1, ge=1, le=20)
    variations: int = Field(default=1, ge=1, le=5)
