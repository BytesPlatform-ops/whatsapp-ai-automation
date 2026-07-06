"""Platform-aware SEO agent HTTP surface (/api/agents/seo/*).

Audit (real crawl), platform detect, per-platform connection status/connect, and
approval-gated one-tap optimize. Reuses approvals/activity/persistence.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from . import audit_agent as aa
from . import optimize  # noqa: F401 — registers the seo-agent executor on import
from . import website_connections as wc
from .agent_schemas import AuditStartBody, ConnectTokenBody, ConnectWordPressBody, OptimizePrepareBody
from .httpx_fetch import fetch_full
from .platform_detector import detect_platform

router = APIRouter(prefix="/api/agents/seo", tags=["seo-agent"])


@router.post("/audit/start")
async def audit_start(body: AuditStartBody) -> dict:
    return await aa.run_audit(body)


@router.get("/audit/{audit_id}")
def audit_get(audit_id: str, tenant_id: str = Query(...)) -> dict:
    audit = aa.get_audit(tenant_id, audit_id)
    if not audit:
        raise HTTPException(status_code=404, detail="audit not found")
    return {"audit": audit, "issues": aa.list_issues(tenant_id, audit_id)}


@router.get("/audit/{audit_id}/issues")
def audit_issues(audit_id: str, tenant_id: str = Query(...)) -> dict:
    return {"issues": aa.list_issues(tenant_id, audit_id)}


@router.get("/audit/{audit_id}/pages")
def audit_pages(audit_id: str, tenant_id: str = Query(...)) -> dict:
    return {"pages": aa.list_pages(tenant_id, audit_id)}


@router.get("/platform-detect")
def platform_detect(url: str = Query(...)) -> dict:
    u = url if url.startswith(("http://", "https://")) else "https://" + url
    try:
        fetched = fetch_full(u)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"fetch failed: {exc}") from exc
    return detect_platform(fetched["html"], fetched["headers"], fetched["final_url"])


@router.get("/connections/status")
def connections_status(tenant_id: str = Query(...)) -> dict:
    return wc.status(tenant_id)


@router.post("/connections/wordpress/connect")
def connect_wordpress(body: ConnectWordPressBody) -> dict:
    return wc.connect_wordpress(body.tenant_id, body.site_url, body.username, body.application_password)


@router.post("/connections/token/connect")
def connect_token(body: ConnectTokenBody) -> dict:
    return wc.connect_token(body.tenant_id, body.platform, body.token, body.site_id)


class _Disc(ConnectTokenBody):
    pass


@router.post("/connections/disconnect")
def disconnect(body: ConnectTokenBody) -> dict:
    return wc.disconnect(body.tenant_id, body.platform)


@router.post("/optimize/prepare")
def optimize_prepare(body: OptimizePrepareBody) -> dict:
    return optimize.prepare(body.tenant_id, body.audit_id, body.issue_id, body.new_value, body.now)


class _ApplyBody(OptimizePrepareBody):
    approval_id: str = ""


@router.post("/optimize/apply")
def optimize_apply(body: _ApplyBody) -> dict:
    if not body.approval_id:
        raise HTTPException(status_code=422, detail="approval_id required")
    return optimize.apply_now(body.tenant_id, body.approval_id, body.now)


@router.get("/history")
def history(tenant_id: str = Query(...)) -> dict:
    return {"audits": aa.list_history(tenant_id)}
