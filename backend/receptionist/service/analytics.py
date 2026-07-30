"""Analytics roll-ups for the receptionist dashboard.

Pure aggregation over the durable stores — cheap tenant scans, no LLM. Powers the
overview cards + charts (totals, funnels, breakdowns). Everything tenant-scoped.
"""

from __future__ import annotations

from collections import Counter
from datetime import datetime, timedelta, timezone

from . import stores


def _counter(rows: list[dict], key: str) -> dict:
    return dict(Counter((r.get(key) or "unknown") for r in rows))


# ── date-range analytics (Part 21) ───────────────────────────────────────────

_PRESETS = {"today": 1, "7d": 7, "30d": 30, "90d": 90}


def _resolve_range(start: str, end: str, preset: str) -> tuple[str, str]:
    """Return (start_iso, end_iso). Preset wins when start/end are absent. Times are
    UTC ISO strings compared lexically against stored created_at."""
    now = datetime.now(timezone.utc)
    if start and end:
        return start, end
    if preset == "mtd":
        s = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        return s.isoformat(timespec="seconds"), now.isoformat(timespec="seconds")
    days = _PRESETS.get(preset or "30d", 30)
    s = (now - timedelta(days=days)).replace(microsecond=0)
    return s.isoformat(timespec="seconds"), now.isoformat(timespec="seconds")


def _in_range(iso: str, start: str, end: str) -> bool:
    return bool(iso) and start <= iso <= end


def _filt(rows: list[dict], start: str, end: str) -> list[dict]:
    return [r for r in rows if _in_range(r.get("created_at", ""), start, end)]


def range_summary(tenant_id: str, *, start: str = "", end: str = "", preset: str = "") -> dict:
    """Server-side aggregation over a bounded date range. Real persisted data only;
    empty ranges return zeros (never fabricated values)."""
    s, e = _resolve_range(start, end, preset)

    conversations = _filt(stores.conversations().list(tenant_id), s, e)
    contacts = _filt(stores.contacts().list(tenant_id), s, e)
    messages = _filt(stores.messages().list(tenant_id), s, e)
    actions = _filt(stores.actions().list(tenant_id), s, e)
    escalations = _filt(stores.escalations().list(tenant_id), s, e)
    tasks = _filt(stores.tasks().list(tenant_id), s, e)
    reminders = _filt(stores.reminders().list(tenant_id), s, e)

    ai_msgs = [m for m in messages if m.get("role") == "assistant"]
    human_msgs = [m for m in messages if m.get("role") in ("human", "customer")]
    total_actions = len(actions) or 1
    resolved = len([a for a in actions if a.get("status") == "executed"
                    and a.get("action") not in ("escalation", "fallback")])
    failed = len([a for a in actions if a.get("status") == "failed"])

    from . import usage as _usage
    try:
        credits = _usage.get(tenant_id, "monthly_ai_turns")
    except Exception:
        credits = 0

    return {
        "range": {"start": s, "end": e, "preset": preset or "30d"},
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "metrics": {
            "conversations": len(conversations),
            "ai_messages": len(ai_msgs),
            "human_messages": len(human_msgs),
            "new_contacts": len(contacts),
            "leads": len([c for c in contacts if c.get("intent") not in ("", "unknown", None)]),
            "qualified_leads": len([c for c in contacts if c.get("status") == "qualified"]),
            "escalations": len(escalations),
            "resolutions": resolved,
            "approvals": len([a for a in actions if a.get("status") == "approval_required"]),
            "follow_ups": len([t for t in tasks if t.get("kind") == "follow_up"]),
            "reminders": len(reminders),
            "knowledge_queries": len([a for a in actions if a.get("intent") == "faq"]),
            "knowledge_gaps": len([a for a in actions if a.get("action") == "faq" and a.get("detail") == "source=none"]),
            "failed_actions": failed,
            "credits_consumed": credits,
        },
        "rates": {
            "ai_resolution_rate": round(resolved / total_actions, 3),
        },
        "top_intents": _counter(actions, "intent"),
    }


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
