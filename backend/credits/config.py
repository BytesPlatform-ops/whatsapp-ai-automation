"""Credit-system configuration — PURE STDLIB, secret-free, safe defaults.

Everything defaults OFF: the credit system is inert until explicitly enabled, so
this code can ship before durable migrations and Stripe keys exist. No value here
is a secret; Stripe secrets live only in the (git-ignored) env files.
"""

from __future__ import annotations

import os


def _flag(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, "").strip() or default)
    except (TypeError, ValueError):
        return default


def credit_system_enabled() -> bool:
    """Master switch. When false, product code must NOT reserve/settle credits —
    operations run exactly as they did before this phase."""
    return _flag("CREDIT_SYSTEM_ENABLED", False)


def billing_enforcement_enabled() -> bool:
    """When false, entitlement/limit checks are advisory (report-only) — never a
    hard block. Kept off until durable migrations are applied in production."""
    return _flag("BILLING_ENFORCEMENT_ENABLED", False)


def allow_negative_credits() -> bool:
    """Never allow a negative available balance unless explicitly opted in (tests)."""
    return _flag("ALLOW_NEGATIVE_CREDITS", False)


def mock_usage_consumes_credits() -> bool:
    """Mock/dry-run provider operations consume ZERO credits by default."""
    return _flag("MOCK_USAGE_CONSUMES_CREDITS", False)


def byok_credit_policy() -> str:
    """How workspace-supplied provider keys (BYOK) are charged:
      * 'service_fee_only' (default) — no provider-cost credits; only a configured
        platform/service fee, and entitlement/limits still apply.
      * 'none' — no Pixie credits consumed at all (entitlement/limits still apply).
      * 'full' — treated like Pixie-managed (provider-cost credits charged).
    """
    val = (os.getenv("BYOK_CREDIT_POLICY", "service_fee_only").strip().lower() or "service_fee_only")
    return val if val in ("service_fee_only", "none", "full") else "service_fee_only"


def reservation_ttl_seconds(operation: str = "") -> int:
    """Reservation lifetime. Video is long-running, so it gets a longer TTL — one
    dangerously short TTL for all providers would prematurely release a valid video
    job (Task 10)."""
    base = _int("CREDIT_RESERVATION_TTL_SECONDS", 900)  # 15 min default
    if operation and "video" in operation:
        return _int("CREDIT_VIDEO_RESERVATION_TTL_SECONDS", max(base, 3600))  # ≥1h
    return base


def reconciliation_enabled() -> bool:
    return _flag("CREDIT_RECONCILIATION_ENABLED", False)


def reconciliation_interval_seconds() -> int:
    return _int("CREDIT_RECONCILIATION_INTERVAL_SECONDS", 300)


def reconciliation_lock_timeout_seconds() -> int:
    return _int("CREDIT_RECONCILIATION_LOCK_TIMEOUT_SECONDS", 300)


def status() -> dict:
    """Frontend-safe config snapshot (no secrets)."""
    return {
        "credit_system_enabled": credit_system_enabled(),
        "billing_enforcement_enabled": billing_enforcement_enabled(),
        "allow_negative_credits": allow_negative_credits(),
        "mock_usage_consumes_credits": mock_usage_consumes_credits(),
        "byok_credit_policy": byok_credit_policy(),
        "reservation_ttl_seconds": reservation_ttl_seconds(),
        "reconciliation_enabled": reconciliation_enabled(),
    }
