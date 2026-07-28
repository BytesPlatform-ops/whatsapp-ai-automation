"""FastAPI routes for the durable rank-tracking vertical.

All endpoints are tenant-scoped and mirror the style of ``seo/agent_routes.py``.
The router uses the SAME prefix ``/api/agents/seo`` so it can be included
alongside ``seo_agent_router`` in ``app.py``:

    from seo.rank.routes import router as seo_rank_router
    app.include_router(seo_rank_router)

Endpoints
---------
POST  /api/agents/seo/rank/check
      Manual rank check for a list of keyword_ids (plan-limit enforced).

GET   /api/agents/seo/rank/jobs
      List all RankJobs for the authenticated tenant.

GET   /api/agents/seo/rank/job/{job_id}
      Get a single RankJob (tenant-scoped; 404 on cross-tenant).

GET   /api/agents/seo/rank/history
      Snapshot history for a keyword (?keyword_id=).

GET   /api/agents/seo/rank/overview
      Winners/losers/buckets for a project (?project_id=).

GET   /api/agents/seo/rank/keyword/{keyword_id}
      History + latest SERP data + competitors for a single keyword.
"""

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from seo.metering_search import SeoLimitExceeded
from seo.rank.analytics import (
    keyword_detail,
    rank_history,
    rank_overview,
)
from seo.rank.service import run_rank_check
from seo.search_stores import (
    SyncJobStatus,
    get_rank_job_repository,
    get_rank_snapshot_repository,
)
from seo.tenant import effective_tenant, resolve_tenant, resolve_tenant_header

router = APIRouter(prefix="/api/agents/seo", tags=["seo-rank"])


# ── Request bodies ────────────────────────────────────────────────────────────

class RankCheckBody(BaseModel):
    tenant_id: Optional[str] = None
    project_id: str
    keyword_ids: List[str]
    location: str = "us"
    device: str = "desktop"


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/rank/check")
async def rank_check(
    body: RankCheckBody,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
) -> dict:
    """Trigger a manual rank check for the supplied keyword_ids.

    Enforces the tenant's plan limit for tracked keywords before running.
    Returns a job summary with per-keyword snapshots.
    """
    tenant = effective_tenant(_header_tenant, body.tenant_id)
    try:
        summary = run_rank_check(
            tenant,
            body.project_id,
            body.keyword_ids,
            location=body.location,
            device=body.device,
        )
    except SeoLimitExceeded as exc:
        raise HTTPException(
            status_code=429,
            detail={"error": "plan_limit_exceeded", "detail": exc.result},
        ) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={"error": str(exc)}) from exc
    return summary


@router.get("/rank/jobs")
def rank_jobs(
    project_id: Optional[str] = Query(default=None),
    tenant: str = Depends(resolve_tenant),
) -> dict:
    """List RankJobs for the tenant, optionally filtered by project_id."""
    job_repo = get_rank_job_repository()
    if project_id:
        jobs = job_repo.list_where(tenant, project_id=project_id)
    else:
        jobs = job_repo.list(tenant)

    out = []
    for job_id, job in jobs:
        out.append({
            "job_id": job_id,
            "project_id": job.project_id,
            "status": job.status.value if hasattr(job.status, "value") else str(job.status),
            "frequency": job.frequency,
            "keyword_count": len(job.keyword_ids or []),
            "checked_count": job.checked_count,
            "error_count": job.error_count,
            "retry_count": job.retry_count,
            "queued_at": job.queued_at,
            "started_at": job.started_at,
            "finished_at": job.finished_at,
            "scheduled_for": job.scheduled_for,
            "error": job.error,
        })
    return {"jobs": out, "total": len(out)}


@router.get("/rank/job/{job_id}")
def rank_job_get(
    job_id: str,
    tenant: str = Depends(resolve_tenant),
) -> dict:
    """Get a single RankJob by ID (tenant-scoped)."""
    job_repo = get_rank_job_repository()
    row = job_repo.get(tenant, job_id)
    if not row:
        raise HTTPException(status_code=404, detail="rank job not found")
    _, job = row

    # Fetch associated snapshots for this job
    snap_repo = get_rank_snapshot_repository()
    snaps = snap_repo.list_where(tenant, rank_job_id=job_id)
    snapshots_out = []
    for snap_id, snap in snaps:
        snapshots_out.append({
            "snapshot_id": snap_id,
            "keyword_id": snap.keyword_id,
            "keyword": snap.keyword,
            "date": snap.date,
            "position": snap.position,
            "ranking_url": snap.ranking_url,
            "error": snap.error,
        })

    return {
        "job_id": job_id,
        "project_id": job.project_id,
        "status": job.status.value if hasattr(job.status, "value") else str(job.status),
        "frequency": job.frequency,
        "keyword_ids": job.keyword_ids,
        "checked_count": job.checked_count,
        "error_count": job.error_count,
        "retry_count": job.retry_count,
        "queued_at": job.queued_at,
        "started_at": job.started_at,
        "finished_at": job.finished_at,
        "scheduled_for": job.scheduled_for,
        "lock_owner": job.lock_owner,
        "lock_expires_at": job.lock_expires_at,
        "error": job.error,
        "snapshots": snapshots_out,
    }


@router.get("/rank/history")
def rank_history_endpoint(
    keyword_id: str = Query(...),
    date_from: Optional[str] = Query(default=None),
    date_to: Optional[str] = Query(default=None),
    tenant: str = Depends(resolve_tenant),
) -> dict:
    """Snapshot history for a single keyword (ordered by date ascending)."""
    history = rank_history(
        tenant,
        keyword_id,
        date_from=date_from,
        date_to=date_to,
    )
    return {
        "keyword_id": keyword_id,
        "history": history,
        "count": len(history),
    }


@router.get("/rank/overview")
def rank_overview_endpoint(
    project_id: str = Query(...),
    date_from: Optional[str] = Query(default=None),
    date_to: Optional[str] = Query(default=None),
    window_days: int = Query(default=30),
    tenant: str = Depends(resolve_tenant),
) -> dict:
    """Winners/losers/buckets and SERP-change analytics for a project."""
    return rank_overview(
        tenant,
        project_id,
        date_from=date_from,
        date_to=date_to,
        window_days=window_days,
    )


@router.get("/rank/keyword/{keyword_id}")
def rank_keyword_detail(
    keyword_id: str,
    date_from: Optional[str] = Query(default=None),
    date_to: Optional[str] = Query(default=None),
    tenant: str = Depends(resolve_tenant),
) -> dict:
    """Full keyword detail: history + latest SERP features + competitor positions."""
    return keyword_detail(
        tenant,
        keyword_id,
        date_from=date_from,
        date_to=date_to,
    )
