"""WhatsAppAdapter — WhatsApp Cloud API, mock-first and compliance-gated.

Behind a feature flag until compliance-approved. The whole point of this file is
to embed WhatsApp's two hard rules INSIDE the adapter, isolated from the router:

1. **24-hour customer-service window + template rule.** A proactive send (no
   recent inbound from the user) made OUTSIDE the 24h window MUST use an approved
   message template. If outside the window and no template is supplied, the send
   is BLOCKED here — it never reaches a provider.
2. **Opt-out awareness + quality rating.** Users who reply STOP/block lower the
   number's quality rating; we note this in capabilities so services don't blast.

Live send (WhatsApp Cloud API) is a TODO — `send()` always stays dry-run and
returns a preview, with a reason explaining why (mock vs live-not-wired vs
blocked-by-compliance-window).
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

# WhatsApp Cloud API body cap is ~4096 chars for a text message body.
_MAX_TEXT_LEN = 4096


class WhatsAppAdapter(ChannelAdapter):
    """WhatsApp Cloud API adapter (PARTIAL_API, compliance-gated, dry-run only)."""

    def __init__(self) -> None:
        self.channel = Channel.WHATSAPP
        self.support_level = support_level_for(Channel.WHATSAPP)

    # ── capabilities ─────────────────────────────────────────────────────────
    def capabilities(self) -> Capabilities:
        return Capabilities(
            inbound=True,
            outbound=True,
            supports_media=True,
            supports_buttons=True,  # quick replies / interactive buttons
            supports_proactive=False,  # outside the 24h window needs an approved template
            max_text_len=_MAX_TEXT_LEN,
            notes=(
                "WhatsApp Cloud API (PARTIAL_API, behind compliance flag). "
                "24h customer-service window: proactive sends outside it require an "
                "approved template. Opt-out aware (STOP/block lowers quality rating); "
                "respect per-number quality rating and messaging limits."
            ),
        )

    # ── inbound ──────────────────────────────────────────────────────────────
    def normalize_inbound(self, tenant_id: str, raw: dict) -> InboundMessage:
        """Normalize a WhatsApp Cloud-API-shaped webhook payload.

        Cloud shape:
            entry[].changes[].value.messages[0] -> {from, id, timestamp, text.body}
        Falls back tolerantly to a flat {from, text, id, timestamp} shape.
        """
        raw = raw or {}
        sender_id = ""
        message_id = ""
        text = ""
        timestamp = ""
        media: list[MediaItem] = []

        msg = self._extract_cloud_message(raw)
        if msg is not None:
            sender_id = str(msg.get("from") or "")
            message_id = str(msg.get("id") or "")
            timestamp = str(msg.get("timestamp") or "")
            text = self._extract_text(msg)
            media = self._extract_media(msg)

        # Tolerant flat fallback for {from, text, id} (and a few common aliases).
        if not sender_id:
            sender_id = str(raw.get("from") or raw.get("sender") or raw.get("sender_id") or "")
        if not message_id:
            message_id = str(raw.get("id") or raw.get("message_id") or "")
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
            thread_id=sender_id,  # WhatsApp threads by the user's wa_id
            text=text,
            media=media,
            timestamp=timestamp,
            message_id=message_id,
            raw=raw,
        )

    @staticmethod
    def _extract_cloud_message(raw: dict) -> dict | None:
        entry = raw.get("entry")
        if not isinstance(entry, list) or not entry:
            return None
        changes = entry[0].get("changes") if isinstance(entry[0], dict) else None
        if not isinstance(changes, list) or not changes:
            return None
        value = changes[0].get("value") if isinstance(changes[0], dict) else None
        if not isinstance(value, dict):
            return None
        messages = value.get("messages")
        if not isinstance(messages, list) or not messages:
            return None
        first = messages[0]
        return first if isinstance(first, dict) else None

    @staticmethod
    def _extract_text(msg: dict) -> str:
        text = msg.get("text")
        if isinstance(text, dict):
            return str(text.get("body") or "")
        if text is not None:
            return str(text)
        # interactive button / list reply
        interactive = msg.get("interactive")
        if isinstance(interactive, dict):
            for key in ("button_reply", "list_reply"):
                rep = interactive.get(key)
                if isinstance(rep, dict):
                    return str(rep.get("title") or rep.get("id") or "")
        button = msg.get("button")
        if isinstance(button, dict):
            return str(button.get("text") or "")
        return ""

    @staticmethod
    def _extract_media(msg: dict) -> list[MediaItem]:
        out: list[MediaItem] = []
        for kind in ("image", "video", "audio", "document", "sticker"):
            part = msg.get(kind)
            if isinstance(part, dict):
                out.append(
                    MediaItem(
                        type="file" if kind == "document" else kind,
                        url=str(part.get("id") or part.get("link") or ""),
                        mime=part.get("mime_type"),
                        caption=str(part.get("caption") or ""),
                    )
                )
        return out

    # ── outbound ─────────────────────────────────────────────────────────────
    def format_outbound(self, msg: OutboundMessage) -> dict:
        """Shape into a WhatsApp messages-API payload (text or template)."""
        template = msg.meta.get("template") if msg.meta else None
        text = msg.text or ""
        if len(text) > _MAX_TEXT_LEN:
            text = text[:_MAX_TEXT_LEN]

        payload: dict = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": msg.recipient_id,
        }

        if template:
            payload["type"] = "template"
            if isinstance(template, dict):
                payload["template"] = template
            else:
                payload["template"] = {"name": str(template), "language": {"code": "en_US"}}
        else:
            payload["type"] = "text"
            payload["text"] = {"body": text}

        if msg.media:
            payload["media"] = [m.model_dump() for m in msg.media]
        if msg.buttons:
            payload["buttons"] = [b.model_dump() for b in msg.buttons]
        return payload

    # ── send (compliance-gated, dry-run only) ────────────────────────────────
    def send(self, msg: OutboundMessage, config: ChannelConfig) -> SendResult:
        """Never transmits. Enforces the 24h window + template rule, then dry-runs.

        meta keys read: ``template``, ``within_24h``, ``last_inbound_ts``.
        """
        meta = msg.meta or {}
        template = meta.get("template")

        if not self._within_window(meta) and not template:
            # Proactive send outside the 24h window with no template → BLOCK.
            return SendResult(
                ok=False,
                channel=self.channel,
                recipient_id=msg.recipient_id,
                dry_run=True,
                sent=False,
                preview={},
                reason="outside_24h_requires_template",
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

    @staticmethod
    def _within_window(meta: dict) -> bool:
        """True if we're inside the 24h customer-service window.

        Within-window means a recent inbound from the user. We trust an explicit
        ``within_24h`` flag, else treat the presence of ``last_inbound_ts`` as
        "there was a recent inbound" (the caller is responsible for only setting
        it when it is genuinely recent)."""
        if meta.get("within_24h") is True:
            return True
        if meta.get("within_24h") is False:
            return False
        return bool(meta.get("last_inbound_ts"))
