"""Billing operation API — authenticated, tenant-scoped, secret-free.

Read-only wallet/reservation/config surface plus a server-side estimate. Gated by
``require_internal`` (the trusted Next.js proxy sets the tenant; a browser tenant is
never trusted). No ledger internals, provider keys or pricing formulas are exposed.
Stripe checkout/portal/webhooks are Phase 6.2 and intentionally absent here.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field

from security import require_internal

from . import config, estimate as est, plans
from .reservations import get_reservation_repository
from .wallet import project
from .worker import reconcile_expired

billing_router = APIRouter(prefix="/api/billing", tags=["billing"], dependencies=[Depends(require_internal)])


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
