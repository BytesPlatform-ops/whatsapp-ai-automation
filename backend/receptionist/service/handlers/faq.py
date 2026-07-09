"""FAQ / knowledge answer handler.

Answers ONLY from what the tenant configured — profile fields, saved FAQs, and
knowledge items — via `business_profile.answer_question`. If nothing relevant is
configured it returns None and we say "I'll check with the team" rather than
inventing hours, pricing, or policies. No record is created; this is a read.
"""

from __future__ import annotations

from ..business_profile import answer_question
from .base import HandlerContext, HandlerResult, register


@register("faq")
def handle_faq(ctx: HandlerContext) -> HandlerResult:
    res = answer_question(ctx.tenant_id, ctx.message)

    if res:
        reply = res["answer"]
        detail = f"source={res['source']}"
    else:
        reply = ("That's a great question — let me check that with the team and "
                 "get right back to you.")
        detail = "source=none"

    return HandlerResult(
        reply=reply, action="faq", status="executed",
        record_type="faq", record_id="",
        detail=detail,
    )
