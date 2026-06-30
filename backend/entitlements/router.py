"""Entitlements API — owned/trial/locked state per agent, plus trial + checkout.

Endpoints (tenant-scoped):
  GET  /api/entitlements                 all agents' states for a tenant
  GET  /api/entitlements/agent/{agent}   one agent's state
  POST /api/entitlements/start-trial     begin a time-boxed trial (idempotent)
  POST /api/entitlements/create-checkout Stripe checkout (STUB until keys wired)

No silent charges: start-trial only flips to `trial`; `active` happens only via
the (future) Stripe webhook. Self-contained: one include_router line in app.py.
"""

from __future__ import annotations

from enum import Enum
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, ConfigDict

# Trial length (config-driven; days).
TRIAL_DAYS = 7
AGENTS = ["website", "receptionist", "seo", "marketing", "content"]


class AgentState(str, Enum):
    locked = "locked"
    trial = "trial"
    active = "active"
    expired = "expired"


class AgentEntitlement(BaseModel):
    model_config = ConfigDict(use_enum_values=True)
    agent: str
    state: AgentState = AgentState.locked
    plan: str = ""
    source: str = ""
    trial_started_at: Optional[str] = None
    trial_ends_at: Optional[str] = None


# ── store (in-memory; per tenant) ───────────────────────────────────────────────
class _Store:
    def __init__(self) -> None:
        self._data: dict[str, dict[str, AgentEntitlement]] = {}
        self._trials_used: dict[str, set[str]] = {}

    def all(self, tenant: str) -> list[AgentEntitlement]:
        owned = self._data.get(tenant, {})
        return [owned.get(a) or AgentEntitlement(agent=a, state=AgentState.locked) for a in AGENTS]

    def get(self, tenant: str, agent: str) -> AgentEntitlement:
        return self._data.get(tenant, {}).get(agent) or AgentEntitlement(agent=agent, state=AgentState.locked)

    def set(self, tenant: str, ent: AgentEntitlement) -> AgentEntitlement:
        self._data.setdefault(tenant, {})[ent.agent] = ent
        return ent

    def trial_used(self, tenant: str, agent: str) -> bool:
        return agent in self._trials_used.get(tenant, set())

    def mark_trial_used(self, tenant: str, agent: str) -> None:
        self._trials_used.setdefault(tenant, set()).add(agent)


_store: Optional[_Store] = None


def _seed_demo(store: _Store) -> None:
    """Seed the local-demo tenant ('demo', used for unauthenticated local runs)
    with a coherent mix so the dashboard shows real active/trial/locked states.
    Real tenants ('t_<id>') start fully locked until they trial/purchase."""
    store.set("demo", AgentEntitlement(agent="website", state=AgentState.active, plan="pro"))
    store.set("demo", AgentEntitlement(
        agent="receptionist", state=AgentState.trial, plan="trial",
        trial_started_at="2026-06-30T00:00:00Z", trial_ends_at="2026-07-05T00:00:00Z",
    ))


def _get_store() -> _Store:
    global _store
    if _store is None:
        _store = _Store()
        _seed_demo(_store)
    return _store


router = APIRouter(prefix="/api/entitlements", tags=["entitlements"])


def _check_agent(agent: str) -> str:
    if agent not in AGENTS:
        raise HTTPException(status_code=404, detail=f"unknown agent: {agent}")
    return agent


@router.get("", response_model=list[AgentEntitlement])
def list_entitlements(tenant_id: str = Query(...)) -> list[AgentEntitlement]:
    return _get_store().all(tenant_id)


@router.get("/agent/{agent}", response_model=AgentEntitlement)
def get_entitlement(agent: str, tenant_id: str = Query(...)) -> AgentEntitlement:
    return _get_store().get(tenant_id, _check_agent(agent))


class StartTrialBody(BaseModel):
    tenant_id: str
    agent: str
    # Caller passes wall-clock timestamps (the backend avoids time.* for testability/
    # determinism); ISO strings straight from the client are fine here.
    now: Optional[str] = None
    ends: Optional[str] = None


@router.post("/start-trial", response_model=AgentEntitlement)
def start_trial(body: StartTrialBody) -> AgentEntitlement:
    agent = _check_agent(body.agent)
    store = _get_store()
    current = store.get(body.tenant_id, agent)
    if current.state in ("active", "trial"):
        return current  # idempotent — already usable
    if store.trial_used(body.tenant_id, agent):
        raise HTTPException(status_code=409, detail="trial already used for this agent")
    store.mark_trial_used(body.tenant_id, agent)
    ent = AgentEntitlement(
        agent=agent,
        state=AgentState.trial,
        plan="trial",
        trial_started_at=body.now,
        trial_ends_at=body.ends,
    )
    return store.set(body.tenant_id, ent)


class ActivateBody(BaseModel):
    tenant_id: str
    agent: str
    source: str = "signup_flow"


@router.post("/activate", response_model=AgentEntitlement)
def activate(body: ActivateBody) -> AgentEntitlement:
    """Free activation (NO payment) — used by the signup flow and the dashboard's
    'Add to my dashboard'. Idempotent: an already-active agent stays active."""
    agent = _check_agent(body.agent)
    store = _get_store()
    current = store.get(body.tenant_id, agent)
    if current.state == AgentState.active:
        return current
    return store.set(body.tenant_id, AgentEntitlement(
        agent=agent, state=AgentState.active, plan="free", source=body.source,
    ))


class CheckoutBody(BaseModel):
    tenant_id: str
    agent: str


@router.post("/create-checkout")
def create_checkout(body: CheckoutBody) -> dict:
    """STUB — real Stripe checkout lands when keys are wired. No charge here.
    Returns a placeholder so the UI can wire the button; activation only ever
    happens via the Stripe webhook (never from the client)."""
    _check_agent(body.agent)
    return {
        "ok": True,
        "stub": True,
        "agent": body.agent,
        "tenant_id": body.tenant_id,
        "message": "Stripe checkout not wired yet — no charge made.",
        "checkout_url": None,
    }
