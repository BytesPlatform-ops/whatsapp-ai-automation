"""Action handlers for the AI Receptionist.

Importing this package registers every handler into the `base._REGISTRY`
(each module calls `@register(...)` at import time). The engine then dispatches
by intent via `base.get_handler`.

Keep this import list in sync with the handler modules — the boot smoke check /
tests assert every Intent has a handler.
"""

from . import (  # noqa: F401  (imported for side-effect: registration)
    booking,
    lead,
    escalation,
    quote,
    callback,
    voicemail,
    waitlist,
    reminder,
    payment,
    status_lookup,
    faq,
    intake,
    complaint,
    follow_up,
    campaign_reply,
    unsubscribe,
    fallback,
)

from .base import get_handler, registered_intents, HandlerContext, HandlerResult  # noqa: F401
