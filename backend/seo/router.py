"""Self-contained FastAPI router for the SEO service (Mode A + Mode B).

By design this is NOT registered in the shared app (`backend/app.py`); the lead
engineer adds one `include_router` line manually (see the handoff notes). All
persisted data is tenant-scoped and `GET /score/{id}` requires tenant context.

Endpoints:
  POST /api/seo/generate     Mode A — enrich a Pixie page + before/after score
  POST /api/seo/audit-url    Mode B — audit an external page (never edits it)
  POST /api/seo/keywords     keyword research (provider lands in Wave 3)
  GET  /api/seo/score/{id}   fetch a saved, tenant-scoped report
  POST /api/seo/track        register keywords for rank tracking
"""

from __future__ import annotations

import time
from typing import Optional

from fastapi import APIRouter, Header, HTTPException, Query

from .api_models import (
    AuditUrlRequest,
    GenerateRequest,
    GenerateResponse,
    KeywordsRequest,
    TrackedKeywordOut,
    TrackRequest,
    TrackResponse,
    UsageMeta,
)
from .mode_external import audit_url as crawl_url
from .mode_external import build_report
from .mode_pixie import enrich_site
from .repository import get_repository

router = APIRouter(prefix="/api/seo", tags=["seo"])

_GENERATE_KEYS = (
    "report_id", "tenant_id", "mode", "url", "site",
    "suggested_slug", "score_before", "score_after", "applied", "ai_fallback",
)


@router.post("/generate", response_model=GenerateResponse)
def generate(req: GenerateRequest) -> GenerateResponse:
    """Mode A — SEO-enrich a Pixie-controlled page and return before/after scores."""
    start = time.perf_counter()
    out = enrich_site(req.page, business_type=req.business_type, brand=req.brand)
    report = {
        "tenant_id": req.tenant_id,
        "mode": "pixie",
        "url": out["site"].get("url", ""),
        "site": out["site"],
        "suggested_slug": out["suggested_slug"],
        "score_before": out["score_before"],
        "score_after": out["score_after"],
        "applied": out["applied"],
        "ai_fallback": out["ai_fallback"],
    }
    stored = get_repository().save_report(req.tenant_id, report, req.idempotency_key)
    usage = UsageMeta(
        provider="pixie-seo-mode-a",
        latency_ms=int((time.perf_counter() - start) * 1000),
        cache_hit=out["ai_fallback"] is False,
        request_id=stored["report_id"],
    )
    return GenerateResponse(usage=usage, **{k: stored[k] for k in _GENERATE_KEYS})


@router.post("/audit-url")
def audit_url(req: AuditUrlRequest) -> dict:
    """Mode B — audit an external page. Pixie NEVER edits external sites.

    Supply `page` to audit a pre-normalized object, or `url` for a live,
    SSRF-guarded crawl. Returns a severity-grouped report with a migration CTA.
    """
    start = time.perf_counter()
    if req.page is not None:
        report = build_report(req.url or req.page.get("url", ""), req.page)
    elif req.url:
        report = crawl_url(req.url)  # SSRF guard + fetch + parse + report
        if report.get("error"):
            # blocked / fetch_failed — surface as a 400 with the reason.
            raise HTTPException(status_code=400, detail=report)
    else:
        raise HTTPException(status_code=400, detail="provide either 'url' or 'page'")

    stored = get_repository().save_report(req.tenant_id, report, req.idempotency_key)
    stored["usage"] = {
        "provider": "pixie-seo-mode-b",
        "latency_ms": int((time.perf_counter() - start) * 1000),
        "request_id": stored["report_id"],
    }
    return stored


@router.get("/score/{report_id}")
def get_score(
    report_id: str,
    tenant_id: Optional[str] = Query(default=None),
    x_tenant_id: Optional[str] = Header(default=None),
) -> dict:
    """Fetch a saved report. Tenant context is REQUIRED and enforced (no cross-tenant reads)."""
    tenant = tenant_id or x_tenant_id
    if not tenant:
        raise HTTPException(
            status_code=400,
            detail="tenant context required (tenant_id query param or X-Tenant-Id header)",
        )
    stored = get_repository().get_report(tenant, report_id)
    if stored is None:
        raise HTTPException(status_code=404, detail="report not found")
    return stored


@router.post("/keywords")
def keywords(req: KeywordsRequest):
    """Keyword research — provider abstraction + mock fallback land in Wave 3."""
    raise HTTPException(
        status_code=501,
        detail="Keyword research arrives in Wave 3 (seo.keywords); no provider is wired yet.",
    )


@router.post("/track", response_model=TrackResponse)
def track(req: TrackRequest) -> TrackResponse:
    """Register keywords for rank tracking (tenant-scoped). Snapshots come in Wave 3."""
    records = get_repository().add_tracked_keywords(req.tenant_id, req.url, req.keywords)
    tracked = [TrackedKeywordOut(**r) for r in records]
    return TrackResponse(tenant_id=req.tenant_id, tracked=tracked, usage=UsageMeta())
