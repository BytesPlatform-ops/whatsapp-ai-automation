"""Server-side credit estimation — trusted inputs only, never a browser value.

Produces a conservative MAX reservation (so settlement releases the unused
remainder — rule 5/12) from provider-cost heuristics kept in µUSD integers. Markup
is applied only when Pixie fronts the credits (Pixie-managed / BYOK 'full'); BYOK
'service_fee_only'/'none' converts without markup. The response never exposes the
markup formula — only the resulting credit figures.
"""

from __future__ import annotations

from typing import Optional

from . import config
from .money import CURRENT_PRICING_VERSION, provider_micro_usd_to_mc

# Conservative per-unit provider-cost ceilings in µUSD (1 USD = 1_000_000 µUSD).
# These bound the MAX reservation; the actual charge at settlement uses real usage.
MAX_MICRO_USD = {
    "content_text_per_variation": 20_000,     # $0.02 / variation
    "influencer_idea_batch": 15_000,          # $0.015 / idea batch
    "influencer_script": 25_000,              # $0.025 / script
    "influencer_video_per_second": 12_000,    # $0.012 / second (premium-ish ceiling)
}
VIDEO_MODEL_MULTIPLIER = {"standard": 1, "premium": 2, "mock-fast": 1}


def _apply_markup(byok: bool) -> bool:
    """Pixie fronts provider cost (→ markup) unless BYOK policy says otherwise."""
    if not byok:
        return True
    return config.byok_credit_policy() == "full"


def build_estimate(tenant_id: str, *, operation_type: str, max_provider_micro_usd: int,
                   is_mock: bool, byok: bool = False, pricing_version: str = "",
                   authorized_balance: bool = True) -> dict:
    """Shared estimate envelope (Task 5). Mock → zero credits by default."""
    pv = pricing_version or CURRENT_PRICING_VERSION
    charge_mock = is_mock and config.mock_usage_consumes_credits()
    if is_mock and not charge_mock:
        max_mc = 0
        provider_micro = 0
    else:
        provider_micro = max(0, int(max_provider_micro_usd))
        max_mc = provider_micro_usd_to_mc(provider_micro, version=pv, apply_markup=_apply_markup(byok))

    available = None
    sufficient = True
    if authorized_balance:
        from .wallet import balances
        available = balances(tenant_id)[0]
        sufficient = config.allow_negative_credits() or available >= max_mc

    return {
        "operation_type": operation_type,
        "estimated_credits_mc": max_mc,
        "max_reservation_mc": max_mc,
        "estimated_provider_micro_usd": provider_micro,
        "currency": "usd",
        "pricing_version": pv,
        "mock": is_mock,
        "byok": byok,
        "byok_policy": config.byok_credit_policy(),
        "enforcement_enabled": config.billing_enforcement_enabled(),
        "credit_system_enabled": config.credit_system_enabled(),
        "available_mc": available,
        "sufficient": sufficient,
    }


# ── product-specific estimators ─────────────────────────────────────────────────
def content_agent_estimate(tenant_id: str, *, variations: int, is_mock: bool, byok: bool = False,
                           authorized_balance: bool = True) -> dict:
    n = max(1, int(variations or 1))
    micro = MAX_MICRO_USD["content_text_per_variation"] * n
    return build_estimate(tenant_id, operation_type="content_text", max_provider_micro_usd=micro,
                          is_mock=is_mock, byok=byok, authorized_balance=authorized_balance)


def influencer_idea_estimate(tenant_id: str, *, is_mock: bool, byok: bool = False,
                             authorized_balance: bool = True) -> dict:
    return build_estimate(tenant_id, operation_type="influencer_idea",
                          max_provider_micro_usd=MAX_MICRO_USD["influencer_idea_batch"],
                          is_mock=is_mock, byok=byok, authorized_balance=authorized_balance)


def influencer_script_estimate(tenant_id: str, *, is_mock: bool, byok: bool = False,
                               authorized_balance: bool = True) -> dict:
    return build_estimate(tenant_id, operation_type="influencer_script",
                          max_provider_micro_usd=MAX_MICRO_USD["influencer_script"],
                          is_mock=is_mock, byok=byok, authorized_balance=authorized_balance)


def influencer_video_estimate(tenant_id: str, *, duration_seconds: int, model: str = "standard",
                              outputs: int = 1, retry_budget: int = 1, is_mock: bool, byok: bool = False,
                              authorized_balance: bool = True) -> dict:
    secs = max(1, int(duration_seconds or 15))
    mult = VIDEO_MODEL_MULTIPLIER.get(model, 1)
    attempts = max(1, int(outputs or 1)) * (1 + max(0, int(retry_budget)))
    micro = MAX_MICRO_USD["influencer_video_per_second"] * secs * mult * attempts
    return build_estimate(tenant_id, operation_type="influencer_video", max_provider_micro_usd=micro,
                          is_mock=is_mock, byok=byok, authorized_balance=authorized_balance)
