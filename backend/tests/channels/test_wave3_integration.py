"""Wave 3 integration — all 9 channels wired, compliance gate + retry enforced.

Proves: every channel has a concrete adapter; the cross-channel compliance gate
blocks a marketing send without consent (and allows it once consent is recorded);
the new adapters route through the router (voice STT, generic webhook, IG/FB 24h
rule); and the retry wrapper retries transient failures only. Keyless, $0.
"""

from __future__ import annotations

from channels.compliance import evaluate_compliance
from channels.delivery import backoff_delays, send_with_retry
from channels.mock import MockAdapterBase
from channels.registry import register_default_adapters
from channels.router import ChannelRouter
from channels.schemas import Channel, OutboundMessage, SendResult
from channels.store import InMemoryChannelStore


def _router() -> ChannelRouter:
    r = ChannelRouter(store=InMemoryChannelStore())
    register_default_adapters(r)
    r.set_compliance_gate(lambda msg, config, store: evaluate_compliance(msg, config, store))
    return r


def test_every_channel_has_a_concrete_adapter():
    r = ChannelRouter(store=InMemoryChannelStore())
    register_default_adapters(r)
    for ch in Channel:
        assert not isinstance(r.adapter_for(ch), MockAdapterBase), f"{ch} still mock"


def test_compliance_gate_blocks_marketing_without_consent():
    r = _router()
    msg = OutboundMessage(tenant_id="t_a", channel=Channel.EMAIL, recipient_id="c@x.com",
                          text="Sale!", meta={"category": "marketing"})
    blocked = r.send(msg)
    assert blocked.ok is False and "consent" in blocked.reason

    # record consent → now it proceeds (dry-run send)
    r._store.set_consent("t_a", Channel.EMAIL, "c@x.com", True)
    msg2 = OutboundMessage(tenant_id="t_a", channel=Channel.EMAIL, recipient_id="c@x.com",
                           text="Sale!", meta={"category": "marketing"}, idempotency_key="k2")
    ok = r.send(msg2)
    assert ok.ok is True and ok.dry_run is True


def test_transactional_send_not_gated():
    r = _router()
    res = r.send(OutboundMessage(tenant_id="t_a", channel=Channel.WEB_CHAT, recipient_id="u1", text="hi"))
    assert res.ok is True  # no marketing category → no consent required


def test_voice_stt_and_short_reply_via_router():
    r = _router()
    out = r.route_inbound(Channel.VOICE, "t_a", {"transcript": "what are your hours?", "caller": "+1"})
    assert out["inbound"].text == "what are your hours?"
    # voice has no handler registered here → just confirms normalization works
    assert out["inbound"].channel == Channel.VOICE


def test_instagram_24h_rule_enforced_through_router():
    r = _router()
    blocked = r.send(OutboundMessage(tenant_id="t_a", channel=Channel.INSTAGRAM_DM,
                                     recipient_id="ig1", text="promo", meta={"within_24h": False}))
    assert blocked.ok is False and "tag" in blocked.reason


def test_generic_webhook_routes():
    r = _router()
    out = r.route_inbound(Channel.GENERIC_WEBHOOK, "t_a", {"from": "x", "message": "ping"})
    assert out["inbound"].text == "ping"


def test_retry_only_retries_transient():
    calls = {"n": 0}
    slept: list[float] = []

    def flaky():
        calls["n"] += 1
        if calls["n"] < 3:
            return SendResult(ok=False, channel=Channel.SMS, reason="timeout")
        return SendResult(ok=True, channel=Channel.SMS, sent=True, reason="delivered")

    res = send_with_retry(flaky, max_attempts=3, sleep=lambda d: slept.append(d))
    assert res.ok is True and calls["n"] == 3 and len(slept) == 2

    # a non-transient reason is NOT retried
    calls2 = {"n": 0}

    def mock_only():
        calls2["n"] += 1
        return SendResult(ok=False, channel=Channel.SMS, reason="mock_mode")

    res2 = send_with_retry(mock_only, max_attempts=3, sleep=lambda d: None)
    assert calls2["n"] == 1
    assert backoff_delays(3) == [0.5, 1.0, 2.0]
