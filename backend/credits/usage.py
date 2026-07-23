"""Period-scoped usage counters — derived from settled reservations + product stores.

Credit-consuming operations are counted from SETTLED reservations, which makes the
"what counts" rules true by construction (Task/Part 4):
  * a successful paid op settles exactly once → counts once,
  * mock ops place no reservation → don't count,
  * a released/expired hold → not settled → doesn't count,
  * a duplicate request reuses one reservation → counts once,
  * provider retries within one operation share one reservation → count once.

Non-credit quantities (publish jobs, connected accounts, scheduled jobs, documents,
profiles) are counted from their own stores.

Billing period: the workspace's Stripe subscription window when present (wallet
period_start/end), else a clearly-marked calendar-month fallback (replaced in the
Stripe sync phase).
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional, Tuple

from .reservations import ReservationStatus, get_reservation_repository


def current_period(tenant_id: str) -> Tuple[str, str, bool]:
    """(start_iso, end_iso, fallback). Uses the wallet's Stripe period when set."""
    try:
        from .wallet import get_wallet_repository
        w = get_wallet_repository().get_cached(tenant_id)
        if w and w.period_start and w.period_end:
            return w.period_start, w.period_end, False
    except Exception:
        pass
    now = datetime.now(timezone.utc)
    start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    end = (start.replace(year=start.year + 1, month=1) if start.month == 12
           else start.replace(month=start.month + 1))
    return start.isoformat(timespec="seconds"), end.isoformat(timespec="seconds"), True


def _in_period(iso: str, start: str, end: str) -> bool:
    return bool(iso) and start <= iso < end


def count_operations(tenant_id: str, operation_type: str, *, period: Optional[Tuple[str, str, bool]] = None) -> int:
    """Settled reservations of an operation_type in the current period."""
    start, end, _ = period or current_period(tenant_id)
    n = 0
    for _i, r in get_reservation_repository().list(tenant_id):
        if not r or r.operation_type != operation_type:
            continue
        if r.status == ReservationStatus.SETTLED.value and _in_period(r.created_at, start, end):
            n += 1
    return n


# ── product-store counts (non-credit quantities) ───────────────────────────────
def count_publish_jobs(tenant_id: str, *, period: Optional[Tuple[str, str, bool]] = None) -> int:
    start, end, _ = period or current_period(tenant_id)
    try:
        from publishing.store import get_job_repository
        from publishing.enums import PublishStatus
        return sum(1 for _i, j in get_job_repository().list(tenant_id)
                   if j and j.status != PublishStatus.CANCELLED and _in_period(j.created_at, start, end))
    except Exception:
        return 0


def count_active_scheduled_jobs(tenant_id: str) -> int:
    try:
        from publishing.store import get_job_repository
        from publishing.enums import PublishStatus
        return sum(1 for _i, j in get_job_repository().list(tenant_id)
                   if j and j.status in (PublishStatus.SCHEDULED, PublishStatus.QUEUED, PublishStatus.RETRY_WAIT))
    except Exception:
        return 0


def count_connected_accounts(tenant_id: str) -> int:
    try:
        from publishing import connections
        return len(connections.list_accounts(tenant_id))
    except Exception:
        return 0


def count_documents(tenant_id: str) -> int:
    try:
        from content_agent.store import get_document_repository
        return len(get_document_repository().list(tenant_id))
    except Exception:
        return 0


def count_influencer_profiles(tenant_id: str) -> int:
    try:
        from content_creator.store import get_identity_repository
        idn = get_identity_repository().get_active(tenant_id)
        return 1 if idn else 0
    except Exception:
        return 0


# key → (label, counter, limit_key)
_COUNTERS = [
    ("content_text", "Text generations", lambda t, p: count_operations(t, "content_text", period=p), "monthly_text_generations"),
    ("influencer_idea", "Idea generations", lambda t, p: count_operations(t, "influencer_idea", period=p), "monthly_text_generations"),
    ("influencer_script", "Script generations", lambda t, p: count_operations(t, "influencer_script", period=p), "monthly_text_generations"),
    ("influencer_video", "Video generations", lambda t, p: count_operations(t, "influencer_video", period=p), "monthly_video_generations"),
    ("publish_jobs", "Publish jobs", lambda t, p: count_publish_jobs(t, period=p), None),
    ("connected_accounts", "Connected accounts", lambda t, p: count_connected_accounts(t), "connected_accounts"),
    ("scheduled_jobs", "Active scheduled jobs", lambda t, p: count_active_scheduled_jobs(t), "scheduled_jobs"),
    ("documents", "Saved documents", lambda t, p: count_documents(t), "max_documents"),
    ("influencer_profiles", "Influencer profiles", lambda t, p: count_influencer_profiles(t), "active_influencer_profiles"),
]


def usage_summary(tenant_id: str) -> dict:
    """Per-counter used/limit/remaining for the billing period (API + UI)."""
    from .plans import UNLIMITED, plan_for_workspace
    plan = plan_for_workspace(tenant_id)
    period = current_period(tenant_id)
    counters = []
    for key, label, fn, limit_key in _COUNTERS:
        used = fn(tenant_id, period)
        limit = plan.limit(limit_key) if limit_key else UNLIMITED
        counters.append({
            "key": key, "label": label, "used": used, "limit": limit,
            "remaining": UNLIMITED if limit == UNLIMITED else max(0, limit - used),
        })
    return {"period": {"start": period[0], "end": period[1], "fallback": period[2]}, "counters": counters}
