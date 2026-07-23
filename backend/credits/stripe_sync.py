"""Stripe event synchronization — idempotent, server-authoritative.

``process_event`` turns a verified Stripe event into subscription/plan/credit state.
Idempotent on the Stripe event id (a duplicate/replayed webhook is a no-op → no double
grant). Workspace is resolved SERVER-SIDE (event metadata.tenant_id / client_reference_id
/ customer→tenant map) — never from a browser. Out-of-order subscription updates never
move the billing period backwards.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from . import audit, plans
from .ledger import LedgerEntryType
from .money import credits_to_mc
from .service import grant
from .subscriptions import (
    Subscription,
    get_stripe_event_store,
    get_subscription_repository,
)


def _ts(unix) -> str:
    try:
        return datetime.fromtimestamp(int(unix), tz=timezone.utc).isoformat(timespec="seconds")
    except (TypeError, ValueError):
        return ""


def _obj(event: dict) -> dict:
    return (event.get("data") or {}).get("object") or {}


def _tenant_for(obj: dict) -> str:
    """Server-side tenant resolution. Order: explicit metadata → checkout ref →
    customer→tenant map. Never trusts a browser value."""
    meta = obj.get("metadata") or {}
    if meta.get("tenant_id"):
        return str(meta["tenant_id"])
    if obj.get("client_reference_id"):
        return str(obj["client_reference_id"])
    cust = obj.get("customer") or ""
    if cust:
        sub = get_subscription_repository().find_by_customer(cust)
        if sub:
            return sub.tenant_id
    return ""


def _price_id(sub_obj: dict) -> str:
    items = ((sub_obj.get("items") or {}).get("data") or [])
    if items:
        return (items[0].get("price") or {}).get("id") or items[0].get("plan", {}).get("id", "")
    return sub_obj.get("plan", {}).get("id", "")


def process_event(event: dict) -> dict:
    eid = event.get("id", "")
    etype = event.get("type", "")
    obj = _obj(event)
    store = get_stripe_event_store()

    if store.already_processed(eid):
        audit.emit(_tenant_for(obj) or "_stripe", audit.DUPLICATE_WEBHOOK_IGNORED,
                   metadata={"event_id": eid, "type": etype})
        return {"duplicate": True, "event_id": eid, "type": etype}

    tenant = _tenant_for(obj)
    result = {"processed": True, "event_id": eid, "type": etype, "tenant_id": tenant}

    if etype in ("customer.subscription.created", "customer.subscription.updated"):
        _sync_subscription(tenant, obj)
    elif etype == "customer.subscription.deleted":
        _cancel_subscription(tenant, obj)
    elif etype == "checkout.session.completed":
        _link_customer(tenant, obj)
    elif etype == "invoice.paid":
        result["granted"] = _grant_monthly(tenant, obj, eid)
    elif etype in ("invoice.payment_failed", "invoice.payment_action_required"):
        _mark_past_due(tenant, obj)
    elif etype in ("charge.refunded", "charge.dispute.created"):
        audit.emit(tenant or "_stripe", audit.PAYMENT_FAILED if etype == "charge.dispute.created" else audit.REFUND_CREATED,
                   metadata={"event_id": eid, "type": etype})

    store.mark_processed(eid, etype, tenant)
    return result


def _apply_wallet_period(tenant: str, sub: Subscription) -> None:
    try:
        from .wallet import get_wallet_repository
        get_wallet_repository().set_plan_period(tenant, plan_id=sub.plan_id,
                                                 period_start=sub.current_period_start,
                                                 period_end=sub.current_period_end)
    except Exception:
        pass


def _sync_subscription(tenant: str, obj: dict) -> None:
    if not tenant:
        return
    repo = get_subscription_repository()
    existing = repo.get(tenant)
    plan_id = plans.plan_for_price(_price_id(obj)) or (existing.plan_id if existing else "free")
    new_end = _ts(obj.get("current_period_end"))
    # Out-of-order guard: never move the period backwards.
    if existing and existing.current_period_end and new_end and new_end < existing.current_period_end:
        return
    old_plan = existing.plan_id if existing else ""
    sub = Subscription(
        tenant_id=tenant, plan_id=plan_id, status=str(obj.get("status", "active")),
        stripe_customer_id=obj.get("customer", "") or (existing.stripe_customer_id if existing else ""),
        stripe_subscription_id=obj.get("id", ""),
        current_period_start=_ts(obj.get("current_period_start")),
        current_period_end=new_end,
        cancel_at_period_end=bool(obj.get("cancel_at_period_end", False)))
    repo.upsert(sub)
    _apply_wallet_period(tenant, sub)
    audit.emit(tenant, audit.SUBSCRIPTION_UPDATED, metadata={"plan_id": plan_id, "status": sub.status,
                                                             "cancel_at_period_end": sub.cancel_at_period_end})
    if old_plan and old_plan != plan_id:
        audit.emit(tenant, audit.PLAN_CHANGED, metadata={"from": old_plan, "to": plan_id})


def _cancel_subscription(tenant: str, obj: dict) -> None:
    if not tenant:
        return
    repo = get_subscription_repository()
    existing = repo.get(tenant) or Subscription(tenant_id=tenant)
    sub = existing.model_copy(update={"status": "canceled",
                                      "current_period_end": _ts(obj.get("current_period_end")) or existing.current_period_end})
    repo.upsert(sub)
    audit.emit(tenant, audit.SUBSCRIPTION_UPDATED, metadata={"status": "canceled"})


def _link_customer(tenant: str, obj: dict) -> None:
    if not tenant:
        return
    repo = get_subscription_repository()
    existing = repo.get(tenant) or Subscription(tenant_id=tenant)
    repo.upsert(existing.model_copy(update={"stripe_customer_id": obj.get("customer", "") or existing.stripe_customer_id}))


def _grant_monthly(tenant: str, obj: dict, event_id: str) -> bool:
    """Grant plan-included monthly credits ONCE per invoice/event. Included credits
    expire at period end (default policy); purchased credits roll over."""
    if not tenant:
        return False
    # Only grant when the invoice is actually paid.
    if obj.get("paid") is False or str(obj.get("status", "paid")) not in ("paid", ""):
        return False
    sub = get_subscription_repository().get(tenant)
    plan = plans.get_plan(sub.plan_id if sub else "free")
    if plan.monthly_credits <= 0:
        return False
    grant(tenant, credits_to_mc(plan.monthly_credits), entry_type=LedgerEntryType.MONTHLY_RESET,
          reason_code="plan_included_monthly", idempotency_key=f"grant:{event_id}",
          stripe_event_id=event_id, reference_type="stripe_invoice", reference_id=obj.get("id", ""))
    return True


def _mark_past_due(tenant: str, obj: dict) -> None:
    if not tenant:
        return
    repo = get_subscription_repository()
    existing = repo.get(tenant) or Subscription(tenant_id=tenant)
    repo.upsert(existing.model_copy(update={"status": "past_due"}))
    audit.emit(tenant, audit.PAYMENT_FAILED, metadata={"invoice": obj.get("id", "")})
