"""SEO ops router — health, metrics, readiness, and alerts endpoints.

All endpoints are ADMIN/INTERNAL guarded (require_internal dependency from
security.py). No secrets, tokens, or raw provider responses are returned.

Endpoints:
  GET /api/agents/seo/ops/health/live   — liveness (process up, cheap)
  GET /api/agents/seo/ops/health/ready  — readiness (config, encryption, persistence)
  GET /api/agents/seo/ops/health/deps   — dependency health (provider states, cached)
  GET /api/agents/seo/ops/metrics       — tenant-safe metrics snapshot
  GET /api/agents/seo/ops/readiness     — provider readiness dashboard
  GET /api/agents/seo/ops/alerts        — active alert events

Include in app.py with:
    from seo.ops.routes import router as seo_ops_router
    app.include_router(seo_ops_router)
"""

from __future__ import annotations

from typing import Any, Dict, List

from fastapi import APIRouter, Depends

from security import RequestContext, require_internal

router = APIRouter(
    prefix="/api/agents/seo/ops",
    tags=["seo-ops"],
)


# ── Health endpoints ───────────────────────────────────────────────────────────

@router.get("/health/live", summary="SEO liveness check")
async def health_live(
    _ctx: RequestContext = Depends(require_internal),
) -> Dict[str, Any]:
    """Process liveness — returns immediately if the process is up."""
    from seo.ops.health import liveness
    return liveness()


@router.get("/health/ready", summary="SEO readiness check")
async def health_ready(
    _ctx: RequestContext = Depends(require_internal),
) -> Dict[str, Any]:
    """Service readiness — config valid, encryption ready, persistence up."""
    from seo.ops.health import readiness
    return readiness()


@router.get("/health/deps", summary="SEO dependency health")
async def health_deps(
    _ctx: RequestContext = Depends(require_internal),
) -> Dict[str, Any]:
    """Dependency health — provider states (cached, no live calls)."""
    from seo.ops.health import deps
    return deps()


# ── Metrics endpoint ───────────────────────────────────────────────────────────

@router.get("/metrics", summary="SEO metrics snapshot")
async def get_metrics(
    _ctx: RequestContext = Depends(require_internal),
) -> Dict[str, Any]:
    """Return a tenant-safe point-in-time metrics snapshot.

    Counter and histogram labels use hashed tenant identifiers.
    No content, token text, emails, or review text is ever included.
    """
    from seo.ops.metrics import snapshot
    return snapshot()


# ── Readiness endpoint ─────────────────────────────────────────────────────────

@router.get("/readiness", summary="SEO provider readiness dashboard")
async def get_readiness(
    _ctx: RequestContext = Depends(require_internal),
) -> Dict[str, Any]:
    """Provider readiness dashboard.

    Shows configured/creds_present/last_smoke/last_success/last_failure/latency
    for all SEO providers. No credential values are returned.
    """
    from seo.ops.readiness import all_providers_readiness
    providers = all_providers_readiness()
    return {
        "providers": providers,
        "count": len(providers),
    }


# ── Alerts endpoint ────────────────────────────────────────────────────────────

@router.get("/alerts", summary="SEO active alert events")
async def get_alerts(
    _ctx: RequestContext = Depends(require_internal),
) -> Dict[str, Any]:
    """Evaluate and return active operational alert events.

    Alerts are derived from current metrics state and system health —
    no external network calls are made. Empty list means no active alerts.
    """
    from seo.ops.alerts import evaluate_alerts
    fired = evaluate_alerts()
    return {
        "alerts": fired,
        "count": len(fired),
        "has_critical": any(a.get("severity") == "critical" for a in fired),
    }
