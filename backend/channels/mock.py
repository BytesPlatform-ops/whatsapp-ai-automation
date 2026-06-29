"""MockAdapterBase — a deterministic, keyless adapter for every channel.

This is what lets the WHOLE layer run end-to-end with NO API keys: the router
seeds one of these per channel. It normalizes a generic raw payload, formats a
generic outbound payload, and NEVER transmits — `send()` returns a dry-run
`SendResult` with a `preview`. Wave 2 replaces specific channels with richer
adapters (web_chat live, telegram token-based, …); this stays the safe fallback.

A real adapter subclasses `ChannelAdapter` directly and implements live `send`.
"""

from __future__ import annotations

from .base import ChannelAdapter
from .requirements import support_level_for
from .schemas import (
    Capabilities,
    Channel,
    ChannelConfig,
    InboundMessage,
    MediaItem,
    OutboundMessage,
    SendResult,
)

# Generic field aliases so one normalizer handles most providers' shapes.
_SENDER_KEYS = ("sender_id", "from", "sender", "user_id", "msisdn", "chat_id")
_THREAD_KEYS = ("thread_id", "thread", "conversation_id", "chat_id")
_TEXT_KEYS = ("text", "message", "body", "content")
_ID_KEYS = ("message_id", "id", "mid", "sid")
_TS_KEYS = ("timestamp", "ts", "time", "created_at")


def _first(raw: dict, keys: tuple[str, ...], default: str = "") -> str:
    for k in keys:
        v = raw.get(k)
        if v:
            return str(v)
    return default


class MockAdapterBase(ChannelAdapter):
    """Concrete generic adapter bound to a single channel at construction."""

    def __init__(self, channel: Channel) -> None:
        self.channel = channel
        self.support_level = support_level_for(channel)

    def capabilities(self) -> Capabilities:
        media = self.channel not in (Channel.SMS, Channel.VOICE)
        buttons = self.channel in (Channel.WEB_CHAT, Channel.WHATSAPP, Channel.TELEGRAM,
                                   Channel.FACEBOOK_MESSENGER, Channel.INSTAGRAM_DM)
        return Capabilities(
            inbound=True,
            outbound=True,
            supports_media=media,
            supports_buttons=buttons,
            supports_proactive=self.channel != Channel.WHATSAPP,  # WA needs templates outside 24h
            max_text_len=160 if self.channel == Channel.SMS else 4096,
            notes="mock adapter (deterministic, keyless)",
        )

    def normalize_inbound(self, tenant_id: str, raw: dict) -> InboundMessage:
        raw = raw or {}
        media = [MediaItem(**m) if isinstance(m, dict) else MediaItem(url=str(m))
                 for m in (raw.get("media") or [])]
        return InboundMessage(
            tenant_id=tenant_id,
            channel=self.channel,
            sender_id=_first(raw, _SENDER_KEYS),
            thread_id=_first(raw, _THREAD_KEYS),
            text=_first(raw, _TEXT_KEYS),
            media=media,
            timestamp=_first(raw, _TS_KEYS),
            message_id=_first(raw, _ID_KEYS),
            raw=raw,
        )

    def format_outbound(self, msg: OutboundMessage) -> dict:
        cap = self.capabilities()
        text = msg.text
        if len(text) > cap.max_text_len:
            text = text[: cap.max_text_len]
        payload: dict = {
            "channel": self.channel.value,
            "to": msg.recipient_id,
            "thread_id": msg.thread_id,
            "text": text,
        }
        if cap.supports_media and msg.media:
            payload["media"] = [m.model_dump() for m in msg.media]
        if cap.supports_buttons and msg.buttons:
            payload["buttons"] = [b.model_dump() for b in msg.buttons]
        if msg.meta:
            payload["meta"] = msg.meta
        return payload

    def send(self, msg: OutboundMessage, config: ChannelConfig) -> SendResult:
        """Mock send — NEVER transmits. Returns a dry-run preview. (Even if the
        config says live, Wave 1 has no real provider wired, so we stay dry-run
        and say so.)"""
        reason = "mock_mode" if not config.is_live() else "live_not_wired_yet"
        return SendResult(
            ok=True,
            channel=self.channel,
            recipient_id=msg.recipient_id,
            dry_run=True,
            sent=False,
            preview=self.format_outbound(msg),
            reason=reason,
        )
