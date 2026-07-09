"""Fallback handler.

The safety net when no intent was matched (or the brain was unsure). On low
confidence it asks a brief clarifying question; otherwise it gives a warm,
generic offer of help — WITHOUT inventing any business specifics (hours, pricing,
services), which only the FAQ handler may surface from configured data. No record
is created and the result is a `noop`.
"""

from __future__ import annotations

from .base import HandlerContext, HandlerResult, register


@register("fallback")
def handle_fallback(ctx: HandlerContext) -> HandlerResult:
    if ctx.confidence < 0.4:
        reply = ("I want to make sure I help correctly — could you tell me a bit "
                 "more about what you need?")
        detail = "clarify"
    else:
        reply = ("Happy to help! I can take a booking, answer your questions, or "
                 "put together a quote — what can I do for you?")
        detail = "generic"

    return HandlerResult(
        reply=reply, action="fallback", status="noop",
        record_type="", record_id="",
        detail=detail,
    )
