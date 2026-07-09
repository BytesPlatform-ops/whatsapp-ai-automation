"""Campaign-reply handler.

Classifies an inbound reply to an outbound campaign (interested, not_interested,
question, complaint, unsubscribe, booking_request, quote_request, other) — using
the brain's `classification` when given, otherwise a simple keyword inference —
and stores it against the campaign. An `unsubscribe` reply also records an
`OptOut` so the contact is suppressed from future marketing.
"""

from __future__ import annotations

from .. import stores
from ..schemas import CampaignReply, OptOut
from .base import HandlerContext, HandlerResult, register

_KEYWORD_RULES: list[tuple[str, tuple[str, ...]]] = [
    ("unsubscribe", ("unsubscribe", "stop", "opt out", "opt-out", "remove me", "no more")),
    ("complaint", ("complaint", "terrible", "awful", "angry", "unacceptable", "worst", "refund")),
    ("booking_request", ("book", "appointment", "schedule", "reserve", "slot")),
    ("quote_request", ("quote", "pricing", "price", "cost", "estimate", "how much")),
    ("not_interested", ("not interested", "no thanks", "no thank you", "not right now", "pass")),
    ("interested", ("interested", "yes", "sounds good", "tell me more", "keen", "sign me up")),
    ("question", ("?", "how", "what", "when", "where", "why", "can you", "do you")),
]


def _infer_classification(message: str) -> str:
    text = (message or "").lower()
    for label, keywords in _KEYWORD_RULES:
        if any(kw in text for kw in keywords):
            return label
    return "other"


_REPLIES = {
    "interested": "Great, glad to hear it! Someone from the team will follow up with the details shortly.",
    "not_interested": "No problem at all — thanks for letting us know. We won't chase you on this.",
    "question": "Good question — let me get that answered for you and come right back.",
    "complaint": "I'm sorry to hear that. I've flagged it so the team can look into it right away.",
    "booking_request": "Happy to help you book that in — I'll get the details sorted for you.",
    "quote_request": "Sure — I'll get a quote put together for you.",
    "unsubscribe": "You're all set — I've removed you and you won't receive further marketing messages.",
    "other": "Thanks for getting back to us — I've passed your reply on to the team.",
}


@register("campaign_reply")
def handle_campaign_reply(ctx: HandlerContext) -> HandlerResult:
    classification = ctx.f("classification") or _infer_classification(ctx.message)
    campaign_id = ctx.f("campaign_id") or ctx.campaign_id

    reply = CampaignReply(
        tenant_id=ctx.tenant_id, campaign_id=campaign_id, contact_id=ctx.contact_id,
        from_email=ctx.f("email") or None, from_phone=ctx.f("phone") or None,
        channel=ctx.channel, text=ctx.message, classification=classification,
        status="handled",
    ).model_dump()

    if classification == "unsubscribe":
        optout = OptOut(
            tenant_id=ctx.tenant_id, contact_id=ctx.contact_id,
            email=ctx.f("email") or None, phone=ctx.f("phone") or None,
            scope="marketing", reason="reply_stop", source=ctx.channel,
        ).model_dump()
        stores.optouts().put(ctx.tenant_id, optout)
        reply["action_taken"] = "opt_out"
        reply["action_record_id"] = optout["id"]

    stores.campaign_replies().put(ctx.tenant_id, reply)

    return HandlerResult(
        reply=_REPLIES.get(classification, _REPLIES["other"]),
        action="campaign_reply", status="handled",
        record_type="campaign_reply", record_id=reply["id"], record=reply,
        detail=f"classification={classification}",
    )
