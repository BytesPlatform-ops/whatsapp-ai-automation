"""Pixie Channels layer — one normalized messaging interface for every service.

A SHARED, generic abstraction used by ALL Pixie services (receptionist, marketing,
content-creator, …). It normalizes every inbound/outbound message across every
platform so services never deal with platform specifics:

    inbound (webhook/poll) → normalize → owning service handler → OutboundMessage
                           → route to adapter → format → send (dry-run by default)

Design rules:
* ONE normalized shape both directions: `InboundMessage` / `OutboundMessage`.
* Every platform is one adapter implementing the SAME interface; add a channel =
  write one adapter; lose a channel = degrade gracefully.
* Mock-first: every adapter has a deterministic mock fallback, so the whole layer
  runs end-to-end with NO API keys. Real keys switch an adapter to live.
* Per-tenant isolation; tokens stored via an encryption seam, never logged.

Services consume this layer through `ChannelRouter.register_handler` + `send`
ONLY — they never import an adapter or know the channel.
"""

from __future__ import annotations

from .router import ChannelRouter, get_channel_router
from .schemas import (
    Button,
    Channel,
    ChannelConfig,
    ChannelMode,
    ChannelStatus,
    InboundMessage,
    MediaItem,
    OutboundMessage,
    PixieContact,
    SendResult,
    SupportLevel,
)

__all__ = [
    "ChannelRouter",
    "get_channel_router",
    "Channel",
    "ChannelMode",
    "SupportLevel",
    "InboundMessage",
    "OutboundMessage",
    "MediaItem",
    "Button",
    "ChannelConfig",
    "ChannelStatus",
    "PixieContact",
    "SendResult",
]

__version__ = "0.1.0"  # Wave 1: schemas + adapter base + ChannelRouter + mock base
