"""Wire the concrete Wave-2 adapters onto a ChannelRouter.

The router seeds a mock adapter for every channel; this swaps in the richer
adapters for the channels that have one. Channels without a concrete adapter yet
(instagram_dm, facebook_messenger, voice, generic_webhook) keep the safe mock —
the layer still runs everywhere. This is the ONE place adapters are registered,
so individual adapter files never touch the router.
"""

from __future__ import annotations

from .adapters.email import EmailAdapter
from .adapters.facebook_messenger import FacebookMessengerAdapter
from .adapters.generic_webhook import GenericWebhookAdapter
from .adapters.instagram_dm import InstagramDmAdapter
from .adapters.sms import SmsAdapter
from .adapters.telegram import TelegramAdapter
from .adapters.voice import VoiceAdapter
from .adapters.whatsapp import WhatsAppAdapter
from .adapters.web_chat import WebChatAdapter
from .router import ChannelRouter, get_channel_router


def register_default_adapters(router: ChannelRouter | None = None) -> ChannelRouter:
    """Register every concrete adapter onto the router (defaults to the singleton).

    All 9 channels now have a concrete adapter — the mock fallback only remains for
    a channel with no file at all."""
    router = router or get_channel_router()
    for adapter in (WebChatAdapter(), TelegramAdapter(), SmsAdapter(),
                    WhatsAppAdapter(), EmailAdapter(),
                    InstagramDmAdapter(), FacebookMessengerAdapter(),
                    VoiceAdapter(), GenericWebhookAdapter()):
        router.register_adapter(adapter)
    return router
