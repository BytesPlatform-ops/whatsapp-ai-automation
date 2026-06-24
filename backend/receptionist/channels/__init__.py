"""Channel adapters — one per surface (web chat first; sms/voice/whatsapp later)."""

from .base import ChannelAdapter
from .web_chat import WebChatAdapter

__all__ = ["ChannelAdapter", "WebChatAdapter"]
