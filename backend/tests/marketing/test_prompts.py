"""Prompt-template smoke tests — pure, $0, no network.

Every builder must return a non-empty (system, user) tuple, and the user prompt
must weave in the business name, the industry, and a compliance/restricted-claims
line. Plain ``def test_*`` callables (pytest not installed) so they run directly.
"""

from __future__ import annotations

from marketing.knowledge import get_preset
from marketing.prompts import (
    build_brand_voice_prompt,
    build_campaign_prompt,
    build_compliance_review_prompt,
    build_content_prompt,
    build_creative_brief_prompt,
    build_industry_prompt,
    build_performance_analysis_prompt,
    build_platform_adaptation_prompt,
    build_repurposing_prompt,
    build_strategy_prompt,
)
from marketing.schemas import Industry, MarketingProfile, Platform

_BUSINESS = "Glow & Co Salon"


def _profile() -> MarketingProfile:
    return MarketingProfile(
        tenant_id="t_test",
        business_name=_BUSINESS,
        industry=Industry.BEAUTY_SALON,
        target_audience="local women 25-45 wanting bridal glam",
        usp="award-winning bridal stylists",
        primary_cta="Book your slot",
        restricted_claims=["guaranteed flawless skin"],
    )


def _assert_prompt(system: str, user: str) -> None:
    assert isinstance(system, str) and system.strip(), "system prompt empty"
    assert isinstance(user, str) and user.strip(), "user prompt empty"
    assert _BUSINESS in user, "business name missing from user prompt"
    assert "beauty_salon" in user, "industry missing from user prompt"
    # A compliance / restricted-claims line must always be woven in.
    low = user.lower()
    assert ("restricted_claims" in low) or ("compliance" in low), "no compliance/restricted line"


def test_strategy_prompt():
    p = _profile()
    s, u = build_strategy_prompt(p, get_preset(p.industry), goal="fill midweek chairs", platform_focus=[Platform.INSTAGRAM])
    _assert_prompt(s, u)


def test_campaign_prompt():
    p = _profile()
    s, u = build_campaign_prompt(p, get_preset(p.industry), goal="bridal season push")
    _assert_prompt(s, u)


def test_content_prompt():
    p = _profile()
    s, u = build_content_prompt(p, get_preset(p.industry), platform=Platform.TIKTOK)
    _assert_prompt(s, u)


def test_platform_adaptation_prompt():
    p = _profile()
    s, u = build_platform_adaptation_prompt(p, get_preset(p.industry), source_content="A long blog post", platform=Platform.INSTAGRAM)
    _assert_prompt(s, u)


def test_creative_brief_prompt():
    p = _profile()
    s, u = build_creative_brief_prompt(p, get_preset(p.industry), platform=Platform.TIKTOK, video_format="ugc_script", concept="bridal transformation")
    _assert_prompt(s, u)


def test_performance_analysis_prompt():
    p = _profile()
    s, u = build_performance_analysis_prompt(p, get_preset(p.industry), performance_data="reels: 10k views, 2% saves")
    _assert_prompt(s, u)


def test_industry_prompt():
    p = _profile()
    s, u = build_industry_prompt(p, get_preset(p.industry))
    _assert_prompt(s, u)


def test_brand_voice_prompt():
    p = _profile()
    s, u = build_brand_voice_prompt(p, get_preset(p.industry), sample_text="hey come visit")
    _assert_prompt(s, u)


def test_compliance_review_prompt():
    p = _profile()
    s, u = build_compliance_review_prompt(p, get_preset(p.industry), draft_content="guaranteed flawless skin in one visit!")
    _assert_prompt(s, u)


def test_repurposing_prompt():
    p = _profile()
    s, u = build_repurposing_prompt(p, get_preset(p.industry), source_content="our origin story", target_platforms=[Platform.INSTAGRAM, Platform.TIKTOK])
    _assert_prompt(s, u)
