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
