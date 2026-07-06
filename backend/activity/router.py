"""Activity API — a tenant-scoped recent-events feed.

  GET /api/activity?tenant_id=   recent events (most recent first)

`log_activity(...)` is the internal helper other services (feed, entitlements)
call to append events. Self-contained: one include_router line in app.py.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Query
from pydantic import BaseModel

import persistence


class ActivityEvent(BaseModel):
    id: str
    tenant_id: str
    agent: str = ""
    type: str
    title: str = ""
    created_at: str = ""


class _Store:
    """Row repo over table `activity_logs` (memory | file | supabase). Append-only."""

    def __init__(self) -> None:
        self._repo = persistence.table("activity_logs")

    def add(self, tenant_id: str, type_: str, title: str = "", agent: str = "", created_at: str = "") -> ActivityEvent:
        import secrets
        ev = ActivityEvent(
            id=f"ev_{secrets.token_hex(6)}", tenant_id=tenant_id, agent=agent,
            type=type_, title=title, created_at=created_at,
        )
        # envelope created_at is stamped server-side (monotonic) for stable ordering
        self._repo.upsert(persistence.envelope(ev.id, tenant_id, ev.model_dump()))
        return ev

    def recent(self, tenant_id: str, limit: int = 20) -> list[ActivityEvent]:
        rows = self._repo.list_by_tenant(tenant_id)
        return [ActivityEvent(**r["data"]) for r in reversed(rows)][:limit]


_store: Optional[_Store] = None


def get_activity_store() -> _Store:
    global _store
    if _store is None:
        _store = _Store()
    return _store


def log_activity(tenant_id: str, type_: str, title: str = "", agent: str = "", created_at: str = "") -> ActivityEvent:
    """Append an event. Safe to call from any service."""
    return get_activity_store().add(tenant_id, type_, title, agent, created_at)


router = APIRouter(prefix="/api/activity", tags=["activity"])


@router.get("", response_model=list[ActivityEvent])
def recent_activity(tenant_id: str = Query(...), limit: int = 20) -> list[ActivityEvent]:
    return get_activity_store().recent(tenant_id, limit)
