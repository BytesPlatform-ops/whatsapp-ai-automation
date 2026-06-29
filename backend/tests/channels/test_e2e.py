"""End-to-end mock QA sweep for the Pixie Channels layer (Wave 4).

A COMPREHENSIVE, keyless, $0, no-network exercise of all 9 channels plus the
cross-cutting compliance / idempotency / retry service. Every test builds a fresh
isolated router (`ChannelRouter(store=InMemoryChannelStore())` + concrete adapters)
so there is no shared-state bleed between tests, EXCEPT the process-wide RateLimiter
singleton — those tests use unique tenant/recipient keys to stay independent.

pytest is NOT installed; these are plain `def test_*` functions invoked directly by
the validation harness. Each asserts the CORRECT expected behavior — a failing test
is a real product defect, called out in the QA report, not a fixed-product workaround.
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from channels.api import router as channels_router
from channels.compliance import RateLimiter, evaluate_compliance
from channels.crypto import MockTokenVault, get_vault, mask
from channels.delivery import backoff_delays, send_with_retry
from channels.mock import MockAdapterBase
from channels.registry import register_default_adapters
from channels.router import ChannelRouter
from channels.schemas import (
    Channel,
    ChannelConfig,
    ChannelMode,
    InboundMessage,
    OutboundMessage,
    PixieContact,
    PixieContactType,
    SendResult,
)
from channels.store import InMemoryChannelStore, idempotency_key


# ── helpers ──────────────────────────────────────────────────────────────────
def _fresh_router() -> ChannelRouter:
    """An isolated router: own store, all concrete adapters, no gate."""
    r = ChannelRouter(store=InMemoryChannelStore())
    register_default_adapters(r)
    return r


def _gated_router() -> ChannelRouter:
    r = _fresh_router()
    r.set_compliance_gate(lambda m, c, s: evaluate_compliance(m, c, s))
    return r


def _echo_handler(inbound: InboundMessage):
    """A service handler that echoes the inbound text straight back."""
    if not inbound.sender_id:
        return None
    return OutboundMessage(
        tenant_id=inbound.tenant_id,
        channel=inbound.channel,
        recipient_id=inbound.sender_id,
        thread_id=inbound.thread_id,
        text=f"echo: {inbound.text}",
    )


#: A representative raw inbound payload per channel (provider-shaped where it matters).
_RAW_BY_CHANNEL: dict[Channel, dict] = {
    Channel.WEB_CHAT: {"customer_id": "web_u1", "message": "hello from web", "conversation_id": "c1"},
    Channel.TELEGRAM: {"message": {"chat": {"id": 555}, "from": {"id": 999},
                                   "text": "hi tg", "message_id": 12, "date": 1}},
    Channel.SMS: {"From": "+15551234567", "Body": "hi sms", "MessageSid": "SM1"},
    Channel.WHATSAPP: {"entry": [{"changes": [{"value": {"messages": [
        {"from": "15557654321", "id": "wamid.1", "timestamp": "1",
         "text": {"body": "hi wa"}}]}}]}]},
    Channel.EMAIL: {"from": "sender@x.com", "subject": "Hi", "text": "hi email", "message_id": "<m1>"},
    Channel.INSTAGRAM_DM: {"entry": [{"messaging": [{"sender": {"id": "ig_u1"},
                          "message": {"mid": "mid.1", "text": "hi ig"}}]}]},
    Channel.FACEBOOK_MESSENGER: {"entry": [{"messaging": [{"sender": {"id": "fb_u1"},
                                "message": {"mid": "mid.fb1", "text": "hi fb"}}]}]},
    Channel.VOICE: {"transcript": "hi voice", "caller": "+15550001111", "CallSid": "CA1"},
    Channel.GENERIC_WEBHOOK: {"from": "gw_u1", "message": "hi webhook", "id": "evt1"},
}

#: Expected normalized sender_id per channel (so we assert normalization, not just shape).
_EXPECTED_SENDER: dict[Channel, str] = {
    Channel.WEB_CHAT: "web_u1",
    Channel.TELEGRAM: "999",
    Channel.SMS: "+15551234567",
    Channel.WHATSAPP: "15557654321",
    Channel.EMAIL: "sender@x.com",
    Channel.INSTAGRAM_DM: "ig_u1",
    Channel.FACEBOOK_MESSENGER: "fb_u1",
    Channel.VOICE: "+15550001111",
    Channel.GENERIC_WEBHOOK: "gw_u1",
}

_EXPECTED_TEXT: dict[Channel, str] = {
    Channel.WEB_CHAT: "hello from web",
    Channel.TELEGRAM: "hi tg",
    Channel.SMS: "hi sms",
    Channel.WHATSAPP: "hi wa",
    Channel.EMAIL: "hi email",
    Channel.INSTAGRAM_DM: "hi ig",
    Channel.FACEBOOK_MESSENGER: "hi fb",
    Channel.VOICE: "hi voice",
    Channel.GENERIC_WEBHOOK: "hi webhook",
}


# ── 1. inbound→handler→outbound→send for ALL 9 channels ──────────────────────
#: Channels for the broad inbound→reply sweep. WhatsApp is intentionally excluded
#: here and isolated into test_whatsapp_reply_to_inbound_should_not_block below,
#: which documents DEFECT-1 (a reply to a just-received inbound is blocked).
_SWEEP_CHANNELS = [c for c in Channel if c != Channel.WHATSAPP]


def test_eight_channels_inbound_to_send_dry_run():
    """Each channel: normalize a representative payload, echo via a handler, send.
    Adapter must be concrete (not MockAdapterBase); send must not raise; reply
    must be sent=False (dry-run) EXCEPT web_chat which legitimately delivers."""
    assert len(list(Channel)) == 9, "expected exactly 9 channels in the enum"

    for ch in _SWEEP_CHANNELS:
        r = _fresh_router()
        r.register_handler("svc", _echo_handler)

        # adapter is concrete
        adapter = r.adapter_for(ch)
        assert not isinstance(adapter, MockAdapterBase), f"{ch.value} still on MockAdapterBase"

        out = r.route_inbound(ch, "t_e2e", dict(_RAW_BY_CHANNEL[ch]))
        inb = out["inbound"]
        assert inb.channel == ch
        assert inb.sender_id == _EXPECTED_SENDER[ch], (
            f"{ch.value} sender_id={inb.sender_id!r} != {_EXPECTED_SENDER[ch]!r}")
        assert inb.text == _EXPECTED_TEXT[ch], (
            f"{ch.value} text={inb.text!r} != {_EXPECTED_TEXT[ch]!r}")

        assert out["handled"] is True, f"{ch.value} not handled"
        assert isinstance(out["reply"], OutboundMessage), f"{ch.value} produced no reply"
        sr: SendResult = out["send_result"]
        assert sr is not None and sr.ok is True, (
            f"{ch.value} send not ok (reason={sr.reason if sr else None})")

        if ch == Channel.WEB_CHAT:
            # web_chat with config disabled by default → dry-run; either is acceptable.
            assert sr.sent in (True, False)
        else:
            assert sr.sent is False, f"{ch.value} unexpectedly reported sent=True"
            assert sr.dry_run is True, f"{ch.value} not dry_run"


def test_whatsapp_inbound_normalizes_concrete_adapter():
    """WhatsApp inbound normalization + concrete adapter (the parts that DO work)."""
    r = _fresh_router()
    assert not isinstance(r.adapter_for(Channel.WHATSAPP), MockAdapterBase)
    out = r.route_inbound(Channel.WHATSAPP, "t_e2e", dict(_RAW_BY_CHANNEL[Channel.WHATSAPP]))
    assert out["inbound"].sender_id == "15557654321"
    assert out["inbound"].text == "hi wa"


def test_whatsapp_reply_to_inbound_should_not_block():
    """DEFECT-1 (EXPECTED-FAIL until fixed): a service that REPLIES to a WhatsApp
    inbound — i.e. the user just messaged us, so we are inside the 24h window — has
    its reply BLOCKED with outside_24h_requires_template, because route_inbound does
    not propagate a 'recent inbound' signal into the reply and the WhatsApp adapter
    defaults _within_window() to False when within_24h/last_inbound_ts is absent.

    Correct behavior: replying to a fresh inbound must NOT require a template.
    (Compare: instagram_dm + facebook_messenger ALLOW the same no-meta reply — see
    DEFECT-2 for the cross-channel inconsistency.)"""
    r = _fresh_router()
    r.register_handler("svc", _echo_handler)
    out = r.route_inbound(Channel.WHATSAPP, "t_wa_reply",
                          dict(_RAW_BY_CHANNEL[Channel.WHATSAPP]))
    sr: SendResult = out["send_result"]
    assert sr is not None and sr.ok is True, (
        f"DEFECT-1: WhatsApp reply to inbound blocked with reason={sr.reason!r}")


def test_web_chat_delivers_when_enabled():
    """web_chat is the one fully-live channel — enabled config => sent=True."""
    r = _fresh_router()
    r.save_config(ChannelConfig(tenant_id="t_wc", channel=Channel.WEB_CHAT,
                                enabled=True, settings={"widget_id": "w1"}))
    sr = r.send(OutboundMessage(tenant_id="t_wc", channel=Channel.WEB_CHAT,
                                recipient_id="u1", text="live!"))
    assert sr.ok is True and sr.sent is True and sr.dry_run is False
    assert sr.preview["text"] == "live!"


# ── 2. compliance gate ───────────────────────────────────────────────────────
def test_compliance_marketing_blocked_without_consent_then_allowed():
    r = _gated_router()
    msg = OutboundMessage(tenant_id="t_c1", channel=Channel.EMAIL, recipient_id="c@x.com",
                          text="Sale!", meta={"category": "marketing"}, idempotency_key="c1a")
    blocked = r.send(msg)
    assert blocked.ok is False and blocked.reason == "blocked:consent"

    r._store.set_consent("t_c1", Channel.EMAIL, "c@x.com", True)
    msg2 = OutboundMessage(tenant_id="t_c1", channel=Channel.EMAIL, recipient_id="c@x.com",
                           text="Sale!", meta={"category": "marketing"}, idempotency_key="c1b")
    ok = r.send(msg2)
    assert ok.ok is True and ok.dry_run is True


def test_compliance_transactional_not_gated():
    r = _gated_router()
    res = r.send(OutboundMessage(tenant_id="t_c2", channel=Channel.EMAIL, recipient_id="c@x.com",
                                 text="Your receipt", idempotency_key="c2"))
    assert res.ok is True  # no category → consent not required


def test_compliance_opted_out_blocked():
    r = _gated_router()
    res = r.send(OutboundMessage(tenant_id="t_c3", channel=Channel.SMS, recipient_id="+1999",
                                 text="hello", meta={"opted_out": True}, idempotency_key="c3"))
    assert res.ok is False and res.reason == "blocked:opt_out"


def test_compliance_rate_limit_blocks_after_n():
    """A gate that enforces rate_limit=2/window. 3rd send to the same recipient blocks."""
    limiter = RateLimiter()  # isolated limiter, not the process singleton

    def gate(m, c, s):
        return _rl_eval(m, c, s, limiter)

    r = _fresh_router()
    r.set_compliance_gate(gate)

    results = []
    for i in range(3):
        results.append(r.send(OutboundMessage(
            tenant_id="t_rl", channel=Channel.SMS, recipient_id="+rl1",
            text=f"msg{i}", idempotency_key=f"rl{i}")))
    assert results[0].ok is True
    assert results[1].ok is True
    assert results[2].ok is False and results[2].reason == "blocked:rate_limit"


def _rl_eval(m, c, s, limiter: RateLimiter):
    """Rate-limit gate using an INJECTED limiter (compliance.evaluate_compliance
    only knows the process-wide singleton, so we replicate its rate-limit check
    here with a private limiter to keep the test isolated)."""
    from channels.compliance import ComplianceCheck, ComplianceResult
    key = f"{m.tenant_id}|{m.channel.value}|{m.recipient_id}"
    if not limiter.allow(key, 2, 3600, 0.0):
        return ComplianceResult(allowed=False, blocked_by="rate_limit",
                                checks=[ComplianceCheck(name="rate_limit", passed=False)])
    limiter.record(key, 0.0)
    return ComplianceResult(allowed=True, blocked_by=None,
                            checks=[ComplianceCheck(name="rate_limit", passed=True)])


def test_compliance_rate_limit_via_singleton_path():
    """Exercise the SHIPPED evaluate_compliance rate-limit path (process singleton).
    Uses a unique recipient so the singleton's history can't be polluted by others."""
    from channels.compliance import get_rate_limiter
    # Drain any prior state for our unique key by using a fresh tenant/recipient.
    r = _fresh_router()

    def gate(m, c, s):
        return evaluate_compliance(m, c, s, now=0.0, rate_limit=1, rate_window_s=3600)

    r.set_compliance_gate(gate)
    a = r.send(OutboundMessage(tenant_id="t_rl_singleton_unique_42", channel=Channel.SMS,
                               recipient_id="+rluniq42", text="one", idempotency_key="s1"))
    b = r.send(OutboundMessage(tenant_id="t_rl_singleton_unique_42", channel=Channel.SMS,
                               recipient_id="+rluniq42", text="two", idempotency_key="s2"))
    assert a.ok is True
    assert b.ok is False and b.reason == "blocked:rate_limit"


# ── 3. idempotency ───────────────────────────────────────────────────────────
def test_idempotency_duplicate_on_second_send():
    r = _fresh_router()
    msg = OutboundMessage(tenant_id="t_idem", channel=Channel.SMS, recipient_id="+1",
                          text="once", idempotency_key="idem-fixed")
    first = r.send(msg)
    second = r.send(msg)
    assert first.duplicate is False
    assert second.duplicate is True and second.reason == "duplicate_idempotency_key"


def test_idempotency_derived_key_dedupes_identical_content():
    """No explicit key → derived from (tenant|channel|recipient|text); identical
    content dedupes on the 2nd send."""
    r = _fresh_router()
    m1 = OutboundMessage(tenant_id="t_idem2", channel=Channel.EMAIL, recipient_id="x@y.com", text="hey")
    m2 = OutboundMessage(tenant_id="t_idem2", channel=Channel.EMAIL, recipient_id="x@y.com", text="hey")
    assert idempotency_key(m1) == idempotency_key(m2)
    r.send(m1)
    assert r.send(m2).duplicate is True


# ── 4. retry / backoff ───────────────────────────────────────────────────────
def test_retry_transient_twice_then_success_three_attempts():
    calls = {"n": 0}
    slept: list[float] = []

    def flaky():
        calls["n"] += 1
        if calls["n"] < 3:
            return SendResult(ok=False, channel=Channel.SMS, reason="timeout")
        return SendResult(ok=True, channel=Channel.SMS, sent=True, reason="delivered")

    res = send_with_retry(flaky, max_attempts=3, sleep=lambda d: slept.append(d))
    assert res.ok is True
    assert calls["n"] == 3
    assert res.preview["_attempts"] == 3
    assert slept == [0.5, 1.0]  # 2 gaps, exponential


def test_retry_non_transient_single_attempt():
    calls = {"n": 0}

    def mock_only():
        calls["n"] += 1
        return SendResult(ok=False, channel=Channel.SMS, reason="mock_mode")

    res = send_with_retry(mock_only, max_attempts=3, sleep=lambda d: None)
    assert calls["n"] == 1
    assert res.preview["_attempts"] == 1


def test_backoff_delays_schedule():
    assert backoff_delays(3) == [0.5, 1.0, 2.0]
    assert backoff_delays(1) == [0.5]
    assert backoff_delays(0) == []


# ── 5. per-channel requirements / go-live ────────────────────────────────────
def test_web_chat_goes_live_with_widget_enabled_live():
    r = _fresh_router()
    cfg = r.save_config(ChannelConfig(tenant_id="t_live", channel=Channel.WEB_CHAT,
                                      enabled=True, mode=ChannelMode.LIVE,
                                      settings={"widget_id": "w1"}))
    st = r.status("t_live", Channel.WEB_CHAT)
    assert cfg.requirements_met is True
    assert st.live is True
    assert st.missing == []


def test_whatsapp_default_not_met_lists_missing():
    r = _fresh_router()
    st = r.status("t_wa", Channel.WHATSAPP)
    assert st.live is False
    assert st.requirements_met is False
    labels = " ".join(st.missing).lower()
    assert "template" in labels
    assert "window" in labels or "24-hour" in labels
    assert "compliance" in labels


# ── 6. channel-specific rules ────────────────────────────────────────────────
def test_whatsapp_proactive_outside_window_blocked_without_template():
    r = _fresh_router()
    blocked = r.send(OutboundMessage(tenant_id="t_r", channel=Channel.WHATSAPP,
                                     recipient_id="wa1", text="promo",
                                     meta={"within_24h": False}, idempotency_key="wa-block"))
    assert blocked.ok is False and blocked.reason == "outside_24h_requires_template"

    # with a template → allowed (dry-run)
    ok = r.send(OutboundMessage(tenant_id="t_r", channel=Channel.WHATSAPP,
                                recipient_id="wa1", text="promo",
                                meta={"within_24h": False, "template": "promo_tpl"},
                                idempotency_key="wa-ok"))
    assert ok.ok is True and ok.dry_run is True
    assert ok.preview.get("type") == "template"


def test_instagram_and_messenger_proactive_outside_window_blocked_without_tag():
    for ch, reason in ((Channel.INSTAGRAM_DM, "outside_24h_requires_tag"),
                       (Channel.FACEBOOK_MESSENGER, "outside_24h_requires_tag")):
        r = _fresh_router()
        blocked = r.send(OutboundMessage(tenant_id="t_r2", channel=ch, recipient_id="u1",
                                         text="promo", meta={"within_24h": False},
                                         idempotency_key=f"{ch.value}-block"))
        assert blocked.ok is False and blocked.reason == reason, f"{ch.value}: {blocked.reason}"

        ok = r.send(OutboundMessage(tenant_id="t_r2", channel=ch, recipient_id="u1",
                                    text="promo", meta={"within_24h": False,
                                                        "message_tag": "HUMAN_AGENT"},
                                    idempotency_key=f"{ch.value}-ok"))
        assert ok.ok is True and ok.dry_run is True


def test_meta_channels_consistent_on_no_window_meta_reply():
    """DEFECT-2 (EXPECTED-FAIL until fixed): the three Meta channels disagree on a
    reply that carries NO window meta. WhatsApp BLOCKS (treats absent within_24h as
    out-of-window); Instagram + Messenger ALLOW (only block on explicit within_24h
    is False). All three implement 'the same' 24h rule and should behave alike for
    a fresh reply. This asserts the consistent (allow) behavior and currently fails
    on WhatsApp only."""
    outcomes = {}
    for ch in (Channel.WHATSAPP, Channel.INSTAGRAM_DM, Channel.FACEBOOK_MESSENGER):
        r = _fresh_router()
        sr = r.send(OutboundMessage(tenant_id="t_meta", channel=ch, recipient_id="u",
                                    text="reply", idempotency_key=f"meta-{ch.value}"))
        outcomes[ch.value] = sr.ok
    assert outcomes["instagram_dm"] is True
    assert outcomes["facebook_messenger"] is True
    # The defect: WhatsApp should also allow a no-meta reply, but blocks.
    assert outcomes["whatsapp"] is True, (
        f"DEFECT-2: Meta channels inconsistent on no-meta reply: {outcomes}")


def test_sms_truncates_to_160_with_segment_count():
    r = _fresh_router()
    long_text = "x" * 500
    sr = r.send(OutboundMessage(tenant_id="t_sms", channel=Channel.SMS,
                                recipient_id="+1", text=long_text, idempotency_key="sms-long"))
    assert sr.ok is True
    assert len(sr.preview["text"]) == 160
    assert sr.preview["segments"] == 4  # ceil(500/160)


def test_email_marketing_appends_unsubscribe_footer():
    r = _fresh_router()
    sr = r.send(OutboundMessage(tenant_id="t_em", channel=Channel.EMAIL, recipient_id="c@x.com",
                                text="Big sale today", meta={"category": "marketing"},
                                idempotency_key="em-mkt"))
    assert sr.ok is True
    assert sr.preview["unsubscribe"] is True
    assert "unsubscribe" in sr.preview["body"].lower()

    # transactional → no footer added
    sr2 = r.send(OutboundMessage(tenant_id="t_em", channel=Channel.EMAIL, recipient_id="c@x.com",
                                 text="Your receipt", idempotency_key="em-txn"))
    assert sr2.preview["unsubscribe"] is False
    assert "unsubscribe" not in sr2.preview["body"].lower()


def test_voice_long_reply_truncated_to_300():
    r = _fresh_router()
    sr = r.send(OutboundMessage(tenant_id="t_v", channel=Channel.VOICE, recipient_id="+1",
                                text="y" * 1000, idempotency_key="v-long"))
    assert sr.ok is True
    assert len(sr.preview["text"]) <= 300
    assert sr.preview["truncated"] is True


# ── 7. tenant isolation ──────────────────────────────────────────────────────
def test_tenant_isolation_config_and_messages():
    r = _fresh_router()
    r.save_config(ChannelConfig(tenant_id="t_a", channel=Channel.WEB_CHAT,
                                enabled=True, mode=ChannelMode.LIVE, settings={"widget_id": "wa"}))
    # t_b never configured web_chat
    st_a = r.status("t_a", Channel.WEB_CHAT)
    st_b = r.status("t_b", Channel.WEB_CHAT)
    assert st_a.live is True
    assert st_b.live is False  # isolation: t_a's enable did not leak to t_b

    # messages are tenant-scoped too
    r.send(OutboundMessage(tenant_id="t_a", channel=Channel.WEB_CHAT, recipient_id="u",
                           text="for A", idempotency_key="iso-a"))
    a_msgs = r._store.list_messages("t_a")
    b_msgs = r._store.list_messages("t_b")
    assert any(m.get("text") == "for A" for m in a_msgs)
    assert all(m.get("tenant_id") == "t_a" for m in a_msgs)
    assert b_msgs == []

    # idempotency keys are tenant-scoped: same key under t_b is NOT a duplicate
    r.send(OutboundMessage(tenant_id="t_a", channel=Channel.SMS, recipient_id="+1",
                           text="dup", idempotency_key="shared-key"))
    b_send = r.send(OutboundMessage(tenant_id="t_b", channel=Channel.SMS, recipient_id="+1",
                                    text="dup", idempotency_key="shared-key"))
    assert b_send.duplicate is False


# ── 8. secret safety ─────────────────────────────────────────────────────────
def test_vault_get_works_but_secret_never_in_repr():
    vault = MockTokenVault()
    secret = "super-secret-token-9999"
    ref = vault.put("t_sec", "bot_token", secret)
    assert vault.get(ref) == secret           # retrievable by ref
    assert secret not in repr(vault)          # never leaks in repr
    assert ref not in repr(vault) or "refs=" in repr(vault)
    assert "MockTokenVault" in repr(vault)
    # unknown ref → None, not an exception
    assert vault.get("vault_does_not_exist") is None
    assert vault.get(None) is None


def test_pixie_contact_stores_masked_value():
    raw = "owner@business.com"
    contact = PixieContact(
        tenant_id="t_pc",
        type=PixieContactType.EMAIL,
        value_ref=get_vault().put("t_pc", "owner_contact", raw),
        value_masked=mask(raw),
    )
    assert contact.value_masked == "o***@business.com"
    assert raw not in contact.value_masked
    assert raw not in contact.model_dump_json()  # masked-only on the wire
    # phone masking too
    assert mask("+15551234567") == "+1********67"


# ── 9. API smoke (TestClient) ────────────────────────────────────────────────
_app = FastAPI()
_app.include_router(channels_router)
_client = TestClient(_app)
_TID = "t_e2e_api"


def test_api_status_returns_nine():
    r = _client.get("/api/channels/status", params={"tenant_id": _TID})
    assert r.status_code == 200, r.text
    assert len(r.json()) == 9


def test_api_config_enables_channel():
    r = _client.post("/api/channels/web_chat/config", json={
        "tenant_id": _TID, "enabled": True, "mode": "live",
        "settings": {"widget_id": "w1"}, "credentials_present": {}})
    assert r.status_code == 200, r.text
    st = r.json()
    assert st["requirements_met"] is True and st["live"] is True


def test_api_dry_run_never_transmits():
    r = _client.post("/api/channels/sms/dry-run", json={
        "tenant_id": _TID, "recipient_id": "+1", "text": "hi"})
    assert r.status_code == 200, r.text
    sr = r.json()
    assert sr["ok"] is True and sr["dry_run"] is True and sr["sent"] is False
    assert sr["preview"]["text"] == "hi"


def test_api_inbound_replay():
    r = _client.post("/api/channels/web_chat/inbound", json={
        "tenant_id": _TID, "raw": {"sender": "u9", "message": "hello there"}})
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["inbound"]["text"] == "hello there"
    assert out["inbound"]["sender_id"] == "u9"


def test_api_agents_returns_four():
    r = _client.get("/api/channels/agents")
    assert r.status_code == 200, r.text
    names = {a["name"] for a in r.json()}
    assert names == {"receptionist", "marketing", "seo", "omnichannel"}


def test_api_pixie_contact_returns_masked_raw_absent():
    raw_email = "secretowner@business.com"
    r = _client.post("/api/channels/pixie-contact", json={
        "tenant_id": _TID, "type": "email", "value": raw_email,
        "preferred_channel": "email", "notify_on": ["new_lead"]})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["value_masked"] == "s***@business.com"
    assert raw_email not in r.text  # raw NEVER on the wire
    g = _client.get("/api/channels/pixie-contact", params={"tenant_id": _TID})
    assert raw_email not in g.text
    assert g.json()["value_masked"] == "s***@business.com"


def test_api_unknown_channel_404():
    r = _client.get("/api/channels/carrier_pigeon/status", params={"tenant_id": _TID})
    assert r.status_code == 404
