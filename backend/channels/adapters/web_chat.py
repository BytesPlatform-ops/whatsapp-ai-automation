"""WebChatAdapter — the ONE channel that is fully live with NO external creds.

Pixie owns the web chat surface end-to-end: the "provider" is our own widget /
websocket, so *delivering* a message just means returning the formatted text to
the caller (the open socket/HTTP response). There is no third party to authorize,
no token, no network egress — which is exactly why this is the DoD's "web_chat
fully working live" channel.

Rules kept inside this adapter:
- supports buttons + media, proactive ok, max text 4096.
- inbound normalizer is tolerant of the widget's field names (`message`/`text`,
  `customer_id`/`sender`/`session_id`, `thread`/`conversation_id`, `history`).
- send: when the config is enabled (or live), the message is "delivered" by
  returning it as the SendResult preview with sent=True/dry_run=False; when the
  channel is off, we still produce a dry-run preview and never claim delivery.
"""

from __future__ import annotations

from ..base import ChannelAdapter
from ..requirements import support_level_for
from ..schemas import (
    Capabilities,
    Channel,
    ChannelConfig,
    InboundMessage,
    MediaItem,
    OutboundMessage,
    SendResult,
    SupportLevel,
)

# Widget field aliases — be tolerant of however the front-end labels things.
_TEXT_KEYS = ("message", "text", "body", "content")
_SENDER_KEYS = ("customer_id", "sender", "session_id", "sender_id", "user_id")
_THREAD_KEYS = ("thread", "conversation_id", "thread_id", "session_id")
_ID_KEYS = ("message_id", "id", "mid")
_TS_KEYS = ("timestamp", "ts", "time", "created_at")

#: Web chat is a long, rich text surface.
MAX_TEXT_LEN = 4096


def _first(raw: dict, keys: tuple[str, ...], default: str = "") -> str:
    for k in keys:
        v = raw.get(k)
        if v:
            return str(v)
    return default


class WebChatAdapter(ChannelAdapter):
    """Fully-live web chat. Delivery = returning text to the caller/websocket."""

    def __init__(self) -> None:
        self.channel = Channel.WEB_CHAT
        self.support_level = support_level_for(Channel.WEB_CHAT) or SupportLevel.FULL_API

    # ── identity / capabilities ──────────────────────────────────────────────
    def capabilities(self) -> Capabilities:
        return Capabilities(
            inbound=True,
            outbound=True,
            supports_media=True,
            supports_buttons=True,
            supports_proactive=True,
            max_text_len=MAX_TEXT_LEN,
            notes="web_chat: fully live, no external provider (delivery = reply on the open socket)",
        )

    # ── inbound ──────────────────────────────────────────────────────────────
    def normalize_inbound(self, tenant_id: str, raw: dict) -> InboundMessage:
        raw = dict(raw or {})  # copy — never mutate the caller's/logged payload
        media = [MediaItem(**m) if isinstance(m, dict) else MediaItem(url=str(m))
                 for m in (raw.get("media") or [])]
        # The widget may carry prior turns; keep them in raw for the service.
        if "history" in raw:
            raw.setdefault("_history", raw.get("history"))
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

    # ── outbound ─────────────────────────────────────────────────────────────
    def format_outbound(self, msg: OutboundMessage) -> dict:
        text = msg.text
        if len(text) > MAX_TEXT_LEN:
            text = text[:MAX_TEXT_LEN]
        payload: dict = {
            "channel": self.channel.value,
            "to": msg.recipient_id,
            "thread_id": msg.thread_id,
            "text": text,
        }
        if msg.media:
            payload["media"] = [m.model_dump() for m in msg.media]
        if msg.buttons:
            payload["buttons"] = [b.model_dump() for b in msg.buttons]
        if msg.meta:
            payload["meta"] = msg.meta
        return payload

    def send(self, msg: OutboundMessage, config: ChannelConfig) -> SendResult:
        """Deliver by returning the formatted text. There is no external provider,
        so delivery just means returning the text — but we still require the channel
        to be ready (enabled + requirements met, e.g. a widget connected). This is
        the ONE intentional dry-run exception: an in-process channel with no network
        egress, so it does not require mode==live."""
        preview = self.format_outbound(msg)
        # Compute readiness from the config directly (don't depend on the router
        # having pre-populated requirements_met): enabled + its requirements met.
        ready = config.enabled and self.validate_credentials(config)
        delivered = config.is_live() or ready
        if delivered:
            return SendResult(
                ok=True,
                channel=self.channel,
                recipient_id=msg.recipient_id,
                dry_run=False,
                sent=True,
                idempotency_key=msg.idempotency_key or "",
                preview=preview,
                reason="delivered",
            )
        return SendResult(
            ok=True,
            channel=self.channel,
            recipient_id=msg.recipient_id,
            dry_run=True,
            sent=False,
            idempotency_key=msg.idempotency_key or "",
            preview=preview,
            reason="channel_disabled",
        )
