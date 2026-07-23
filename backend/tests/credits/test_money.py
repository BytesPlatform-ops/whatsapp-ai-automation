"""Credit unit + pricing conversions — integer-only, versioned, ceil-rounded."""

from __future__ import annotations

import pytest

from credits import config, money


def test_credits_to_mc_is_integer():
    assert money.credits_to_mc(5) == 5000
    assert isinstance(money.credits_to_mc(5), int)


def test_mc_to_credits_str():
    assert money.mc_to_credits_str(5000) == "5"
    assert money.mc_to_credits_str(5500) == "5.5"
    assert money.mc_to_credits_str(5250) == "5.25"
    assert money.mc_to_credits_str(1) == "0.001"
    assert money.mc_to_credits_str(-2500) == "-2.5"


def test_current_rule_resolves_and_unknown_raises():
    rule = money.get_rule()
    assert rule.version == money.CURRENT_PRICING_VERSION
    assert rule.usd_per_credit_micro == 10_000 and rule.markup_pct == 30
    with pytest.raises(ValueError):
        money.get_rule("1999-01-01")


def test_provider_cost_to_credits_with_markup_rounds_up():
    # $0.01 provider cost = 10_000 µUSD. With 30% markup → 13_000 µUSD.
    # credits = 13_000 / 10_000 = 1.3 credits → 1300 mc.
    assert money.provider_micro_usd_to_mc(10_000) == 1300
    # A sub-credit cost still rounds UP (never undercharge Pixie).
    assert money.provider_micro_usd_to_mc(1) == 1  # tiny → 1 mc, not 0


def test_provider_cost_without_markup_for_byok():
    # No markup: $0.01 → exactly 1.0 credit = 1000 mc.
    assert money.provider_micro_usd_to_mc(10_000, apply_markup=False) == 1000


def test_negative_cost_rejected():
    with pytest.raises(ValueError):
        money.provider_micro_usd_to_mc(-5)


def test_historical_version_is_used_verbatim(monkeypatch):
    # Simulate a second pricing version; a historical entry priced under the old
    # version must convert with the OLD rule, not the current one.
    old = money.PricingRule(version="2020-01-01", usd_per_credit_micro=10_000, markup_pct=0)
    monkeypatch.setitem(money.PRICING_RULES, "2020-01-01", old)
    assert money.provider_micro_usd_to_mc(10_000, version="2020-01-01") == 1000  # no markup in old rule


def test_no_float_types_in_conversion():
    out = money.provider_micro_usd_to_mc(123456)
    assert isinstance(out, int)


# ── config safe defaults ────────────────────────────────────────────────────────
def test_config_defaults_are_all_safe(monkeypatch):
    for k in ["CREDIT_SYSTEM_ENABLED", "BILLING_ENFORCEMENT_ENABLED", "ALLOW_NEGATIVE_CREDITS",
              "MOCK_USAGE_CONSUMES_CREDITS", "CREDIT_RECONCILIATION_ENABLED"]:
        monkeypatch.delenv(k, raising=False)
    assert config.credit_system_enabled() is False
    assert config.billing_enforcement_enabled() is False
    assert config.allow_negative_credits() is False
    assert config.mock_usage_consumes_credits() is False
    assert config.reconciliation_enabled() is False
    assert config.byok_credit_policy() == "service_fee_only"


def test_video_reservation_ttl_is_longer(monkeypatch):
    monkeypatch.delenv("CREDIT_RESERVATION_TTL_SECONDS", raising=False)
    monkeypatch.delenv("CREDIT_VIDEO_RESERVATION_TTL_SECONDS", raising=False)
    assert config.reservation_ttl_seconds("influencer_video") > config.reservation_ttl_seconds("content_text")


def test_byok_policy_validation(monkeypatch):
    monkeypatch.setenv("BYOK_CREDIT_POLICY", "garbage")
    assert config.byok_credit_policy() == "service_fee_only"
    monkeypatch.setenv("BYOK_CREDIT_POLICY", "none")
    assert config.byok_credit_policy() == "none"
