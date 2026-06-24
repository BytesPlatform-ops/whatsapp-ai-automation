"""Brain — turn a business profile + a goal into the structured strategy contract.

Flow:
1. Read the profile and the matching industry preset (the priors).
2. Build a system + user prompt and ask the model layer for STRICT JSON.
3. Parse the model's JSON into ``BrainStrategy``; if anything is missing or the
   model returned nothing usable (e.g. ``fake`` mode), fill from a DETERMINISTIC
   synthesizer built from the profile + preset.

Why the synthesizer matters: it keeps the whole module functional and $0 in
``PIXIE_MODEL_MODE=fake`` and gives the real model a sane floor to beat. AI does
the reasoning; the synthesizer is plain, repetitive defaulting — no model call.

Tier routing honors the cheap-first rule: a real strategy is a LARGE-tier task; a
trivial ask (``ctx.simple``, e.g. a single caption) is routed to SMALL.
"""

from __future__ import annotations

import json
from dataclasses import dataclass

from models import ModelRequest, ModelResult, get_router
from schemas import ModelTier

from ..knowledge import IndustryPreset, get_preset
from ..schemas import BrainStrategy, MarketingContext

_TASK = "marketing_strategy"

_SYSTEM = """You are Pixie's marketing strategist. You reason about positioning, \
audience, creative angles and cadence for a specific business. You output ONLY a \
single JSON object, no prose, with EXACTLY these keys:
campaignGoal (string), targetAudience (string), platforms (string[]), \
contentPillars (string[]), creativeAngles (string[]), cta (string), \
assetsNeeded (string[]), recommendedCadence (string), riskNotes (string[]), \
nextActions (string[]).
Respect the business's restricted claims and compliance notes. Never promise \
guaranteed results. Keep it concrete and specific to this business."""


@dataclass
class BrainOutcome:
    """What the Brain returns: the strategy, the model metering, and whether the
    deterministic synthesizer had to fill in (true in fake mode / on bad output)."""

    strategy: BrainStrategy
    result: ModelResult | None
    used_fallback: bool

    @property
    def cost_usd(self) -> float:
        return self.result.cost_usd if self.result else 0.0

    @property
    def latency_ms(self) -> int:
        return self.result.latency_ms if self.result else 0


class Brain:
    def __init__(self, router=None) -> None:
        self._router = router or get_router()

    def _build_user_prompt(self, ctx: MarketingContext, preset: IndustryPreset) -> str:
        p = ctx.profile
        focus = [pl.value for pl in ctx.platform_focus] or [pl.value for pl in preset.platforms]
        lines = [
            f"GOAL: {ctx.goal}",
            "",
            "BUSINESS PROFILE:",
            f"- name: {p.business_name}",
            f"- industry: {p.industry.value} ({preset.display_name})",
            f"- type: {p.business_type or '-'}",
            f"- location: {p.location or '-'}",
            f"- audience: {p.target_audience or '-'}",
            f"- pain_points: {', '.join(p.pain_points) or '-'}",
            f"- products: {', '.join(p.products) or '-'}",
            f"- usp: {p.usp or '-'}",
            f"- brand_tone: {p.brand_tone or '-'}",
            f"- primary_cta: {p.primary_cta or '-'}",
            f"- funnel_stage: {p.funnel_stage.value}",
            f"- budget_range: {p.budget_range or '-'}",
            f"- restricted_claims: {', '.join(p.restricted_claims) or 'none'}",
            f"- compliance_notes: {p.compliance_notes or 'none'}",
            f"- language: {p.language}",
            "",
            "INDUSTRY PRIORS (use, don't blindly copy):",
            f"- pain_points: {', '.join(preset.pain_points)}",
            f"- best_campaign_types: {', '.join(preset.best_campaign_types)}",
            f"- content_pillars: {', '.join(preset.content_pillars)}",
            f"- common_offers: {', '.join(preset.common_offers)}",
            f"- suggested_platforms: {', '.join(focus)}",
            f"- compliance_warnings: {', '.join(preset.compliance_warnings) or 'none'}",
            f"- things_to_avoid: {', '.join(preset.things_to_avoid) or 'none'}",
        ]
        if ctx.past_performance:
            lines += ["", f"PAST PERFORMANCE: {ctx.past_performance}"]
        return "\n".join(lines)

    async def strategize(self, ctx: MarketingContext) -> BrainOutcome:
        preset = get_preset(ctx.profile.industry)
        tier = ModelTier.SMALL if ctx.simple else ModelTier.LARGE
        req = ModelRequest(
            tier=tier,
            task=_TASK,
            system=_SYSTEM,
            user=self._build_user_prompt(ctx, preset),
            expects_json=True,
            context={"tenant_id": ctx.tenant_id},
        )
        result = await self._router.complete(req)

        parsed = _parse_strategy(result.text)
        synth = _synthesize(ctx, preset)
        if parsed is None:
            return BrainOutcome(strategy=synth, result=result, used_fallback=True)

        # Merge: keep the model's content, backfill any empty field from the
        # deterministic synthesizer so the contract is never half-empty.
        merged, used_fallback = _merge(parsed, synth)
        return BrainOutcome(strategy=merged, result=result, used_fallback=used_fallback)


def _parse_strategy(text: str) -> BrainStrategy | None:
    """Parse model output into a BrainStrategy. Tolerant: returns None if the text
    isn't a usable JSON object (e.g. fake mode's ``{}``) so the caller can fall back."""
    text = (text or "").strip()
    if not text:
        return None
    try:
        data = json.loads(text)
    except (json.JSONDecodeError, ValueError):
        return None
    if not isinstance(data, dict) or not data:
        return None
    try:
        return BrainStrategy.model_validate(data)
    except Exception:
        return None


_LIST_FIELDS = ("platforms", "content_pillars", "creative_angles", "assets_needed", "risk_notes", "next_actions")
_STR_FIELDS = ("campaign_goal", "target_audience", "cta", "recommended_cadence")


def _merge(primary: BrainStrategy, fallback: BrainStrategy) -> tuple[BrainStrategy, bool]:
    """Backfill empty fields of ``primary`` from ``fallback``. Returns (merged,
    used_fallback) where used_fallback is True if any field had to be filled."""
    used = False
    data = primary.model_dump()
    fb = fallback.model_dump()
    for f in _STR_FIELDS:
        if not data.get(f):
            data[f] = fb[f]
            used = True
    for f in _LIST_FIELDS:
        if not data.get(f):
            data[f] = fb[f]
            used = True
    return BrainStrategy.model_validate(data), used


def _synthesize(ctx: MarketingContext, preset: IndustryPreset) -> BrainStrategy:
    """Deterministic strategy from profile + preset. NO model call — this is the
    repetitive-defaulting floor, not reasoning."""
    p = ctx.profile
    platforms = [pl.value for pl in (ctx.platform_focus or p.platforms_used or preset.platforms)]
    audience = p.target_audience or (f"{preset.display_name} customers" + (f" in {p.location}" if p.location else ""))
    cta = p.primary_cta or (preset.cta_examples[0] if preset.cta_examples else "Message us")

    risks = list(preset.compliance_warnings)
    if preset.high_risk:
        risks.append("High-risk industry — requires human review before publishing.")
    if p.restricted_claims:
        risks.append("Avoid restricted claims: " + ", ".join(p.restricted_claims) + ".")

    return BrainStrategy(
        campaign_goal=ctx.goal.strip() or f"Grow {p.business_name} via {preset.best_campaign_types[0] if preset.best_campaign_types else 'awareness'}.",
        target_audience=audience,
        platforms=platforms,
        content_pillars=list(preset.content_pillars),
        creative_angles=list(preset.best_campaign_types[:4]),
        cta=cta,
        assets_needed=list(preset.content_formats[:5]),
        recommended_cadence="3-5 posts/week across primary platforms; 1 offer/CTA post weekly.",
        risk_notes=risks,
        next_actions=[
            "Confirm the offer and CTA with the business.",
            "Draft the first batch of content for approval.",
            "Set the posting calendar for the chosen platforms.",
        ],
    )


_brain: Brain | None = None


def get_brain() -> Brain:
    global _brain
    if _brain is None:
        _brain = Brain()
    return _brain
