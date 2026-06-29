"""SmsAdapter tests — truncation, segments, opt-out. Plain `def test_*`."""

from __future__ import annotations

from channels.adapters.sms import (
    SmsAdapter,
    is_opt_in,
    is_opt_out,
    segment_count,
)
from channels.schemas import (
    Channel,
    ChannelConfig,
    ChannelMode,
    OutboundMessage,
    SupportLevel,
)


def _adapter() -> SmsAdapter:
    return SmsAdapter()


def test_identity_and_capabilities():
    a = _adapter()
    assert a.channel == Channel.SMS
    assert a.support_level == SupportLevel.PARTIAL_API
    cap = a.capabilities()
    assert cap.supports_media is False and cap.supports_buttons is False
    assert cap.max_text_len == 160
    assert "a2p" in cap.notes.lower()  # A2P registration note present


def test_truncation_and_segment_count():
    a = _adapter()
    out = OutboundMessage(tenant_id="t_a", channel=Channel.SMS, recipient_id="+1", text="x" * 500)
    payload = a.format_outbound(out)
    assert len(payload["text"]) == 160
    assert payload["segments"] == 4   # ceil(500 / 160)
    assert segment_count("x" * 500) == 4
    assert segment_count("") == 1


def test_opt_out_helper():
    assert is_opt_out("STOP") is True
    assert is_opt_out("stop") is True
    assert is_opt_out("  Unsubscribe ") is True
    assert is_opt_out("hello") is False
    assert is_opt_in("START") is True
    assert is_opt_in("hello") is False


def test_inbound_sets_opt_out_flag():
    a = _adapter()
    inb = a.normalize_inbound("t_a", {"from": "+15550001111", "body": "STOP"})
    assert inb.text == "STOP"
    assert inb.sender_id == "+15550001111"
    assert inb.raw.get("_opt_out") is True
    assert inb.raw.get("_opt_in") is None


def test_inbound_sets_opt_in_flag():
    a = _adapter()
    inb = a.normalize_inbound("t_a", {"from": "+15550001111", "body": "START"})
    assert inb.raw.get("_opt_in") is True
    assert inb.raw.get("_opt_out") is None


def test_inbound_normal_message_no_flags():
    a = _adapter()
    inb = a.normalize_inbound("t_a", {"from": "+1", "body": "hi there"})
    assert inb.raw.get("_opt_out") is None and inb.raw.get("_opt_in") is None


def test_send_stays_dry_run():
    a = _adapter()
    cfg = ChannelConfig(tenant_id="t_a", channel=Channel.SMS, enabled=True)
    sr = a.send(OutboundMessage(tenant_id="t_a", channel=Channel.SMS,
                                recipient_id="+1", text="hi"), cfg)
    assert sr.sent is False and sr.dry_run is True
    assert sr.reason == "mock_mode"

    live_cfg = ChannelConfig(tenant_id="t_a", channel=Channel.SMS, enabled=True,
                             mode=ChannelMode.LIVE, requirements_met=True,
                             credentials_present={"account_sid": True, "auth_token": True},
                             settings={"phone_number": "+1", "a2p_registered": True,
                                       "opt_out_enabled": True})
    sr2 = a.send(OutboundMessage(tenant_id="t_a", channel=Channel.SMS,
                                 recipient_id="+1", text="hi"), live_cfg)
    assert sr2.sent is False and sr2.dry_run is True
    assert sr2.reason == "live_not_wired"


if __name__ == "__main__":
    for _n, _f in list(vars().items()):
        if _n.startswith("test_"):
            _f()
    print("sms OK")
