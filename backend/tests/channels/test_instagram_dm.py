"""InstagramDmAdapter tests — Meta webhook normalize + 24h-window/message-tag rule.

Plain `def test_*` functions, callable directly. $0, no network, no API keys.
"""

from __future__ import annotations

from channels.adapters.instagram_dm import InstagramDmAdapter
from channels.schemas import (
    Button,
    Channel,
    ChannelConfig,
    ChannelMode,
    OutboundMessage,
    SupportLevel,
)


def _cfg(**kw) -> ChannelConfig:
    base = dict(tenant_id="t1", channel=Channel.INSTAGRAM_DM, enabled=False, mode=ChannelMode.MOCK)
    base.update(kw)
    return ChannelConfig(**base)


def test_identity():
    a = InstagramDmAdapter()
    assert a.channel == Channel.INSTAGRAM_DM
    assert a.support_level == SupportLevel.FUTURE_PLACEHOLDER


def test_capabilities():
    cap = InstagramDmAdapter().capabilities()
    assert cap.supports_media is True
    assert cap.supports_buttons is True
    assert cap.supports_proactive is False


def test_normalize_meta_webhook_shape():
    a = InstagramDmAdapter()
    raw = {
        "entry": [
            {
                "messaging": [
                    {
                        "sender": {"id": "igsid_123"},
                        "recipient": {"id": "page_999"},
                        "timestamp": 1700000000,
                        "message": {"mid": "mid.ABC", "text": "hey there"},
                    }
                ]
            }
        ]
    }
    inb = a.normalize_inbound("t1", raw)
    assert inb.sender_id == "igsid_123"
    assert inb.thread_id == "igsid_123"
    assert inb.message_id == "mid.ABC"
    assert inb.text == "hey there"
    assert inb.channel == Channel.INSTAGRAM_DM


def test_normalize_flat_fallback():
    a = InstagramDmAdapter()
    inb = a.normalize_inbound("t1", {"sender": "u1", "text": "hi", "id": "m1"})
    assert inb.sender_id == "u1"
    assert inb.text == "hi"
    assert inb.message_id == "m1"


def test_proactive_outside_24h_no_tag_is_blocked():
    a = InstagramDmAdapter()
    msg = OutboundMessage(
        tenant_id="t1",
        channel=Channel.INSTAGRAM_DM,
        recipient_id="igsid_123",
        text="checking in",
        meta={"within_24h": False},
    )
    res = a.send(msg, _cfg())
    assert res.ok is False
    assert res.sent is False
    assert res.reason == "outside_24h_requires_tag"


def test_outside_24h_with_message_tag_dry_runs():
    a = InstagramDmAdapter()
    msg = OutboundMessage(
        tenant_id="t1",
        channel=Channel.INSTAGRAM_DM,
        recipient_id="igsid_123",
        text="agent follow-up",
        meta={"within_24h": False, "message_tag": "HUMAN_AGENT"},
    )
    res = a.send(msg, _cfg())
    assert res.ok is True
    assert res.dry_run is True
    assert res.sent is False
    assert res.preview["tag"] == "HUMAN_AGENT"


def test_within_24h_dry_runs_without_tag():
    a = InstagramDmAdapter()
    msg = OutboundMessage(
        tenant_id="t1",
        channel=Channel.INSTAGRAM_DM,
        recipient_id="igsid_123",
        text="reply within window",
        meta={"within_24h": True},
    )
    res = a.send(msg, _cfg())
    assert res.ok is True
    assert res.dry_run is True
    assert res.preview["message"]["text"] == "reply within window"


def test_format_outbound_carries_quick_replies():
    a = InstagramDmAdapter()
    msg = OutboundMessage(
        tenant_id="t1",
        channel=Channel.INSTAGRAM_DM,
        recipient_id="igsid_123",
        text="pick one",
        buttons=[Button(label="Yes", value="yes"), Button(label="No", value="no")],
    )
    payload = a.format_outbound(msg)
    assert payload["recipient"]["id"] == "igsid_123"
    qr = payload["message"]["quick_replies"]
    assert len(qr) == 2
    assert qr[0]["title"] == "Yes"
    assert qr[0]["payload"] == "yes"


def test_send_never_transmits():
    a = InstagramDmAdapter()
    msg = OutboundMessage(
        tenant_id="t1",
        channel=Channel.INSTAGRAM_DM,
        recipient_id="igsid_123",
        text="x",
        meta={"within_24h": True},
    )
    res = a.send(msg, _cfg(enabled=True, mode=ChannelMode.LIVE, requirements_met=True))
    assert res.sent is False
    assert res.dry_run is True
    assert res.reason == "live_not_wired"


if __name__ == "__main__":
    for _name, _fn in list(globals().items()):
        if _name.startswith("test_") and callable(_fn):
            _fn()
    print("ig OK")
