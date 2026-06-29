"""Cross-channel pre-send compliance / consent gate (Wave 3).

A pure *judge*: given a normalized `OutboundMessage`, its `ChannelConfig`, and the
channel store, it runs an ORDERED set of checks and returns a `ComplianceResult`.
The FIRST failing check short-circuits and is recorded in `blocked_by`.

This module NEVER sends and NEVER mutates the store except the `RateLimiter`
recording a timestamp on the rate-limit step. Consent + idempotency state live in
`channels.store` — we only read them here (we do not duplicate that storage).

The lead wires this into `router.send` via an injectable hook with the exact
`evaluate_compliance(...)` signature below.
"""

from __future__ import annotations

from typing import Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field

from .schemas import ChannelConfig, OutboundMessage
from .store import idempotency_key


# ── result models ────────────────────────────────────────────────────────────
class ComplianceCheck(BaseModel):
    """One named check and its outcome."""

    model_config = ConfigDict(extra="ignore")

    name: str
    passed: bool
    detail: str = ""


class ComplianceResult(BaseModel):
    """The verdict. `allowed` is the AND of every check; `blocked_by` names the
    first check that failed (None when allowed)."""

    model_config = ConfigDict(extra="ignore")

    allowed: bool
    blocked_by: Optional[str] = None
    checks: List[ComplianceCheck] = Field(default_factory=list)


# ── rate limiter (deterministic, injected clock) ─────────────────────────────
class RateLimiter:
    """A sliding-window counter keyed by an arbitrary string.

    Deterministic: callers inject `now` (seconds, float) — there are NO wall-clock
    calls in here, so tests are reproducible. `allow` is a pure query (it prunes
    expired timestamps but does not record); `record` appends a send timestamp.
    """

    def __init__(self) -> None:
        self._hits: Dict[str, List[float]] = {}

    def _prune(self, key: str, now: float, window_seconds: int) -> List[float]:
        cutoff = now - window_seconds
        kept = [t for t in self._hits.get(key, []) if t > cutoff]
        self._hits[key] = kept
        return kept

    def allow(self, key: str, limit: int, window_seconds: int, now: float) -> bool:
        """True if a send NOW would stay within `limit` per `window_seconds`."""
        if limit <= 0:
            return False
        kept = self._prune(key, now, window_seconds)
        return len(kept) < limit

    def record(self, key: str, now: float) -> None:
        """Record a send at `now` (call only after `allow` returned True)."""
        self._hits.setdefault(key, []).append(now)


_rate_limiter: Optional[RateLimiter] = None


def get_rate_limiter() -> RateLimiter:
    """Process-wide RateLimiter singleton (mirrors get_channel_store)."""
    global _rate_limiter
    if _rate_limiter is None:
        _rate_limiter = RateLimiter()
    return _rate_limiter


# ── the gate ─────────────────────────────────────────────────────────────────
def evaluate_compliance(
    msg: OutboundMessage,
    config: ChannelConfig,
    store,
    *,
    now: float = 0.0,
    require_consent: bool | None = None,
    rate_limit: int | None = None,
    rate_window_s: int = 3600,
) -> ComplianceResult:
    """Judge whether `msg` may be sent. Runs ordered checks; the first failure
    short-circuits (sets `blocked_by`) and no later checks run.

    Order: consent → opt_out → rate_limit → idempotency.

    - consent: required when `require_consent` is True. Default policy: True when
      `msg.meta.get("category") == "marketing"`, else False. Requires
      `store.has_consent(tenant, channel, recipient)`.
    - opt_out: blocked when `msg.meta.get("opted_out")` is truthy.
    - rate_limit: when `rate_limit` is set, enforce it per (tenant|channel|recipient)
      over `rate_window_s` using the process RateLimiter (records on pass).
    - idempotency: blocked when `store.already_sent(tenant, idempotency_key(msg))`.

    Returns a `ComplianceResult` carrying every check that was evaluated.
    """
    meta = msg.meta or {}
    checks: List[ComplianceCheck] = []

    def _fail(name: str, detail: str) -> ComplianceResult:
        checks.append(ComplianceCheck(name=name, passed=False, detail=detail))
        return ComplianceResult(allowed=False, blocked_by=name, checks=checks)

    # 1. consent ──────────────────────────────────────────────────────────────
    need_consent = require_consent
    if need_consent is None:
        need_consent = meta.get("category") == "marketing"
    if need_consent:
        if store.has_consent(msg.tenant_id, msg.channel, msg.recipient_id):
            checks.append(ComplianceCheck(name="consent", passed=True, detail="consent on file"))
        else:
            return _fail("consent", "marketing/required send without recorded consent")
    else:
        checks.append(ComplianceCheck(name="consent", passed=True, detail="consent not required"))

    # 2. opt_out ────────────────────────────────────────────────────────────────
    if bool(meta.get("opted_out")):
        return _fail("opt_out", "recipient flagged opted_out")
    checks.append(ComplianceCheck(name="opt_out", passed=True, detail="not opted out"))

    # 3. rate_limit ─────────────────────────────────────────────────────────────
    if rate_limit is not None:
        limiter = get_rate_limiter()
        key = f"{msg.tenant_id}|{msg.channel.value}|{msg.recipient_id}"
        if not limiter.allow(key, rate_limit, rate_window_s, now):
            return _fail("rate_limit", f"over {rate_limit}/{rate_window_s}s for {key}")
        limiter.record(key, now)
        checks.append(ComplianceCheck(name="rate_limit", passed=True, detail=f"within {rate_limit}/{rate_window_s}s"))
    else:
        checks.append(ComplianceCheck(name="rate_limit", passed=True, detail="no rate limit configured"))

    # 4. idempotency ────────────────────────────────────────────────────────────
    idem = idempotency_key(msg)
    if store.already_sent(msg.tenant_id, idem):
        return _fail("idempotency", f"duplicate send for key {idem}")
    checks.append(ComplianceCheck(name="idempotency", passed=True, detail=f"first send for key {idem}"))

    return ComplianceResult(allowed=True, blocked_by=None, checks=checks)
