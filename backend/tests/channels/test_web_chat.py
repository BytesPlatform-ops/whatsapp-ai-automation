"""WebChatAdapter tests — fully live, keyless. Plain `def test_*`, callable directly."""

from __future__ import annotations

from channels.adapters.web_chat import WebChatAdapter
from channels.schemas import (
    Button,
    Channel,
    ChannelConfig,
    ChannelMode,
    OutboundMessage,
    SupportLevel,
)


def _adapter() -> WebChatAdapter:
    return WebChatAdapter()


def test_identity():
    a = _adapter()
    assert a.channel == Channel.WEB_CHAT
    assert a.support_level == SupportLevel.FULL_API
    cap = a.capabilities()
    assert cap.supports_buttons is True and cap.supports_media is True
    assert cap.supports_proactive is True and cap.max_text_len == 4096


def test_normalize_inbound_widget_shape():
    a = _adapter()
    inb = a.normalize_inbound("t_a", {
        "message": "hi there",
        "customer_id": "cust_1",
        "conversation_id": "conv_9",
        "history": [{"role": "user", "text": "earlier"}],
    })
    assert inb.text == "hi there"
    assert inb.sender_id == "cust_1"
    assert inb.thread_id == "conv_9"
    assert inb.channel == Channel.WEB_CHAT
    assert inb.raw.get("_history") == [{"role": "user", "text": "earlier"}]


def test_send_enabled_is_delivered_live():
    a = _adapter()
    # Delivery requires the channel to be READY: enabled + its requirement met
    # (a connected widget). enabled alone is not enough.
    cfg = ChannelConfig(tenant_id="t_a", channel=Channel.WEB_CHAT, enabled=True,
                        settings={"widget_id": "w1"})
    sr = a.send(OutboundMessage(tenant_id="t_a", channel=Channel.WEB_CHAT,
                                recipient_id="cust_1", text="hello"), cfg)
    assert sr.sent is True and sr.dry_run is False
    assert sr.reason == "delivered"
    assert sr.preview["text"] == "hello" and sr.preview["to"] == "cust_1"


def test_send_enabled_without_widget_is_dry_run():
    a = _adapter()
    # enabled but NO widget connected → not ready → dry-run, not delivered.
    cfg = ChannelConfig(tenant_id="t_a", channel=Channel.WEB_CHAT, enabled=True)
    sr = a.send(OutboundMessage(tenant_id="t_a", channel=Channel.WEB_CHAT,
                                recipient_id="cust_1", text="hello"), cfg)
    assert sr.sent is False and sr.dry_run is True


def test_send_disabled_is_dry_run():
    a = _adapter()
    cfg = ChannelConfig(tenant_id="t_a", channel=Channel.WEB_CHAT, enabled=False)
    sr = a.send(OutboundMessage(tenant_id="t_a", channel=Channel.WEB_CHAT,
                                recipient_id="cust_1", text="hello"), cfg)
    assert sr.sent is False and sr.dry_run is True
    assert sr.reason == "channel_disabled"


def test_format_outbound_carries_buttons():
    a = _adapter()
    out = OutboundMessage(tenant_id="t_a", channel=Channel.WEB_CHAT, recipient_id="u",
                          text="pick one", buttons=[Button(label="Yes", value="y")])
    payload = a.format_outbound(out)
    assert payload["buttons"][0]["label"] == "Yes"
    assert payload["channel"] == "web_chat"


def test_long_text_truncated_to_max():
    a = _adapter()
    out = OutboundMessage(tenant_id="t_a", channel=Channel.WEB_CHAT, recipient_id="u",
                          text="x" * 5000)
    payload = a.format_outbound(out)
    assert len(payload["text"]) == 4096


if __name__ == "__main__":
    for _n, _f in list(vars().items()):
        if _n.startswith("test_"):
            _f()
    print("web_chat OK")
