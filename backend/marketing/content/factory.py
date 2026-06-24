"""Content factory — AI writes the copy, deterministic code formats it.

Flow (mirrors ``marketing/brain/brain.py``'s AI-then-synthesize pattern):
1. Ask the model layer (task=``marketing_content``, strict JSON) for the creative
   copy (hook, main_copy, caption, script) reading profile + preset + topic.
2. If the model returns nothing usable (``fake`` mode returns ``"{}"`` for unknown
   tasks), DETERMINISTICALLY synthesize templated copy from profile + preset +
   topic — so fake mode produces real-looking items at $0.
3. A DETERMINISTIC formatting pass (NO model call) fills hashtags, cta, tone,
   target_audience, and a simple ``risk_score`` heuristic.

Produces ``count`` items. Each extra ``variations`` (beyond 1) appends an A/B
caption variant into ``notes`` — kept simple, no extra model call.
"""

from __future__ import annotations

import json

from models import ModelRequest, get_router
from schemas import ModelTier

from ..knowledge import IndustryPreset, get_preset
from ..schemas import MarketingProfile
from .schemas import ContentItem, ContentRequest, ContentType

_TASK = "marketing_content"

_SYSTEM = """You are Pixie's marketing copywriter. You write platform-native, \
on-brand creative for a specific business. You output ONLY a single JSON object, \
no prose, with EXACTLY these keys:
hook (string), mainCopy (string), caption (string), script (string), \
visualDirection (string).
Respect the brand tone and the business's restricted claims. Never promise \
guaranteed results. Be concrete and specific to this business."""


# Small per-platform / per-pillar hashtag bank. Deterministic, no model call.
_PLATFORM_TAGS: dict[str, list[str]] = {
    "instagram": ["#instagood", "#reels", "#explore"],
    "tiktok": ["#fyp", "#foryou", "#tiktokmademebuyit"],
    "facebook": ["#smallbusiness", "#local"],
    "youtube_shorts": ["#shorts", "#youtube"],
    "linkedin": ["#business", "#growth"],
    "x": ["#trending"],
    "threads": ["#threads"],
    "pinterest": ["#inspo", "#ideas"],
}

# Words that, if they appear in copy, suggest a risky/overclaiming statement.
_RESTRICTED_WORDS = (
    "guarantee", "guaranteed", "cure", "permanent", "100%", "risk-free",
    "miracle", "instant results", "no risk", "always works", "best in the world",
)


def _industry_tag(profile: MarketingProfile) -> str:
    base = (profile.industry.value or "business").replace("_", "")
    return "#" + base


def _build_user_prompt(req: ContentRequest, preset: IndustryPreset) -> str:
    p = req.profile
    lines = [
        f"PLATFORM: {req.platform.value}",
        f"CONTENT TYPE: {req.content_type.value}",
        f"TOPIC / HOOK HINT: {req.topic or '-'}",
        "",
        "BUSINESS PROFILE:",
        f"- name: {p.business_name}",
        f"- industry: {p.industry.value} ({preset.display_name})",
        f"- audience: {p.target_audience or '-'}",
        f"- usp: {p.usp or '-'}",
        f"- brand_tone: {p.brand_tone or '-'}",
        f"- primary_cta: {p.primary_cta or '-'}",
        f"- restricted_claims: {', '.join(p.restricted_claims) or 'none'}",
        "",
        "INDUSTRY PRIORS:",
        f"- pain_points: {', '.join(preset.pain_points)}",
        f"- content_pillars: {', '.join(preset.content_pillars)}",
        f"- cta_examples: {', '.join(preset.cta_examples)}",
        f"- compliance_warnings: {', '.join(preset.compliance_warnings) or 'none'}",
    ]
    return "\n".join(lines)


def _parse_copy(text: str) -> dict | None:
    """Parse model output into a copy dict. Returns None on unusable/empty output."""
    text = (text or "").strip()
    if not text:
        return None
    try:
        data = json.loads(text)
    except (json.JSONDecodeError, ValueError):
        return None
    if not isinstance(data, dict) or not data:
        return None
    return data


def _synthesize_copy(req: ContentRequest, preset: IndustryPreset, index: int) -> dict:
    """Deterministic templated copy from profile + preset + topic. NO model call."""
    p = req.profile
    # Each of N items takes a distinct content pillar as its angle, so a single
    # `count`/topic request yields varied (and separately persistable) items.
    pillars = preset.content_pillars or ["what we do"]
    angle = pillars[index % len(pillars)]
    subject = req.topic or angle
    name = p.business_name or preset.display_name
    audience = p.target_audience or f"{preset.display_name} customers"
    usp = p.usp or (preset.common_offers[0] if preset.common_offers else "great value")

    hook = f"{angle.capitalize()} — {subject}? Here's how {name} helps {audience}."
    main_copy = (
        f"At {name}, we focus on {angle} for {subject}. {usp}. "
        f"Built for {audience} who want results without the hassle."
    )
    caption = f"{hook} {usp}. {p.primary_cta or (preset.cta_examples[0] if preset.cta_examples else 'Message us')} 👇"
    script = (
        f"[HOOK] {hook}\n"
        f"[VALUE] {main_copy}\n"
        f"[CTA] {p.primary_cta or (preset.cta_examples[0] if preset.cta_examples else 'Message us today.')}"
    )
    visual = f"On-brand visuals for {name}: {subject} ({angle}) in action, {p.brand_tone or 'clean and approachable'} style."
    return {
        "hook": hook,
        "mainCopy": main_copy,
        "caption": caption,
        "script": script,
        "visualDirection": visual,
    }


def _hashtags(req: ContentRequest, preset: IndustryPreset) -> list[str]:
    tags = list(_PLATFORM_TAGS.get(req.platform.value, []))
    tags.append(_industry_tag(req.profile))
    if req.profile.location:
        loc = "#" + "".join(ch for ch in req.profile.location.lower() if ch.isalnum())
        if loc != "#":
            tags.append(loc)
    # de-dup, keep order
    return list(dict.fromkeys(tags))


def _risk_score(copy_text: str, preset: IndustryPreset, profile: MarketingProfile) -> int:
    score = 0
    if preset.high_risk:
        score += 40
    lowered = copy_text.lower()
    if any(word in lowered for word in _RESTRICTED_WORDS):
        score += 30
    for claim in profile.restricted_claims:
        if claim and claim.lower() in lowered:
            score += 30
    return min(score, 100)


def _alt_caption(base_caption: str, profile: MarketingProfile, preset: IndustryPreset, v: int) -> str:
    cta = profile.primary_cta or (preset.cta_examples[v % len(preset.cta_examples)]
                                  if preset.cta_examples else "Message us")
    return f"(variant {v + 1}) {base_caption.split(' 👇')[0]} — {cta} now."


async def generate_content(req: ContentRequest) -> list[ContentItem]:
    """Generate ``count`` content items. One model call per item (skipped/fallback in
    fake mode); a deterministic formatting pass fills the structural fields."""
    preset = get_preset(req.profile.industry)
    router = get_router()
    items: list[ContentItem] = []

    for index in range(req.count):
        request = ModelRequest(
            tier=ModelTier.LARGE,
            task=_TASK,
            system=_SYSTEM,
            user=_build_user_prompt(req, preset),
            expects_json=True,
            context={"tenant_id": req.tenant_id},
        )
        result = await router.complete(request)
        parsed = _parse_copy(result.text)
        copy = parsed if parsed else _synthesize_copy(req, preset, index)

        # Backfill any missing key from the synthesizer (model may return partial JSON).
        synth = _synthesize_copy(req, preset, index)
        for key in ("hook", "mainCopy", "caption", "script", "visualDirection"):
            if not copy.get(key):
                copy[key] = synth[key]

        # ── deterministic formatting pass (NO model call) ──
        cta = req.profile.primary_cta or (preset.cta_examples[0] if preset.cta_examples else "Message us")
        tone = req.profile.brand_tone or "clear and approachable"
        audience = req.profile.target_audience or f"{preset.display_name} customers"
        hashtags = _hashtags(req, preset)

        combined_text = " ".join([
            str(copy.get("hook", "")), str(copy.get("mainCopy", "")),
            str(copy.get("caption", "")), str(copy.get("script", "")),
        ])
        risk = _risk_score(combined_text, preset, req.profile)

        notes_parts: list[str] = []
        if req.variations > 1:
            for v in range(1, req.variations):
                notes_parts.append(_alt_caption(str(copy.get("caption", "")), req.profile, preset, v))

        item = ContentItem(
            tenant_id=req.tenant_id,
            platform=req.platform.value,
            content_type=req.content_type,
            campaign_id=req.campaign_id,
            hook=str(copy.get("hook", "")),
            main_copy=str(copy.get("mainCopy", "")),
            caption=str(copy.get("caption", "")),
            script=str(copy.get("script", "")),
            visual_direction=str(copy.get("visualDirection", "")),
            cta=cta,
            hashtags=hashtags,
            tone=tone,
            target_audience=audience,
            approval_status="needs_review",
            risk_score=risk,
            notes=" | ".join(notes_parts),
            version=1,
        )
        items.append(item)

    return items
