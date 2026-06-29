"""TelegramAdapter tests — Bot API shape, mock-first. Plain `def test_*`."""

from __future__ import annotations

from channels.adapters.telegram import TelegramAdapter
from channels.schemas import (
    Button,
    Channel,
    ChannelConfig,
    ChannelMode,
    OutboundMessage,
    SupportLevel,
)


def _adapter() -> TelegramAdapter:
    return TelegramAdapter()


def test_identity():
    a = _adapter()
    assert a.channel == Channel.TELEGRAM
    assert a.support_level == SupportLevel.FULL_API
    cap = a.capabilities()
    assert cap.supports_buttons is True and cap.supports_media is True
    assert cap.max_text_len == 4096


def test_normalize_inbound_telegram_update():
    a = _adapter()
    raw = {
        "update_id": 1001,
        "message": {
            "message_id": 55,
            "from": {"id": 42, "first_name": "Sam"},
            "chat": {"id": 9001, "type": "private"},
            "date": 1700000000,
            "text": "hello bot",
        },
    }
    inb = a.normalize_inbound("t_a", raw)
    assert inb.text == "hello bot"
    assert inb.sender_id == "42"        # from id
    assert inb.thread_id == "9001"      # chat id
    assert inb.message_id == "55"
    assert inb.channel == Channel.TELEGRAM


def test_normalize_inbound_tolerant_of_missing():
    a = _adapter()
    inb = a.normalize_inbound("t_a", {})  # garbage / empty — must not raise
    assert inb.text == "" and inb.sender_id == "" and inb.thread_id == ""


def test_format_outbound_chat_id_and_buttons():
    a = _adapter()
    out = OutboundMessage(tenant_id="t_a", channel=Channel.TELEGRAM,
                          recipient_id="42", thread_id="9001", text="pick",
                          buttons=[Button(label="Open", value="https://x.com", kind="url"),
                                   Button(label="Yes", value="confirm")])
    payload = a.format_outbound(out)
    assert payload["method"] == "sendMessage"
    assert payload["chat_id"] == "9001"
    kb = payload["reply_markup"]["inline_keyboard"]
    assert kb[0][0]["url"] == "https://x.com"
    assert kb[1][0]["callback_data"] == "confirm"


def test_send_stays_dry_run_without_creds():
    a = _adapter()
    # mock mode
    cfg = ChannelConfig(tenant_id="t_a", channel=Channel.TELEGRAM, enabled=True)
    sr = a.send(OutboundMessage(tenant_id="t_a", channel=Channel.TELEGRAM,
                                recipient_id="42", thread_id="9001", text="hi"), cfg)
    assert sr.sent is False and sr.dry_run is True
    assert sr.reason == "mock_mode"

    # live-ish config but requirements not met → still dry-run (is_live False)
    live_cfg = ChannelConfig(tenant_id="t_a", channel=Channel.TELEGRAM, enabled=True,
                             mode=ChannelMode.LIVE, requirements_met=False)
    sr2 = a.send(OutboundMessage(tenant_id="t_a", channel=Channel.TELEGRAM,
                                 recipient_id="42", thread_id="9001", text="hi"), live_cfg)
    assert sr2.sent is False and sr2.dry_run is True


if __name__ == "__main__":
    for _n, _f in list(vars().items()):
        if _n.startswith("test_"):
            _f()
    print("telegram OK")
