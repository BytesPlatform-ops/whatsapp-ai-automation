"""FastAPI router for Google Search Console + GA4 endpoints.

Prefix: /api/agents/seo (matches seo/agent_routes.py)
Tags:   seo-google

Endpoints (all tenant-scoped):

  GET  /google/connections          — list non-revoked connections
  POST /google/connect              — start OAuth flow; returns auth_url + state
  GET  /google/callback             — OAuth callback: validate state, exchange, save
  GET  /google/properties           — list discovered properties for a connection
  POST /google/properties/select    — map property to a Pixie site
  POST /google/connections/{id}/sync       — run GSC + GA4 sync
  POST /google/connections/{id}/disconnect — revoke + mark REVOKED
  GET  /google/gsc/queries          — query-performance view
  GET  /google/gsc/pages            — striking-distance (pos 4–20) view
  GET  /google/ga4/landing          — landing-page performance view

Tenant pattern mirrors agent_routes.py:
  GET  → Depends(resolve_tenant)
  POST → _h: Optional[str] = Depends(resolve_tenant_header), then effective_tenant(_h, body.tenant_id)
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel

from seo.tenant import effective_tenant, resolve_tenant, resolve_tenant_header
from seo.google.connections import (
    ConnectionError as ConnError,
    CrossAccountError,
    complete_connect,
    disconnect,
    get_connection,
    list_connections,
    list_properties_for_connection,
    refresh_connection,
    select_property,
    start_connect,
    _safe_connection_dict,
)
from seo.google.oauth import OAuthStateError, validate_state
from seo.google.sync import (
    ga4_landing_performance,
    gsc_high_impression_low_ctr,
    gsc_positions_4_20,
    gsc_query_performance,
    run_ga4_sync,
    run_gsc_sync,
)

_log = logging.getLogger("pixie.seo.google.routes")

router = APIRouter(prefix="/api/agents/seo", tags=["seo-google"])


# ── Pydantic bodies ─────────────────────────────────────────────────────────────

class ConnectBody(BaseModel):
    tenant_id: Optional[str] = None
    kind: str = "google"


class PropertySelectBody(BaseModel):
    tenant_id: Optional[str] = None
    connection_id: str
    property_row_id: str   # the DB id of the GoogleProperty row
    site_id: str = ""


class SyncBody(BaseModel):
    tenant_id: Optional[str] = None
    property_id: str = ""
    site_id: str = ""
    initial_lookback_days: Optional[int] = None


class DisconnectBody(BaseModel):
    tenant_id: Optional[str] = None


# ── Connections ─────────────────────────────────────────────────────────────────

@router.get("/google/connections")
def list_connections_endpoint(
    tenant: str = Depends(resolve_tenant),
) -> Dict[str, Any]:
    """List all active Google connections for the tenant."""
    pairs = list_connections(tenant)
    return {"connections": [_safe_connection_dict(cid, conn) for cid, conn in pairs]}


@router.post("/google/connect")
def start_connect_endpoint(
    body: ConnectBody,
    _h: Optional[str] = Depends(resolve_tenant_header),
) -> Dict[str, Any]:
    """Start the Google OAuth flow; returns {auth_url, state}."""
    tenant = effective_tenant(_h, body.tenant_id)
    try:
        return start_connect(tenant, body.kind)
    except OAuthStateError as exc:
        raise HTTPException(status_code=400, detail={"error": "oauth_not_configured", "reason": str(exc)})
    except Exception as exc:
        _log.exception("start_connect failed")
        raise HTTPException(status_code=500, detail={"error": "connect_failed", "reason": str(exc)})


@router.get("/google/callback")
def google_callback(
    state: str = Query(...),
    code: Optional[str] = Query(default=None),
    error: Optional[str] = Query(default=None),
) -> Dict[str, Any]:
    """Google OAuth callback.

    Validates the HMAC state, exchanges the code for tokens, seals them,
    and persists the connection. Returns a safe connection summary.

    In tests the exchange is mocked via the injected client factory in sync;
    in this route we call complete_connect which accepts a token_exchange_fn
    injection. For the HTTP surface we use None (real exchange in live mode,
    or a test override via the conftest).
    """
    if error:
        raise HTTPException(
            status_code=400,
            detail={"error": "oauth_denied", "reason": error},
        )
    if not code:
        raise HTTPException(
            status_code=400,
            detail={"error": "missing_code"},
        )

    try:
        conn_id, conn = complete_connect(state, code)
    except OAuthStateError as exc:
        raise HTTPException(status_code=400, detail={"error": "invalid_state", "reason": str(exc)})
    except ConnError as exc:
        raise HTTPException(status_code=502, detail={"error": "exchange_failed", "reason": str(exc)})
    except Exception as exc:
        _log.exception("google_callback failed")
        raise HTTPException(status_code=500, detail={"error": "callback_error", "reason": str(exc)})

    return {"connection": _safe_connection_dict(conn_id, conn)}


# ── Properties ──────────────────────────────────────────────────────────────────

@router.get("/google/properties")
def list_properties_endpoint(
    connection_id: str = Query(...),
    tenant: str = Depends(resolve_tenant),
) -> Dict[str, Any]:
    """List GSC + GA4 properties for a connection (fetches from Google + caches)."""
    try:
        props = list_properties_for_connection(tenant, connection_id)
    except ConnError as exc:
        raise HTTPException(status_code=404, detail={"error": "connection_not_found", "reason": str(exc)})
    except Exception as exc:
        _log.exception("list_properties failed")
        raise HTTPException(status_code=500, detail={"error": "list_properties_failed", "reason": str(exc)})
    return {"properties": props}


@router.post("/google/properties/select")
def select_property_endpoint(
    body: PropertySelectBody,
    _h: Optional[str] = Depends(resolve_tenant_header),
) -> Dict[str, Any]:
    """Map a property to a Pixie site. Cross-account selection is rejected."""
    tenant = effective_tenant(_h, body.tenant_id)
    try:
        prop = select_property(tenant, body.connection_id, body.property_row_id, body.site_id)
    except CrossAccountError as exc:
        raise HTTPException(status_code=403, detail={"error": "cross_account", "reason": str(exc)})
    except ConnError as exc:
        raise HTTPException(status_code=404, detail={"error": "property_not_found", "reason": str(exc)})
    except Exception as exc:
        _log.exception("select_property failed")
        raise HTTPException(status_code=500, detail={"error": "select_failed", "reason": str(exc)})
    return {"property": prop}


# ── Sync ────────────────────────────────────────────────────────────────────────

@router.post("/google/connections/{connection_id}/sync")
def sync_connection(
    connection_id: str,
    body: SyncBody,
    background_tasks: BackgroundTasks,
    _h: Optional[str] = Depends(resolve_tenant_header),
) -> Dict[str, Any]:
    """Enqueue and run GSC + GA4 sync for a connection.

    Runs synchronously (in background_tasks) for simplicity; a real deployment
    would push to a task queue. Returns immediately with job info.
    """
    tenant = effective_tenant(_h, body.tenant_id)

    # Verify connection belongs to tenant
    result = get_connection(tenant, connection_id)
    if result is None:
        raise HTTPException(status_code=404, detail={"error": "connection_not_found"})

    property_id = body.property_id
    site_id = body.site_id
    lookback = body.initial_lookback_days

    def _do_sync():
        try:
            run_gsc_sync(
                tenant, connection_id, property_id,
                site_id=site_id,
                initial_lookback_days=lookback,
            )
            run_ga4_sync(
                tenant, connection_id, property_id,
                site_id=site_id,
                initial_lookback_days=lookback,
            )
        except Exception as exc:
            _log.error("sync background task failed: %s", exc)

    background_tasks.add_task(_do_sync)
    return {"status": "sync_enqueued", "connection_id": connection_id, "tenant_id": tenant}


@router.post("/google/connections/{connection_id}/disconnect")
def disconnect_connection(
    connection_id: str,
    body: DisconnectBody,
    _h: Optional[str] = Depends(resolve_tenant_header),
) -> Dict[str, Any]:
    """Revoke tokens and mark connection REVOKED."""
    tenant = effective_tenant(_h, body.tenant_id)
    try:
        return disconnect(tenant, connection_id)
    except ConnError as exc:
        raise HTTPException(status_code=404, detail={"error": "connection_not_found", "reason": str(exc)})
    except Exception as exc:
        _log.exception("disconnect failed")
        raise HTTPException(status_code=500, detail={"error": "disconnect_failed", "reason": str(exc)})


# ── GSC views ───────────────────────────────────────────────────────────────────

@router.get("/google/gsc/queries")
def gsc_queries_view(
    property_id: str = Query(...),
    start: Optional[str] = Query(default=None),
    end: Optional[str] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=1000),
    tenant: str = Depends(resolve_tenant),
) -> Dict[str, Any]:
    """Query performance aggregated from stored GSC rows."""
    rows = gsc_query_performance(tenant, property_id, start=start, end=end, limit=limit)
    return {"rows": rows, "count": len(rows)}


@router.get("/google/gsc/pages")
def gsc_pages_view(
    property_id: str = Query(...),
    start: Optional[str] = Query(default=None),
    end: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
    tenant: str = Depends(resolve_tenant),
) -> Dict[str, Any]:
    """Striking-distance queries (positions 4–20) from stored GSC rows."""
    rows = gsc_positions_4_20(tenant, property_id, start=start, end=end, limit=limit)
    return {"rows": rows, "count": len(rows)}


# ── GA4 views ───────────────────────────────────────────────────────────────────

@router.get("/google/ga4/landing")
def ga4_landing_view(
    property_id: str = Query(...),
    start: Optional[str] = Query(default=None),
    end: Optional[str] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=1000),
    tenant: str = Depends(resolve_tenant),
) -> Dict[str, Any]:
    """Landing-page performance aggregated from stored GA4 rows."""
    rows = ga4_landing_performance(tenant, property_id, start=start, end=end, limit=limit)
    return {"rows": rows, "count": len(rows)}
