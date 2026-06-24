"""Campaign planner — Brain strategy in, fully assembled ``Campaign`` out.

Split of labour (matches ``marketing/brain/brain.py``'s philosophy):
- The **Brain** does the reasoning (creative angles, pillars, cta, platforms,
  risks) — that's the ONLY model call here.
- Everything else — the posting schedule spread over ``duration_days``, required
  assets, KPI targets, compliance notes, approval status — is DETERMINISTIC plain
  code. No extra model call.

High-risk industries (``preset.high_risk``) always start ``needs_review`` and get a
human-review compliance note appended.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from ..brain import get_brain
from ..knowledge import IndustryPreset, get_preset
from ..schemas import BrainStrategy, MarketingContext, Platform
from .schemas import Campaign, CampaignPlanRequest, CampaignStatus, CampaignType


# Sensible KPI defaults per campaign type. Deterministic; tuned downstream.
_KPI_DEFAULTS: dict[CampaignType, dict] = {
    CampaignType.BRAND_AWARENESS: {"reach": 10000, "impressions": 25000, "follower_growth_pct": 5},
    CampaignType.PRODUCT_LAUNCH: {"reach": 15000, "signups": 100, "engagement_rate_pct": 4},
    CampaignType.SOFT_LAUNCH: {"reach": 5000, "waitlist_signups": 50, "engagement_rate_pct": 5},
    CampaignType.LEAD_GEN: {"leads": 50, "cost_per_lead_usd": 8, "conversion_rate_pct": 3},
    CampaignType.OFFER: {"redemptions": 40, "click_through_rate_pct": 5, "revenue_usd": 2000},
    CampaignType.EVENT: {"registrations": 75, "attendance_rate_pct": 60, "reach": 8000},
    CampaignType.RETARGETING: {"return_rate_pct": 12, "conversions": 30, "roas": 3.0},
    CampaignType.RE_ENGAGEMENT: {"reactivations": 25, "open_rate_pct": 20, "click_rate_pct": 4},
    CampaignType.REVIEW: {"new_reviews": 20, "avg_rating": 4.7, "response_rate_pct": 90},
    CampaignType.BOOKING: {"bookings": 40, "show_rate_pct": 80, "cost_per_booking_usd": 10},
    CampaignType.MISSED_LEAD_RECOVERY: {"recovered_leads": 20, "reply_rate_pct": 25, "conversions": 8},
    CampaignType.REFERRAL: {"referrals": 30, "referral_conversion_pct": 20, "new_customers": 12},
    CampaignType.LOCAL: {"local_reach": 6000, "store_visits": 50, "calls": 30},
    CampaignType.UGC_INFLUENCER: {"ugc_pieces": 15, "reach": 20000, "engagement_rate_pct": 6},
    CampaignType.SEASONAL: {"reach": 12000, "redemptions": 35, "revenue_usd": 2500},
    CampaignType.GIVEAWAY: {"entries": 300, "follower_growth_pct": 10, "shares": 100},
    CampaignType.EDUCATIONAL: {"reach": 8000, "saves": 150, "engagement_rate_pct": 5},
    CampaignType.TRUST_BUILDING: {"reach": 7000, "saves": 100, "profile_visits": 500},
    CampaignType.COMPARISON: {"reach": 9000, "click_through_rate_pct": 4, "leads": 25},
    CampaignType.PROBLEM_SOLUTION: {"reach": 9000, "saves": 120, "leads": 20},
}

_FOLLOW_UP = (
    "After this campaign: review KPI actuals vs targets, double down on the best "
    "performing format/platform, and queue a re-engagement or retargeting follow-up "
    "for everyone who engaged but didn't convert."
)


def _infer_campaign_type(strategy: BrainStrategy, preset: IndustryPreset) -> CampaignType:
    """Best-effort mapping from the Brain's creative angles / preset to a CampaignType."""
    candidates = [a.lower() for a in (strategy.creative_angles or [])]
    candidates += [t.lower() for t in (preset.best_campaign_types or [])]
    haystack = " ".join(candidates)
    # Ordered so more-specific phrases win before generic ones.
    table = [
        ("missed lead", CampaignType.MISSED_LEAD_RECOVERY),
        ("re-engag", CampaignType.RE_ENGAGEMENT),
        ("re engag", CampaignType.RE_ENGAGEMENT),
        ("retarget", CampaignType.RETARGETING),
        ("product launch", CampaignType.PRODUCT_LAUNCH),
        ("soft launch", CampaignType.SOFT_LAUNCH),
        ("lead gen", CampaignType.LEAD_GEN),
        ("trust", CampaignType.TRUST_BUILDING),
        ("review", CampaignType.REVIEW),
        ("booking", CampaignType.BOOKING),
        ("referral", CampaignType.REFERRAL),
        ("seasonal", CampaignType.SEASONAL),
        ("giveaway", CampaignType.GIVEAWAY),
        ("educat", CampaignType.EDUCATIONAL),
        ("comparison", CampaignType.COMPARISON),
        ("problem", CampaignType.PROBLEM_SOLUTION),
        ("event", CampaignType.EVENT),
        ("ugc", CampaignType.UGC_INFLUENCER),
        ("influencer", CampaignType.UGC_INFLUENCER),
        ("local", CampaignType.LOCAL),
        ("offer", CampaignType.OFFER),
        ("awareness", CampaignType.BRAND_AWARENESS),
    ]
    for needle, ctype in table:
        if needle in haystack:
            return ctype
    return CampaignType.BRAND_AWARENESS


def _resolve_platforms(req: CampaignPlanRequest, strategy: BrainStrategy, preset: IndustryPreset) -> list[str]:
    if req.platform_focus:
        return [p.value for p in req.platform_focus]
    if strategy.platforms:
        return list(strategy.platforms)
    if req.profile.platforms_used:
        return [p.value for p in req.profile.platforms_used]
    return [p.value for p in preset.platforms] or [Platform.INSTAGRAM.value]


def _resolve_formats(strategy: BrainStrategy, preset: IndustryPreset) -> list[str]:
    formats = list(preset.content_formats) or list(strategy.assets_needed)
    return formats or ["post", "reel", "story"]


def _build_schedule(
    duration_days: int,
    platforms: list[str],
    formats: list[str],
    pillars: list[str],
    start: date,
) -> list[dict]:
    """Spread one post per day across the duration, round-robin platform & format.

    Each item: {day (ISO date), day_index, platform, format, topic}.
    """
    topics = pillars or ["value", "social proof", "offer", "story"]
    schedule: list[dict] = []
    for i in range(duration_days):
        the_day = start + timedelta(days=i)
        schedule.append({
            "day": the_day.isoformat(),
            "day_index": i + 1,
            "platform": platforms[i % len(platforms)],
            "format": formats[i % len(formats)],
            "topic": topics[i % len(topics)],
        })
    return schedule


async def plan_campaign(req: CampaignPlanRequest) -> Campaign:
    """Turn a plan request into a fully-assembled ``Campaign``.

    One model call (the Brain); the rest is deterministic assembly.
    """
    preset = get_preset(req.profile.industry)

    ctx = MarketingContext(
        tenant_id=req.tenant_id,
        profile=req.profile,
        goal=req.goal,
        platform_focus=list(req.platform_focus) if req.platform_focus else [],
    )
    outcome = await get_brain().strategize(ctx)
    strategy: BrainStrategy = outcome.strategy

    campaign_type = req.campaign_type or _infer_campaign_type(strategy, preset)

    platforms = _resolve_platforms(req, strategy, preset)
    formats = _resolve_formats(strategy, preset)
    pillars = list(strategy.content_pillars) or list(preset.content_pillars)

    start = datetime.now(timezone.utc).date()
    end = start + timedelta(days=max(req.duration_days - 1, 0))
    schedule = _build_schedule(req.duration_days, platforms, formats, pillars, start)

    # Required assets: union of strategy.assets_needed + preset.content_formats actually scheduled.
    scheduled_formats = sorted({item["format"] for item in schedule})
    required_assets = list(dict.fromkeys(list(strategy.assets_needed) + scheduled_formats))

    audience = strategy.target_audience or req.profile.target_audience or f"{preset.display_name} customers"
    cta = strategy.cta or req.profile.primary_cta or (preset.cta_examples[0] if preset.cta_examples else "Message us")
    messaging_angle = (strategy.creative_angles[0] if strategy.creative_angles else "") or req.profile.usp

    # Compliance notes: merge preset warnings + Brain risk notes + high-risk human-review.
    compliance_notes = list(preset.compliance_warnings)
    for note in strategy.risk_notes:
        if note not in compliance_notes:
            compliance_notes.append(note)
    if req.profile.restricted_claims:
        compliance_notes.append("Never make restricted claims: " + ", ".join(req.profile.restricted_claims) + ".")

    approval_status = CampaignStatus.NEEDS_REVIEW
    if preset.high_risk:
        hr_note = "High-risk industry — human review REQUIRED before publishing."
        if hr_note not in compliance_notes:
            compliance_notes.append(hr_note)

    name = f"{req.profile.business_name or preset.display_name} — {campaign_type.value.replace('_', ' ').title()} ({req.duration_days}d)"

    campaign = Campaign(
        tenant_id=req.tenant_id,
        name=name,
        goal=strategy.campaign_goal or req.goal,
        campaign_type=campaign_type,
        audience=audience,
        platforms=platforms,
        formats=formats,
        messaging_angle=messaging_angle,
        hooks=list(strategy.creative_angles),
        cta=cta,
        schedule=schedule,
        required_assets=required_assets,
        approval_status=approval_status,
        start_date=start.isoformat(),
        end_date=end.isoformat(),
        kpi_targets=dict(_KPI_DEFAULTS.get(campaign_type, _KPI_DEFAULTS[CampaignType.BRAND_AWARENESS])),
        risks=list(strategy.risk_notes),
        compliance_notes=compliance_notes,
        follow_up=_FOLLOW_UP,
    )
    return campaign
