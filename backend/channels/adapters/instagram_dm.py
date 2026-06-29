"""InstagramDmAdapter — Instagram Messaging (Meta Graph API), mock-first.

A FUTURE_PLACEHOLDER channel: live Instagram DM messaging requires a Meta app,
the `instagram_manage_messages` permission, and app-review approval. Until that's
granted the adapter NEVER transmits — `send()` stays dry-run and explains why.

The point of this file is to embed Instagram's hard messaging rule INSIDE the
adapter, isolated from the router:

**24-hour messaging window + human-agent message tag.** Instagram messaging only
allows free-form replies within 24 hours of the user's last message. A proactive
send OUTSIDE that window MUST carry an allowed message tag (e.g. the human-agent
tag). If outside the window and no tag is supplied, the send is BLOCKED here — it
never reaches the Graph API.

Live send is a TODO — `send()` returns a dry-run preview with a reason.
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
)

# Instagram message text body cap (~1000 chars per send).
_MAX_TEXT_LEN = 1000


class InstagramDmAdapter(ChannelAdapter):
    """Instagram DM adapter (FUTURE_PLACEHOLDER, app-review gated, dry-run only)."""

    def __init__(self) -> None:
        self.channel = Channel.INSTAGRAM_DM
        self.support_level = support_level_for(Channel.INSTAGRAM_DM)

    # ── capabilities ─────────────────────────────────────────────────────────
    def capabilities(self) -> Capabilities:
        return Capabilities(
            inbound=True,
            outbound=True,
            supports_media=True,
            supports_buttons=True,  # quick replies
            supports_proactive=False,  # outside the 24h window needs a message tag
            max_text_len=_MAX_TEXT_LEN,
            notes=(
                "Instagram Messaging via Meta Graph API (FUTURE_PLACEHOLDER, "
                "app-review required for instagram_manage_messages). 24-hour "
                "messaging window: proactive sends outside it require an allowed "
                "human-agent message tag."
            ),
        )

    # ── inbound ──────────────────────────────────────────────────────────────
    def normalize_inbound(self, tenant_id: str, raw: dict) -> InboundMessage:
        """Normalize a Meta (Instagram) messaging webhook payload.

        Meta shape:
            entry[].messaging[] -> {sender.id, recipient.id, message.{text, mid}}
        Falls back tolerantly to a flat {sender, text, id} shape.
        """
        raw = raw or {}
        sender_id = ""
        message_id = ""
        text = ""
        timestamp = ""
        media: list[MediaItem] = []

        item = self._extract_messaging(raw)
        if item is not None:
            sender = item.get("sender")
            if isinstance(sender, dict):
                sender_id = str(sender.get("id") or "")
            timestamp = str(item.get("timestamp") or "")
            message = item.get("message")
            if isinstance(message, dict):
                message_id = str(message.get("mid") or "")
                text = str(message.get("text") or "")
                media = self._extract_media(message)

        # Tolerant flat fallback for {sender, text, id} (+ common aliases).
        if not sender_id:
            sender_id = str(raw.get("sender") or raw.get("sender_id") or raw.get("from") or "")
        if not message_id:
            message_id = str(raw.get("id") or raw.get("mid") or raw.get("message_id") or "")
        if not text:
            flat_text = raw.get("text")
            if isinstance(flat_text, dict):
                text = str(flat_text.get("body") or "")
            elif flat_text is not None:
                text = str(flat_text)
            else:
                text = str(raw.get("body") or raw.get("message") or "")
        if not timestamp:
            timestamp = str(raw.get("timestamp") or raw.get("ts") or "")

        return InboundMessage(
            tenant_id=tenant_id,
            channel=self.channel,
            sender_id=sender_id,
            thread_id=sender_id,  # IG threads by the sender's IGSID
            text=text,
            media=media,
            timestamp=timestamp,
            message_id=message_id,
            raw=raw,
        )

    @staticmethod
    def _extract_messaging(raw: dict) -> dict | None:
        entry = raw.get("entry")
        if not isinstance(entry, list) or not entry:
            return None
        first_entry = entry[0]
        if not isinstance(first_entry, dict):
            return None
        messaging = first_entry.get("messaging")
        if not isinstance(messaging, list) or not messaging:
            return None
        first = messaging[0]
        return first if isinstance(first, dict) else None

    @staticmethod
    def _extract_media(message: dict) -> list[MediaItem]:
        out: list[MediaItem] = []
        attachments = message.get("attachments")
        if isinstance(attachments, list):
            for att in attachments:
                if not isinstance(att, dict):
                    continue
                payload = att.get("payload") if isinstance(att.get("payload"), dict) else {}
                out.append(
                    MediaItem(
                        type=str(att.get("type") or "file"),
                        url=str(payload.get("url") or ""),
                    )
                )
        return out

    # ── outbound ─────────────────────────────────────────────────────────────
    def format_outbound(self, msg: OutboundMessage) -> dict:
        """Shape into a Graph send-shaped payload (recipient + message text,
        quick_replies from buttons)."""
        text = msg.text or ""
        if len(text) > _MAX_TEXT_LEN:
            text = text[:_MAX_TEXT_LEN]

        message: dict = {"text": text}
        if msg.buttons:
            message["quick_replies"] = [
                {
                    "content_type": "text",
                    "title": b.label,
                    "payload": b.value or b.label,
                }
                for b in msg.buttons
            ]
        if msg.media:
            message["attachments"] = [m.model_dump() for m in msg.media]

        payload: dict = {
            "recipient": {"id": msg.recipient_id},
            "message": message,
        }
        tag = (msg.meta or {}).get("message_tag")
        if tag:
            payload["messaging_type"] = "MESSAGE_TAG"
            payload["tag"] = str(tag)
        return payload

    # ── send (window-gated, dry-run only) ────────────────────────────────────
    def send(self, msg: OutboundMessage, config: ChannelConfig) -> SendResult:
        """Never transmits. Enforces the 24h window + message-tag rule, then
        dry-runs.

        meta keys read: ``within_24h``, ``message_tag``.
        """
        meta = msg.meta or {}
        if meta.get("within_24h") is not True and not meta.get("message_tag"):
            # Default-deny (matches WhatsApp): block unless we KNOW we're inside the
            # 24h window (within_24h is True) or a message tag is supplied. The
            # router stamps within_24h=True on replies to a just-received inbound.
            return SendResult(
                ok=False,
                channel=self.channel,
                recipient_id=msg.recipient_id,
                dry_run=True,
                sent=False,
                preview={},
                reason="outside_24h_requires_tag",
            )

        reason = "live_not_wired" if config.is_live() else "mock_mode"
        return SendResult(
            ok=True,
            channel=self.channel,
            recipient_id=msg.recipient_id,
            dry_run=True,
            sent=False,
            preview=self.format_outbound(msg),
            reason=reason,
        )
