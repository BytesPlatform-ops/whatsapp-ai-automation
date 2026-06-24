"""Wave 1 smoke — prove the marketing foundation works at $0 (fake mode).

Covers: the 20 industry presets load and are well-formed; the profile repository
is tenant-isolated; and the Brain produces the EXACT structured contract from a
profile + goal, with the deterministic synthesizer keeping it functional in fake
mode. No network, no DB, no spend.
"""

from __future__ import annotations

import asyncio

from marketing.brain import get_brain
from marketing.knowledge import get_preset, list_presets
from marketing.profile import get_profile_repository
from marketing.schemas import (
    BrainStrategy,
    Industry,
    MarketingContext,
    MarketingProfile,
    Platform,
)

CONTRACT_KEYS = {
    "campaignGoal", "targetAudience", "platforms", "contentPillars", "creativeAngles",
    "cta", "assetsNeeded", "recommendedCadence", "riskNotes", "nextActions",
}


def test_all_20_industries_have_presets():
    presets = list_presets()
    # 20 seeded industries + GENERIC fallback.
    assert len(presets) == len(Industry)
    for ind in Industry:
        p = get_preset(ind)
        assert p.industry == ind
        assert p.display_name
        assert p.pain_points and p.content_pillars and p.cta_examples


def test_high_risk_industries_flagged():
    high = {p.industry for p in list_presets() if p.high_risk}
    assert {Industry.MEDICAL_CLINIC, Industry.DENTAL_CLINIC, Industry.LAW_FIRM,
            Industry.INSURANCE, Industry.ACCOUNTING_TAX, Industry.REAL_ESTATE} <= high


def test_get_preset_falls_back_to_generic():
    assert get_preset("not_a_real_industry").industry == Industry.GENERIC


def test_profile_repository_is_tenant_isolated():
    repo = get_profile_repository()
    a = repo.save_profile(MarketingProfile(tenant_id="t_a", business_name="Glow Salon", industry=Industry.BEAUTY_SALON))
    assert a.id
    # same tenant + name → stable id (upsert, not duplicate)
    a2 = repo.save_profile(MarketingProfile(tenant_id="t_a", business_name="Glow Salon", industry=Industry.BEAUTY_SALON))
    assert a2.id == a.id
    # other tenant can't read it
    assert repo.get_profile("t_b", a.id) is None
    assert repo.get_profile("t_a", a.id) is not None


def test_brain_produces_exact_contract():
    profile = MarketingProfile(
        tenant_id="t_test",
        business_name="Bliss Bridal Salon",
        industry=Industry.BEAUTY_SALON,
        location="Lahore",
        target_audience="brides-to-be, 22-35",
        usp="award-winning bridal styling",
        primary_cta="DM to book your bridal trial",
        platforms_used=[Platform.INSTAGRAM, Platform.TIKTOK],
    )
    ctx = MarketingContext(tenant_id="t_test", profile=profile,
                           goal="2-week bridal booking campaign")
    outcome = asyncio.run(get_brain().strategize(ctx))

    assert isinstance(outcome.strategy, BrainStrategy)
    contract = outcome.strategy.to_contract()
    # exact contract keys, nothing more, nothing less
    assert set(contract.keys()) == CONTRACT_KEYS
    # the synthesizer fills it in fake mode → no empty contract
    assert contract["campaignGoal"]
    assert contract["targetAudience"]
    assert contract["platforms"]
    assert contract["cta"]
    assert contract["nextActions"]
    # fake mode costs nothing
    assert outcome.cost_usd == 0.0
    assert outcome.used_fallback is True
