"""VoiceAdapter tests — STT inbound, TTS short-reply mode, dry-run send.

Plain `def test_*`, callable directly (no pytest required)."""

from __future__ import annotations

from channels.adapters.voice import (
    MAX_SPEECH_LEN,
    UNRECOGNIZED,
    VoiceAdapter,
    mock_stt,
    mock_tts,
)
from channels.schemas import (
    Channel,
    ChannelConfig,
    ChannelMode,
    OutboundMessage,
    SupportLevel,
)


def _adapter() -> VoiceAdapter:
    return VoiceAdapter()


def test_identity_and_capabilities():
    a = _adapter()
    assert a.channel == Channel.VOICE
    assert a.support_level == SupportLevel.FUTURE_PLACEHOLDER
    cap = a.capabilities()
    assert cap.supports_buttons is False        # caller can't tap a button
    assert cap.supports_media is False          # audio only, no visual media
    assert cap.supports_proactive is True
    assert cap.max_text_len == MAX_SPEECH_LEN   # short-reply cap
    assert "stt" in cap.notes.lower() and "tts" in cap.notes.lower()


def test_inbound_transcript_normalizes_to_text():
    a = _adapter()
    inb = a.normalize_inbound("t_a", {"transcript": "book me a table", "caller": "+15551112222",
                                      "call_id": "call_99"})
    assert inb.text == "book me a table"
    assert inb.sender_id == "+15551112222"
    assert inb.thread_id == "call_99"
    assert inb.raw.get("_stt") is None          # had a real transcript, no STT needed


def test_inbound_audio_url_runs_mock_stt():
    a = _adapter()
    inb = a.normalize_inbound("t_a", {"audio_url": "https://x/clip.wav", "from": "+1"})
    assert inb.text == UNRECOGNIZED
    assert inb.raw.get("_stt") == "mock"
    assert inb.sender_id == "+1"


def test_mock_stt_helper():
    assert mock_stt({"speech": "hi there"}) == "hi there"
    assert mock_stt({"audio_url": "https://x/a.wav"}) == UNRECOGNIZED
    assert mock_stt({}) == ""


def test_outbound_truncates_to_short_reply():
    a = _adapter()
    long_text = "y" * 1000
    out = OutboundMessage(tenant_id="t_a", channel=Channel.VOICE, recipient_id="+1", text=long_text)
    payload = a.format_outbound(out)
    assert len(payload["text"]) <= MAX_SPEECH_LEN
    assert len(payload["text"]) == MAX_SPEECH_LEN
    assert payload["truncated"] is True
    assert payload["voice"] == "default"


def test_outbound_short_text_not_truncated():
    a = _adapter()
    out = OutboundMessage(tenant_id="t_a", channel=Channel.VOICE, recipient_id="+1",
                          text="all set", meta={"voice": "amelia"})
    payload = a.format_outbound(out)
    assert payload["truncated"] is False
    assert payload["text"] == "all set"
    assert payload["voice"] == "amelia"


def test_mock_tts_helper():
    d = mock_tts("hi")
    assert d["text"] == "hi"
    assert d["voice"] == "default"
    assert d["truncated"] is False
    long_d = mock_tts("z" * 500, voice="brian")
    assert long_d["voice"] == "brian"
    assert len(long_d["text"]) == MAX_SPEECH_LEN
    assert long_d["truncated"] is True


def test_send_stays_dry_run():
    a = _adapter()
    cfg = ChannelConfig(tenant_id="t_a", channel=Channel.VOICE, enabled=True)
    sr = a.send(OutboundMessage(tenant_id="t_a", channel=Channel.VOICE,
                                recipient_id="+1", text="hi"), cfg)
    assert sr.sent is False and sr.dry_run is True
    assert sr.reason == "mock_mode"

    live_cfg = ChannelConfig(tenant_id="t_a", channel=Channel.VOICE, enabled=True,
                             mode=ChannelMode.LIVE, requirements_met=True,
                             credentials_present={"account_sid": True, "auth_token": True},
                             settings={"phone_number": "+1", "stt_engine": "whisper",
                                       "tts_engine": "polly"})
    sr2 = a.send(OutboundMessage(tenant_id="t_a", channel=Channel.VOICE,
                                 recipient_id="+1", text="hi"), live_cfg)
    assert sr2.sent is False and sr2.dry_run is True
    assert sr2.reason == "live_not_wired"


if __name__ == "__main__":
    for _n, _f in list(vars().items()):
        if _n.startswith("test_"):
            _f()
    print("voice OK")
