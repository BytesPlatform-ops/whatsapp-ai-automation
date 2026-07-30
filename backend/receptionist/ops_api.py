"""AI Receptionist operations HTTP surface (Wave 6).

Adds the endpoints the operator frontend needs that were not on console_api:
worker health/controls, knowledge-source ingestion (text/PDF/website + reindex/
archive/delete + retrieval test), versioned configuration (save/versions/rollback/
preview), durable usage counters, plan limits, and date-range analytics.

Same prefix + tenant model as console_api: the tenant is server-derived by
``resolve_tenant`` (never trusted from the body), and every route is reachable only
through the Next.js proxies which attach the internal secret.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

from .context import resolve_tenant

ops_router = APIRouter(prefix="/api/agents/ai-receptionist", tags=["ai-receptionist-ops"])


# ── worker health + controls ──────────────────────────────────────────────────

@ops_router.get("/worker/health")
def worker_health(tenant_id: str = Depends(resolve_tenant)) -> dict:
    from .worker import jobs_store
    from .worker.runtime import get_active_worker_stats
    stats = get_active_worker_stats()
    due = jobs_store.due_jobs(limit=100)
    return {"worker": stats, "due_count": len(due),
            "tenant_jobs": jobs_store.count_by_status(tenant_id)}


@ops_router.get("/worker/jobs")
def worker_jobs(tenant_id: str = Depends(resolve_tenant),
                status: str = Query("", description="optional status filter"),
                limit: int = Query(50, ge=1, le=200)) -> dict:
    from .worker import jobs_store
    jobs = jobs_store.list_jobs(tenant_id, status=status or None, limit=limit)
    return {"jobs": jobs}


@ops_router.post("/worker/jobs/{job_id}/retry")
def worker_retry(job_id: str, tenant_id: str = Depends(resolve_tenant)) -> dict:
    from .worker import jobs_store
    ok = jobs_store.requeue(job_id, tenant_id)
    return {"ok": ok, "job_id": job_id}


@ops_router.post("/worker/jobs/{job_id}/cancel")
def worker_cancel(job_id: str, tenant_id: str = Depends(resolve_tenant)) -> dict:
    from .worker import jobs_store
    ok = jobs_store.cancel(job_id, tenant_id)
    return {"ok": ok, "job_id": job_id}


# ── knowledge sources + ingestion ─────────────────────────────────────────────

@ops_router.get("/knowledge-sources")
def list_knowledge_sources(tenant_id: str = Depends(resolve_tenant)) -> dict:
    from .service import ingestion
    return {"sources": ingestion.list_sources(tenant_id)}


class TextSourceIn(BaseModel):
    title: str = ""
    content: str = Field(..., min_length=1, max_length=200_000)


@ops_router.post("/knowledge-sources/text")
def add_text_source(body: TextSourceIn, tenant_id: str = Depends(resolve_tenant)) -> dict:
    from .service import ingestion
    from .service.limits import LimitExceeded
    try:
        return {"source": ingestion.ingest_text(tenant_id, body.title, body.content)}
    except LimitExceeded as e:
        raise HTTPException(status_code=402, detail=e.detail) from e


class WebsiteSourceIn(BaseModel):
    url: str = Field(..., min_length=4, max_length=2000)
    crawl: bool = False
    max_pages: int | None = None


@ops_router.post("/knowledge-sources/website")
def add_website_source(body: WebsiteSourceIn, tenant_id: str = Depends(resolve_tenant)) -> dict:
    """Enqueue a durable website-ingestion job (crawl runs off the request thread)."""
    from .service import ingestion
    from .service.limits import LimitExceeded
    try:
        job = ingestion.enqueue_website_ingestion(tenant_id, body.url, crawl=body.crawl,
                                                  max_pages=body.max_pages)
        return {"job": job}
    except ingestion.IngestionError as e:
        raise HTTPException(status_code=400, detail={"reason": e.reason}) from e
    except LimitExceeded as e:
        raise HTTPException(status_code=402, detail=e.detail) from e


@ops_router.post("/knowledge-sources/pdf")
async def add_pdf_source(request: Request, tenant_id: str = Depends(resolve_tenant),
                         filename: str = Query("document.pdf")) -> dict:
    """Upload a PDF as the raw request body (application/pdf). The Next.js proxy
    forwards the file bytes and the filename query param — no multipart dependency."""
    from .service import ingestion
    from .service.limits import LimitExceeded
    data = await request.body()
    try:
        return {"source": ingestion.ingest_pdf(tenant_id, filename, data)}
    except ingestion.IngestionError as e:
        raise HTTPException(status_code=400, detail={"reason": e.reason}) from e
    except LimitExceeded as e:
        raise HTTPException(status_code=402, detail=e.detail) from e


@ops_router.post("/knowledge-sources/{source_id}/reindex")
def reindex_knowledge_source(source_id: str, tenant_id: str = Depends(resolve_tenant)) -> dict:
    from .service import ingestion
    src = ingestion.reindex_source(tenant_id, source_id)
    if src is None:
        raise HTTPException(status_code=404, detail="source not found")
    return {"source": src}


@ops_router.post("/knowledge-sources/{source_id}/archive")
def archive_knowledge_source(source_id: str, tenant_id: str = Depends(resolve_tenant)) -> dict:
    from .service import ingestion
    return {"ok": ingestion.archive_source(tenant_id, source_id)}


@ops_router.delete("/knowledge-sources/{source_id}")
def delete_knowledge_source(source_id: str, tenant_id: str = Depends(resolve_tenant)) -> dict:
    from .service import ingestion
    return {"ok": ingestion.delete_source(tenant_id, source_id)}


class RetrievalTestIn(BaseModel):
    query: str = Field(..., min_length=1, max_length=2000)


@ops_router.post("/knowledge/retrieval-test")
def retrieval_test(body: RetrievalTestIn, tenant_id: str = Depends(resolve_tenant)) -> dict:
    from .service import knowledge
    return knowledge.retrieve(tenant_id, body.query)


# ── versioned configuration ───────────────────────────────────────────────────

@ops_router.get("/config")
def get_config(tenant_id: str = Depends(resolve_tenant)) -> dict:
    from .service import config_repo
    return {"config": config_repo.get_active_or_default(tenant_id),
            "missing_required": config_repo.missing_required(tenant_id)}


@ops_router.post("/config")
def save_config(patch: dict, tenant_id: str = Depends(resolve_tenant)) -> dict:
    from .service import config_repo
    updated_by = str((patch or {}).get("updated_by", "settings"))
    return {"config": config_repo.save(tenant_id, patch or {}, updated_by=updated_by)}


@ops_router.get("/config/versions")
def config_versions(tenant_id: str = Depends(resolve_tenant)) -> dict:
    from .service import config_repo
    return {"versions": config_repo.list_versions(tenant_id)}


class RollbackIn(BaseModel):
    version_id: str


@ops_router.post("/config/rollback")
def rollback_config(body: RollbackIn, tenant_id: str = Depends(resolve_tenant)) -> dict:
    from .service import config_repo
    cfg = config_repo.activate_version(tenant_id, body.version_id)
    if cfg is None:
        raise HTTPException(status_code=404, detail="version not found")
    return {"config": cfg}


class PreviewIn(BaseModel):
    message: str = Field(..., min_length=1, max_length=8000)


@ops_router.post("/config/preview")
def preview_config(body: PreviewIn, tenant_id: str = Depends(resolve_tenant)) -> dict:
    """Run one message through the canonical engine using the active config."""
    from .service import engine
    out = engine.run_message(tenant_id=tenant_id, message=body.message, channel="web_chat")
    return {"reply": out.get("reply", ""), "intent": out.get("intent", ""),
            "response_plan_version": out.get("response_plan_version", "")}


# ── usage + limits ────────────────────────────────────────────────────────────

@ops_router.get("/usage")
def usage_summary(tenant_id: str = Depends(resolve_tenant)) -> dict:
    from .service import usage
    return usage.summary(tenant_id)


@ops_router.get("/limits")
def limits_summary(tenant_id: str = Depends(resolve_tenant)) -> dict:
    from .service import limits
    return {"limits": limits.summary(tenant_id)}


# ── analytics with date ranges ────────────────────────────────────────────────

@ops_router.get("/analytics/range")
def analytics_range(tenant_id: str = Depends(resolve_tenant),
                    start: str = Query("", description="ISO start (inclusive)"),
                    end: str = Query("", description="ISO end (exclusive)"),
                    preset: str = Query("", description="today|7d|30d|90d|mtd")) -> dict:
    from .service import analytics
    return analytics.range_summary(tenant_id, start=start, end=end, preset=preset)


# ── Gmail provider endpoints (Wave 8) ─────────────────────────────────────────

def _run_async(coro):
    import asyncio
    try:
        return asyncio.new_event_loop().run_until_complete(coro)
    except Exception:  # pragma: no cover
        raise


@ops_router.get("/gmail/status")
def gmail_status(tenant_id: str = Depends(resolve_tenant)) -> dict:
    from .providers import gmail
    from .service import gmail_sync
    v = _run_async(gmail.validate_connection(tenant_id))
    st = gmail_sync.get_sync_state(tenant_id)
    return {"connection": v, "reply_mode": gmail_sync.reply_mode(tenant_id),
            "last_history_id": st.get("last_history_id", ""), "last_sync_at": st.get("last_sync_at", "")}


class GmailSettingsIn(BaseModel):
    gmail_reply_mode: str | None = None


@ops_router.post("/gmail/settings")
def gmail_settings(body: GmailSettingsIn, tenant_id: str = Depends(resolve_tenant)) -> dict:
    from .service import config_repo, gmail_sync
    if body.gmail_reply_mode in gmail_sync.REPLY_MODES:
        config_repo.save(tenant_id, {"gmail_reply_mode": body.gmail_reply_mode}, updated_by="settings")
    return {"reply_mode": gmail_sync.reply_mode(tenant_id)}


class GmailSyncIn(BaseModel):
    mode: str = "incremental"   # initial | incremental
    batch_size: int | None = None


@ops_router.post("/gmail/sync")
def gmail_sync_start(body: GmailSyncIn, tenant_id: str = Depends(resolve_tenant)) -> dict:
    from .worker import jobs_store
    job_type = "gmail_initial_sync" if body.mode == "initial" else "gmail_incremental_sync"
    jid = jobs_store.enqueue(tenant_id, job_type, {"batch_size": body.batch_size})
    return {"enqueued": True, "job_id": jid, "job_type": job_type}


@ops_router.get("/gmail/drafts")
def gmail_drafts(tenant_id: str = Depends(resolve_tenant)) -> dict:
    from .service import gmail_sync
    return {"drafts": gmail_sync.list_drafts(tenant_id)}


@ops_router.post("/gmail/drafts/{draft_id}/retry")
def gmail_draft_retry(draft_id: str, tenant_id: str = Depends(resolve_tenant)) -> dict:
    from .worker import jobs_store
    jid = jobs_store.enqueue(tenant_id, "gmail_send_retry", {"draft_id": draft_id})
    return {"enqueued": True, "job_id": jid}


@ops_router.post("/gmail/drafts/{draft_id}/reconcile")
def gmail_draft_reconcile(draft_id: str, tenant_id: str = Depends(resolve_tenant)) -> dict:
    from .worker import jobs_store
    jid = jobs_store.enqueue(tenant_id, "gmail_send_reconcile", {"draft_id": draft_id})
    return {"enqueued": True, "job_id": jid}


# ── Calendar provider endpoints ───────────────────────────────────────────────

@ops_router.get("/calendar/status")
def calendar_status(tenant_id: str = Depends(resolve_tenant)) -> dict:
    from .providers import gcal
    from .service import booking
    v = _run_async(gcal.validate_connection(tenant_id))
    cfg = booking.get_config(tenant_id)
    return {"connection": v, "configured": bool(cfg.get("configured")),
            "calendar_id": cfg.get("calendar_id", ""), "timezone": cfg.get("timezone", "UTC"),
            "services": cfg.get("services", {})}


@ops_router.get("/calendar/list")
def calendar_list(tenant_id: str = Depends(resolve_tenant)) -> dict:
    from .providers import gcal
    try:
        return {"calendars": _run_async(gcal.list_calendars(tenant_id))}
    except Exception as e:  # typed provider error
        raise HTTPException(status_code=400, detail={"reason": getattr(e, "category", "provider_error")})


@ops_router.post("/calendar/config")
def calendar_config_save(patch: dict, tenant_id: str = Depends(resolve_tenant)) -> dict:
    from .service import booking
    return {"config": booking.save_config(tenant_id, patch or {})}


@ops_router.get("/calendar/availability")
def calendar_availability(tenant_id: str = Depends(resolve_tenant),
                          service: str = Query(...), days: int = Query(7, ge=1, le=60)) -> dict:
    from .service import booking
    return booking.availability(tenant_id, service=service, days=days)


@ops_router.get("/calendar/bookings")
def calendar_bookings(tenant_id: str = Depends(resolve_tenant),
                      status: str = Query("")) -> dict:
    from .service import stores
    rows = stores.bookings().list(tenant_id)
    if status:
        rows = [b for b in rows if b.get("status") == status]
    return {"bookings": rows}


class RescheduleIn(BaseModel):
    start: str
    end: str


@ops_router.post("/calendar/bookings/{booking_id}/reschedule")
def calendar_reschedule(booking_id: str, body: RescheduleIn, tenant_id: str = Depends(resolve_tenant)) -> dict:
    from .service import booking
    return booking.reschedule_booking(tenant_id, booking_id, new_start=body.start, new_end=body.end)


@ops_router.post("/calendar/bookings/{booking_id}/cancel")
def calendar_cancel(booking_id: str, tenant_id: str = Depends(resolve_tenant)) -> dict:
    from .service import booking
    return booking.cancel_booking(tenant_id, booking_id)


@ops_router.post("/calendar/bookings/{booking_id}/reconcile")
def calendar_reconcile(booking_id: str, tenant_id: str = Depends(resolve_tenant)) -> dict:
    from .service import booking
    return booking.reconcile_event(tenant_id, booking_id)


# ── Widget endpoints ──────────────────────────────────────────────────────────

@ops_router.get("/widget/config")
def widget_config(tenant_id: str = Depends(resolve_tenant)) -> dict:
    from .service import widget
    cfg = widget.get_or_create_config(tenant_id)
    return {"config": {k: v for k, v in cfg.items() if k != "tenant_id"}}


@ops_router.post("/widget/config")
def widget_config_save(patch: dict, tenant_id: str = Depends(resolve_tenant)) -> dict:
    from .service import widget
    cfg = widget.save_config(tenant_id, patch or {})
    return {"config": {k: v for k, v in cfg.items() if k != "tenant_id"}}


@ops_router.get("/widget/verification")
def widget_verification(tenant_id: str = Depends(resolve_tenant)) -> dict:
    from .service import widget
    return widget.verification_status(tenant_id)


class WidgetVerifyIn(BaseModel):
    domain: str = ""
    origin: str = ""


@ops_router.post("/widget/verify")
def widget_verify(body: WidgetVerifyIn, tenant_id: str = Depends(resolve_tenant)) -> dict:
    """Operator-triggered check: reports the SERVER-OBSERVED handshake state for a
    domain (never a frontend-only success). Returns the honest current status."""
    from .service import widget
    return widget.verification_status(tenant_id)
