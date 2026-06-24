"""Marketing HTTP surface — one APIRouter mounting the whole module.

Wave 2 endpoints, all under ``/v1/marketing``. The lead registers this in the
app with a SINGLE line (kept out of app.py while that file is dirty):

    from marketing.api import router as marketing_router
    app.include_router(marketing_router)

Design notes:
* The Brain is the only AI; every endpoint stays $0 in ``PIXIE_MODEL_MODE=fake``.
* Nothing publishes live — the platform endpoint is dry-run only.
* Persistence is the in-memory repository seam (profiles, campaigns, content);
  the durable Prisma/Supabase layer plugs in behind the same accessors later.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from .brain import get_brain
from .briefs import BriefRequest, CreativeBrief, generate_brief
from .campaigns import (
    Campaign,
    CampaignPlanRequest,
    get_campaign_repository,
    plan_campaign,
)
from .content import (
    ContentItem,
    ContentRequest,
    generate_content,
    get_content_repository,
)
from .knowledge import IndustryPreset, get_preset, list_presets
from .platforms import PostContent, get_adapter, get_platform_spec, list_platform_specs
from .profile import get_profile_repository
from .schemas import MarketingContext, MarketingProfile

router = APIRouter(prefix="/v1/marketing", tags=["marketing"])


# ── response envelopes ───────────────────────────────────────────────────────
class StrategyResponse(BaseModel):
    """The exact Brain contract + what it cost to produce it."""

    strategy: dict = Field(..., description="The BrainStrategy contract (camelCase keys).")
    cost_usd: float = 0.0
    latency_ms: int = 0
    used_fallback: bool = Field(default=False, description="True when the deterministic synthesizer filled gaps (e.g. fake mode).")


# ── profile ──────────────────────────────────────────────────────────────────
@router.post("/profile", response_model=MarketingProfile)
async def upsert_profile(profile: MarketingProfile) -> MarketingProfile:
    """Create or update a business marketing profile (the Brain's input data)."""
    return get_profile_repository().save_profile(profile)


@router.get("/profile/{profile_id}", response_model=MarketingProfile)
async def get_profile(profile_id: str, tenant_id: str = Query(...)) -> MarketingProfile:
    profile = get_profile_repository().get_profile(tenant_id, profile_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="profile not found")
    return profile


@router.get("/profiles", response_model=list[MarketingProfile])
async def list_profiles(tenant_id: str = Query(...)) -> list[MarketingProfile]:
    return get_profile_repository().list_profiles(tenant_id)


# ── knowledge / presets ──────────────────────────────────────────────────────
@router.get("/presets", response_model=list[IndustryPreset])
async def get_presets() -> list[IndustryPreset]:
    return list_presets()


@router.get("/presets/{industry}", response_model=IndustryPreset)
async def get_industry_preset(industry: str) -> IndustryPreset:
    return get_preset(industry)


# ── platforms ────────────────────────────────────────────────────────────────
@router.get("/platforms")
async def get_platforms() -> list[dict]:
    return [spec.model_dump() for spec in list_platform_specs()]


# ── strategy (Brain) ─────────────────────────────────────────────────────────
@router.post("/strategy", response_model=StrategyResponse)
async def strategy(ctx: MarketingContext) -> StrategyResponse:
    """Run the Brain → the structured BrainStrategy contract."""
    outcome = await get_brain().strategize(ctx)
    return StrategyResponse(
        strategy=outcome.strategy.to_contract(),
        cost_usd=outcome.cost_usd,
        latency_ms=outcome.latency_ms,
        used_fallback=outcome.used_fallback,
    )


# ── campaigns ────────────────────────────────────────────────────────────────
@router.post("/campaigns", response_model=Campaign)
async def create_campaign(req: CampaignPlanRequest) -> Campaign:
    """Plan a campaign (Brain reasons, deterministic assembly) and persist it."""
    campaign = await plan_campaign(req)
    return get_campaign_repository().save_campaign(campaign)


@router.get("/campaigns", response_model=list[Campaign])
async def list_campaigns(tenant_id: str = Query(...)) -> list[Campaign]:
    return get_campaign_repository().list_campaigns(tenant_id)


@router.get("/campaigns/{campaign_id}", response_model=Campaign)
async def get_campaign(campaign_id: str, tenant_id: str = Query(...)) -> Campaign:
    campaign = get_campaign_repository().get_campaign(tenant_id, campaign_id)
    if campaign is None:
        raise HTTPException(status_code=404, detail="campaign not found")
    return campaign


# ── content ──────────────────────────────────────────────────────────────────
@router.post("/content", response_model=list[ContentItem])
async def create_content(req: ContentRequest) -> list[ContentItem]:
    """Generate structured content assets (AI writes, services format) and persist."""
    items = await generate_content(req)
    repo = get_content_repository()
    return [repo.save_content(item) for item in items]


@router.get("/content", response_model=list[ContentItem])
async def list_content(
    tenant_id: str = Query(...),
    campaign_id: str | None = Query(default=None),
) -> list[ContentItem]:
    return get_content_repository().list_content(tenant_id, campaign_id)


# ── creative briefs ──────────────────────────────────────────────────────────
@router.post("/briefs", response_model=CreativeBrief)
async def create_brief(req: BriefRequest) -> CreativeBrief:
    """Generate a creative brief for a designer / AI video tool."""
    return await generate_brief(req)


# ── platform dry-run (nothing publishes live) ────────────────────────────────
@router.post("/platforms/{platform}/dry-run")
async def platform_dry_run(platform: str, content: PostContent) -> dict:
    """Format + validate content for a platform and return the dry-run preview.

    This NEVER publishes — the adapters are dry-run placeholders. ``would_post`` is
    always False until real credentials + explicit approval are wired in.
    """
    # Surface an unknown platform clearly rather than silently using the fallback.
    get_platform_spec(platform)  # validates/normalizes; never raises
    result = get_adapter(platform).dry_run_post(content)
    return result.model_dump()
