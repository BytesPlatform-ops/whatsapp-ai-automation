"""Deterministic cost estimator — PURE STDLIB, NO AI call.

Cost is a pure function of model, duration and retry budget per the pricing
rules. Two provider modes:
  * USER_ACCOUNT (Mode A): the user spends their own provider credits, so Pixie
    takes no markup and charges nothing — markup and final price are 0.
  * PIXIE_ACCOUNT (Mode B): Pixie fronts the credits and bills the user the
    provider cost plus a fixed markup.
"""

from __future__ import annotations

from content_creator.cost.pricing import MODEL_PRICES, PIXIE_MARKUP_PCT
from content_creator.enums import ProviderMode


def _mode_value(provider_mode) -> str:
    """Accept a ProviderMode enum or its raw string value."""
    if isinstance(provider_mode, ProviderMode):
        return provider_mode.value
    return str(provider_mode)


def estimate_cost(
    *,
    provider_mode,
    model: str = "standard",
    duration_seconds: int = 15,
    retry_budget: int = 2,
) -> dict:
    mode = _mode_value(provider_mode)
    price = MODEL_PRICES.get(model, MODEL_PRICES["standard"])
    credits_per_second = price["credits_per_second"]
    usd_per_credit = price["usd_per_credit"]

    estimated_credits = int(
        round(credits_per_second * duration_seconds * (1 + retry_budget * 0.5))
    )
    provider_cost = estimated_credits * usd_per_credit

    if mode == ProviderMode.USER_ACCOUNT.value:
        # User pays the provider directly from their own credits.
        pixie_markup = 0.0
        final_user_price = 0.0
    else:
        pixie_markup = round(provider_cost * PIXIE_MARKUP_PCT, 4)
        final_user_price = round(provider_cost + pixie_markup, 4)

    return {
        "provider_mode": mode,
        "model": model,
        "estimated_credits": estimated_credits,
        "estimated_provider_cost": round(provider_cost, 4),
        "pixie_markup": pixie_markup,
        "final_user_price": final_user_price,
        "duration_seconds": duration_seconds,
        "retry_budget": retry_budget,
    }
