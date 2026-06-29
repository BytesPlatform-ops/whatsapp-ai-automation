"""TelegramAdapter — Telegram Bot API, token-based, mock-first.

Telegram is simple to wire (one bot token from @BotFather, JSON sendMessage), so
its support level is FULL_API — but we have NO token and NO network in this
environment, so the LIVE send path is a TODO: we format the exact Bot-API payload
and return it as a dry-run preview rather than transmitting. Replacing the dry-run
block with a single https POST to api.telegram.org/bot<token>/sendMessage is all
that's left to go live.

Rules kept inside this adapter:
- buttons render as a Telegram inline keyboard (reply_markup.inline_keyboard).
- media + buttons supported, max text 4096.
- inbound is tolerant of the Telegram update shape (message.chat.id, message.from.id,
  message.text, message.message_id); sender_id = from id, thread_id = chat id.
"""

from __future__ import annotations

from ..base import ChannelAdapter
from ..requirements import support_level_for
from ..schemas import (
    Button,
    Capabilities,
    Channel,
    ChannelConfig,
    InboundMessage,
    MediaItem,
    OutboundMessage,
    SendResult,
    SupportLevel,
)

#: Telegram message hard limit.
MAX_TEXT_LEN = 4096


def _g(d: dict, key: str, default=None):
    """Tolerant dict.get for untrusted payloads (returns default on non-dict)."""
    return d.get(key, default) if isinstance(d, dict) else default


def _inline_keyboard(buttons: list[Button]) -> dict:
    """Map normalized Buttons → a Telegram inline keyboard (one button per row).

    `url` buttons carry a `url`; everything else becomes `callback_data`."""
    rows = []
    for b in buttons:
        if b.kind == "url":
            rows.append([{"text": b.label, "url": b.value or b.label}])
        else:
            rows.append([{"text": b.label, "callback_data": b.value or b.label}])
    return {"inline_keyboard": rows}


class TelegramAdapter(ChannelAdapter):
    """Telegram Bot API adapter. Live send is wired but TODO (no token/network)."""

    def __init__(self) -> None:
        self.channel = Channel.TELEGRAM
        self.support_level = support_level_for(Channel.TELEGRAM) or SupportLevel.FULL_API

    # ── identity / capabilities ──────────────────────────────────────────────
    def capabilities(self) -> Capabilities:
        return Capabilities(
            inbound=True,
            outbound=True,
            supports_media=True,
            supports_buttons=True,
            supports_proactive=True,
            max_text_len=MAX_TEXT_LEN,
            notes="telegram: Bot API (token from @BotFather); live send TODO — formats payload, no network",
        )

    # ── inbound ──────────────────────────────────────────────────────────────
    def normalize_inbound(self, tenant_id: str, raw: dict) -> InboundMessage:
        raw = raw or {}
        # Telegram wraps the message in an "update"; tolerate either shape.
        message = _g(raw, "message") or _g(raw, "edited_message") or raw
        chat = _g(message, "chat", {}) or {}
        frm = _g(message, "from", {}) or {}

        chat_id = _g(chat, "id")
        from_id = _g(frm, "id")
        text = _g(message, "text") or _g(message, "caption") or ""
        msg_id = _g(message, "message_id")
        date = _g(message, "date")

        media: list[MediaItem] = []
        if _g(message, "photo"):
            media.append(MediaItem(type="image", caption=str(text or "")))
        elif _g(message, "document"):
            media.append(MediaItem(type="file"))

        return InboundMessage(
            tenant_id=tenant_id,
            channel=self.channel,
            sender_id=str(from_id) if from_id is not None else "",
            thread_id=str(chat_id) if chat_id is not None else "",
            text=str(text),
            media=media,
            timestamp=str(date) if date is not None else "",
            message_id=str(msg_id) if msg_id is not None else "",
            raw=raw,
        )

    # ── outbound ─────────────────────────────────────────────────────────────
    def format_outbound(self, msg: OutboundMessage) -> dict:
        text = msg.text
        if len(text) > MAX_TEXT_LEN:
            text = text[:MAX_TEXT_LEN]
        # Telegram replies into a chat — thread_id holds the chat id, else recipient.
        chat_id = msg.thread_id or msg.recipient_id
        payload: dict = {
            "method": "sendMessage",
            "chat_id": chat_id,
            "text": text,
        }
        if msg.buttons:
            payload["reply_markup"] = _inline_keyboard(msg.buttons)
        if msg.media:
            payload["media"] = [m.model_dump() for m in msg.media]
        if msg.meta:
            payload["meta"] = msg.meta
        return payload

    def send(self, msg: OutboundMessage, config: ChannelConfig) -> SendResult:
        """LIVE requires credentials_present['bot_token']; with no token/network the
        live path is a TODO, so we always stay dry-run and say why. Never transmits."""
        preview = self.format_outbound(msg)
        has_token = bool(config.credentials_present.get("bot_token"))
        if config.is_live():
            # TODO: POST https://api.telegram.org/bot<token>/sendMessage with `preview`.
            reason = "live_not_wired" if has_token else "missing_bot_token"
        else:
            reason = "mock_mode"
        return SendResult(
            ok=True,
            channel=self.channel,
            recipient_id=msg.recipient_id,
            dry_run=True,
            sent=False,
            idempotency_key=msg.idempotency_key or "",
            preview=preview,
            reason=reason,
        )
