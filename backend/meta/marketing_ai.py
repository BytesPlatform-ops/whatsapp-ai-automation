"""Marketing AI — the strategist layer (AI-with-fallback).

Pixie thinks like a senior marketer here. When an AI provider is configured it is
used for real strategic reasoning (bounded by a timeout); when it is unavailable,
too slow, or returns nothing, a deterministic heuristic fallback runs so the
product NEVER blanks or errors just because data or a provider is missing.

`ai_generate` is the single seam every strategic generator uses. It returns
`(data, provider)` where provider is "ai" (real model output) or "heuristic"
(fell back). Callers always have a usable result.

This module owns the rich Brand Brain (Part 2). Ideas / calendar / trend mapping
build on the same seam in later groups.
"""

from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone

from models import ModelRequest, get_router
from schemas import ModelTier

from .kv_store import KVDict

AGENT_SLUG = "marketing-agent"
_BRAIN = KVDict("meta_marketing_brain")


async def ai_generate(system: str, user: str, tenant_id: str, task: str,
                      tier: ModelTier = ModelTier.LARGE, timeout: float = 28.0) -> tuple[dict, str]:
    """Best-effort strategic generation. Returns ({}, 'heuristic') on any failure,
    empty output, timeout, or when no real provider is configured."""
    router = get_router()
    try:
        result = await asyncio.wait_for(router.complete(ModelRequest(
            tier=tier, task=task, system=system, user=user, expects_json=True,
            context={"tenant_id": tenant_id, "agent": AGENT_SLUG})), timeout)
        data = json.loads(result.text) if result.text else {}
        if isinstance(data, dict) and data:
            return data, ("ai" if router.mode == "openai" else "heuristic")
    except Exception:
        pass
    return {}, "heuristic"


def provider_configured() -> bool:
    """True when a real (non-fake) model provider is wired up."""
    try:
        return get_router().mode == "openai"
    except Exception:
        return False


# ── Rich Brand Brain ──────────────────────────────────────────────────────────

_BRAND_SYSTEM = """
You are Pixie, a senior marketing manager taking over a small business's marketing.
From the brief and data provided, produce a sharp, specific Brand Brain — the kind
a real marketer would write, never generic filler. Use the business's own words,
offers, and audience problems. Ground angles in the data given.

Return JSON only, no markdown, with EXACTLY these keys:
{
  "business_summary": "2-3 sentences",
  "product_service_summary": "what they sell, specifically",
  "ideal_customer_profile": "who to target",
  "audience_pain_points": ["..."],
  "buyer_motivations": ["..."],
  "brand_tone": "one line",
  "content_pillars": ["3-6 pillars"],
  "offer_angles": ["specific promotional angles"],
  "trust_building_angles": ["ways to build credibility"],
  "lead_generation_angles": ["ways to capture leads"],
  "local_awareness_angles": ["local visibility angles"],
  "retargeting_angles": ["warm-audience angles"],
  "objection_handling": ["top objections + how to answer them"],
  "best_cta_style": "one line"
}
""".strip()


def _l(v, default):
    return v if isinstance(v, list) and v else default


def _starter_brand_brain(context: dict) -> dict:
    """Deterministic brand brain from the business profile + light inference.
    Used when no AI provider ran (or it failed). Honest, useful, non-generic where
    the client gave answers; clearly a starter when they didn't."""
    p = context.get("profile", {})
    sells = p.get("sells") or "your products and services"
    offer = p.get("main_offer") or p.get("promote_first") or sells
    diff = p.get("differentiator")
    problems = p.get("audience_problems")
    locations = p.get("locations")
    ideal = p.get("ideal_customer") or "your ideal local customer"
    tone = p.get("tone") or "Friendly, clear and helpful"

    pains = [problems] if problems else [f"Finding a trustworthy provider for {sells}",
                                         "Not knowing what they're really paying for"]
    return {
        "business_summary": f"A business that sells {sells}." + (f" What sets it apart: {diff}." if diff else ""),
        "product_service_summary": f"Primary offer: {offer}.",
        "ideal_customer_profile": ideal,
        "audience_pain_points": pains,
        "buyer_motivations": ["Trust and proof it works", "Convenience", "Value for money"],
        "brand_tone": tone,
        "content_pillars": ["Education", "Proof & trust", "Offers", "Behind the scenes", "Community"],
        "offer_angles": [f"Highlight the outcome of {offer}", "Limited-time / seasonal offer"],
        "trust_building_angles": ["Share real customer results", "Show your process and people"],
        "lead_generation_angles": ["Free quote / consultation hook", "Lead magnet answering a top question"],
        "local_awareness_angles": ([f"Reach people near {locations}"] if locations else ["Introduce the business to the local area"]),
        "retargeting_angles": [f"Re-engage people who considered {offer} but didn't act"],
        "objection_handling": [f"Address the top concern about {sells} directly in content"],
        "best_cta_style": "A light, specific CTA that invites a reply or a booking.",
    }


def _confidence(context: dict, provider: str) -> str:
    score = 0
    if context.get("profile"):
        score += min(len(context["profile"]), 6)
    if context.get("post_count", 0) > 0:
        score += 3
    if context.get("campaigns"):
        score += 2
    if context.get("inbox_themes"):
        score += 1
    if provider == "ai":
        score += 2
    return "high" if score >= 8 else "medium" if score >= 4 else "low"


def _sources(context: dict, provider: str) -> list[str]:
    used = []
    if context.get("profile"):
        used.append("business_profile")
    if context.get("post_count", 0) > 0:
        used.append("old_posts")
    if context.get("campaigns"):
        used.append("campaigns")
    if context.get("inbox_themes"):
        used.append("inbox")
    used.append("ai_reasoning" if provider == "ai" else "industry_presets")
    return used


async def generate_brand_brain(tenant_id: str, context: dict) -> dict:
    """Build (and persist) the rich Brand Brain from all available sources with
    AI reasoning, falling back to a deterministic starter. Never raises."""
    user = json.dumps({
        "business_profile": context.get("profile", {}),
        "recent_posts": {"count": context.get("post_count", 0),
                         "top": context.get("top_posts", []), "weak": context.get("weak_posts", []),
                         "types": context.get("post_types", {})},
        "campaigns": context.get("campaigns", []),
        "ads": context.get("insights", {}),
        "inbox_themes": context.get("inbox_themes", []),
        "assets": {"has_page": context.get("has_page"), "has_instagram": context.get("has_instagram")},
    }, ensure_ascii=False)[:6000]

    data, provider = await ai_generate(_BRAND_SYSTEM, user, tenant_id, task="brand_brain")
    if not data:
        data = _starter_brand_brain(context)

    # Guarantee every documented field exists (merge AI over the starter shape).
    starter = _starter_brand_brain(context)
    brain = {k: (data.get(k) if data.get(k) not in (None, "", []) else starter.get(k)) for k in starter}

    brain["missing_data_questions"] = [m["question"] for m in context.get("profile_missing", [])][:6]
    brain["confidence_level"] = _confidence(context, provider)
    brain["data_sources_used"] = _sources(context, provider)
    brain["provider"] = provider
    brain["data_source"] = ("ai" if provider == "ai"
                            else ("limited data" if context.get("post_count", 0) else "starter / limited data"))
    brain["generated_at"] = datetime.now(timezone.utc).isoformat()

    # Back-compat aliases so the existing brand-view UI keeps rendering while the
    # richer Part-2 fields above are available to newer surfaces.
    p = context.get("profile", {})
    brain["brand_summary"] = brain["business_summary"]
    brain["audience"] = brain["ideal_customer_profile"]
    brain["tone"] = brain["brand_tone"]
    brain["recommended_cta"] = brain["best_cta_style"]
    brain["ad_angles"] = brain.get("offer_angles") or []
    brain["strongest_themes"] = brain.get("content_pillars") or []
    brain["weak_patterns"] = []
    brain["posting_suggestions"] = brain.get("posting_suggestions") or []
    brain["services"] = [s for s in (p.get("promote_first"), p.get("sells")) if s]
    brain["missing_data_warnings"] = brain["missing_data_questions"]
    brain["stats"] = context.get("stats", {})

    _BRAIN.set(tenant_id, brain)
    return brain


def get_brand_brain(tenant_id: str) -> dict | None:
    return _BRAIN.get(tenant_id)
