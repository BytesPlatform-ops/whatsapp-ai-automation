"""Credit unit + pricing — INTEGER ONLY, deterministic, versioned.

Financial-safety rules 17/18: money and credits are integers, never floats.

Units
-----
* **milli-credit (mc)** — the internal credit unit. ``1 credit = 1000 mc``. All
  balances, reservations and ledger amounts are integer mc.
* **micro-USD (µUSD)** — provider cost unit. ``1 USD = 1_000_000 µUSD``. Provider
  cost is recorded in integer µUSD alongside the credit charge.

Pricing is **versioned**: every ledger entry / reservation stores the
``pricing_version`` used, and conversions for a historical record use THAT version
— old entries are never recomputed with new prices (rule 12, Task 4).
"""

from __future__ import annotations

from dataclasses import dataclass

MC_PER_CREDIT = 1000
MICRO_PER_USD = 1_000_000


@dataclass(frozen=True)
class PricingRule:
    """Immutable conversion rule. ``usd_per_credit_micro`` is the µUSD value of one
    credit (e.g. 10_000 µUSD = $0.01/credit). ``markup_pct`` is Pixie's integer
    markup over raw provider cost when Pixie fronts the credits (0 for BYOK/none)."""
    version: str
    usd_per_credit_micro: int   # µUSD per 1 credit
    markup_pct: int             # integer percent, e.g. 30


# Registry of pricing rules. Append new versions; NEVER mutate an existing one —
# historical ledger entries reference these by version.
PRICING_RULES = {
    "2026-07-01": PricingRule(version="2026-07-01", usd_per_credit_micro=10_000, markup_pct=30),
}

CURRENT_PRICING_VERSION = "2026-07-01"


def get_rule(version: str = "") -> PricingRule:
    """Resolve a pricing rule by version. Empty → current. Unknown → ValueError
    (never silently fall back, which could misprice a historical entry)."""
    v = version or CURRENT_PRICING_VERSION
    rule = PRICING_RULES.get(v)
    if rule is None:
        raise ValueError(f"unknown pricing version: {v!r}")
    return rule


def credits_to_mc(credits: int) -> int:
    """Whole credits → milli-credits."""
    return int(credits) * MC_PER_CREDIT


def mc_to_credits_str(mc: int) -> str:
    """Human-readable credits with up to 3 decimals, no float rounding drift."""
    sign = "-" if mc < 0 else ""
    mc = abs(int(mc))
    whole, frac = divmod(mc, MC_PER_CREDIT)
    if frac == 0:
        return f"{sign}{whole}"
    return f"{sign}{whole}.{frac:03d}".rstrip("0")


def _ceil_div(numerator: int, denominator: int) -> int:
    """Integer ceiling division for non-negative inputs — charges round UP so Pixie
    is never underpaid by rounding (rule 9)."""
    if denominator <= 0:
        raise ValueError("denominator must be positive")
    return -((-numerator) // denominator)


def provider_micro_usd_to_mc(micro_usd: int, *, version: str = "", apply_markup: bool = True) -> int:
    """Convert a provider cost in µUSD to a credit charge in mc under a pricing rule.

    Rounds UP (ceil) to protect Pixie from rounding losses. ``apply_markup=False``
    for BYOK 'service_fee_only'/'none' where Pixie doesn't front provider cost.
    """
    micro_usd = int(micro_usd)
    if micro_usd < 0:
        raise ValueError("provider cost cannot be negative")
    rule = get_rule(version)
    marked = micro_usd * (100 + (rule.markup_pct if apply_markup else 0)) // 100
    # credits = marked_µUSD / µUSD_per_credit ; in mc: * MC_PER_CREDIT
    return _ceil_div(marked * MC_PER_CREDIT, rule.usd_per_credit_micro)


def usd_to_micro(usd_cents: int) -> int:
    """Integer USD cents → µUSD (helper for callers holding Stripe cents)."""
    return int(usd_cents) * 10_000
