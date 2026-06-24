"""Marketing schemas — the contracts the whole module is built around.

Two things matter most here:

1. ``BrainStrategy`` — the EXACT structured output contract the Brain produces and
   every downstream module consumes. Its JSON keys are camelCase and fixed by the
   spec; ``to_contract()`` emits them verbatim. Don't rename a key without updating
   every consumer.
2. ``MarketingProfile`` — the business knowledge the Brain MUST read before it
   generates anything.

Pydantic v2, tenant-scoped (``tenant_id`` is the isolation key), tolerant of extra
keys on inbound model output so a model that adds a field never breaks parsing.
"""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


# ── industries ───────────────────────────────────────────────────────────────
class Industry(str, Enum):
    """The 20 seeded industries (Section B). ``GENERIC`` is the safe fallback for
    anything we don't have a preset for yet."""

    AI_SAAS = "ai_saas"
    BEAUTY_SALON = "beauty_salon"
    DENTAL_CLINIC = "dental_clinic"
    MEDICAL_CLINIC = "medical_clinic"
    REAL_ESTATE = "real_estate"
    RESTAURANT_CAFE = "restaurant_cafe"
    FITNESS_GYM = "fitness_gym"
    ECOMMERCE = "ecommerce"
    AUTO_REPAIR = "auto_repair"
    CLEANING_SERVICE = "cleaning_service"
    HOME_SERVICES = "home_services"
    LAW_FIRM = "law_firm"
    ACCOUNTING_TAX = "accounting_tax"
    SCHOOL_ACADEMY = "school_academy"
    EVENT_PLANNER = "event_planner"
    TRAVEL_AGENCY = "travel_agency"
    HOTEL = "hotel"
    CONSTRUCTION = "construction"
    MARKETING_AGENCY = "marketing_agency"
    INSURANCE = "insurance"
    GENERIC = "generic"


class FunnelStage(str, Enum):
    AWARENESS = "awareness"
    CONSIDERATION = "consideration"
    DECISION = "decision"
    RETENTION = "retention"
    ADVOCACY = "advocacy"


class Platform(str, Enum):
    """Platforms the strategy can target. Adapters (Wave 2) map 1:1 to these."""

    INSTAGRAM = "instagram"
    FACEBOOK = "facebook"
    TIKTOK = "tiktok"
    YOUTUBE_SHORTS = "youtube_shorts"
    LINKEDIN = "linkedin"
    X = "x"
    THREADS = "threads"
    WHATSAPP = "whatsapp"
    EMAIL = "email"
    SMS = "sms"
    GOOGLE_BUSINESS = "google_business"
    REDDIT = "reddit"
    PINTEREST = "pinterest"
    SNAPCHAT = "snapchat"
    TELEGRAM = "telegram"
    DISCORD = "discord"
    NEXTDOOR = "nextdoor"


# ── business profile (Section B) ─────────────────────────────────────────────
class MarketingProfile(BaseModel):
    """Everything the Brain reads about a business before generating. One row per
    business; ``tenant_id`` isolates tenants and the same tenant may hold several."""

    model_config = ConfigDict(extra="ignore")

    id: str | None = Field(default=None, description="Stable id (set by the repository on save).")
    tenant_id: str = Field(..., description="Isolation key — which account this profile belongs to.")

    business_name: str = Field(..., min_length=1, max_length=200)
    industry: Industry = Industry.GENERIC
    business_type: str = Field(default="", description="Freeform sub-type, e.g. 'bridal salon'.")
    location: str = Field(default="", description="City / region for local targeting.")

    target_audience: str = Field(default="", description="Who we're selling to, in plain words.")
    pain_points: list[str] = Field(default_factory=list)
    products: list[str] = Field(default_factory=list, description="Products / services offered.")
    pricing: str = Field(default="", description="Freeform pricing notes (e.g. 'from $49').")

    brand_tone: str = Field(default="", description="e.g. 'warm, premium, no jargon'.")
    brand_personality: str = Field(default="")
    usp: str = Field(default="", description="The one differentiator to lead with.")
    competitors: list[str] = Field(default_factory=list)

    platforms_used: list[Platform] = Field(default_factory=list)
    monthly_goal: str = Field(default="", description="The business outcome this month, in words.")
    budget_range: str = Field(default="", description="Freeform budget band, e.g. '$300-500/mo'.")
    primary_cta: str = Field(default="", description="The default call to action.")

    website_url: str = Field(default="")
    landing_url: str = Field(default="")
    booking_url: str = Field(default="")
    contact: str = Field(default="", description="Phone / email / handle for CTAs.")

    funnel_stage: FunnelStage = FunnelStage.AWARENESS
    content_style: str = Field(default="", description="e.g. 'short-form, punchy, UGC-leaning'.")

    restricted_claims: list[str] = Field(default_factory=list, description="Claims we must NEVER make.")
    compliance_notes: str = Field(default="")
    language: str = Field(default="en")
    approval_required: bool = Field(default=True, description="Human must approve before anything is marked ready.")


# ── brain input ──────────────────────────────────────────────────────────────
class MarketingContext(BaseModel):
    """The Brain's input: a profile, the goal in plain words, and optional history.

    The Brain reads the profile + the matching industry preset + any past
    performance, then reasons. Keep this small — it's the only thing the reasoning
    layer is allowed to see."""

    model_config = ConfigDict(extra="ignore")

    tenant_id: str = Field(..., description="Isolation key.")
    profile: MarketingProfile
    goal: str = Field(..., min_length=1, max_length=2000, description="What the business wants, in plain words.")
    platform_focus: list[Platform] = Field(default_factory=list, description="Optional: restrict to these platforms.")
    past_performance: str = Field(default="", description="Optional summary of what has worked/failed before.")
    simple: bool = Field(default=False, description="True for tiny asks (one caption) → routes to the small model.")


# ── brain output contract (Section A — keep these JSON keys EXACTLY) ──────────
class BrainStrategy(BaseModel):
    """The Brain's structured output. JSON keys are fixed by the spec (camelCase);
    Python fields stay snake_case via aliases. ``to_contract()`` emits the exact
    contract; parsing accepts either the alias or the field name."""

    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    campaign_goal: str = Field(default="", alias="campaignGoal")
    target_audience: str = Field(default="", alias="targetAudience")
    platforms: list[str] = Field(default_factory=list)
    content_pillars: list[str] = Field(default_factory=list, alias="contentPillars")
    creative_angles: list[str] = Field(default_factory=list, alias="creativeAngles")
    cta: str = Field(default="")
    assets_needed: list[str] = Field(default_factory=list, alias="assetsNeeded")
    recommended_cadence: str = Field(default="", alias="recommendedCadence")
    risk_notes: list[str] = Field(default_factory=list, alias="riskNotes")
    next_actions: list[str] = Field(default_factory=list, alias="nextActions")

    def to_contract(self) -> dict:
        """The exact, ordered output contract other modules consume."""
        return self.model_dump(by_alias=True)
