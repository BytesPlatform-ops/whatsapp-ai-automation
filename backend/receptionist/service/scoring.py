"""Lead scoring — deterministic 0-100 score + derived CRM status.

Blends four signals the brief calls out: urgency, intent (business value),
completeness of contact details, and stated budget. Pure function, no I/O, so
it's trivially testable and never depends on the LLM.
"""

from __future__ import annotations

_HIGH_VALUE_INTENTS = {"booking", "quote", "payment_link"}
_MID_VALUE_INTENTS = {"lead", "call_routing", "waitlist", "intake", "follow_up"}
_URGENCY_POINTS = {"emergency": 25, "high": 20, "normal": 10, "low": 5}


def score_lead(
    *,
    intent: str = "unknown",
    urgency: str = "normal",
    has_email: bool = False,
    has_phone: bool = False,
    has_name: bool = False,
    service_interest: str = "",
    budget: str = "",
) -> tuple[int, str]:
    """Return (score 0-100, status). status ∈ {new, follow_up_needed, qualified}."""
    score = 0
    if has_email:
        score += 15
    if has_phone:
        score += 15
    if has_name:
        score += 5
    if service_interest.strip():
        score += 10
    if budget.strip():
        score += 15
    score += _URGENCY_POINTS.get((urgency or "normal").lower(), 10)
    if intent in _HIGH_VALUE_INTENTS:
        score += 20
    elif intent in _MID_VALUE_INTENTS:
        score += 10

    score = max(0, min(100, score))
    if score >= 60:
        status = "qualified"
    elif score >= 30:
        status = "follow_up_needed"
    else:
        status = "new"
    return score, status
