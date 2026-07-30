"""Server-authoritative AI Receptionist plan-limit enforcement (Wave 6, Part 9).

Maps each receptionist resource to its plan-limit key + live usage (durable usage
counters and store counts), and blocks creation / paid operations when over the
limit. Enforcement is HARD when ``BILLING_ENFORCEMENT_ENABLED`` is on; otherwise it
is advisory (report-only) so existing flows are never blocked before durable
production persistence is active — the same convention the rest of Pixie uses.

Errors carry: limit_key, used, limit (allowed), billing period, upgrade URL and the
Receptionist return route, so the frontend can link the user straight back.
"""

from __future__ import annotations

import os
from typing import Callable, Optional

from . import stores, usage

UPGRADE_URL = "/pixie-lab/billing?agent=ai-receptionist"


class LimitExceeded(Exception):
    def __init__(self, detail: dict) -> None:
        super().__init__(detail.get("reason", "usage_limit_reached"))
        self.detail = detail
        self.http_status = 402


# resource key → (plan limit_key, usage function). Usage reflects CURRENT count.
def _monthly(metric: str) -> Callable[[str], int]:
    return lambda t: usage.get(t, metric)


_RESOURCES: dict[str, tuple] = {
    "conversation":   ("receptionist_monthly_conversations", _monthly("monthly_conversations")),
    "ai_turn":        ("receptionist_monthly_ai_turns", _monthly("monthly_ai_turns")),
    "contact":        ("receptionist_stored_contacts", lambda t: stores.contacts().count(t)),
    "stored_conversation": ("receptionist_stored_conversations", lambda t: stores.conversations().count(t)),
    "knowledge_source": ("receptionist_knowledge_sources", lambda t: stores.knowledge_sources().count(t)),
    "knowledge_ingestion": ("receptionist_monthly_knowledge_ingestions", _monthly("knowledge_ingestions")),
    "summary":        ("receptionist_monthly_summaries", _monthly("summaries")),
    "escalation":     ("receptionist_monthly_escalations", _monthly("escalations")),
    "reminder":       ("receptionist_scheduled_reminders", lambda t: stores.reminders().count(t)),
    "follow_up":      ("receptionist_scheduled_follow_ups", _monthly("follow_ups")),
    "gmail_reply":    ("receptionist_gmail_monthly_replies", _monthly("gmail_replies")),
    "booking":        ("receptionist_monthly_bookings", _monthly("bookings")),
    "reschedule":     ("receptionist_monthly_reschedules", _monthly("reschedules")),
    "cancellation":   ("receptionist_monthly_cancellations", _monthly("cancellations")),
    "whatsapp_inbound": ("receptionist_whatsapp_monthly_inbound", _monthly("whatsapp_inbound")),
    "whatsapp_freeform": ("receptionist_whatsapp_monthly_freeform", _monthly("whatsapp_freeform")),
    "whatsapp_template": ("receptionist_whatsapp_monthly_templates", _monthly("whatsapp_template")),
    "whatsapp_interactive": ("receptionist_whatsapp_monthly_interactive", _monthly("whatsapp_interactive")),
}


def _enforcement_on() -> bool:
    try:
        from credits import config
        return config.billing_enforcement_enabled()
    except Exception:
        return False


def check(tenant_id: str, resource: str) -> dict:
    """Advisory check for a resource → plans.check_limit result (+ used/limit)."""
    spec = _RESOURCES.get(resource)
    if spec is None:
        return {"allowed": True, "reason": "", "limit_key": "", "used": 0, "limit": -1}
    limit_key, used_fn = spec
    used = int(used_fn(tenant_id))
    try:
        from credits.plans import check_limit
        return check_limit(tenant_id, limit_key, used)
    except Exception:
        return {"allowed": True, "reason": "", "limit_key": limit_key, "used": used, "limit": -1}


def _feature_error(tenant_id: str) -> dict:
    start, end, _ = usage.current_period(tenant_id)
    return {
        "error": "feature_not_entitled", "reason": "feature_not_entitled",
        "limit_key": "ai_receptionist", "used": 0, "limit": 0,
        "billing_period": {"start": start, "end": end},
        "upgrade_url": UPGRADE_URL, "return_route": "/pixie-lab/receptionist",
    }


def enforce(tenant_id: str, resource: str) -> None:
    """Raise :class:`LimitExceeded` when over the limit AND enforcement is on.

    Also enforces the ``ai_receptionist`` feature access flag (zero-limit plans).
    Advisory (never raises) when enforcement is off."""
    if not _enforcement_on():
        return

    # Feature access first (plan with ai_receptionist=False is disabled).
    try:
        from credits.plans import check_feature
        feat = check_feature(tenant_id, "ai_receptionist")
        if not feat.get("allowed", True):
            raise LimitExceeded(_feature_error(tenant_id))
    except LimitExceeded:
        raise
    except Exception:
        pass

    result = check(tenant_id, resource)
    if not result.get("allowed", True):
        start, end, _ = usage.current_period(tenant_id)
        raise LimitExceeded({
            "error": "usage_limit_reached",
            "reason": result.get("reason", "usage_limit_reached"),
            "limit_key": result.get("limit_key", ""),
            "used": result.get("used", 0),
            "limit": result.get("limit", 0),
            "billing_period": {"start": start, "end": end},
            "upgrade_url": UPGRADE_URL,
            "return_route": "/pixie-lab/receptionist",
        })


def summary(tenant_id: str) -> dict:
    """All receptionist resource limits + current usage (for the UI / Billing)."""
    out = {}
    for resource in _RESOURCES:
        out[resource] = check(tenant_id, resource)
    return out
