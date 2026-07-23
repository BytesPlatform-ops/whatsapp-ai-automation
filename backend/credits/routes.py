"""Billing operation API — authenticated, tenant-scoped, secret-free.

Read-only wallet/reservation/config surface plus a server-side estimate. Gated by
``require_internal`` (the trusted Next.js proxy sets the tenant; a browser tenant is
never trusted). No ledger internals, provider keys or pricing formulas are exposed.
Stripe checkout/portal/webhooks are Phase 6.2 and intentionally absent here.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict, Field

from security import require_internal

from . import config, estimate as est, plans, stripe, usage as usage_mod
from .ledger import get_ledger_repository
from .reservations import get_reservation_repository
from .subscriptions import get_subscription_repository
from .wallet import project
from .worker import reconcile_expired

billing_router = APIRouter(prefix="/api/billing", tags=["billing"], dependencies=[Depends(require_internal)])
# Public — Stripe calls this directly; auth is the signature, not the internal secret.
stripe_webhook_router = APIRouter(prefix="/api/billing", tags=["billing-webhook"])


@billing_router.get("/config")
def billing_config() -> dict:
    return config.status()


@billing_router.get("/plans")
def billing_plans() -> dict:
    return {"plans": plans.catalog_summary()}


@billing_router.get("/wallet")
def wallet(tenant_id: str = Query(..., min_length=1)) -> dict:
    w = project(tenant_id).model_dump()
    plan = plans.plan_for_workspace(tenant_id)
    return {"tenant_id": tenant_id, "wallet": w, "plan": plans.plan_summary(plan)}


@billing_router.get("/reservations")
def list_reservations(tenant_id: str = Query(..., min_length=1),
                      status: str = Query(default=""),
                      limit: int = Query(default=50, ge=1, le=200),
                      offset: int = Query(default=0, ge=0)) -> dict:
    rows = [(i, r) for (i, r) in get_reservation_repository().list(tenant_id)
            if r and (not status or r.status == status)]
    rows.sort(key=lambda x: x[1].created_at, reverse=True)
    total = len(rows)
    page = rows[offset:offset + limit]
    return {"tenant_id": tenant_id, "total": total, "limit": limit, "offset": offset,
            "reservations": [{"id": i, **r.model_dump()} for (i, r) in page]}


def _reservation_or_404(tenant_id: str, rid: str) -> dict:
    found = get_reservation_repository().get(tenant_id, rid)
    if found is None:
        raise HTTPException(status_code=404, detail="reservation not found for tenant")
    i, r = found
    return {"id": i, **r.model_dump()}


@billing_router.get("/reservations/{reservation_id}")
def get_reservation(reservation_id: str, tenant_id: str = Query(..., min_length=1)) -> dict:
    return {"reservation": _reservation_or_404(tenant_id, reservation_id)}


@billing_router.get("/operations/{operation_id}")
def get_operation(operation_id: str, tenant_id: str = Query(..., min_length=1)) -> dict:
    """A product operation is tracked by its reservation (idempotency key == op id)."""
    found = get_reservation_repository().find_by_idempotency(tenant_id, operation_id)
    if found is None:
        raise HTTPException(status_code=404, detail="operation not found for tenant")
    i, r = found
    return {"operation": {"id": i, "operation_id": operation_id, **r.model_dump()}}


class _EstimateBody(BaseModel):
    model_config = ConfigDict(extra="ignore")
    tenant_id: str = Field(..., min_length=1)
    operation: str                       # content_text | influencer_idea | influencer_script | influencer_video
    variations: int = 1
    duration_seconds: int = 15
    model: str = "standard"
    outputs: int = 1
    is_mock: bool = True
    byok: bool = False


@billing_router.post("/estimate")
def estimate(body: _EstimateBody) -> dict:
    op = body.operation
    t = body.tenant_id
    if op == "content_text":
        return est.content_agent_estimate(t, variations=body.variations, is_mock=body.is_mock, byok=body.byok)
    if op == "influencer_idea":
        return est.influencer_idea_estimate(t, is_mock=body.is_mock, byok=body.byok)
    if op == "influencer_script":
        return est.influencer_script_estimate(t, is_mock=body.is_mock, byok=body.byok)
    if op == "influencer_video":
        return est.influencer_video_estimate(t, duration_seconds=body.duration_seconds, model=body.model,
                                             outputs=body.outputs, is_mock=body.is_mock, byok=body.byok)
    raise HTTPException(status_code=422, detail={"error": "unknown_operation", "message": f"unknown operation {op!r}"})


class _ReconcileBody(BaseModel):
    model_config = ConfigDict(extra="ignore")
    tenant_id: str = ""


@billing_router.post("/reconcile/run-once")
def reconcile_run_once(_body: _ReconcileBody) -> dict:
    """Internal: run the expired-reservation reconciler once (server-triggered)."""
    return reconcile_expired("billing-http")


@billing_router.get("/reconcile/status")
def reconcile_status() -> dict:
    return {"enabled": config.reconciliation_enabled(),
            "interval_seconds": config.reconciliation_interval_seconds()}


# ── subscription status / entitlements / usage / ledger ─────────────────────────
@billing_router.get("/status")
def status(tenant_id: str = Query(..., min_length=1)) -> dict:
    sub = get_subscription_repository().get(tenant_id)
    plan = plans.plan_for_workspace(tenant_id)
    subscription = {
        "status": sub.status if sub else "inactive",
        "plan_id": plan.id,
        "cancel_at_period_end": bool(sub.cancel_at_period_end) if sub else False,
        "current_period_end": sub.current_period_end if sub else "",
        "past_due": bool(sub.past_due) if sub else False,
    }
    return {"tenant_id": tenant_id, "subscription": subscription, "plan": plans.plan_summary(plan)}


@billing_router.get("/entitlements")
def entitlements(tenant_id: str = Query(..., min_length=1)) -> dict:
    plan = plans.plan_for_workspace(tenant_id)
    return {"tenant_id": tenant_id, "plan": {"id": plan.id, "name": plan.name},
            "access": dict(plan.access), "limits": dict(plan.limits)}


@billing_router.get("/usage")
def usage(tenant_id: str = Query(..., min_length=1)) -> dict:
    return {"tenant_id": tenant_id, **usage_mod.usage_summary(tenant_id)}


_LEDGER_SAFE = ("entry_type", "amount_mc", "reserved_delta_mc", "reason_code", "reference_type",
                "reference_id", "reservation_id", "original_txn_id", "created_at")


@billing_router.get("/ledger")
def ledger(tenant_id: str = Query(..., min_length=1),
           type: str = Query(default=""),
           limit: int = Query(default=50, ge=1, le=200),
           offset: int = Query(default=0, ge=0)) -> dict:
    rows = [(i, e) for (i, e) in get_ledger_repository().list(tenant_id)
            if e and (not type or e.entry_type == type)]
    rows.sort(key=lambda x: x[1].created_at, reverse=True)
    total = len(rows)
    page = rows[offset:offset + limit]
    entries = [{"id": i, **{k: getattr(e, k) for k in _LEDGER_SAFE}} for (i, e) in page]
    return {"tenant_id": tenant_id, "total": total, "limit": limit, "offset": offset, "entries": entries}


# ── checkout / portal ───────────────────────────────────────────────────────────
class _CheckoutBody(BaseModel):
    model_config = ConfigDict(extra="ignore")
    tenant_id: str = Field(..., min_length=1)
    plan: str = Field(..., min_length=1)


@billing_router.post("/checkout")
def checkout(body: _CheckoutBody) -> dict:
    stripe.sync_plan_registry()
    if not stripe.configured():
        raise HTTPException(status_code=503, detail={"error": "stripe_not_configured",
                            "message": "Billing isn't configured yet."})
    if body.plan not in plans.PLAN_CATALOG or body.plan == "free":
        raise HTTPException(status_code=422, detail={"error": "invalid_plan", "message": "Unknown plan."})
    price_id = stripe.plan_to_price(body.plan)
    if not price_id:
        raise HTTPException(status_code=503, detail={"error": "price_not_configured",
                            "message": "That plan has no Stripe price configured."})
    sub = get_subscription_repository().get(body.tenant_id)
    customer_id = sub.stripe_customer_id if sub else ""
    session = stripe.create_checkout_session(price_id=price_id, customer_id=customer_id,
                                             tenant_id=body.tenant_id, success=stripe.success_url(),
                                             cancel=stripe.cancel_url())
    return {"url": session.get("url", "")}


class _PortalBody(BaseModel):
    model_config = ConfigDict(extra="ignore")
    tenant_id: str = Field(..., min_length=1)


@billing_router.post("/portal")
def portal(body: _PortalBody) -> dict:
    if not stripe.configured():
        raise HTTPException(status_code=503, detail={"error": "stripe_not_configured",
                            "message": "Billing isn't configured yet."})
    sub = get_subscription_repository().get(body.tenant_id)
    if not sub or not sub.stripe_customer_id:
        raise HTTPException(status_code=409, detail={"error": "no_customer",
                            "message": "No billing account yet — start a subscription first."})
    session = stripe.create_portal_session(customer_id=sub.stripe_customer_id, return_url=stripe.portal_return_url())
    return {"url": session.get("url", "")}


# ── Stripe webhook (public; signature is the auth) ──────────────────────────────
@stripe_webhook_router.post("/webhook")
async def stripe_webhook(request: Request) -> dict:
    from .stripe_sync import process_event
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    try:
        stripe.verify_signature(payload, sig)
    except stripe.SignatureError as exc:
        raise HTTPException(status_code=400, detail={"error": "invalid_signature", "message": str(exc)})
    import json as _json
    try:
        event = _json.loads(payload.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail={"error": "invalid_payload"})
    stripe.sync_plan_registry()
    return process_event(event)
