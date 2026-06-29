"""SmsAdapter — SMS (Twilio/Sinch placeholder), mock-first, opt-out aware.

SMS is a PARTIAL_API channel: text only (no media, no buttons), a hard 160-char
segment, carrier opt-out rules, and US A2P 10DLC registration before you can send
real traffic. We have no provider creds and no network here, so the LIVE (Twilio)
path is a TODO — `send` formats the message and returns a dry-run preview rather
than transmitting.

Rules kept inside this adapter:
- NO media, NO buttons; max text 160 (one segment); preview carries a `segments`
  count = ceil(len(text)/160) computed BEFORE truncation.
- OPT-OUT: STOP / STOPALL / UNSUBSCRIBE / CANCEL / END / QUIT (case-insensitive)
  flag the inbound as opted-out; START / YES / UNSTOP opt back in. The flags land
  in InboundMessage.raw (`_opt_out` / `_opt_in`), and `is_opt_out(text)` is a
  module-level helper services can call directly.
- capabilities.notes records the A2P 10DLC registration requirement.
"""

from __future__ import annotations

import math

from ..base import ChannelAdapter
from ..requirements import support_level_for
from ..schemas import (
    Capabilities,
    Channel,
    ChannelConfig,
    InboundMessage,
    OutboundMessage,
    SendResult,
    SupportLevel,
)

#: One SMS segment (GSM-7 single-part). Long messages are truncated to this.
SEGMENT_LEN = 160

# Carrier-standard keywords (case-insensitive, whole-message match after strip).
_OPT_OUT_KEYWORDS = frozenset({"STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"})
_OPT_IN_KEYWORDS = frozenset({"START", "YES", "UNSTOP"})

_SENDER_KEYS = ("from", "From", "sender", "msisdn", "sender_id")
_THREAD_KEYS = ("thread_id", "conversation_id", "MessagingServiceSid")
_TEXT_KEYS = ("text", "body", "Body", "message", "content")
_ID_KEYS = ("message_id", "MessageSid", "sid", "id")
_TS_KEYS = ("timestamp", "ts", "DateSent", "created_at")


def _first(raw: dict, keys: tuple[str, ...], default: str = "") -> str:
    for k in keys:
        v = raw.get(k)
        if v:
            return str(v)
    return default


def _keyword(text: str) -> str:
    """Normalize a message to a single uppercase keyword token for matching."""
    return (text or "").strip().strip(".!").upper()


def is_opt_out(text: str) -> bool:
    """True if `text` is a carrier opt-out keyword (STOP, UNSUBSCRIBE, …)."""
    return _keyword(text) in _OPT_OUT_KEYWORDS


def is_opt_in(text: str) -> bool:
    """True if `text` is a carrier opt-in/resume keyword (START, YES, UNSTOP)."""
    return _keyword(text) in _OPT_IN_KEYWORDS


def segment_count(text: str) -> int:
    """Number of 160-char SMS segments `text` would occupy (>=1)."""
    return max(1, math.ceil(len(text or "") / SEGMENT_LEN))


class SmsAdapter(ChannelAdapter):
    """SMS adapter — text-only, opt-out aware. Live (Twilio) send is a TODO."""

    def __init__(self) -> None:
        self.channel = Channel.SMS
        self.support_level = support_level_for(Channel.SMS) or SupportLevel.PARTIAL_API

    # ── identity / capabilities ──────────────────────────────────────────────
    def capabilities(self) -> Capabilities:
        return Capabilities(
            inbound=True,
            outbound=True,
            supports_media=False,
            supports_buttons=False,
            supports_proactive=True,  # ok, but subject to opt-out + quiet-hours rules
            max_text_len=SEGMENT_LEN,
            notes=("sms: text only, 160/segment; proactive subject to opt-out; "
                   "US traffic requires A2P 10DLC brand/campaign registration; live (Twilio) send TODO"),
        )

    # ── inbound ──────────────────────────────────────────────────────────────
    def normalize_inbound(self, tenant_id: str, raw: dict) -> InboundMessage:
        raw = dict(raw or {})  # copy — never mutate the caller's/logged payload
        text = _first(raw, _TEXT_KEYS)
        # Surface opt-out/opt-in state into raw so the service/router can honor it.
        if is_opt_out(text):
            raw["_opt_out"] = True
        if is_opt_in(text):
            raw["_opt_in"] = True
        return InboundMessage(
            tenant_id=tenant_id,
            channel=self.channel,
            sender_id=_first(raw, _SENDER_KEYS),
            thread_id=_first(raw, _THREAD_KEYS),
            text=text,
            media=[],  # SMS carries no media in this adapter
            timestamp=_first(raw, _TS_KEYS),
            message_id=_first(raw, _ID_KEYS),
            raw=raw,
        )

    # ── outbound ─────────────────────────────────────────────────────────────
    def format_outbound(self, msg: OutboundMessage) -> dict:
        full = msg.text or ""
        segments = segment_count(full)
        text = full[:SEGMENT_LEN]
        payload: dict = {
            "channel": self.channel.value,
            "to": msg.recipient_id,
            "text": text,
            "segments": segments,
        }
        if msg.meta:
            payload["meta"] = msg.meta
        return payload

    def send(self, msg: OutboundMessage, config: ChannelConfig) -> SendResult:
        """LIVE (Twilio/Sinch) send is a TODO — no creds, no network. Always returns
        a dry-run preview; never transmits."""
        preview = self.format_outbound(msg)
        reason = "live_not_wired" if config.is_live() else "mock_mode"
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
