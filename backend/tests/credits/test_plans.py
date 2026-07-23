"""Plan catalog + entitlement service — server-authoritative, advisory vs enforced."""

from __future__ import annotations

import pytest

from credits import plans, wallet, ledger
from credits.plans import UNLIMITED


@pytest.fixture(autouse=True)
def _clean(monkeypatch):
    monkeypatch.delenv("PIXIE_PERSIST", raising=False)
    monkeypatch.delenv("BILLING_ENFORCEMENT_ENABLED", raising=False)
    wallet.reset_wallet_repository()
    ledger.reset_ledger_repository()
    yield
    wallet.reset_wallet_repository()
    ledger.reset_ledger_repository()


def _set_plan(tenant, plan_id):
    wallet.get_wallet_repository().set_plan_period(tenant, plan_id=plan_id, period_start="", period_end="")


def test_unknown_or_empty_plan_falls_back_to_free():
    assert plans.get_plan("").id == "free"
    assert plans.get_plan("enterprise_unicorn").id == "free"


def test_resolve_plan_from_server_state_only():
    # no wallet → free
    assert plans.resolve_plan_id("ws_A") == "free"
    _set_plan("ws_A", "pro")
    assert plans.resolve_plan_id("ws_A") == "pro"


def test_free_plan_blocks_ai_influencer_when_enforced(monkeypatch):
    monkeypatch.setenv("BILLING_ENFORCEMENT_ENABLED", "true")
    r = plans.check_feature("ws_A", "ai_influencer")
    assert r["entitled"] is False and r["allowed"] is False
    assert r["reason"] == "feature_not_entitled" and r["plan_id"] == "free"


def test_feature_check_is_advisory_when_not_enforced(monkeypatch):
    monkeypatch.delenv("BILLING_ENFORCEMENT_ENABLED", raising=False)
    r = plans.check_feature("ws_A", "ai_influencer")
    assert r["entitled"] is False and r["allowed"] is True and r["enforced"] is False


def test_pro_plan_grants_live_publishing():
    _set_plan("ws_A", "pro")
    r = plans.check_feature("ws_A", "live_publishing")
    assert r["entitled"] is True and r["allowed"] is True


def test_limit_check_blocks_over_limit_when_enforced(monkeypatch):
    monkeypatch.setenv("BILLING_ENFORCEMENT_ENABLED", "true")
    # free plan: monthly_text_generations = 10
    within = plans.check_limit("ws_A", "monthly_text_generations", used=9)
    assert within["within_limit"] is True and within["remaining"] == 1
    over = plans.check_limit("ws_A", "monthly_text_generations", used=10)
    assert over["within_limit"] is False and over["allowed"] is False
    assert over["reason"] == "usage_limit_reached"


def test_unlimited_limit_always_passes(monkeypatch):
    monkeypatch.setenv("BILLING_ENFORCEMENT_ENABLED", "true")
    _set_plan("ws_A", "pro")  # monthly_text_generations = UNLIMITED
    r = plans.check_limit("ws_A", "monthly_text_generations", used=10_000)
    assert r["limit"] == UNLIMITED and r["within_limit"] is True and r["remaining"] == UNLIMITED


def test_price_to_plan_mapping_is_server_side(monkeypatch):
    monkeypatch.setitem(plans.PRICE_TO_PLAN, "price_abc", "starter")
    assert plans.plan_for_price("price_abc") == "starter"
    assert plans.plan_for_price("price_unknown") is None


def test_catalog_summary_has_no_pricing_internals():
    summary = plans.catalog_summary()
    ids = {p["id"] for p in summary}
    assert {"free", "starter", "pro"} <= ids
    for p in summary:
        assert "usd" not in str(p).lower() and "stripe" not in str(p).lower()


def test_monthly_credits_defined_per_plan():
    assert plans.get_plan("free").monthly_credits == 0
    assert plans.get_plan("starter").monthly_credits == 2000
    assert plans.get_plan("pro").monthly_credits == 10000
