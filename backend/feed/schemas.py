"""Feed Pydantic models — mirror the frontend TS contract in
landing/lib/pixie-lab/feed.ts so the masonry UI can consume them unchanged."""

from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class FeedCategory(str, Enum):
    setup = "setup"
    ready_to_approve = "ready_to_approve"
    growth = "growth"
    customer_attention = "customer_attention"
    content_marketing = "content_marketing"
    website_seo = "website_seo"
    system = "system"


class FeedPriority(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"
    urgent = "urgent"


class FeedAgent(str, Enum):
    website = "website"
    receptionist = "receptionist"
    seo = "seo"
    marketing = "marketing"
    content = "content"
    pixie = "pixie"


class FeedActionType(str, Enum):
    approve = "approve"
    preview = "preview"
    edit = "edit"
    do_this = "do_this"
    connect = "connect"
    skip = "skip"
    not_relevant = "not_relevant"
    remind_later = "remind_later"
    open_agent = "open_agent"
    start_trial = "start_trial"
    buy_agent = "buy_agent"


_PRIORITY_RANK = {
    FeedPriority.urgent: 0,
    FeedPriority.high: 1,
    FeedPriority.medium: 2,
    FeedPriority.low: 3,
}


class FeedCardAction(BaseModel):
    model_config = ConfigDict(use_enum_values=True)
    id: str
    label: str
    type: FeedActionType
    requires_confirmation: bool = False


class FeedCard(BaseModel):
    model_config = ConfigDict(use_enum_values=True)
    id: str
    heading: str  # 5-6 words
    full_idea: str
    reason: str
    category: FeedCategory
    priority: FeedPriority
    primary_agent: FeedAgent
    supporting_agents: list[FeedAgent] = Field(default_factory=list)
    source_signals: list[str] = Field(default_factory=list)
    actions: list[FeedCardAction] = Field(default_factory=list)
    outcome: str = ""
    status: str = "new"

    def rank(self) -> int:
        return _PRIORITY_RANK.get(FeedPriority(self.priority), 9)


class BusinessSignals(BaseModel):
    """The tenant business-state the rules engine reads. Sensible 'new tenant'
    defaults so a fresh user still gets a full, non-empty feed (starter cards)."""

    has_website: bool = False
    homepage_cta_weak: bool = True
    channels_connected: int = 0
    unanswered_leads: int = 3
    days_since_last_post: int = 9
    seo_pages_missing_meta: int = 4
    reel_script_ready: bool = True
    credits_pct: int = 12
    business_hours_set: bool = False
    locked_agents: list[FeedAgent] = Field(default_factory=list)
    # extra signals → a richer feed
    no_testimonials: bool = True
    google_business_unclaimed: bool = True
    reviews_to_reply: int = 2
    appointment_reminders_off: bool = True
    weekend_offer_idea: bool = True
    no_product_photos: bool = True


class FeedResponse(BaseModel):
    tenant_id: str
    health: int
    cards: list[FeedCard]


class ActionResult(BaseModel):
    ok: bool
    card_id: str
    status: str
    note: str = ""
