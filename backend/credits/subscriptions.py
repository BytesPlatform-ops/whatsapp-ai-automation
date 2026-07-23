"""Workspace subscription state + Stripe event receipts (idempotency).

One ``Subscription`` row per tenant (id = tenant_id) mirrors the Stripe subscription
(plan, status, period, cancel-at-period-end, customer id). ``StripeEventStore`` records
processed Stripe event ids so a replayed/duplicate webhook is a no-op (unique event id).
Customer→tenant mapping is server-side only.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional, Tuple

import persistence
from pydantic import BaseModel, ConfigDict, Field


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Subscription(BaseModel):
    model_config = ConfigDict(extra="ignore")
    tenant_id: str = Field(..., min_length=1)
    plan_id: str = "free"
    status: str = "inactive"           # active | trialing | past_due | unpaid | canceled | inactive
    stripe_customer_id: str = ""
    stripe_subscription_id: str = ""
    current_period_start: str = ""
    current_period_end: str = ""
    cancel_at_period_end: bool = False
    updated_at: str = ""

    @property
    def past_due(self) -> bool:
        return self.status in ("past_due", "unpaid")

    @property
    def active_access(self) -> bool:
        """Access is granted while active/trialing, or cancelled-but-still-in-period."""
        return self.status in ("active", "trialing") or (self.status == "canceled" and not self._period_over())

    def _period_over(self) -> bool:
        return bool(self.current_period_end) and self.current_period_end < _now()


class SubscriptionRepository:
    table_name = "credit_subscriptions"

    def __init__(self) -> None:
        self._repo = persistence.table(self.table_name)

    def get(self, tenant_id: str) -> Optional[Subscription]:
        row = self._repo.get(tenant_id, tenant_id)
        return Subscription(**row["data"]) if row else None

    def upsert(self, sub: Subscription) -> Subscription:
        sub = sub.model_copy(update={"updated_at": _now()})
        self._repo.upsert(persistence.envelope(sub.tenant_id, sub.tenant_id, sub.model_dump(mode="json")))
        return sub

    def _all(self) -> List[dict]:
        rows = getattr(self._repo, "_rows", None)
        if rows is not None:
            return list(rows)
        try:
            import httpx
            with httpx.Client(timeout=20) as http:
                r = http.get(persistence._sb_rest(self.table_name), headers=persistence._sb_headers())
                return r.json() if r.status_code == 200 else []
        except Exception:
            return []

    def find_by_customer(self, customer_id: str) -> Optional[Subscription]:
        if not customer_id:
            return None
        for row in self._all():
            if row.get("data", {}).get("stripe_customer_id") == customer_id:
                return Subscription(**row["data"])
        return None


class StripeEventStore:
    """Append-only receipt of processed Stripe event ids (idempotency)."""
    table_name = "credit_stripe_events"

    def __init__(self) -> None:
        self._repo = persistence.table(self.table_name)

    def already_processed(self, event_id: str) -> bool:
        if not event_id:
            return False
        return self._repo.get("_stripe", event_id) is not None

    def mark_processed(self, event_id: str, event_type: str = "", tenant_id: str = "") -> None:
        if not event_id:
            return
        self._repo.upsert(persistence.envelope(event_id, "_stripe", {
            "event_id": event_id, "event_type": event_type, "tenant_id": tenant_id, "processed_at": _now()}))


_SUB_REPO: Optional[SubscriptionRepository] = None
_EVT_REPO: Optional[StripeEventStore] = None


def get_subscription_repository() -> SubscriptionRepository:
    global _SUB_REPO
    if _SUB_REPO is None:
        _SUB_REPO = SubscriptionRepository()
    return _SUB_REPO


def get_stripe_event_store() -> StripeEventStore:
    global _EVT_REPO
    if _EVT_REPO is None:
        _EVT_REPO = StripeEventStore()
    return _EVT_REPO


def reset_subscription_repositories() -> None:
    global _SUB_REPO, _EVT_REPO
    _SUB_REPO = None
    _EVT_REPO = None
