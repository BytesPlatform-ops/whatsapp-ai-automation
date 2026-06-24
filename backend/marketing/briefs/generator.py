"""Creative-brief generator — AI creative direction with a deterministic floor.

``generate_brief`` asks the model layer (task="marketing_brief") for the creative
direction (visual concept, scene direction, mood, voiceover, on-screen text…) and
parses its JSON. In ``PIXIE_MODEL_MODE=fake`` (or on any empty/unparseable
output) it DETERMINISTICALLY synthesizes a sensible brief from the profile + the
industry preset + the video format — so the module is always functional and $0.

The structural fields are ALWAYS deterministic regardless of the model:
``aspect_ratio`` and the default ``duration_seconds`` from the platform,
``editing_pace`` from the format, and the ``asset_checklist``. The model only
provides creative *direction*; it never decides the spec.

Mirrors the brain's pattern (``marketing/brain/brain.py``): build the prompt with
``marketing.prompts.templates.build_creative_brief_prompt`` (same cluster), call
the router, parse, then merge over a deterministic synthesizer.
"""

from __future__ import annotations

import hashlib
import json

from models import ModelRequest, get_router
from schemas import ModelTier

from ..knowledge import get_preset
from ..prompts.templates import build_creative_brief_prompt
from .schemas import BriefRequest, CreativeBrief, PixieVideoFormat

_TASK = "marketing_brief"

# ── deterministic spec tables ────────────────────────────────────────────────
# Aspect ratio by platform. Vertical 9:16 is the short-form default; the few
# platforms that differ are listed explicitly.
_ASPECT_BY_PLATFORM: dict[str, str] = {
    "instagram": "9:16",
    "tiktok": "9:16",
    "youtube_shorts": "9:16",
    "facebook": "9:16",
    "snapchat": "9:16",
    "threads": "9:16",
    "x": "16:9",
    "linkedin": "1:1",
    "pinterest": "2:3",
    "reddit": "16:9",
}
_DEFAULT_ASPECT = "9:16"

# Default duration (seconds) by platform.
_DURATION_BY_PLATFORM: dict[str, int] = {
    "instagram": 30,
    "tiktok": 27,
    "youtube_shorts": 45,
    "facebook": 30,
    "snapchat": 20,
    "pinterest": 15,
    "linkedin": 40,
    "x": 30,
}
_DEFAULT_DURATION = 30

# Editing pace by video format.
_PACE_BY_FORMAT: dict[PixieVideoFormat, str] = {
    PixieVideoFormat.AI_ROBOT_PROMO: "snappy, beat-synced cuts",
    PixieVideoFormat.PROBLEM_SOLUTION_REEL: "fast cut on the problem, slow on the payoff",
    PixieVideoFormat.FOUNDER_CONTENT: "relaxed, talking-head with light B-roll cutaways",
    PixieVideoFormat.UGC_SCRIPT: "handheld, natural, jump-cuts",
    PixieVideoFormat.EXPLAINER: "steady, one idea per beat",
    PixieVideoFormat.MEME_BRAINROT: "hyper-fast, chaotic, meme-paced",
    PixieVideoFormat.CINEMATIC_LAUNCH_TEASER: "slow, cinematic, dramatic holds",
    PixieVideoFormat.SOFT_LAUNCH: "calm, intriguing, unhurried reveal",
    PixieVideoFormat.INDUSTRY_AD: "clean, professional, purposeful cuts",
}
_DEFAULT_PACE = "medium, platform-native cutting"


def _aspect_for(platform: str) -> str:
    return _ASPECT_BY_PLATFORM.get(platform, _DEFAULT_ASPECT)


def _duration_for(platform: str, requested: int | None) -> int:
    if requested and requested > 0:
        return int(requested)
    return _DURATION_BY_PLATFORM.get(platform, _DEFAULT_DURATION)


def _pace_for(fmt: PixieVideoFormat) -> str:
    return _PACE_BY_FORMAT.get(fmt, _DEFAULT_PACE)


def _brief_id(req: BriefRequest) -> str:
    raw = "|".join([req.tenant_id, req.platform.value, req.video_format.value, req.topic_or_concept])
    return "brief_" + hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]


def _asset_checklist(req: BriefRequest, fmt: PixieVideoFormat) -> list[str]:
    """Deterministic shot/asset checklist from format + profile. No model call."""
    p = req.profile
    items = [
        "Hook frame (first 1-2 seconds)",
        "Main scene footage / generations",
        "On-screen text overlays",
        "Voiceover / audio track",
        "Background music (licensed)",
        "Brand CTA end-card",
        f"Logo / brand mark for {p.business_name}",
    ]
    if p.primary_cta:
        items.append(f"CTA graphic: '{p.primary_cta}'")
    fmt_extras: dict[PixieVideoFormat, list[str]] = {
        PixieVideoFormat.AI_ROBOT_PROMO: ["AI robot character / avatar asset"],
        PixieVideoFormat.PROBLEM_SOLUTION_REEL: ["Before/after or problem b-roll", "Solution demo footage"],
        PixieVideoFormat.FOUNDER_CONTENT: ["Founder talking-head footage", "Office/workspace B-roll"],
        PixieVideoFormat.UGC_SCRIPT: ["UGC creator / actor", "Authentic handheld phone footage"],
        PixieVideoFormat.EXPLAINER: ["Diagram / motion-graphic explainers"],
        PixieVideoFormat.MEME_BRAINROT: ["Meme clips / reaction footage", "Caption stickers"],
        PixieVideoFormat.CINEMATIC_LAUNCH_TEASER: ["Cinematic hero shots", "Title reveal animation"],
        PixieVideoFormat.SOFT_LAUNCH: ["Teaser hero shot", "Coming-soon title card"],
        PixieVideoFormat.INDUSTRY_AD: ["Product/service hero shots", "Testimonial or proof element"],
    }
    items += fmt_extras.get(fmt, [])
    return items


def _synthesize(req: BriefRequest) -> CreativeBrief:
    """Deterministic brief from profile + preset + format. NO model call."""
    p = req.profile
    preset = get_preset(p.industry)
    fmt = req.video_format
    platform = req.platform.value
    concept = req.topic_or_concept or f"{p.business_name} — {fmt.value.replace('_', ' ')}"
    cta = p.primary_cta or (preset.cta_examples[0] if preset.cta_examples else "Message us")
    audience = p.target_audience or f"{preset.display_name} customers"
    pain = (p.pain_points or preset.pain_points or ["the problem you solve"])[0]
    hook = req.hook_hint or f"Struggling with {pain}? Watch this."

    visual_concept = (
        f"A {fmt.value.replace('_', ' ')} for {p.business_name} ({preset.display_name}) "
        f"aimed at {audience}. Concept: {concept}."
    )
    scene_direction = [
        f"Beat 1 — Hook: {hook}",
        f"Beat 2 — Tension: show the pain '{pain}' the audience feels.",
        f"Beat 3 — Solution: how {p.business_name} fixes it" + (f" ({p.usp})" if p.usp else "") + ".",
        f"Beat 4 — Proof / payoff: the result or transformation.",
        f"Beat 5 — CTA: '{cta}'.",
    ]
    on_screen_text = [hook, p.usp or f"{p.business_name}", cta]
    voiceover = (
        f"{hook} Here's how {p.business_name} helps {audience} "
        f"{('— ' + p.usp) if p.usp else 'get results'}. {cta}."
    )

    return CreativeBrief(
        id=_brief_id(req),
        tenant_id=req.tenant_id,
        content_ref_id=req.content_ref_id,
        platform=platform,
        video_format=fmt.value,
        visual_concept=visual_concept,
        scene_direction=scene_direction,
        camera="Vertical handheld with subtle motion; lock off on the CTA card."
        if _aspect_for(platform) == "9:16"
        else "Stable framing matched to the platform aspect ratio.",
        mood=p.brand_tone or "confident, upbeat, trustworthy",
        lighting="Bright, clean, high-key" if fmt != PixieVideoFormat.CINEMATIC_LAUNCH_TEASER else "Moody, cinematic, directional",
        colors=["brand primary", "brand accent", "neutral background"],
        characters=["founder / presenter"] if fmt == PixieVideoFormat.FOUNDER_CONTENT else ["on-camera talent / creator"],
        props=list(p.products[:3]) or ["product/service hero item"],
        background=p.location or "on-brand set or clean studio backdrop",
        on_screen_text=on_screen_text,
        voiceover=voiceover,
        music="Trending, upbeat, license-cleared track matched to the cut",
        editing_pace=_pace_for(fmt),
        aspect_ratio=_aspect_for(platform),
        duration_seconds=_duration_for(platform, req.duration_seconds),
        hook_frame=hook,
        ending_frame=f"{p.business_name} logo + tagline" + (f": {p.usp}" if p.usp else ""),
        cta_frame=cta,
        asset_checklist=_asset_checklist(req, fmt),
    )


_CREATIVE_STR_FIELDS = ("visual_concept", "camera", "mood", "lighting", "background", "voiceover", "music", "hook_frame", "ending_frame", "cta_frame")
_CREATIVE_LIST_FIELDS = ("scene_direction", "colors", "characters", "props", "on_screen_text")


def _parse_direction(text: str) -> dict | None:
    """Parse the model's creative-direction JSON. Returns None on empty/garbage."""
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


async def generate_brief(req: BriefRequest) -> CreativeBrief:
    """Generate a creative brief: AI direction over a deterministic floor.

    The spec fields (aspect_ratio, duration, editing_pace, asset_checklist) are
    always deterministic. The creative fields come from the model when it returns
    usable JSON, otherwise from the synthesizer. Always returns a complete brief.
    """
    synth = _synthesize(req)
    preset = get_preset(req.profile.industry)

    system, user = build_creative_brief_prompt(
        req.profile,
        preset,
        platform=req.platform,
        video_format=req.video_format.value,
        concept=req.topic_or_concept,
        hook_hint=req.hook_hint or "",
        duration_seconds=req.duration_seconds,
    )
    result = await get_router().complete(
        ModelRequest(
            tier=ModelTier.LARGE,
            task=_TASK,
            system=system,
            user=user,
            expects_json=True,
            context={"tenant_id": req.tenant_id},
        )
    )

    direction = _parse_direction(result.text)
    if direction is None:
        return synth

    # Overlay the model's creative direction on the deterministic floor. Spec
    # fields stay deterministic; only creative direction is taken from the model.
    data = synth.model_dump()
    for f in _CREATIVE_STR_FIELDS:
        val = direction.get(f)
        if isinstance(val, str) and val.strip():
            data[f] = val.strip()
    for f in _CREATIVE_LIST_FIELDS:
        val = direction.get(f)
        if isinstance(val, list) and val:
            data[f] = [str(x) for x in val if str(x).strip()]
        elif isinstance(val, str) and val.strip():
            data[f] = [val.strip()]
    return CreativeBrief.model_validate(data)
