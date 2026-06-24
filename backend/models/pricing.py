"""Per-model token pricing → cost-per-call.

USD per 1K tokens (in, out). Fake models are free so fake-mode cost is $0, but
the cost-computation path is identical to real models — so the day we switch to
OpenAI, cost-per-site is already correct. Update real prices in one place here.
"""

from __future__ import annotations

# model_id -> (usd_per_1k_input, usd_per_1k_output)
PRICING: dict[str, tuple[float, float]] = {
    # fake models — free
    "fake-small": (0.0, 0.0),
    "fake-large": (0.0, 0.0),
    "fake-embed": (0.0, 0.0),
    # OpenAI (USD per 1K tokens; verify against current pricing before billing)
    "gpt-4o": (2.50 / 1000, 10.00 / 1000),
    "gpt-4o-mini": (0.15 / 1000, 0.60 / 1000),
    "text-embedding-3-small": (0.02 / 1000, 0.0),
}


def cost_for(model: str, tokens_in: int, tokens_out: int) -> float:
    """Cost in USD for a call. Unknown model → 0.0 (don't crash on metering)."""
    rate_in, rate_out = PRICING.get(model, (0.0, 0.0))
    return round((tokens_in / 1000) * rate_in + (tokens_out / 1000) * rate_out, 6)
