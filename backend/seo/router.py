"""Self-contained FastAPI router for the SEO service (Mode A + Mode B).

By design this is NOT registered in the shared app (`backend/app.py`); the lead
engineer adds one `include_router` line manually (see the handoff notes). All
persisted data is tenant-scoped and `GET /score/{id}` requires tenant context.

Endpoints:
  POST /api/seo/generate     Mode A — enrich a Pixie page + score it
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
    KeywordsRequest,
    ReportResponse,
    TrackedKeywordOut,
    TrackRequest,
    TrackResponse,
    UsageMeta,
)
from .engine import analyze
from .repository import get_repository
from .schemas import Mode

router = APIRouter(prefix="/api/seo", tags=["seo"])

_REPORT_KEYS = (
    "report_id", "tenant_id", "mode", "url",
    "score", "checks", "issues", "suggestions", "fixes",
)


def _build_report(tenant_id: str, result, mode: Mode) -> dict:
    d = result.to_dict()
    return {
        "tenant_id": tenant_id,
        "mode": mode.value,
        "url": d["page"].get("url", ""),
        "score": d["score"],
        "checks": d["checks"],
        "issues": d["issues"],
        "suggestions": d["suggestions"],
        "fixes": d["fixes"],
    }


def _as_response(stored: dict, usage: UsageMeta) -> ReportResponse:
    return ReportResponse(usage=usage, **{k: stored[k] for k in _REPORT_KEYS})


@router.post("/generate", response_model=ReportResponse)
def generate(req: GenerateRequest) -> ReportResponse:
    """Mode A — SEO-enrich a Pixie-controlled page and score it."""
    start = time.perf_counter()
    result = analyze(req.page, Mode.PIXIE)
    report = _build_report(req.tenant_id, result, Mode.PIXIE)
    stored = get_repository().save_report(req.tenant_id, report, req.idempotency_key)
    usage = UsageMeta(
        latency_ms=int((time.perf_counter() - start) * 1000),
        request_id=stored["report_id"],
    )
    return _as_response(stored, usage)


@router.post("/audit-url", response_model=ReportResponse)
def audit_url(req: AuditUrlRequest) -> ReportResponse:
    """Mode B — audit an external page. Pixie NEVER edits external sites."""
    if req.page is None:
        # Live crawling (SSRF-guarded fetch + HTML->SeoPage) lands in Wave 2.
        raise HTTPException(
            status_code=501,
            detail=(
                "Live URL crawling arrives in Wave 2 (seo.mode_external). "
                "Submit a normalized 'page' object to audit it now."
            ),
        )
    start = time.perf_counter()
    result = analyze(req.page, Mode.EXTERNAL)
    report = _build_report(req.tenant_id, result, Mode.EXTERNAL)
    if req.url and not report["url"]:
        report["url"] = req.url
    stored = get_repository().save_report(req.tenant_id, report, req.idempotency_key)
    usage = UsageMeta(
        latency_ms=int((time.perf_counter() - start) * 1000),
        request_id=stored["report_id"],
    )
    return _as_response(stored, usage)


@router.get("/score/{report_id}", response_model=ReportResponse)
def get_score(
    report_id: str,
    tenant_id: Optional[str] = Query(default=None),
    x_tenant_id: Optional[str] = Header(default=None),
) -> ReportResponse:
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
    return _as_response(stored, UsageMeta(cache_hit=True, request_id=report_id))


@router.post("/keywords")
def keywords(req: KeywordsRequest):
    """Keyword research — provider abstraction + mock fallback land in Wave 3."""
    raise HTTPException(
        status_code=501,
        detail=(
            "Keyword research arrives in Wave 3 (seo.keywords); no provider is wired yet."
        ),
    )


@router.post("/track", response_model=TrackResponse)
def track(req: TrackRequest) -> TrackResponse:
    """Register keywords for rank tracking (tenant-scoped). Snapshots come in Wave 3."""
    records = get_repository().add_tracked_keywords(req.tenant_id, req.url, req.keywords)
    tracked = [TrackedKeywordOut(**r) for r in records]
    return TrackResponse(tenant_id=req.tenant_id, tracked=tracked, usage=UsageMeta())
