"""HTTP surface for the publishing engine + social connections.

Two routers, both gated by ``require_internal`` (the trusted Next.js proxy):
* ``/api/social/*``      — connected publishing destinations + capabilities.
* ``/api/publishing/*``  — publish jobs, calendar, history, job actions.

Every endpoint is tenant-scoped (tenant on body/query; the trusted proxy sets it).
Tokens are NEVER returned. OAuth connect/callback reuse the existing Meta routes
(``/api/meta/connect``) — this module does not create a second OAuth system.
"""

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field

from security import require_internal

from . import config, connections, service
from .enums import (
    DUE_STATUSES,
    TERMINAL_STATUSES,
    ContentFormat,
    Platform,
    PublishMode,
    PublishStatus,
    SourceProduct,
)
from .fingerprint import compute as compute_fingerprint
from .scheduling import ScheduleError, is_past, resolve
from .schemas import CreatePublishJobBody
from .store import get_attempt_repository, get_job_repository, now_iso, query_jobs
from .worker import run_due_once

social_router = APIRouter(prefix="/api/social", tags=["social"], dependencies=[Depends(require_internal)])
publishing_router = APIRouter(prefix="/api/publishing", tags=["publishing"], dependencies=[Depends(require_internal)])


class _Body(BaseModel):
    model_config = ConfigDict(extra="ignore")
    tenant_id: str = Field(..., min_length=1)


# ── Social connections ──────────────────────────────────────────────────────────
@social_router.get("/connections")
def list_connections(tenant_id: str = Query(..., min_length=1)) -> dict:
    return {"tenant_id": tenant_id, "connections": connections.list_accounts(tenant_id)}


@social_router.get("/capabilities")
def capabilities(tenant_id: str = Query(..., min_length=1)) -> dict:
    accts = connections.list_accounts(tenant_id)
    return {"tenant_id": tenant_id, "accounts": [
        {"connection_id": a["connection_id"], "platform": a["platform"], "display_name": a["display_name"],
         "capabilities": a["capabilities"]}
        for a in accts
    ]}


@social_router.get("/connections/{connection_id}")
def get_connection(connection_id: str, tenant_id: str = Query(..., min_length=1)) -> dict:
    acc = connections.get_account(tenant_id, connection_id)
    if not acc:
        raise HTTPException(status_code=404, detail="connection not found for tenant")
    return {"connection": acc}


@social_router.post("/connections/{connection_id}/validate")
def validate_connection(connection_id: str, body: _Body) -> dict:
    acc = connections.get_account(body.tenant_id, connection_id)
    if not acc:
        raise HTTPException(status_code=404, detail="connection not found for tenant")
    caps = acc["capabilities"]
    return {"connection_id": connection_id, "publishing_authorized": caps["publishing_authorized"],
            "missing_scopes": caps["missing_scopes"], "reconnection_required": caps["reconnection_required"]}


# ── Publishing config / jobs ────────────────────────────────────────────────────
@publishing_router.get("/config")
def publishing_config() -> dict:
    return config.status()


def _job_out(jid: str, job) -> dict:
    return {"id": jid, "job": job.model_dump()}


def _raise_service_error(exc: service.PublishError):
    raise HTTPException(status_code=exc.http_status, detail=exc.to_detail())


@publishing_router.post("/jobs")
def create_job(body: CreatePublishJobBody) -> dict:
    try:
        jid, job = service.create_job(body)
    except ScheduleError as exc:
        raise HTTPException(status_code=422, detail={"error": "invalid_schedule", "message": str(exc)})
    except service.PublishError as exc:
        _raise_service_error(exc)
    return {**_job_out(jid, job), "created": True}


@publishing_router.get("/jobs")
def list_jobs(
    tenant_id: str = Query(..., min_length=1),
    status: str = Query(default=""),
    platform: str = Query(default=""),
    source_product: str = Query(default=""),
    influencer_video_id: str = Query(default=""),
    document_id: str = Query(default=""),
) -> dict:
    rows = query_jobs(tenant_id, status=status, platform=platform, source_product=source_product,
                      influencer_video_id=influencer_video_id, document_id=document_id)
    return {"tenant_id": tenant_id, "jobs": [_job_out(i, j) for (i, j) in rows]}


@publishing_router.get("/calendar")
def calendar(tenant_id: str = Query(..., min_length=1)) -> dict:
    """Scheduled/queued/retry jobs with their execution time — for a calendar view."""
    rows = query_jobs(tenant_id, sort="scheduled")
    upcoming = [j for j in rows if j[1].status in DUE_STATUSES or j[1].status == PublishStatus.PUBLISHING]
    return {"tenant_id": tenant_id, "events": [
        {"id": i, "scheduled_utc": j.scheduled_utc, "local_time": j.local_time, "timezone": j.timezone,
         "platform": j.platform.value, "status": j.status.value, "source_product": j.source_product.value,
         "account_id": j.account_id, "preview": (j.snapshot.text or "")[:120]}
        for (i, j) in upcoming
    ]}


@publishing_router.get("/history")
def history(tenant_id: str = Query(..., min_length=1)) -> dict:
    """Durable publishing history — safe fields only (no tokens/raw payloads)."""
    rows = query_jobs(tenant_id)
    return {"tenant_id": tenant_id, "history": [
        {"id": i, "platform": j.platform.value, "source_product": j.source_product.value,
         "status": j.status.value, "mode": j.mode.value, "scheduled_utc": j.scheduled_utc,
         "completed_at": j.completed_at, "attempt_count": j.attempt_count,
         "platform_post_id": j.platform_post_id, "platform_permalink": j.platform_permalink,
         "error_category": j.error_category, "error_correlation_id": j.error_correlation_id,
         "created_by": j.created_by, "cancelled_by": j.cancelled_by}
        for (i, j) in rows
    ]}


def _get_or_404(tenant_id: str, job_id: str):
    found = get_job_repository().get(tenant_id, job_id)
    if found is None:
        raise HTTPException(status_code=404, detail="publish job not found for tenant")
    return found


@publishing_router.get("/jobs/{job_id}")
def get_job(job_id: str, tenant_id: str = Query(..., min_length=1)) -> dict:
    jid, job = _get_or_404(tenant_id, job_id)
    attempts = get_attempt_repository().list_by_job(tenant_id, jid)
    return {**_job_out(jid, job), "attempts": [a.model_dump() for (_i, a) in attempts]}


@publishing_router.get("/jobs/{job_id}/attempts")
def job_attempts(job_id: str, tenant_id: str = Query(..., min_length=1)) -> dict:
    _get_or_404(tenant_id, job_id)
    attempts = get_attempt_repository().list_by_job(tenant_id, job_id)
    return {"job_id": job_id, "attempts": [{"id": i, "attempt": a.model_dump()} for (i, a) in attempts]}


class _PatchBody(_Body):
    text: Optional[str] = None
    first_comment: Optional[str] = None
    media_asset_ids: Optional[List[str]] = None


class _RescheduleBody(_Body):
    scheduled_local: str = ""
    timezone: str = ""


class _CancelBody(_Body):
    cancelled_by: str = ""


def _editable_or_409(job):
    if job.status in TERMINAL_STATUSES:
        raise HTTPException(status_code=409, detail={"error": "not_editable", "message": "This job is already finished."})
    if job.status == PublishStatus.PUBLISHING or (job.locked_at and not job.completed_at):
        raise HTTPException(status_code=409, detail={"error": "locked", "message": "This job is publishing; try again shortly."})


@publishing_router.patch("/jobs/{job_id}")
def edit_job(job_id: str, body: _PatchBody) -> dict:
    """Edit content before execution → new immutable snapshot + fingerprint."""
    jid, job = _get_or_404(body.tenant_id, job_id)
    _editable_or_409(job)
    snap = job.snapshot.model_copy(update={
        k: v for k, v in {
            "text": body.text, "first_comment": body.first_comment, "media_asset_ids": body.media_asset_ids,
        }.items() if v is not None
    })
    fp = compute_fingerprint(job.tenant_id, job.connection_id, job.platform.value, job.account_id,
                             snap.model_dump(), job.scheduled_utc, job.mode.value, idempotency_key=job.idempotency_key)
    _, updated = get_job_repository().update(body.tenant_id, jid, snapshot=snap.model_dump(), fingerprint=fp)
    return _job_out(jid, updated)


@publishing_router.post("/jobs/{job_id}/cancel")
def cancel_job(job_id: str, body: _CancelBody) -> dict:
    jid, job = _get_or_404(body.tenant_id, job_id)
    if job.status == PublishStatus.PUBLISHED:
        raise HTTPException(status_code=409, detail={"error": "already_published",
                            "message": "A published post can't be cancelled; delete it on the platform instead."})
    if job.status == PublishStatus.PUBLISHING:
        raise HTTPException(status_code=409, detail={"error": "in_flight",
                            "message": "This job is publishing now; cancellation isn't guaranteed."})
    _, updated = get_job_repository().update(body.tenant_id, jid, status=PublishStatus.CANCELLED,
                                            cancelled_by=body.cancelled_by or "", completed_at=now_iso())
    return _job_out(jid, updated)


@publishing_router.post("/jobs/{job_id}/reschedule")
def reschedule_job(job_id: str, body: _RescheduleBody) -> dict:
    jid, job = _get_or_404(body.tenant_id, job_id)
    _editable_or_409(job)
    scheduled_local = body.scheduled_local or ""
    tz = body.timezone or job.timezone or config.default_timezone()
    if not scheduled_local:
        scheduled_utc, local_time, timezone_name, status = now_iso(), now_iso(), "UTC", PublishStatus.QUEUED
    else:
        try:
            resolved = resolve(scheduled_local, tz)
        except ScheduleError as exc:
            raise HTTPException(status_code=422, detail={"error": "invalid_schedule", "message": str(exc)})
        if is_past(resolved.utc_iso):
            raise HTTPException(status_code=422, detail={"error": "schedule_in_past", "message": "Time is in the past."})
        scheduled_utc, local_time, timezone_name, status = resolved.utc_iso, resolved.local_iso, resolved.timezone, PublishStatus.SCHEDULED
    _, updated = get_job_repository().update(body.tenant_id, jid, scheduled_utc=scheduled_utc,
                                            local_time=local_time, timezone=timezone_name, status=status,
                                            next_retry_utc="")
    return _job_out(jid, updated)


@publishing_router.post("/jobs/{job_id}/retry")
def retry_job(job_id: str, body: _Body) -> dict:
    jid, job = _get_or_404(body.tenant_id, job_id)
    if job.status not in (PublishStatus.FAILED, PublishStatus.RECONNECTION_REQUIRED, PublishStatus.RETRY_WAIT):
        raise HTTPException(status_code=409, detail={"error": "not_retryable",
                            "message": "Only failed or waiting jobs can be retried."})
    if job.platform_post_id:
        raise HTTPException(status_code=409, detail={"error": "already_published",
                            "message": "This job already produced a post."})
    _, updated = get_job_repository().update(body.tenant_id, jid, status=PublishStatus.QUEUED,
                                            scheduled_utc=now_iso(), next_retry_utc="", locked_at="", locked_by="")
    return _job_out(jid, updated)


@publishing_router.post("/worker/run-once")
def worker_run_once() -> dict:
    """Process due jobs once (server-triggered). Dry-run jobs never call a platform;
    live jobs run only when live is enabled. Used by tests/demos in place of the
    background worker."""
    return run_due_once("worker-http")
