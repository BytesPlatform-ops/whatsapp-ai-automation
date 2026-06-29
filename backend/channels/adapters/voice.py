"""VoiceAdapter — voice/telephony (STT inbound → text → service → text → TTS out).

Voice is a FUTURE_PLACEHOLDER channel: a call arrives, speech is transcribed
(STT), the service replies in text, and that text is spoken back (TTS). Latency
matters, so replies run in a SHORT-REPLY mode — condensed to <=300 chars so the
TTS engine can speak them quickly. We have no telephony provider, no STT/TTS
engine, and no network here, so this adapter is mock-first: STT is a placeholder,
TTS produces an instruction dict, and `send` never transmits.

Rules kept inside this adapter:
- NO buttons, NO visual media — audio only (a caller can't tap a button).
- normalize_inbound is tolerant: recognized text comes from `transcript` / `speech`
  / `text`; if none but an `audio_url` is present, run a MOCK STT that yields a
  clear placeholder and records `raw["_stt"]="mock"`.
- format_outbound is a TTS instruction dict `{channel, to, text, voice, ssml?}`;
  text is condensed to <=300 chars and the preview carries a `truncated` flag.
- Module-level helpers `mock_stt(payload)` and `mock_tts(text, voice)` are callable
  directly by services.
- send: telephony is a TODO → always dry-run; reason "live_not_wired" if live else
  "mock_mode". Never network.
"""

from __future__ import annotations

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

#: Short-reply cap for low-latency speech. Long replies are condensed to this.
MAX_SPEECH_LEN = 300

#: What a service sees when audio couldn't be transcribed (mock STT placeholder).
UNRECOGNIZED = "[unrecognized audio]"

_TRANSCRIPT_KEYS = ("transcript", "speech", "text")
_CALLER_KEYS = ("caller", "from", "phone", "msisdn", "From")
_THREAD_KEYS = ("call_id", "session_id", "CallSid", "conversation_id")
_ID_KEYS = ("message_id", "id", "CallSid", "call_id")
_TS_KEYS = ("timestamp", "ts", "time", "created_at")


def _first(raw: dict, keys: tuple[str, ...], default: str = "") -> str:
    for k in keys:
        v = raw.get(k)
        if v:
            return str(v)
    return default


def mock_stt(payload: dict) -> str:
    """Mock speech-to-text. Returns recognized text if the payload already carries
    a transcript; otherwise (an `audio_url` with no transcript) returns a clear
    placeholder. Deterministic, keyless, no network."""
    payload = payload or {}
    text = _first(payload, _TRANSCRIPT_KEYS)
    if text:
        return text
    if payload.get("audio_url"):
        return UNRECOGNIZED
    return ""


def _condense(text: str, limit: int = MAX_SPEECH_LEN) -> tuple[str, bool]:
    """Condense `text` to <=limit chars for low-latency speech. Returns
    (spoken_text, truncated)."""
    text = text or ""
    if len(text) <= limit:
        return text, False
    return text[:limit], True


def mock_tts(text: str, voice: str = "default") -> dict:
    """Mock text-to-speech. Returns a TTS instruction dict (no audio bytes, no
    network). Text is condensed to the short-reply cap for low latency."""
    spoken, truncated = _condense(text)
    return {
        "channel": Channel.VOICE.value,
        "text": spoken,
        "voice": voice,
        "truncated": truncated,
    }


class VoiceAdapter(ChannelAdapter):
    """Voice adapter — STT in, TTS out, short-reply mode. Telephony send is a TODO."""

    def __init__(self) -> None:
        self.channel = Channel.VOICE
        self.support_level = support_level_for(Channel.VOICE) or SupportLevel.FUTURE_PLACEHOLDER

    # ── identity / capabilities ──────────────────────────────────────────────
    def capabilities(self) -> Capabilities:
        return Capabilities(
            inbound=True,
            outbound=True,
            supports_media=False,   # audio only — no visual media a caller could see
            supports_buttons=False,  # a caller can't tap a button
            supports_proactive=True,  # outbound calls (callbacks/reminders) are possible
            max_text_len=MAX_SPEECH_LEN,
            notes=("voice: audio only, no buttons/visual media; short-reply mode "
                   f"(<= {MAX_SPEECH_LEN} chars) for low-latency speech; requires STT + TTS "
                   "config; live telephony (STT/TTS provider) send TODO"),
        )

    # ── inbound ──────────────────────────────────────────────────────────────
    def normalize_inbound(self, tenant_id: str, raw: dict) -> InboundMessage:
        raw = dict(raw or {})  # copy — never mutate the caller's/logged payload
        text = _first(raw, _TRANSCRIPT_KEYS)
        if not text and raw.get("audio_url"):
            # No transcript but audio present — run mock STT and record that we did.
            text = mock_stt(raw)
            raw["_stt"] = "mock"
        return InboundMessage(
            tenant_id=tenant_id,
            channel=self.channel,
            sender_id=_first(raw, _CALLER_KEYS),
            thread_id=_first(raw, _THREAD_KEYS),
            text=text,
            media=[],  # voice carries no visual media in this adapter
            timestamp=_first(raw, _TS_KEYS),
            message_id=_first(raw, _ID_KEYS),
            raw=raw,
        )

    # ── outbound ─────────────────────────────────────────────────────────────
    def format_outbound(self, msg: OutboundMessage) -> dict:
        spoken, truncated = _condense(msg.text or "")
        voice = str(msg.meta.get("voice", "default")) if msg.meta else "default"
        payload: dict = {
            "channel": self.channel.value,
            "to": msg.recipient_id,
            "text": spoken,
            "voice": voice,
            "truncated": truncated,
        }
        if msg.meta and msg.meta.get("ssml"):
            payload["ssml"] = msg.meta["ssml"]
        if msg.meta:
            payload["meta"] = msg.meta
        return payload

    def send(self, msg: OutboundMessage, config: ChannelConfig) -> SendResult:
        """LIVE telephony (provider + STT/TTS) is a TODO — no creds, no network.
        Always returns a dry-run preview; never transmits."""
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
