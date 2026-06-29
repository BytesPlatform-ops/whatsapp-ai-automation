"""EmailAdapter — transactional + inbound-parse email, mock-first.

Email is a first-class channel: long bodies, attachments, no buttons, and it can
send proactively (no session window like WhatsApp). The compliance rule embedded
here is CAN-SPAM/GDPR-style: any **marketing** email MUST carry an unsubscribe
footer — this adapter appends one if the service forgot.

Live send (Postmark / SES) is a TODO — `send()` always stays dry-run and returns
a preview, with a reason explaining why (mock vs live-not-wired).
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

_MAX_TEXT_LEN = 100_000
_DEFAULT_SUBJECT = "(no subject)"
_UNSUB_FOOTER = (
    "\n\n---\n"
    "You are receiving this because you opted in. "
    "To stop receiving these emails, unsubscribe here: {{unsubscribe_url}}"
)
# Tokens that signal an unsubscribe footer is already present.
_UNSUB_MARKERS = ("unsubscribe", "opt out", "opt-out")


class EmailAdapter(ChannelAdapter):
    """Transactional + marketing email adapter (PARTIAL_API, dry-run only)."""

    def __init__(self) -> None:
        self.channel = Channel.EMAIL
        self.support_level = support_level_for(Channel.EMAIL)

    # ── capabilities ─────────────────────────────────────────────────────────
    def capabilities(self) -> Capabilities:
        return Capabilities(
            inbound=True,
            outbound=True,
            supports_media=True,  # attachments
            supports_buttons=False,  # no native buttons; use links in the body
            supports_proactive=True,  # no session window
            max_text_len=_MAX_TEXT_LEN,
            notes=(
                "Transactional + marketing email (PARTIAL_API, mock-first). "
                "Marketing sends MUST include an unsubscribe footer (appended if missing). "
                "Sender auth required: configure SPF + DKIM (and DMARC) on the sending "
                "domain or mail lands in spam / is rejected."
            ),
        )

    # ── inbound ──────────────────────────────────────────────────────────────
    def normalize_inbound(self, tenant_id: str, raw: dict) -> InboundMessage:
        """Parse an inbound email-ish dict into a normalized InboundMessage.

        Reads ``from``/``sender``, ``subject``, body from ``text``/``html``/``body``,
        and ``message_id``. The subject is preserved in ``raw`` (kept verbatim) and
        the body goes in ``text``."""
        raw = raw or {}
        sender_id = str(raw.get("from") or raw.get("sender") or raw.get("from_address") or "")
        subject = str(raw.get("subject") or "")
        body = self._extract_body(raw)
        message_id = str(raw.get("message_id") or raw.get("id") or raw.get("Message-ID") or "")
        timestamp = str(raw.get("timestamp") or raw.get("date") or raw.get("ts") or "")
        media = self._extract_attachments(raw)

        # Ensure the subject is discoverable in raw even if the source nested it.
        raw_with_subject = dict(raw)
        raw_with_subject.setdefault("subject", subject)

        return InboundMessage(
            tenant_id=tenant_id,
            channel=self.channel,
            sender_id=sender_id,
            thread_id=str(raw.get("thread_id") or raw.get("in_reply_to") or message_id or ""),
            text=body,
            media=media,
            timestamp=timestamp,
            message_id=message_id,
            raw=raw_with_subject,
        )

    @staticmethod
    def _extract_body(raw: dict) -> str:
        for key in ("text", "body", "html", "text_body", "html_body"):
            val = raw.get(key)
            if val:
                return str(val)
        return ""

    @staticmethod
    def _extract_attachments(raw: dict) -> list[MediaItem]:
        out: list[MediaItem] = []
        for att in (raw.get("attachments") or raw.get("media") or []):
            if isinstance(att, dict):
                out.append(
                    MediaItem(
                        type="file",
                        url=str(att.get("url") or att.get("link") or att.get("name") or ""),
                        mime=att.get("mime") or att.get("content_type"),
                        caption=str(att.get("name") or att.get("caption") or ""),
                    )
                )
            elif att:
                out.append(MediaItem(type="file", url=str(att)))
        return out

    # ── outbound ─────────────────────────────────────────────────────────────
    def format_outbound(self, msg: OutboundMessage) -> dict:
        """Shape into an email payload. Appends an unsubscribe footer for marketing."""
        meta = msg.meta or {}
        subject = str(meta.get("subject") or _DEFAULT_SUBJECT)
        body = msg.text or ""
        if len(body) > _MAX_TEXT_LEN:
            body = body[:_MAX_TEXT_LEN]

        is_marketing = self._is_marketing(meta)
        unsubscribe = False
        if is_marketing:
            if not self._has_unsub_footer(body):
                body = body + _UNSUB_FOOTER
            unsubscribe = True

        payload: dict = {
            "channel": "email",
            "to": msg.recipient_id,
            "subject": subject,
            "body": body,
            "category": "marketing" if is_marketing else str(meta.get("category") or "transactional"),
            "unsubscribe": unsubscribe,
        }
        if msg.media:
            payload["attachments"] = [m.model_dump() for m in msg.media]
        return payload

    @staticmethod
    def _is_marketing(meta: dict) -> bool:
        return str(meta.get("category") or "").lower() == "marketing" or bool(meta.get("marketing"))

    @staticmethod
    def _has_unsub_footer(body: str) -> bool:
        low = body.lower()
        return any(marker in low for marker in _UNSUB_MARKERS)

    # ── send (dry-run only) ──────────────────────────────────────────────────
    def send(self, msg: OutboundMessage, config: ChannelConfig) -> SendResult:
        """Never transmits. Live (Postmark/SES) is a TODO → dry-run preview.

        meta keys read: ``subject``, ``category`` (== "marketing"), ``marketing``.
        """
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
