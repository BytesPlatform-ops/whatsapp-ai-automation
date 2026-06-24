"""Channel adapter contract.

A channel adapter is the ONLY thing that knows about a specific surface (web
chat, SMS, voice, WhatsApp, social). It normalizes an inbound payload into a
`ReceptionRequest` and formats the engine's `ReceptionReply` back out. The engine
stays channel-agnostic — it only sees the `{{CHANNEL}}` variable.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from ..schemas import Channel, ReceptionReply, ReceptionRequest


class ChannelAdapter(ABC):
    channel: Channel

    @abstractmethod
    def to_request(self, tenant_id: str, payload: dict[str, Any]) -> ReceptionRequest:
        """Normalize a raw inbound payload into a ReceptionRequest."""

    @abstractmethod
    def format_reply(self, reply: ReceptionReply) -> dict[str, Any]:
        """Shape the engine's reply for sending back on this channel."""
