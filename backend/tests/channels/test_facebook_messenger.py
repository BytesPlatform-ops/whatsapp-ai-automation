"""FacebookMessengerAdapter tests — Messenger webhook normalize + 24h/message-tag.

Plain `def test_*` functions, callable directly. $0, no network, no API keys.
"""

from __future__ import annotations

from channels.adapters.facebook_messenger import FacebookMessengerAdapter
from channels.schemas import (
    Button,
    Channel,
    ChannelConfig,
    ChannelMode,
    OutboundMessage,
    SupportLevel,
)


def _cfg(**kw) -> ChannelConfig:
    base = dict(tenant_id="t1", channel=Channel.FACEBOOK_MESSENGER, enabled=False, mode=ChannelMode.MOCK)
    base.update(kw)
    return ChannelConfig(**base)


def test_identity():
    a = FacebookMessengerAdapter()
    assert a.channel == Channel.FACEBOOK_MESSENGER
    assert a.support_level == SupportLevel.FUTURE_PLACEHOLDER


def test_capabilities():
    cap = FacebookMessengerAdapter().capabilities()
    assert cap.supports_media is True
    assert cap.supports_buttons is True
    assert cap.supports_proactive is False


def test_normalize_messenger_webhook_shape():
    a = FacebookMessengerAdapter()
    raw = {
        "entry": [
            {
                "messaging": [
                    {
                        "sender": {"id": "psid_123"},
                        "recipient": {"id": "page_999"},
                        "timestamp": 1700000000,
                        "message": {"mid": "mid.XYZ", "text": "hello page"},
                    }
                ]
            }
        ]
    }
    inb = a.normalize_inbound("t1", raw)
    assert inb.sender_id == "psid_123"
    assert inb.thread_id == "psid_123"
    assert inb.message_id == "mid.XYZ"
    assert inb.text == "hello page"
    assert inb.channel == Channel.FACEBOOK_MESSENGER


def test_normalize_flat_fallback():
    a = FacebookMessengerAdapter()
    inb = a.normalize_inbound("t1", {"sender": "u9", "text": "yo", "id": "m9"})
    assert inb.sender_id == "u9"
    assert inb.text == "yo"
    assert inb.message_id == "m9"


def test_proactive_outside_24h_no_tag_is_blocked():
    a = FacebookMessengerAdapter()
    msg = OutboundMessage(
        tenant_id="t1",
        channel=Channel.FACEBOOK_MESSENGER,
        recipient_id="psid_123",
        text="checking in",
        meta={"within_24h": False},
    )
    res = a.send(msg, _cfg())
    assert res.ok is False
    assert res.sent is False
    assert res.reason == "outside_24h_requires_tag"


def test_outside_24h_with_message_tag_dry_runs():
    a = FacebookMessengerAdapter()
    msg = OutboundMessage(
        tenant_id="t1",
        channel=Channel.FACEBOOK_MESSENGER,
        recipient_id="psid_123",
        text="appointment reminder",
        meta={"within_24h": False, "message_tag": "CONFIRMED_EVENT_UPDATE"},
    )
    res = a.send(msg, _cfg())
    assert res.ok is True
    assert res.dry_run is True
    assert res.sent is False
    assert res.preview["tag"] == "CONFIRMED_EVENT_UPDATE"
    assert res.preview["messaging_type"] == "MESSAGE_TAG"


def test_within_24h_dry_runs_without_tag():
    a = FacebookMessengerAdapter()
    msg = OutboundMessage(
        tenant_id="t1",
        channel=Channel.FACEBOOK_MESSENGER,
        recipient_id="psid_123",
        text="reply within window",
        meta={"within_24h": True},
    )
    res = a.send(msg, _cfg())
    assert res.ok is True
    assert res.dry_run is True
    assert res.preview["message"]["text"] == "reply within window"
    assert res.preview["messaging_type"] == "RESPONSE"


def test_format_outbound_carries_quick_replies():
    a = FacebookMessengerAdapter()
    msg = OutboundMessage(
        tenant_id="t1",
        channel=Channel.FACEBOOK_MESSENGER,
        recipient_id="psid_123",
        text="pick one",
        buttons=[Button(label="Book", value="book")],
    )
    payload = a.format_outbound(msg)
    assert payload["recipient"]["id"] == "psid_123"
    qr = payload["message"]["quick_replies"]
    assert len(qr) == 1
    assert qr[0]["title"] == "Book"
    assert qr[0]["payload"] == "book"


def test_send_never_sets_sent_true():
    a = FacebookMessengerAdapter()
    msg = OutboundMessage(
        tenant_id="t1",
        channel=Channel.FACEBOOK_MESSENGER,
        recipient_id="psid_123",
        text="x",
        meta={"within_24h": True},
    )
    # even with a "live" config, nothing transmits in this placeholder channel
    res = a.send(msg, _cfg(enabled=True, mode=ChannelMode.LIVE, requirements_met=True))
    assert res.sent is False
    assert res.dry_run is True
    assert res.reason == "live_not_wired"


if __name__ == "__main__":
    for _name, _fn in list(globals().items()):
        if _name.startswith("test_") and callable(_fn):
            _fn()
    print("fb OK")
