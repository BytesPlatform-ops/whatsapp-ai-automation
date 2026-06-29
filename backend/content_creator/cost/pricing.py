"""Static pricing tables — PURE STDLIB, deterministic constants only.

Credits-per-second × seconds gives provider credits; usd_per_credit converts to
dollars. PIXIE_MARKUP_PCT is the markup applied only in PIXIE_ACCOUNT mode.
No env, no AI, no network — pricing is fully deterministic per the spec.
"""

from __future__ import annotations

MODEL_PRICES = {
    "mock-fast": {"credits_per_second": 4, "usd_per_credit": 0.01},
    "standard": {"credits_per_second": 8, "usd_per_credit": 0.01},
    "premium": {"credits_per_second": 20, "usd_per_credit": 0.01},
}

# Pixie's markup over raw provider cost when Pixie fronts the credits (Mode B).
PIXIE_MARKUP_PCT = 0.30
