"""EmailAdapter tests — inbound parse + marketing unsubscribe-footer compliance.

Plain `def test_*` functions, callable directly. $0, no network, no API keys.
"""

from __future__ import annotations

from channels.adapters.email import EmailAdapter
from channels.schemas import (
    Channel,
    ChannelConfig,
    ChannelMode,
    OutboundMessage,
    SupportLevel,
)


def _cfg(**kw) -> ChannelConfig:
    base = dict(tenant_id="t1", channel=Channel.EMAIL, enabled=False, mode=ChannelMode.MOCK)
    base.update(kw)
    return ChannelConfig(**base)


def test_identity():
    a = EmailAdapter()
    assert a.channel == Channel.EMAIL
    assert a.support_level == SupportLevel.PARTIAL_API


def test_capabilities():
    cap = EmailAdapter().capabilities()
    assert cap.supports_media is True  # attachments
    assert cap.supports_buttons is False
    assert cap.supports_proactive is True
    assert cap.max_text_len >= 100_000
    assert "spf" in cap.notes.lower() or "dkim" in cap.notes.lower()


def test_normalize_inbound():
    a = EmailAdapter()
    raw = {
        "from": "alice@example.com",
        "subject": "Question about my order",
        "text": "Where is my package?",
        "message_id": "<abc@mail>",
    }
    inb = a.normalize_inbound("t1", raw)
    assert inb.sender_id == "alice@example.com"
    assert inb.text == "Where is my package?"
    assert inb.raw.get("subject") == "Question about my order"
    assert inb.message_id == "<abc@mail>"
    assert inb.channel == Channel.EMAIL


def test_normalize_inbound_html_fallback():
    a = EmailAdapter()
    inb = a.normalize_inbound("t1", {"sender": "bob@x.com", "html": "<p>hi</p>"})
    assert inb.sender_id == "bob@x.com"
    assert inb.text == "<p>hi</p>"


def test_marketing_gets_unsubscribe_footer():
    a = EmailAdapter()
    msg = OutboundMessage(
        tenant_id="t1",
        channel=Channel.EMAIL,
        recipient_id="lead@x.com",
        text="Check out our new feature!",
        meta={"subject": "Big news", "category": "marketing"},
    )
    payload = a.format_outbound(msg)
    assert payload["unsubscribe"] is True
    assert "unsubscribe" in payload["body"].lower()
    assert payload["subject"] == "Big news"


def test_marketing_flag_alias():
    a = EmailAdapter()
    msg = OutboundMessage(
        tenant_id="t1",
        channel=Channel.EMAIL,
        recipient_id="lead@x.com",
        text="Promo time",
        meta={"marketing": True},
    )
    payload = a.format_outbound(msg)
    assert payload["unsubscribe"] is True
    assert "unsubscribe" in payload["body"].lower()


def test_marketing_does_not_double_append_footer():
    a = EmailAdapter()
    body = "Deal inside. Unsubscribe at any time: http://x.com/u"
    msg = OutboundMessage(
        tenant_id="t1",
        channel=Channel.EMAIL,
        recipient_id="lead@x.com",
        text=body,
        meta={"category": "marketing"},
    )
    payload = a.format_outbound(msg)
    assert payload["body"].lower().count("unsubscribe") == 1


def test_transactional_does_not_force_unsubscribe():
    a = EmailAdapter()
    msg = OutboundMessage(
        tenant_id="t1",
        channel=Channel.EMAIL,
        recipient_id="customer@x.com",
        text="Your receipt is attached.",
        meta={"subject": "Receipt", "category": "transactional"},
    )
    payload = a.format_outbound(msg)
    assert payload["unsubscribe"] is False
    assert "unsubscribe" not in payload["body"].lower()


def test_default_subject():
    a = EmailAdapter()
    msg = OutboundMessage(
        tenant_id="t1", channel=Channel.EMAIL, recipient_id="x@x.com", text="hi"
    )
    payload = a.format_outbound(msg)
    assert payload["subject"]  # non-empty default


def test_send_stays_dry_run():
    a = EmailAdapter()
    msg = OutboundMessage(
        tenant_id="t1", channel=Channel.EMAIL, recipient_id="x@x.com", text="hi"
    )
    res = a.send(msg, _cfg())
    assert res.dry_run is True
    assert res.sent is False
    assert res.reason == "mock_mode"


if __name__ == "__main__":
    for _name, _fn in list(globals().items()):
        if _name.startswith("test_") and callable(_fn):
            _fn()
    print("email OK")
