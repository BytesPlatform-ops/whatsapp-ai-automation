"""Analytics roll-ups for the receptionist dashboard.

Pure aggregation over the durable stores — cheap tenant scans, no LLM. Powers the
overview cards + charts (totals, funnels, breakdowns). Everything tenant-scoped.
"""

from __future__ import annotations

from collections import Counter

from . import stores


def _counter(rows: list[dict], key: str) -> dict:
    return dict(Counter((r.get(key) or "unknown") for r in rows))


def overview(tenant_id: str) -> dict:
    conversations = stores.conversations().list(tenant_id)
    contacts = stores.contacts().list(tenant_id)
    bookings = stores.bookings().list(tenant_id)
    quotes = stores.quotes().list(tenant_id)
    escalations = stores.escalations().list(tenant_id)
    tickets = stores.tickets().list(tenant_id)
    tasks = stores.tasks().list(tenant_id)
    reminders = stores.reminders().list(tenant_id)
    payments = stores.payments().list(tenant_id)
    optouts = stores.optouts().list(tenant_id)
    callbacks = stores.callbacks().list(tenant_id)
    voicemails = stores.voicemails().list(tenant_id)
    waitlist = stores.waitlist().list(tenant_id)
    actions = stores.actions().list(tenant_id)
    replies = stores.campaign_replies().list(tenant_id)

    confirmed = [b for b in bookings if b.get("status") == "confirmed"]
    pending_followups = [t for t in tasks if t.get("status") in ("open", "in_progress")]
    total_actions = len(actions) or 1
    escalated_actions = len([a for a in actions if a.get("action") == "escalation"])
    resolved_actions = len([a for a in actions
                            if a.get("status") == "executed" and a.get("action") not in ("escalation", "fallback")])

    return {
        "totals": {
            "conversations": len(conversations),
            "leads": len(contacts),
            "bookings_requested": len(bookings),
            "bookings_confirmed": len(confirmed),
            "quotes": len(quotes),
            "escalations": len(escalations),
            "tickets": len(tickets),
            "pending_followups": len(pending_followups),
            "reminders": len(reminders),
            "callbacks": len(callbacks),
            "voicemails": len(voicemails),
            "waitlist": len(waitlist),
            "payments": len(payments),
            "opt_outs": len(optouts),
            "campaign_replies": len(replies),
        },
        "rates": {
            "ai_resolution_rate": round(resolved_actions / total_actions, 3),
            "human_escalation_rate": round(escalated_actions / total_actions, 3),
        },
        "channel_breakdown": _counter(conversations, "channel"),
        "sentiment_breakdown": _counter(conversations, "sentiment"),
        "intent_distribution": _counter(actions, "intent"),
        "booking_status_breakdown": _counter(bookings, "status"),
        "lead_status_breakdown": _counter(contacts, "status"),
        "ticket_priority_breakdown": _counter(tickets, "priority"),
        "campaign_reply_classification": _counter(replies, "classification"),
        "conversion_funnel": {
            "new": len([c for c in contacts if c.get("status") == "new"]),
            "follow_up_needed": len([c for c in contacts if c.get("status") == "follow_up_needed"]),
            "qualified": len([c for c in contacts if c.get("status") == "qualified"]),
            "converted": len([c for c in contacts if c.get("status") == "converted"]),
            "lost": len([c for c in contacts if c.get("status") == "lost"]),
        },
    }
