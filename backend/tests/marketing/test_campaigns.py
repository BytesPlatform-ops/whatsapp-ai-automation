"""Tests for the campaign planner + store. No pytest required: plain ``test_*``
functions that wrap ``asyncio.run(...)`` so they can be called directly.

Run (fake mode, $0):
    PIXIE_MODEL_MODE=fake .venv/bin/python -c \
      "from tests.marketing import test_campaigns as t; \
       [f() for n,f in vars(t).items() if n.startswith('test_')]; print('campaigns OK')"
"""

from __future__ import annotations

import asyncio

from marketing.campaigns import (
    Campaign,
    CampaignPlanRequest,
    CampaignStatus,
    CampaignType,
    get_campaign_repository,
    plan_campaign,
)
from marketing.schemas import Industry, MarketingProfile, Platform


def _profile(tenant: str, industry: Industry, name: str = "Acme") -> MarketingProfile:
    return MarketingProfile(
        tenant_id=tenant,
        business_name=name,
        industry=industry,
        target_audience="busy locals",
        usp="fast, friendly service",
        brand_tone="warm and clear",
        primary_cta="Book now",
        location="Austin",
    )


def test_plan_campaign_produces_schedule_spanning_duration() -> None:
    req = CampaignPlanRequest(
        tenant_id="t1",
        profile=_profile("t1", Industry.BEAUTY_SALON),
        goal="Fill mid-week appointment slots",
        duration_days=14,
    )
    campaign = asyncio.run(plan_campaign(req))

    assert isinstance(campaign, Campaign)
    assert len(campaign.schedule) == 14, f"expected 14 scheduled days, got {len(campaign.schedule)}"
    # Each item has the required keys.
    for item in campaign.schedule:
        assert {"day", "platform", "format", "topic"} <= set(item.keys())
    assert campaign.platforms, "platforms must not be empty"
    assert campaign.kpi_targets, "kpi_targets must not be empty"
    # use_enum_values=True → stored as the string value.
    assert campaign.approval_status == CampaignStatus.NEEDS_REVIEW.value


def test_high_risk_industry_needs_review_with_compliance_note() -> None:
    req = CampaignPlanRequest(
        tenant_id="t2",
        profile=_profile("t2", Industry.DENTAL_CLINIC),  # high_risk
        goal="Get more new-patient bookings",
        duration_days=7,
    )
    campaign = asyncio.run(plan_campaign(req))

    assert campaign.approval_status == CampaignStatus.NEEDS_REVIEW.value
    assert campaign.compliance_notes, "high-risk industry must carry compliance notes"
    joined = " ".join(campaign.compliance_notes).lower()
    assert "human review" in joined, "expected a human-review compliance note for high-risk industry"


def test_explicit_campaign_type_and_platform_focus_respected() -> None:
    req = CampaignPlanRequest(
        tenant_id="t3",
        profile=_profile("t3", Industry.RESTAURANT_CAFE),
        goal="Launch the new brunch menu",
        campaign_type=CampaignType.PRODUCT_LAUNCH,
        platform_focus=[Platform.INSTAGRAM, Platform.TIKTOK],
        duration_days=10,
    )
    campaign = asyncio.run(plan_campaign(req))
    assert campaign.campaign_type == CampaignType.PRODUCT_LAUNCH.value
    assert set(campaign.platforms) == {Platform.INSTAGRAM.value, Platform.TIKTOK.value}
    assert len(campaign.schedule) == 10


def test_store_is_tenant_isolated() -> None:
    repo = get_campaign_repository()
    req = CampaignPlanRequest(
        tenant_id="owner",
        profile=_profile("owner", Industry.FITNESS_GYM),
        goal="Grow membership",
        duration_days=5,
    )
    campaign = asyncio.run(plan_campaign(req))
    saved = repo.save_campaign(campaign)
    assert saved.id is not None

    # Same tenant can read it back.
    assert repo.get_campaign("owner", saved.id) is not None
    # Cross-tenant read is indistinguishable from "not found".
    assert repo.get_campaign("intruder", saved.id) is None
    # list is tenant-scoped.
    assert all(c.tenant_id == "owner" for c in repo.list_campaigns("owner"))
    assert repo.list_campaigns("intruder") == []


if __name__ == "__main__":
    for _name, _fn in list(vars().items()):
        if _name.startswith("test_") and callable(_fn):
            _fn()
    print("campaigns OK")
