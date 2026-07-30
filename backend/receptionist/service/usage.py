"""Durable, period-scoped, idempotent usage counters for the AI Receptionist (Wave 5).

Multi-instance-safe counting without a parallel DB: one row per
(tenant, metric, period) in ``receptionist_usage_counters`` plus a per-request
idempotency marker row, so a duplicate request never increments twice and the
value survives restart. In supabase mode this is a durable read-modify-write; for
a strictly atomic increment under heavy contention a Postgres RPC would be used,
and billing-critical totals are additionally reconciled from settled reservations
(``credits.usage``). These counters cover the non-credit quantities and give the
UI fast reads.

Metrics (Part 15): monthly_conversations, monthly_ai_turns, summaries,
escalations, reminders, follow_ups, knowledge_ingestions, approvals_created,
gmail_operations, calendar_operations, worker_operations. Gauge-style quantities
(stored_contacts, stored_conversations, knowledge_sources, human_assignees) are
derived from their stores in :func:`summary`.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional, Tuple

from . import stores

# Monthly incrementing counters exposed to billing/UI.
COUNTER_METRICS: list[str] = [
    "monthly_conversations", "monthly_ai_turns", "summaries", "escalations",
    "reminders", "follow_ups", "knowledge_ingestions", "approvals_created",
    "gmail_operations", "calendar_operations", "worker_operations",
    "gmail_replies", "bookings", "reschedules", "cancellations",
]


def current_period(tenant_id: str) -> Tuple[str, str, bool]:
    """(start_iso, end_iso, fallback). Reuses the billing period so receptionist
    usage lines up with the workspace's Stripe window; else a calendar-month
    fallback (documented, timezone: UTC)."""
    try:
        from credits.usage import current_period as billing_period
        return billing_period(tenant_id)
    except Exception:
        now = datetime.now(timezone.utc)
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        end = (start.replace(year=start.year + 1, month=1) if start.month == 12
               else start.replace(month=start.month + 1))
        return start.isoformat(timespec="seconds"), end.isoformat(timespec="seconds"), True


def _period_key(period: Tuple[str, str, bool]) -> str:
    return period[0]


def _counter_id(metric: str, period_start: str) -> str:
    return f"ctr::{metric}::{period_start}"


def _marker_id(metric: str, period_start: str, idempotency_key: str) -> str:
    return f"idem::{metric}::{period_start}::{idempotency_key}"


def increment(tenant_id: str, metric: str, *, amount: int = 1,
              idempotency_key: str = "", period: Optional[Tuple[str, str, bool]] = None) -> int:
    """Add ``amount`` to a period-scoped counter and return the new value.

    Idempotent: a repeated ``idempotency_key`` for the same (tenant, metric,
    period) does not increment again — it returns the current value. Durable and
    restart-safe via the shared persistence layer."""
    if amount == 0:
        return get(tenant_id, metric, period=period)
    period = period or current_period(tenant_id)
    pstart = _period_key(period)
    repo = stores.usage_counters()

    if idempotency_key:
        marker_id = _marker_id(metric, pstart, idempotency_key)
        if repo.get(tenant_id, marker_id) is not None:
            return get(tenant_id, metric, period=period)  # already applied
        repo.put(tenant_id, {"id": marker_id, "tenant_id": tenant_id, "kind": "marker",
                             "metric": metric, "period_start": pstart})

    cid = _counter_id(metric, pstart)
    row = repo.get(tenant_id, cid)
    value = int((row or {}).get("value", 0)) + amount
    repo.put(tenant_id, {
        "id": cid, "tenant_id": tenant_id, "kind": "counter",
        "metric": metric, "period_start": pstart, "period_end": period[1],
        "value": value,
    })
    return value


def get(tenant_id: str, metric: str, *, period: Optional[Tuple[str, str, bool]] = None) -> int:
    period = period or current_period(tenant_id)
    row = stores.usage_counters().get(tenant_id, _counter_id(metric, _period_key(period)))
    return int((row or {}).get("value", 0))


def _gauge(tenant_id: str, metric: str) -> int:
    try:
        if metric == "stored_contacts":
            return stores.contacts().count(tenant_id)
        if metric == "stored_conversations":
            return stores.conversations().count(tenant_id)
        if metric == "knowledge_sources":
            return stores.knowledge().count(tenant_id)
        if metric == "pending_approvals":
            from approvals.router import list_pending  # type: ignore
            return len(list_pending(tenant_id, agent="ai-receptionist"))
    except Exception:
        return 0
    return 0


GAUGE_METRICS: list[str] = ["stored_contacts", "stored_conversations", "knowledge_sources"]


def summary(tenant_id: str, *, period: Optional[Tuple[str, str, bool]] = None) -> dict:
    """Combined durable counters + derived gauges for the billing period (API + UI)."""
    period = period or current_period(tenant_id)
    counters = {m: get(tenant_id, m, period=period) for m in COUNTER_METRICS}
    gauges = {m: _gauge(tenant_id, m) for m in GAUGE_METRICS}
    return {
        "period": {"start": period[0], "end": period[1], "fallback": period[2]},
        "counters": counters,
        "gauges": gauges,
    }
