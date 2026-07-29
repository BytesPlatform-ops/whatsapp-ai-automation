"""SEO PDF report generation routes.

Endpoints (all tenant-scoped via the same tenant resolution as agent_routes.py):

  POST /api/agents/seo/reports/pdf
      Generate a PDF report.
      Body: { site_id, kind, date_from, date_to, workspace_name? }
      Response: { report_id, download_url, kind, byte_size, sha256, expires_at }

  GET  /api/agents/seo/reports/pdf
      List generated report metadata for the tenant.
      Query: site_id (optional filter)
      Response: { reports: [...] }

  GET  /api/agents/seo/reports/pdf/{report_id}/download?token=<token>
      Stream the PDF.  Token is validated (tenant-bound, expiring HMAC).
      Response: application/pdf stream
      Errors: 404 (not found / cross-tenant), 403 (invalid/expired token), 400 (disabled)

Feature gate:
  SEO_PDF_ENABLED=0  (or unset, defaults to "1" = enabled).
  When disabled, POST/GET/download all return HTTP 400 with:
    { "error": "seo_pdf_disabled", "detail": "..." }
  CSV/JSON/print endpoints in agent_routes.py are unaffected.

Mounting (do NOT edit app.py — include this router from the same include_router
call in app.py that includes other seo routers, OR add it there separately):

  from seo.reporting.routes import router as seo_pdf_router
  app.include_router(seo_pdf_router)
"""

from __future__ import annotations

import hashlib
import logging
import os
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field

from seo.tenant import effective_tenant, resolve_tenant, resolve_tenant_header
from seo.reporting.assembler import assemble_report, REPORT_KINDS
from seo.reporting.pdf import render_pdf, PDFRenderError, PDFTimeoutError
from seo.reporting.store import (
    GeneratedReport,
    DownloadTokenError,
    cache_pdf_bytes,
    generate_download_token,
    get_generated_report_repository,
    get_pdf_bytes,
    validate_download_token,
)

_log = logging.getLogger("pixie.seo.reporting.routes")

router = APIRouter(prefix="/api/agents/seo", tags=["seo-reports-pdf"])


# ── Feature gate ──────────────────────────────────────────────────────────────

def _pdf_enabled() -> bool:
    """Return True when SEO_PDF_ENABLED is not explicitly set to 0/false/off."""
    val = os.getenv("SEO_PDF_ENABLED", "1").strip().lower()
    return val not in ("0", "false", "no", "off")


def _check_pdf_enabled() -> None:
    if not _pdf_enabled():
        raise HTTPException(
            status_code=400,
            detail={
                "error": "seo_pdf_disabled",
                "detail": (
                    "PDF report generation is currently disabled. "
                    "Set SEO_PDF_ENABLED=1 to enable. "
                    "CSV/JSON/print exports are still available."
                ),
            },
        )


# ── Request schemas ───────────────────────────────────────────────────────────

class GeneratePdfBody(BaseModel):
    tenant_id: Optional[str] = Field(default=None)
    site_id: str = Field(..., min_length=1, max_length=200)
    kind: str = Field(..., description="Report kind")
    date_from: str = Field(..., description="YYYY-MM-DD start of reporting period")
    date_to: str = Field(..., description="YYYY-MM-DD end of reporting period")
    workspace_name: Optional[str] = Field(default="", max_length=200)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _build_download_url(report_id: str, tenant_id: str, base_url: str = "") -> str:
    """Build the signed download URL for a generated report."""
    token = generate_download_token(report_id, tenant_id)
    # Use a relative path; the proxy/frontend prepends the base URL.
    return f"/api/agents/seo/reports/pdf/{report_id}/download?token={token}"


def _validate_kind(kind: str) -> None:
    if kind not in REPORT_KINDS:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "invalid_report_kind",
                "valid_kinds": list(REPORT_KINDS),
                "received": kind,
            },
        )


def _validate_date(label: str, value: str) -> None:
    """Lightweight ISO date format check (YYYY-MM-DD)."""
    import re
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", value):
        raise HTTPException(
            status_code=400,
            detail={"error": "invalid_date", "field": label,
                    "expected_format": "YYYY-MM-DD", "received": value[:20]},
        )


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/reports/pdf")
async def generate_pdf_report(
    body: GeneratePdfBody,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
) -> dict:
    """Generate a PDF SEO report and return download metadata.

    Assembles report data from all available repositories, renders via reportlab,
    stores metadata, and returns a short-TTL signed download URL.

    PDF generation is NOT metered (local computation only).
    """
    _check_pdf_enabled()

    tenant = effective_tenant(_header_tenant, body.tenant_id)
    _validate_kind(body.kind)
    _validate_date("date_from", body.date_from)
    _validate_date("date_to", body.date_to)

    if body.date_from > body.date_to:
        raise HTTPException(
            status_code=400,
            detail={"error": "invalid_date_range", "detail": "date_from must be <= date_to"},
        )

    # Assemble report data
    try:
        report_data = assemble_report(
            tenant,
            body.site_id,
            kind=body.kind,
            date_from=body.date_from,
            date_to=body.date_to,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={"error": "assembler_error", "detail": str(exc)})
    except Exception as exc:
        _log.exception("PDF assembler error (tenant=%s, site=%s): %s", tenant, body.site_id, exc)
        raise HTTPException(status_code=500, detail={"error": "assembler_error", "detail": str(exc)})

    # Render PDF
    workspace_name = (body.workspace_name or "").strip()
    try:
        pdf_bytes = render_pdf(report_data, workspace_name=workspace_name)
    except PDFTimeoutError as exc:
        _log.warning("PDF generation timed out (tenant=%s, site=%s): %s", tenant, body.site_id, exc)
        raise HTTPException(
            status_code=504,
            detail={"error": "pdf_timeout", "detail": str(exc)},
        )
    except PDFRenderError as exc:
        _log.error("PDF render error (tenant=%s, site=%s): %s", tenant, body.site_id, exc)
        raise HTTPException(
            status_code=500,
            detail={"error": "pdf_render_error", "detail": str(exc)},
        )
    except Exception as exc:
        _log.exception("Unexpected PDF error (tenant=%s, site=%s): %s", tenant, body.site_id, exc)
        raise HTTPException(
            status_code=500,
            detail={"error": "pdf_render_error", "detail": str(exc)},
        )

    # Compute sha256 + byte_size
    sha256_hex = hashlib.sha256(pdf_bytes).hexdigest()
    byte_size = len(pdf_bytes)

    # Persist metadata + cache bytes
    import time
    from datetime import datetime, timezone, timedelta
    from seo.env import env_int

    expires_dt = datetime.now(timezone.utc) + timedelta(seconds=env_int("SEO_PDF_TOKEN_TTL", 300))
    expires_at = expires_dt.isoformat(timespec="microseconds")

    repo = get_generated_report_repository()
    meta = GeneratedReport(
        tenant_id=tenant,
        site_id=body.site_id,
        kind=body.kind,
        date_from=body.date_from,
        date_to=body.date_to,
        byte_size=byte_size,
        sha256=sha256_hex,
        expires_at=expires_at,
        status="ready",
    )
    report_id, saved = repo.create(meta)

    # Cache PDF bytes in-process so the download endpoint can stream them
    cache_pdf_bytes(report_id, pdf_bytes)

    download_url = _build_download_url(report_id, tenant)

    return {
        "report_id": report_id,
        "download_url": download_url,
        "kind": body.kind,
        "site_id": body.site_id,
        "byte_size": byte_size,
        "sha256": sha256_hex,
        "expires_at": expires_at,
        "date_from": body.date_from,
        "date_to": body.date_to,
    }


@router.get("/reports/pdf")
def list_pdf_reports(
    tenant: str = Depends(resolve_tenant),
    site_id: Optional[str] = Query(default=None),
) -> dict:
    """List generated PDF report metadata for the tenant.

    Query param `site_id` filters to a specific site.
    Results are ordered newest-first.
    """
    _check_pdf_enabled()

    repo = get_generated_report_repository()
    if site_id:
        pairs = repo.list_by_site(tenant, site_id)
    else:
        pairs = repo.list_by_tenant(tenant)

    reports = [
        {
            "report_id": rid,
            "site_id": r.site_id,
            "kind": r.kind,
            "date_from": r.date_from,
            "date_to": r.date_to,
            "byte_size": r.byte_size,
            "sha256": r.sha256,
            "expires_at": r.expires_at,
            "status": r.status,
            "created_at": r.created_at,
            "download_url": _build_download_url(rid, tenant),
        }
        for rid, r in pairs
    ]

    return {"reports": reports, "total": len(reports)}


@router.get("/reports/pdf/{report_id}/download")
def download_pdf_report(
    report_id: str,
    token: str = Query(..., description="Signed download token"),
    tenant: str = Depends(resolve_tenant),
) -> Response:
    """Stream a generated PDF report.

    Validates the signed token (tenant-bound, expiring HMAC).
    Returns 404 for cross-tenant requests or unknown report_ids.
    Returns 403 for invalid or expired tokens.

    This endpoint is deliberately non-cacheable to prevent token replay across
    different requests — each download link is single-use (short TTL).
    """
    _check_pdf_enabled()

    # Validate token first (403 on failure, before any DB lookup — avoids oracle)
    try:
        validate_download_token(
            token,
            expected_tenant_id=tenant,
            expected_report_id=report_id,
        )
    except DownloadTokenError as exc:
        raise HTTPException(
            status_code=403,
            detail={"error": "invalid_token", "detail": str(exc)},
        )

    # Tenant-scoped lookup — 404 for cross-tenant (token validated above, this is a belt+suspenders check)
    repo = get_generated_report_repository()
    pair = repo.get(tenant, report_id)
    if not pair:
        raise HTTPException(status_code=404, detail={"error": "report_not_found"})

    _, report_meta = pair
    # Belt+suspenders tenant check (the repo.get is already tenant-scoped, this is defence in depth)
    if report_meta.tenant_id != tenant:
        raise HTTPException(status_code=404, detail={"error": "report_not_found"})

    # Retrieve bytes
    pdf_bytes = get_pdf_bytes(report_id)
    if not pdf_bytes:
        # Bytes not in cache (server restart, etc.) — 404 is correct; client should re-generate
        raise HTTPException(
            status_code=404,
            detail={
                "error": "report_bytes_unavailable",
                "detail": (
                    "PDF bytes are no longer cached (server may have restarted). "
                    "Re-generate the report via POST /reports/pdf."
                ),
            },
        )

    filename = f"seo_report_{report_meta.kind}_{report_meta.site_id}_{report_id[:8]}.pdf"

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Length": str(len(pdf_bytes)),
            "Cache-Control": "no-store, no-cache, must-revalidate, private",
            "X-Content-Type-Options": "nosniff",
        },
    )
