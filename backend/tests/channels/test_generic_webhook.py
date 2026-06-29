"""GenericWebhookAdapter tests — fallback keys, field map, envelope, dry-run send.

Plain `def test_*`, callable directly (no pytest required)."""

from __future__ import annotations

from channels.adapters.generic_webhook import (
    FIELD_MAP_KEY,
    GenericWebhookAdapter,
)
from channels.schemas import (
    Channel,
    ChannelConfig,
    ChannelMode,
    MediaItem,
    OutboundMessage,
    SupportLevel,
)


def _adapter() -> GenericWebhookAdapter:
    return GenericWebhookAdapter()


def test_identity_and_capabilities():
    a = _adapter()
    assert a.channel == Channel.GENERIC_WEBHOOK
    assert a.support_level == SupportLevel.PARTIAL_API
    cap = a.capabilities()
    assert cap.supports_media is True
    assert cap.supports_buttons is False
    assert cap.supports_proactive is True
    assert cap.max_text_len > 4096


def test_inbound_fallback_keys():
    a = _adapter()
    raw = {"from": "user-7", "conversation_id": "conv-3", "body": "hello world", "event_id": "e-1"}
    inb = a.normalize_inbound("t_a", raw)
    assert inb.sender_id == "user-7"
    assert inb.thread_id == "conv-3"
    assert inb.text == "hello world"
    assert inb.message_id == "e-1"
    assert inb.raw == raw  # kept intact


def test_inbound_field_map_maps_custom_keys():
    a = _adapter()
    raw = {
        FIELD_MAP_KEY: {
            "sender_id": "actor",
            "thread_id": "room",
            "text": "payload",
            "message_id": "seq",
        },
        "actor": "abc",
        "room": "r-42",
        "payload": "custom shape works",
        "seq": "99",
    }
    inb = a.normalize_inbound("t_a", raw)
    assert inb.sender_id == "abc"
    assert inb.thread_id == "r-42"
    assert inb.text == "custom shape works"
    assert inb.message_id == "99"


def test_inbound_media_list():
    a = _adapter()
    raw = {"text": "see this", "media": [{"type": "image", "url": "https://x/a.png"}]}
    inb = a.normalize_inbound("t_a", raw)
    assert len(inb.media) == 1
    assert inb.media[0].url == "https://x/a.png"


def test_format_outbound_envelope_keys():
    a = _adapter()
    out = OutboundMessage(tenant_id="t_a", channel=Channel.GENERIC_WEBHOOK, recipient_id="u-1",
                          thread_id="th-1", text="hi", media=[MediaItem(url="https://x/i.png")],
                          meta={"k": "v"})
    env = a.format_outbound(out)
    assert set(env.keys()) == {"channel", "to", "thread_id", "text", "media", "meta"}
    assert env["channel"] == "generic_webhook"
    assert env["to"] == "u-1"
    assert env["text"] == "hi"
    assert env["media"][0]["url"] == "https://x/i.png"
    assert env["meta"] == {"k": "v"}


def test_send_mock_mode():
    a = _adapter()
    cfg = ChannelConfig(tenant_id="t_a", channel=Channel.GENERIC_WEBHOOK, enabled=True)
    sr = a.send(OutboundMessage(tenant_id="t_a", channel=Channel.GENERIC_WEBHOOK,
                                recipient_id="u-1", text="hi"), cfg)
    assert sr.sent is False and sr.dry_run is True
    assert sr.reason == "mock_mode"
    assert "endpoint_url" not in sr.preview


def test_send_live_endpoint_stays_dry_run_and_echoes_url():
    a = _adapter()
    url = "https://example.test/hook"
    live_cfg = ChannelConfig(tenant_id="t_a", channel=Channel.GENERIC_WEBHOOK, enabled=True,
                             mode=ChannelMode.LIVE, requirements_met=True,
                             settings={"endpoint_url": url})
    sr = a.send(OutboundMessage(tenant_id="t_a", channel=Channel.GENERIC_WEBHOOK,
                                recipient_id="u-1", text="hi"), live_cfg)
    assert sr.sent is False and sr.dry_run is True  # NO network
    assert sr.reason == "live_not_wired"
    assert sr.preview.get("endpoint_url") == url     # echoed target


if __name__ == "__main__":
    for _n, _f in list(vars().items()):
        if _n.startswith("test_"):
            _f()
    print("generic_webhook OK")
