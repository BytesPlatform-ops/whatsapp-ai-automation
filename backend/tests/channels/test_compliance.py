"""evaluate_compliance tests — ordered gate, short-circuit, injected clock.

Plain `def test_*` functions, callable directly. $0, no network, no API keys.
Each test uses a FRESH store and a fresh RateLimiter so they don't bleed state.
"""

from __future__ import annotations

import channels.compliance as compliance
from channels.compliance import RateLimiter, evaluate_compliance
from channels.schemas import Channel, ChannelConfig, ChannelMode, OutboundMessage
from channels.store import InMemoryChannelStore, idempotency_key


def _store() -> InMemoryChannelStore:
    return InMemoryChannelStore()


def _cfg() -> ChannelConfig:
    return ChannelConfig(tenant_id="t1", channel=Channel.WHATSAPP, enabled=True, mode=ChannelMode.MOCK)


def _msg(**kw) -> OutboundMessage:
    base = dict(tenant_id="t1", channel=Channel.WHATSAPP, recipient_id="+100", text="hi")
    base.update(kw)
    return OutboundMessage(**base)


def _fresh_limiter() -> None:
    compliance._rate_limiter = RateLimiter()


def test_marketing_without_consent_blocked():
    store = _store()
    msg = _msg(meta={"category": "marketing"})
    res = evaluate_compliance(msg, _cfg(), store)
    assert res.allowed is False
    assert res.blocked_by == "consent"


def test_marketing_with_consent_passes():
    store = _store()
    store.set_consent("t1", Channel.WHATSAPP, "+100", True)
    _fresh_limiter()
    msg = _msg(meta={"category": "marketing"})
    res = evaluate_compliance(msg, _cfg(), store)
    assert res.allowed is True
    assert res.blocked_by is None


def test_opted_out_blocked():
    store = _store()
    msg = _msg(meta={"opted_out": True})
    res = evaluate_compliance(msg, _cfg(), store)
    assert res.allowed is False
    assert res.blocked_by == "opt_out"


def test_rate_limit_third_blocked():
    store = _store()
    _fresh_limiter()
    cfg = _cfg()
    # limit 2 within a 3600s window; three sends 10s apart all fall in window.
    r1 = evaluate_compliance(_msg(text="a"), cfg, store, now=0.0, rate_limit=2, rate_window_s=3600)
    r2 = evaluate_compliance(_msg(text="b"), cfg, store, now=10.0, rate_limit=2, rate_window_s=3600)
    r3 = evaluate_compliance(_msg(text="c"), cfg, store, now=20.0, rate_limit=2, rate_window_s=3600)
    assert r1.allowed is True
    assert r2.allowed is True
    assert r3.allowed is False
    assert r3.blocked_by == "rate_limit"


def test_duplicate_idempotency_blocked():
    store = _store()
    _fresh_limiter()
    msg = _msg(text="dupe")
    store.mark_sent("t1", idempotency_key(msg))
    res = evaluate_compliance(msg, _cfg(), store)
    assert res.allowed is False
    assert res.blocked_by == "idempotency"


def test_clean_transactional_allowed():
    store = _store()
    _fresh_limiter()
    res = evaluate_compliance(_msg(), _cfg(), store)
    assert res.allowed is True
    assert res.blocked_by is None
    # every check evaluated and passed
    assert {c.name for c in res.checks} == {"consent", "opt_out", "rate_limit", "idempotency"}
    assert all(c.passed for c in res.checks)
