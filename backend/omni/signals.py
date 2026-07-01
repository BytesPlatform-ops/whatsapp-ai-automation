"""Signals + routing table for Omni — PURE STDLIB / Pydantic, no network.

A `Signal` is something that happened in the business ("customer asked for
pricing", "no post this week"). Each signal *type* maps to the agent best suited
to act, plus the capability + mock tool that action would use and its risk level.

Where a target agent doesn't exist yet (sales / reputation / reactivation), the
signal is routed to the nearest existing agent and the `note` says so — honest
about the stand-in rather than pretending a module exists.
"""

from __future__ import annotations

from pydantic import BaseModel


class Signal(BaseModel):
    id: str
    type: str
    source: str = "mock"          # where it came from (mock_email, mock_calendar, ...)
    message: str = ""             # human-readable description of what happened
    recommended_agent: str = ""   # filled from the routing table if empty


class Route(BaseModel):
    agent: str          # pixie_units slug, e.g. "ai-receptionist"
    capability: str     # e.g. "customer_messaging"
    tool: str           # mock connector that WOULD run, e.g. "mock_email"
    risk_level: str = "medium"
    note: str = ""      # e.g. "reactivation agent not built yet → routed to marketing"


# signal.type → how Omni routes it. Only the 6 real slugs are used as targets.
ROUTING: dict[str, Route] = {
    "pricing_question": Route(agent="ai-receptionist", capability="customer_messaging", tool="mock_email", risk_level="medium"),
    "booking_request": Route(agent="ai-receptionist", capability="calendar_booking", tool="mock_calendar", risk_level="medium"),
    "faq_question": Route(agent="ai-receptionist", capability="customer_messaging", tool="mock_email", risk_level="low"),
    "slow_weekday": Route(agent="marketing-agent", capability="campaign_sender", tool="mock_campaign", risk_level="medium"),
    "content_gap": Route(agent="content-creator", capability="content_generation", tool="mock_content", risk_level="low"),
    "weak_headline": Route(agent="website-builder", capability="website_editing", tool="mock_website", risk_level="medium"),
    "seo_issue": Route(agent="seo-agent", capability="seo_audit", tool="mock_seo", risk_level="low"),
    # no dedicated agents yet → nearest stand-in, said out loud:
    "inactive_customer": Route(agent="marketing-agent", capability="campaign_sender", tool="mock_campaign", risk_level="medium",
                               note="reactivation agent not built yet → routed to marketing-agent"),
    "positive_review": Route(agent="marketing-agent", capability="social_publishing", tool="mock_social", risk_level="low",
                             note="reputation agent not built yet → routed to marketing-agent"),
    "quote_request": Route(agent="ai-receptionist", capability="customer_messaging", tool="mock_email", risk_level="high",
                           note="sales agent not built yet → routed to ai-receptionist"),
}

# Fallback when a signal type isn't in the table.
DEFAULT_ROUTE = Route(agent="ai-receptionist", capability="customer_messaging", tool="mock_email",
                      risk_level="medium", note="unknown signal type → default to ai-receptionist")


DEMO_SIGNALS: list[Signal] = [
    Signal(id="sig_pricing", type="pricing_question", source="mock_email",
           message="Hi, can you tell me your pricing?"),
    Signal(id="sig_booking", type="booking_request", source="mock_instagram",
           message="Do you have any slots free on Friday?"),
    Signal(id="sig_slow_week", type="slow_weekday", source="mock_calendar",
           message="Tuesday and Wednesday have no bookings this week."),
    Signal(id="sig_content_gap", type="content_gap", source="mock_social",
           message="No social post has been published this week."),
    Signal(id="sig_weak_headline", type="weak_headline", source="mock_website",
           message="Homepage headline is generic and weak."),
    Signal(id="sig_seo", type="seo_issue", source="mock_website",
           message="Homepage is missing a meta title and has a weak H1."),
    Signal(id="sig_inactive", type="inactive_customer", source="mock_crm",
           message="18 customers have been inactive for 45+ days."),
    Signal(id="sig_review", type="positive_review", source="mock_reviews",
           message="A customer left a 5-star review."),
]


def route_for(signal_type: str) -> Route:
    return ROUTING.get(signal_type, DEFAULT_ROUTE)


def get_demo_signal(signal_id: str) -> Signal | None:
    for s in DEMO_SIGNALS:
        if s.id == signal_id:
            return s
    return None
