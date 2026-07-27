"""Platform-aware SEO agent HTTP surface (/api/agents/seo/*).

Audit (real crawl), platform detect, per-platform connection status/connect, and
approval-gated one-tap optimize. Reuses approvals/activity/persistence.

Tenant resolution follows a fail-closed precedence:
  1. X-Pixie-Tenant header (trusted, proxy-set) → always wins, body/query ignored.
  2. Strict mode (PIXIE_REQUIRE_INTERNAL_SECRET=1) + no header → HTTP 400.
  3. Dev/test (flag off) → body tenant_id / query tenant_id / "demo_tenant".
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query

from . import audit_agent as aa
from . import optimize  # noqa: F401 — registers the seo-agent executor on import
from . import website_connections as wc
from .agent_schemas import AuditStartBody, ConnectTokenBody, ConnectWordPressBody, OptimizePrepareBody
from .httpx_fetch import fetch_full
from .platform_detector import detect_platform
from .tenant import effective_tenant, resolve_tenant, resolve_tenant_header
from .url_guard import UrlRejected

router = APIRouter(prefix="/api/agents/seo", tags=["seo-agent"])


@router.post("/audit/start")
async def audit_start(
    body: AuditStartBody,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
) -> dict:
    # Header wins when present; fall back to body.tenant_id in dev/test mode.
    body.tenant_id = effective_tenant(_header_tenant, body.tenant_id)
    try:
        return await aa.run_audit(body)
    except UrlRejected as exc:
        raise HTTPException(
            status_code=400,
            detail={"error": "unsafe_url", "reason": exc.reason},
        ) from exc


@router.get("/audit/{audit_id}")
def audit_get(
    audit_id: str,
    tenant: str = Depends(resolve_tenant),
) -> dict:
    audit = aa.get_audit(tenant, audit_id)
    if not audit:
        raise HTTPException(status_code=404, detail="audit not found")
    return {"audit": audit, "issues": aa.list_issues(tenant, audit_id)}


@router.get("/audit/{audit_id}/issues")
def audit_issues(
    audit_id: str,
    tenant: str = Depends(resolve_tenant),
) -> dict:
    return {"issues": aa.list_issues(tenant, audit_id)}


@router.get("/audit/{audit_id}/pages")
def audit_pages(
    audit_id: str,
    tenant: str = Depends(resolve_tenant),
) -> dict:
    return {"pages": aa.list_pages(tenant, audit_id)}


@router.get("/platform-detect")
def platform_detect(url: str = Query(...)) -> dict:
    u = url if url.startswith(("http://", "https://")) else "https://" + url
    try:
        fetched = fetch_full(u)
    except UrlRejected as exc:
        # Return a structured 400 with only the safe category — never the
        # resolved IP or any internal topology detail.
        raise HTTPException(
            status_code=400,
            detail={"error": "unsafe_url", "reason": exc.reason},
        ) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"fetch failed: {exc}") from exc
    return detect_platform(fetched["html"], fetched["headers"], fetched["final_url"])


@router.get("/connections/status")
def connections_status(tenant: str = Depends(resolve_tenant)) -> dict:
    return wc.status(tenant)


@router.post("/connections/wordpress/connect")
def connect_wordpress(
    body: ConnectWordPressBody,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
) -> dict:
    body.tenant_id = effective_tenant(_header_tenant, body.tenant_id)
    return wc.connect_wordpress(body.tenant_id, body.site_url, body.username, body.application_password)


@router.post("/connections/token/connect")
def connect_token(
    body: ConnectTokenBody,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
) -> dict:
    body.tenant_id = effective_tenant(_header_tenant, body.tenant_id)
    return wc.connect_token(body.tenant_id, body.platform, body.token, body.site_id)


class _Disc(ConnectTokenBody):
    pass


@router.post("/connections/disconnect")
def disconnect(
    body: ConnectTokenBody,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
) -> dict:
    body.tenant_id = effective_tenant(_header_tenant, body.tenant_id)
    return wc.disconnect(body.tenant_id, body.platform)


@router.post("/optimize/prepare")
def optimize_prepare(
    body: OptimizePrepareBody,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
) -> dict:
    body.tenant_id = effective_tenant(_header_tenant, body.tenant_id)
    return optimize.prepare(body.tenant_id, body.audit_id, body.issue_id, body.new_value, body.now)


class _ApplyBody(OptimizePrepareBody):
    approval_id: str = ""


@router.post("/optimize/apply")
def optimize_apply(
    body: _ApplyBody,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
) -> dict:
    if not body.approval_id:
        raise HTTPException(status_code=422, detail="approval_id required")
    body.tenant_id = effective_tenant(_header_tenant, body.tenant_id)
    return optimize.apply_now(body.tenant_id, body.approval_id, body.now)


@router.get("/history")
def history(tenant: str = Depends(resolve_tenant)) -> dict:
    return {"audits": aa.list_history(tenant)}
