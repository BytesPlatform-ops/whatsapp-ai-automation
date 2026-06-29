"""WhatsAppAdapter tests — Cloud-API normalize + 24h-window/template compliance.

Plain `def test_*` functions, callable directly. $0, no network, no API keys.
"""

from __future__ import annotations

from channels.adapters.whatsapp import WhatsAppAdapter
from channels.schemas import (
    Channel,
    ChannelConfig,
    ChannelMode,
    OutboundMessage,
    SupportLevel,
)


def _cfg(**kw) -> ChannelConfig:
    base = dict(tenant_id="t1", channel=Channel.WHATSAPP, enabled=False, mode=ChannelMode.MOCK)
    base.update(kw)
    return ChannelConfig(**base)


def test_identity():
    a = WhatsAppAdapter()
    assert a.channel == Channel.WHATSAPP
    assert a.support_level == SupportLevel.PARTIAL_API


def test_capabilities():
    cap = WhatsAppAdapter().capabilities()
    assert cap.supports_media is True
    assert cap.supports_buttons is True
    assert cap.supports_proactive is False  # needs template outside 24h


def test_normalize_cloud_api_shape():
    a = WhatsAppAdapter()
    raw = {
        "entry": [
            {
                "changes": [
                    {
                        "value": {
                            "messages": [
                                {
                                    "from": "15551234567",
                                    "id": "wamid.ABC",
                                    "timestamp": "1700000000",
                                    "text": {"body": "hello there"},
                                }
                            ]
                        }
                    }
                ]
            }
        ]
    }
    inb = a.normalize_inbound("t1", raw)
    assert inb.sender_id == "15551234567"
    assert inb.message_id == "wamid.ABC"
    assert inb.text == "hello there"
    assert inb.channel == Channel.WHATSAPP


def test_normalize_flat_fallback():
    a = WhatsAppAdapter()
    inb = a.normalize_inbound("t1", {"from": "999", "text": "hi", "id": "m1"})
    assert inb.sender_id == "999"
    assert inb.text == "hi"
    assert inb.message_id == "m1"


def test_proactive_outside_24h_no_template_is_blocked():
    a = WhatsAppAdapter()
    msg = OutboundMessage(
        tenant_id="t1",
        channel=Channel.WHATSAPP,
        recipient_id="15551234567",
        text="just checking in",
        meta={"within_24h": False},
    )
    res = a.send(msg, _cfg())
    assert res.ok is False
    assert res.sent is False
    assert "template" in res.reason
    assert res.reason == "outside_24h_requires_template"


def test_outside_24h_with_template_dry_runs():
    a = WhatsAppAdapter()
    msg = OutboundMessage(
        tenant_id="t1",
        channel=Channel.WHATSAPP,
        recipient_id="15551234567",
        text="ignored for template",
        meta={"within_24h": False, "template": "reminder_v1"},
    )
    res = a.send(msg, _cfg())
    assert res.ok is True
    assert res.dry_run is True
    assert res.sent is False
    assert res.preview.get("type") == "template"


def test_within_24h_dry_runs_without_template():
    a = WhatsAppAdapter()
    msg = OutboundMessage(
        tenant_id="t1",
        channel=Channel.WHATSAPP,
        recipient_id="15551234567",
        text="reply within window",
        meta={"within_24h": True},
    )
    res = a.send(msg, _cfg())
    assert res.ok is True
    assert res.dry_run is True
    assert res.preview.get("type") == "text"
    assert res.preview["text"]["body"] == "reply within window"


def test_last_inbound_ts_counts_as_within_window():
    a = WhatsAppAdapter()
    msg = OutboundMessage(
        tenant_id="t1",
        channel=Channel.WHATSAPP,
        recipient_id="15551234567",
        text="recent inbound",
        meta={"last_inbound_ts": "1700000000"},
    )
    res = a.send(msg, _cfg())
    assert res.ok is True


def test_format_outbound_includes_template():
    a = WhatsAppAdapter()
    msg = OutboundMessage(
        tenant_id="t1",
        channel=Channel.WHATSAPP,
        recipient_id="15551234567",
        text="x",
        meta={"template": "welcome_v2"},
    )
    payload = a.format_outbound(msg)
    assert payload["messaging_product"] == "whatsapp"
    assert payload["type"] == "template"
    assert payload["template"]["name"] == "welcome_v2"


if __name__ == "__main__":
    for _name, _fn in list(globals().items()):
        if _name.startswith("test_") and callable(_fn):
            _fn()
    print("whatsapp OK")
