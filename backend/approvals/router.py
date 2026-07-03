"""Approvals API — risky actions wait here for an explicit yes/no.

  GET  /api/approvals?tenant_id=          pending + recent approvals
  POST /api/approvals/{id}/approve        execute (records activity)
  POST /api/approvals/{id}/reject         reject
  POST /api/approvals/{id}/edit           tweak the prepared output before approving
  POST /api/approvals/{id}/skip           dismiss without executing

`create_approval(...)` is the internal helper the feed router / Omni call when an
action is risky. The item now carries enough context (prepared_output, tool,
capability, risk_level, preview) for a reviewer to decide, and an OPTIONAL
executor hook lets the owning service run the (mock, in test mode) action the
moment the item is approved — so approve → execute → log is one path. All new
fields are optional with defaults, so existing callers (feed) are unaffected.
"""

from __future__ import annotations

import itertools
from typing import Callable, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from activity.router import log_activity


class ApprovalItem(BaseModel):
    id: str
    tenant_id: str
    agent: str = ""
    title: str
    description: str = ""
    action_type: str = ""
    status: str = "pending"  # pending | approved | rejected | executed | skipped
    created_at: str = ""
    # richer context so a reviewer can decide (all optional → backward compatible)
    risk_level: str = "low"          # low | medium | high
    capability: str = ""             # e.g. customer_messaging, social_publishing
    tool: str = ""                   # the connector that WOULD run (mock_email, ...)
    prepared_output: dict = {}       # the draft/recommendation the agent prepared
    preview: str = ""                # short human-readable preview line
    execution_result: Optional[dict] = None  # filled in when executed (mock in test mode)


class _Store:
    def __init__(self) -> None:
        self._items: dict[str, dict[str, ApprovalItem]] = {}
        self._seq = itertools.count(1)

    def create(self, item: ApprovalItem) -> ApprovalItem:
        item.id = f"ap_{next(self._seq)}"
        self._items.setdefault(item.tenant_id, {})[item.id] = item
        return item

    def get(self, tenant_id: str, approval_id: str) -> Optional[ApprovalItem]:
        return self._items.get(tenant_id, {}).get(approval_id)

    def list(self, tenant_id: str) -> list[ApprovalItem]:
        return list(reversed(list(self._items.get(tenant_id, {}).values())))


_store: Optional[_Store] = None

# Optional executor hook. A service (Omni) may register a dispatcher that knows
# how to run an approved item's action. If none is registered, approve just marks
# the item executed (exactly the old behaviour). The dispatcher receives the item
# and returns an execution_result dict; it is responsible for staying mock/preview
# in test mode (it consults runtime.real_execution_allowed()).
_executor: Optional[Callable[["ApprovalItem"], dict]] = None

# Per-agent executors. When an item's `agent` matches a registered key its
# executor runs; otherwise we fall back to the single global `_executor` above.
# This lets multiple services (Omni, AI Receptionist) each own their execution
# path without clobbering one another (the hook used to be a single global).
_executors_by_agent: dict[str, Callable[["ApprovalItem"], dict]] = {}


def register_executor(fn: Callable[["ApprovalItem"], dict]) -> None:
    global _executor
    _executor = fn


def register_executor_for(agent: str, fn: Callable[["ApprovalItem"], dict]) -> None:
    _executors_by_agent[agent] = fn


def _executor_for(item: "ApprovalItem") -> Optional[Callable[["ApprovalItem"], dict]]:
    return _executors_by_agent.get(item.agent, _executor)


def get_approvals_store() -> _Store:
    global _store
    if _store is None:
        _store = _Store()
    return _store


def create_approval(tenant_id: str, agent: str, title: str, action_type: str,
                    description: str = "", created_at: str = "", *,
                    risk_level: str = "low", capability: str = "", tool: str = "",
                    prepared_output: Optional[dict] = None, preview: str = "") -> ApprovalItem:
    item = get_approvals_store().create(ApprovalItem(
        id="", tenant_id=tenant_id, agent=agent, title=title,
        description=description, action_type=action_type, created_at=created_at,
        risk_level=risk_level, capability=capability, tool=tool,
        prepared_output=prepared_output or {}, preview=preview,
    ))
    log_activity(tenant_id, "approval_created", title=title, agent=agent, created_at=created_at)
    return item


router = APIRouter(prefix="/api/approvals", tags=["approvals"])


@router.get("", response_model=list[ApprovalItem])
def list_approvals(tenant_id: str = Query(...)) -> list[ApprovalItem]:
    return get_approvals_store().list(tenant_id)


class ResolveBody(BaseModel):
    tenant_id: str
    now: str = ""


def _resolve(approval_id: str, body: ResolveBody, status: str, event: str) -> ApprovalItem:
    item = get_approvals_store().get(body.tenant_id, approval_id)
    if item is None:
        raise HTTPException(status_code=404, detail="approval not found")
    if item.status in ("approved", "executed", "rejected", "skipped"):
        return item  # idempotent
    item.status = status
    # On approval, run the registered executor (if any) FIRST — it stays
    # mock/preview in test mode — then log the resolve event last so the
    # "completed" event remains the newest entry in the activity feed.
    executor = _executor_for(item)
    if status == "executed" and executor is not None:
        try:
            item.execution_result = executor(item)
        except Exception as exc:  # never let an executor error 500 the approve call
            item.execution_result = {"ok": False, "error": str(exc)}
        log_activity(
            body.tenant_id, "action_executed",
            title=item.title, agent=item.agent, created_at=body.now,
        )
    log_activity(body.tenant_id, event, title=item.title, agent=item.agent, created_at=body.now)
    return item


@router.post("/{approval_id}/approve", response_model=ApprovalItem)
def approve(approval_id: str, body: ResolveBody) -> ApprovalItem:
    return _resolve(approval_id, body, "executed", "approval_completed")


@router.post("/{approval_id}/reject", response_model=ApprovalItem)
def reject(approval_id: str, body: ResolveBody) -> ApprovalItem:
    return _resolve(approval_id, body, "rejected", "approval_rejected")


@router.post("/{approval_id}/skip", response_model=ApprovalItem)
def skip(approval_id: str, body: ResolveBody) -> ApprovalItem:
    """Dismiss an approval without executing (distinct from an explicit reject)."""
    return _resolve(approval_id, body, "skipped", "approval_skipped")


class EditBody(BaseModel):
    tenant_id: str
    title: Optional[str] = None
    description: Optional[str] = None
    prepared_output: Optional[dict] = None
    preview: Optional[str] = None
    now: str = ""


@router.post("/{approval_id}/edit", response_model=ApprovalItem)
def edit(approval_id: str, body: EditBody) -> ApprovalItem:
    """Tweak a pending item's prepared output/title before approving it."""
    item = get_approvals_store().get(body.tenant_id, approval_id)
    if item is None:
        raise HTTPException(status_code=404, detail="approval not found")
    if item.status != "pending":
        raise HTTPException(status_code=409, detail=f"cannot edit a {item.status} item")
    if body.title is not None:
        item.title = body.title
    if body.description is not None:
        item.description = body.description
    if body.prepared_output is not None:
        item.prepared_output = body.prepared_output
    if body.preview is not None:
        item.preview = body.preview
    log_activity(body.tenant_id, "approval_edited", title=item.title, agent=item.agent, created_at=body.now)
    return item
