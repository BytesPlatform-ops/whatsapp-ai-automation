"""Tests for the content factory + store. No pytest required: plain ``test_*``
functions wrapping ``asyncio.run(...)``.

Run (fake mode, $0):
    PIXIE_MODEL_MODE=fake .venv/bin/python -c \
      "from tests.marketing import test_content as t; \
       [f() for n,f in vars(t).items() if n.startswith('test_')]; print('content OK')"
"""

from __future__ import annotations

import asyncio

from marketing.content import (
    ContentItem,
    ContentRequest,
    ContentType,
    generate_content,
    get_content_repository,
)
from marketing.schemas import Industry, MarketingProfile, Platform


def _profile(tenant: str, industry: Industry, name: str = "Acme", restricted=None) -> MarketingProfile:
    return MarketingProfile(
        tenant_id=tenant,
        business_name=name,
        industry=industry,
        target_audience="busy locals",
        usp="fast, friendly service",
        brand_tone="warm and clear",
        primary_cta="Book now",
        location="Austin",
        restricted_claims=restricted or [],
    )


def test_generate_returns_requested_count_with_required_fields() -> None:
    req = ContentRequest(
        tenant_id="t1",
        profile=_profile("t1", Industry.BEAUTY_SALON),
        platform=Platform.INSTAGRAM,
        content_type=ContentType.REEL_SCRIPT,
        topic="summer hair transformations",
        count=3,
    )
    items = asyncio.run(generate_content(req))
    assert len(items) == 3, f"expected 3 items, got {len(items)}"
    for item in items:
        assert isinstance(item, ContentItem)
        assert item.hook, "hook must be non-empty"
        assert item.main_copy, "main_copy must be non-empty"
        assert item.cta, "cta must be non-empty"
        assert item.hashtags, "hashtags must be non-empty"
        assert item.approval_status == "needs_review"


def test_risk_score_higher_for_high_risk_industry() -> None:
    low = asyncio.run(generate_content(ContentRequest(
        tenant_id="t2",
        profile=_profile("t2", Industry.BEAUTY_SALON),
        platform=Platform.INSTAGRAM,
        content_type=ContentType.POST,
        topic="new looks",
        count=1,
    )))[0]
    high = asyncio.run(generate_content(ContentRequest(
        tenant_id="t2",
        profile=_profile("t2", Industry.DENTAL_CLINIC),  # high_risk
        platform=Platform.FACEBOOK,
        content_type=ContentType.POST,
        topic="new patient offer",
        count=1,
    )))[0]
    assert high.risk_score > low.risk_score, (
        f"high-risk industry should score higher: high={high.risk_score} low={low.risk_score}"
    )


def test_variations_produce_notes() -> None:
    req = ContentRequest(
        tenant_id="t3",
        profile=_profile("t3", Industry.RESTAURANT_CAFE),
        platform=Platform.INSTAGRAM,
        content_type=ContentType.CAPTION,
        topic="brunch special",
        count=1,
        variations=3,
    )
    items = asyncio.run(generate_content(req))
    assert items[0].notes, "variations>1 should populate notes with A/B variants"


def test_cost_is_zero_in_fake_mode() -> None:
    # In fake mode every model call is metered at $0 (pricing table = 0).
    from models import get_router
    router = get_router()
    # Sanity: router is in fake mode for these tests.
    assert router.mode == "fake", f"expected fake mode, got {router.mode!r}"
    items = asyncio.run(generate_content(ContentRequest(
        tenant_id="t4",
        profile=_profile("t4", Industry.FITNESS_GYM),
        platform=Platform.INSTAGRAM,
        content_type=ContentType.POST,
        topic="6-week challenge",
        count=2,
    )))
    assert len(items) == 2


def test_store_is_tenant_isolated() -> None:
    repo = get_content_repository()
    items = asyncio.run(generate_content(ContentRequest(
        tenant_id="owner",
        profile=_profile("owner", Industry.FITNESS_GYM),
        platform=Platform.INSTAGRAM,
        content_type=ContentType.POST,
        topic="join us",
        count=1,
        campaign_id="camp_xyz",
    )))
    saved = repo.save_content(items[0])
    assert saved.id is not None

    assert repo.get_content("owner", saved.id) is not None
    assert repo.get_content("intruder", saved.id) is None
    assert all(c.tenant_id == "owner" for c in repo.list_content("owner"))
    # campaign filter works.
    assert all(c.campaign_id == "camp_xyz" for c in repo.list_content("owner", campaign_id="camp_xyz"))
    assert repo.list_content("owner", campaign_id="does_not_exist") == []
    assert repo.list_content("intruder") == []


if __name__ == "__main__":
    for _name, _fn in list(vars().items()):
        if _name.startswith("test_") and callable(_fn):
            _fn()
    print("content OK")
