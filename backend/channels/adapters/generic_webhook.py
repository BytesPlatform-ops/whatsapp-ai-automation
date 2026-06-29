"""GenericWebhookAdapter — a configurable adapter for ANY future platform.

The escape hatch: when a platform has no dedicated adapter yet, this one ingests
an arbitrary inbound shape and emits a generic JSON envelope you can POST to any
endpoint. It's PARTIAL_API — it works today against a configured `endpoint_url`,
but the actual outbound HTTP POST is a TODO (no network here), so `send` returns a
dry-run preview that echoes the target URL.

Rules kept inside this adapter:
- Fully generic + CONFIGURABLE inbound. `normalize_inbound(tenant_id, raw)` only
  gets `raw`, so the field map travels IN the payload: an optional `raw["_field_map"]`
  (normalized-key → source-key) overrides the common-key fallbacks. `raw` is kept
  intact for the adapter.
- format_outbound is a generic envelope `{channel, to, text, media, meta}`.
- send: if live AND `settings["endpoint_url"]` is set, it WOULD POST there — but
  that's a TODO; we return a dry-run preview echoing `endpoint_url`, reason
  "live_not_wired". Otherwise dry-run, reason "mock_mode". NEVER network.
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

#: Reserved key on inbound raw: a {normalized_key: source_key} override map.
FIELD_MAP_KEY = "_field_map"

# Common fallback keys, tried in order when the field map doesn't cover a field.
_SENDER_KEYS = ("sender", "from", "sender_id", "user", "user_id", "author")
_THREAD_KEYS = ("thread", "thread_id", "conversation_id", "conversation", "chat_id")
_TEXT_KEYS = ("text", "message", "body", "content", "msg")
_ID_KEYS = ("id", "message_id", "mid", "event_id", "uuid")
_TS_KEYS = ("timestamp", "ts", "time", "created_at", "date")

# Normalized field name → which source key the field map can name it under.
_FIELD_FALLBACKS: dict[str, tuple[str, ...]] = {
    "sender_id": _SENDER_KEYS,
    "thread_id": _THREAD_KEYS,
    "text": _TEXT_KEYS,
    "message_id": _ID_KEYS,
    "timestamp": _TS_KEYS,
}


def _resolve(raw: dict, field: str, field_map: dict) -> str:
    """Resolve one normalized `field` from `raw`: a `field_map` entry wins,
    otherwise fall through the common fallback keys."""
    mapped = field_map.get(field)
    if mapped and raw.get(mapped):
        return str(raw[mapped])
    for k in _FIELD_FALLBACKS.get(field, ()):  # fallback keys
        v = raw.get(k)
        if v:
            return str(v)
    return ""


class GenericWebhookAdapter(ChannelAdapter):
    """Generic webhook adapter — configurable inbound, JSON-envelope outbound.
    Live outbound POST to a configured endpoint is a TODO."""

    def __init__(self) -> None:
        self.channel = Channel.GENERIC_WEBHOOK
        self.support_level = support_level_for(Channel.GENERIC_WEBHOOK) or SupportLevel.PARTIAL_API

    # ── identity / capabilities ──────────────────────────────────────────────
    def capabilities(self) -> Capabilities:
        return Capabilities(
            inbound=True,
            outbound=True,
            supports_media=True,
            supports_buttons=False,  # unknown target — no portable button semantics
            supports_proactive=True,
            max_text_len=16000,      # generic JSON has no tight platform limit
            notes=("generic_webhook: configurable field map (raw['_field_map']) with "
                   "common-key fallback; JSON envelope out; live POST to settings['endpoint_url'] TODO"),
        )

    # ── inbound ──────────────────────────────────────────────────────────────
    def normalize_inbound(self, tenant_id: str, raw: dict) -> InboundMessage:
        raw = raw or {}
        field_map = raw.get(FIELD_MAP_KEY) or {}
        if not isinstance(field_map, dict):
            field_map = {}

        media_raw = raw.get(field_map.get("media") or "media") or []
        media: list[MediaItem] = []
        if isinstance(media_raw, list):
            media = [MediaItem(**m) if isinstance(m, dict) else MediaItem(url=str(m))
                     for m in media_raw]

        return InboundMessage(
            tenant_id=tenant_id,
            channel=self.channel,
            sender_id=_resolve(raw, "sender_id", field_map),
            thread_id=_resolve(raw, "thread_id", field_map),
            text=_resolve(raw, "text", field_map),
            media=media,
            timestamp=_resolve(raw, "timestamp", field_map),
            message_id=_resolve(raw, "message_id", field_map),
            raw=raw,  # kept intact for the adapter
        )

    # ── outbound ─────────────────────────────────────────────────────────────
    def format_outbound(self, msg: OutboundMessage) -> dict:
        return {
            "channel": self.channel.value,
            "to": msg.recipient_id,
            "thread_id": msg.thread_id,
            "text": msg.text or "",
            "media": [m.model_dump() for m in msg.media],
            "meta": msg.meta or {},
        }

    def send(self, msg: OutboundMessage, config: ChannelConfig) -> SendResult:
        """LIVE outbound POST to the configured endpoint is a TODO — no network.
        Always returns a dry-run preview; echoes the target `endpoint_url`."""
        preview = self.format_outbound(msg)
        endpoint_url = ""
        if config and config.settings:
            endpoint_url = str(config.settings.get("endpoint_url") or "")
        if endpoint_url:
            preview = {**preview, "endpoint_url": endpoint_url}
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
