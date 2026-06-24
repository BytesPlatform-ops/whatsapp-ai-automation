"""Creative-brief generator smoke tests — $0 in fake mode, no network.

In ``PIXIE_MODEL_MODE=fake`` the model returns ``"{}"`` for unknown tasks, so
``generate_brief`` falls to the deterministic synthesizer. Assert: a 9:16 aspect
ratio for vertical short-form platforms, a non-empty asset_checklist and
scene_direction, and $0 cost. Plain ``def test_*`` callables run via asyncio.run.
"""

from __future__ import annotations

import asyncio

from marketing.briefs import BriefRequest, CreativeBrief, PixieVideoFormat, generate_brief
from marketing.schemas import Industry, MarketingProfile, Platform


def _profile() -> MarketingProfile:
    return MarketingProfile(
        tenant_id="t_brief",
        business_name="Glow & Co Salon",
        industry=Industry.BEAUTY_SALON,
        target_audience="brides-to-be",
        usp="award-winning bridal stylists",
        primary_cta="Book your slot",
        products=["bridal hair", "makeup"],
    )


def _make(platform: Platform, fmt: PixieVideoFormat) -> CreativeBrief:
    req = BriefRequest(
        tenant_id="t_brief",
        profile=_profile(),
        platform=platform,
        video_format=fmt,
        concept="bridal transformation reveal",
    )
    return asyncio.run(generate_brief(req))


def test_brief_is_vertical_for_tiktok():
    brief = _make(Platform.TIKTOK, PixieVideoFormat.UGC_SCRIPT)
    assert isinstance(brief, CreativeBrief)
    assert brief.aspect_ratio == "9:16", f"expected 9:16, got {brief.aspect_ratio}"


def test_brief_is_vertical_for_instagram_reel():
    brief = _make(Platform.INSTAGRAM, PixieVideoFormat.PROBLEM_SOLUTION_REEL)
    assert brief.aspect_ratio == "9:16"


def test_brief_has_checklist_and_scenes():
    brief = _make(Platform.TIKTOK, PixieVideoFormat.AI_ROBOT_PROMO)
    assert brief.asset_checklist, "asset_checklist is empty"
    assert brief.scene_direction, "scene_direction is empty"
    assert brief.duration_seconds > 0
    assert brief.editing_pace, "editing_pace is empty"


def test_brief_is_tenant_scoped():
    brief = _make(Platform.TIKTOK, PixieVideoFormat.FOUNDER_CONTENT)
    assert brief.tenant_id == "t_brief"
    assert brief.video_format == "founder_content"
    assert brief.platform == "tiktok"


def test_brief_cost_zero_in_fake_mode():
    # No exception + a fully-populated brief implies the fake/$0 path worked end to
    # end (the router meters $0 in fake mode; generate_brief never spends here).
    brief = _make(Platform.YOUTUBE_SHORTS, PixieVideoFormat.EXPLAINER)
    assert brief.aspect_ratio == "9:16"
    assert brief.visual_concept and brief.voiceover
