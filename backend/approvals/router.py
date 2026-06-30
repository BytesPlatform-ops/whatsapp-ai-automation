"""Approvals API — risky actions wait here for an explicit yes/no.

  GET  /api/approvals?tenant_id=          pending + recent approvals
  POST /api/approvals/{id}/approve        execute (records activity)
  POST /api/approvals/{id}/reject         reject

`create_approval(...)` is the internal helper the feed router calls when a card's
action is risky (requires_confirmation). Self-contained router.
"""

from __future__ import annotations

import itertools
from typing import Optional

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
    status: str = "pending"  # pending | approved | rejected | executed
    created_at: str = ""


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


def get_approvals_store() -> _Store:
    global _store
    if _store is None:
        _store = _Store()
    return _store


def create_approval(tenant_id: str, agent: str, title: str, action_type: str,
                    description: str = "", created_at: str = "") -> ApprovalItem:
    item = get_approvals_store().create(ApprovalItem(
        id="", tenant_id=tenant_id, agent=agent, title=title,
        description=description, action_type=action_type, created_at=created_at,
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
    if item.status in ("approved", "executed", "rejected"):
        return item  # idempotent
    item.status = status
    log_activity(body.tenant_id, event, title=item.title, agent=item.agent, created_at=body.now)
    return item


@router.post("/{approval_id}/approve", response_model=ApprovalItem)
def approve(approval_id: str, body: ResolveBody) -> ApprovalItem:
    return _resolve(approval_id, body, "executed", "approval_completed")


@router.post("/{approval_id}/reject", response_model=ApprovalItem)
def reject(approval_id: str, body: ResolveBody) -> ApprovalItem:
    return _resolve(approval_id, body, "rejected", "approval_rejected")
