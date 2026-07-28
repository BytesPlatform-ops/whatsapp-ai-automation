"""FastAPI router for the backlinks vertical.

Prefix:  /api/agents/seo
Tags:    seo-backlinks

Tenant resolution mirrors agent_routes.py:
  GET  routes: Depends(resolve_tenant) — header wins, then ?tenant_id, then "demo_tenant"
  POST routes: Depends(resolve_tenant_header) + effective_tenant(header, body.tenant_id)

Endpoint index:

  POST  /backlinks/sync                              trigger_sync
  GET   /backlinks/overview?site_id=                 get_overview
  GET   /backlinks?site_id=&status=&domain=          list_backlinks
  GET   /backlinks/referring-domains?site_id=&status= list_referring_domains
  GET   /backlinks/new-lost?site_id=&since=          get_new_lost
  GET   /backlinks/anchors?site_id=                  get_anchors
  GET   /backlinks/risk?site_id=&language=           get_risk
  GET   /backlinks/gap?site_id=&competitors=         get_gap
  GET   /backlinks/opportunities?site_id=&competitors= get_opportunities
  GET   /backlinks/export?site_id=&format=csv        export_csv
"""

from __future__ import annotations

import csv
import io
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..tenant import effective_tenant, resolve_tenant, resolve_tenant_header
from seo.metering_search import SeoLimitExceeded

from . import service as bl_service
from . import risk as bl_risk
from . import gaps as bl_gaps
from .provider import get_backlink_provider
from .stores import (
    get_backlink_repository,
    get_referring_domain_repository,
)

_log = logging.getLogger("pixie.seo.backlinks.routes")

router = APIRouter(prefix="/api/agents/seo", tags=["seo-backlinks"])

# ── Request bodies ─────────────────────────────────────────────────────────────

class SyncBody(BaseModel):
    tenant_id: Optional[str] = None
    site_id: str
    domain: Optional[str] = None   # override domain if different from site_id


# ── CSV escaping (mirrors seo/keywords/csv_io.py) ─────────────────────────────

_INJECTION_CHARS = frozenset("=+-@\t\r")


def _escape_cell(value: str) -> str:
    """Guard a cell value against CSV formula injection (OWASP recommendation)."""
    if value and value[0] in _INJECTION_CHARS:
        return "'" + value
    return value


def _to_csv_row(row: dict, columns: List[str]) -> List:
    out = []
    for col in columns:
        val = row.get(col)
        if val is None:
            out.append("")
        elif isinstance(val, list):
            out.append(_escape_cell("|".join(str(v) for v in val)))
        elif isinstance(val, (int, float, bool)):
            out.append(val)
        else:
            out.append(_escape_cell(str(val)))
    return out


_BACKLINK_CSV_COLUMNS = [
    "source_url", "source_domain", "target_url", "anchor_text",
    "rel", "link_type", "first_seen", "last_seen", "status",
    "language", "country",
]

_RD_CSV_COLUMNS = [
    "domain", "status", "backlink_count", "follow_count", "nofollow_count",
    "first_seen", "last_seen", "top_anchors",
]


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/backlinks/sync")
async def trigger_sync(
    body: SyncBody,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
) -> dict:
    """Trigger a durable backlink sync for a site.

    Uses the mock provider unless SEO_BACKLINK_API_KEY / SEO_BACKLINK_PROVIDER
    credentials are set in the environment. Idempotent: safe to call repeatedly.
    """
    tenant = effective_tenant(_header_tenant, body.tenant_id)
    try:
        result = bl_service.run_backlink_sync(
            tenant, body.site_id,
            domain=body.domain,
        )
        return {"status": "ok", "sync": result}
    except SeoLimitExceeded as exc:
        raise HTTPException(status_code=402, detail={"error": "limit_exceeded", "detail": exc.result})
    except Exception as exc:
        _log.exception("sync failed: %s", exc)
        raise HTTPException(status_code=500, detail={"error": "sync_failed", "detail": str(exc)})


@router.get("/backlinks/overview")
def get_overview(
    site_id: str = Query(...),
    tenant: str = Depends(resolve_tenant),
) -> dict:
    """Backlink profile summary for the overview card."""
    return bl_service.get_profile(tenant, site_id)


@router.get("/backlinks")
def list_backlinks(
    site_id: str = Query(...),
    status: Optional[str] = Query(default=None, description="Filter: active | lost"),
    domain: Optional[str] = Query(default=None, description="Filter by source_domain"),
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    tenant: str = Depends(resolve_tenant),
) -> dict:
    """Paginated list of stored backlinks for a site."""
    try:
        bl_repo = get_backlink_repository()
        from .stores import LinkStatus
        status_filter = None
        if status:
            try:
                status_filter = LinkStatus(status)
            except ValueError:
                raise HTTPException(status_code=400, detail={"error": "invalid_status", "valid": ["active", "lost"]})

        pairs = bl_repo.list_by_site(tenant, site_id, status=status_filter)
        if domain:
            pairs = [(rid, bl) for rid, bl in pairs if bl.source_domain == domain]

        total = len(pairs)
        page = pairs[offset: offset + limit]
        rows = [
            {
                "id": rid,
                "source_url": bl.source_url,
                "source_domain": bl.source_domain,
                "target_url": bl.target_url,
                "anchor_text": bl.anchor_text,
                "rel": bl.rel.value if bl.rel else "follow",
                "link_type": bl.link_type,
                "first_seen": bl.first_seen,
                "last_seen": bl.last_seen,
                "status": bl.status.value if bl.status else "active",
                "language": bl.language,
                "country": bl.country,
                "provider": bl.provider,
                "provider_metrics": bl.provider_metrics,
                "dedup_key": bl.dedup_key,
            }
            for rid, bl in page
        ]
        return {"total": total, "limit": limit, "offset": offset, "backlinks": rows}
    except HTTPException:
        raise
    except Exception as exc:
        _log.warning("list_backlinks failed: %s", exc)
        raise HTTPException(status_code=500, detail={"error": str(exc)})


@router.get("/backlinks/referring-domains")
def list_referring_domains(
    site_id: str = Query(...),
    status: Optional[str] = Query(default=None, description="Filter: active | lost"),
    tenant: str = Depends(resolve_tenant),
) -> dict:
    """List stored referring domains with aggregate counts."""
    domains = bl_service.get_referring_domains(tenant, site_id, status=status)
    return {"referring_domains": domains, "total": len(domains)}


@router.get("/backlinks/new-lost")
def get_new_lost(
    site_id: str = Query(...),
    since: Optional[str] = Query(default=None, description="ISO date YYYY-MM-DD"),
    tenant: str = Depends(resolve_tenant),
) -> dict:
    """New and lost backlinks from stored records (no new provider call)."""
    return bl_service.get_new_lost(tenant, site_id, since=since)


@router.get("/backlinks/anchors")
def get_anchors(
    site_id: str = Query(...),
    tenant: str = Depends(resolve_tenant),
) -> dict:
    """Anchor text distribution sorted by count descending."""
    distribution = bl_service.get_anchor_distribution(tenant, site_id)
    return {"anchors": distribution, "total": len(distribution)}


@router.get("/backlinks/velocity")
def get_velocity(
    site_id: str = Query(...),
    tenant: str = Depends(resolve_tenant),
) -> dict:
    """Link velocity chart data (snapshot sequence ordered by date)."""
    snapshots = bl_service.get_link_velocity(tenant, site_id)
    return {"velocity": snapshots}


@router.get("/backlinks/risk")
def get_risk(
    site_id: str = Query(...),
    language: str = Query(default="en", description="Client site language hint (e.g. 'en', 'de')"),
    min_signals: int = Query(default=0, ge=0, description="Return only domains with at least this many signals"),
    tenant: str = Depends(resolve_tenant),
) -> dict:
    """Transparent risk-signal analysis for all referring domains.

    Returns per-domain signal lists. human_review_required is always True —
    we never automatically disavow or label links as 'toxic'. Provider data
    is passed through verbatim; no scores are fabricated.
    """
    if min_signals > 0:
        results = bl_risk.get_review_list(tenant, site_id,
                                          min_signals=min_signals,
                                          language_hint=language)
    else:
        results = bl_risk.analyse_risk_signals(tenant, site_id, language_hint=language)
    flagged = [r for r in results if r.get("signal_count", 0) > 0]
    return {
        "risk_analysis": results,
        "flagged_count": len(flagged),
        "total_domains": len(results),
        "human_review_required": True,
        "disclaimer": (
            "Risk signals are computed from measurable link properties and provider data. "
            "They are indicators only — not definitive proof of penalty risk. "
            "A human reviewer must make all disavow decisions."
        ),
    }


@router.get("/backlinks/gap")
def get_gap(
    site_id: str = Query(...),
    competitors: List[str] = Query(default=[], description="Competitor domains"),
    domain: Optional[str] = Query(default=None, description="Client domain override"),
    tenant: str = Depends(resolve_tenant),
) -> dict:
    """Full backlink gap analysis vs competitors.

    Returns gap_opportunities, lost_reclamation, resource_candidates,
    competitor_pages, and a summary. All opportunities include score_inputs.
    """
    provider = get_backlink_provider()
    is_mock = provider.name == "mock"
    result = bl_gaps.run_gap_analysis(
        tenant, site_id, competitors,
        provider=provider,
        client_domain=domain,
        is_mock=is_mock,
    )
    return result


@router.get("/backlinks/opportunities")
def get_opportunities(
    site_id: str = Query(...),
    competitors: List[str] = Query(default=[], description="Competitor domains"),
    domain: Optional[str] = Query(default=None, description="Client domain override"),
    tenant: str = Depends(resolve_tenant),
) -> dict:
    """Flat list of all backlink opportunities with score_inputs.

    Convenience endpoint combining gap, lost-reclamation, resource, and
    competitor-page opportunities into a single ranked list.
    """
    provider = get_backlink_provider()
    is_mock = provider.name == "mock"
    opps = bl_gaps.get_opportunities(
        tenant, site_id, competitors,
        provider=provider,
        client_domain=domain,
        is_mock=is_mock,
    )
    return {
        "opportunities": opps,
        "total": len(opps),
    }


@router.get("/backlinks/export")
def export_csv_endpoint(
    site_id: str = Query(...),
    export_type: str = Query(default="backlinks", description="backlinks | referring_domains"),
    tenant: str = Depends(resolve_tenant),
) -> StreamingResponse:
    """CSV export of backlinks or referring domains.

    All string cells are passed through formula-injection escaping
    (OWASP: prefix with ' if cell starts with =, +, -, @, tab, CR).
    """
    if export_type == "referring_domains":
        domains = bl_service.get_referring_domains(tenant, site_id)
        rows = domains
        columns = _RD_CSV_COLUMNS
        filename = f"referring_domains_{site_id}.csv"
    else:
        bl_repo = get_backlink_repository()
        pairs = bl_repo.list_by_site(tenant, site_id)
        rows = [
            {
                "source_url": bl.source_url,
                "source_domain": bl.source_domain,
                "target_url": bl.target_url,
                "anchor_text": bl.anchor_text,
                "rel": bl.rel.value if bl.rel else "follow",
                "link_type": bl.link_type,
                "first_seen": bl.first_seen,
                "last_seen": bl.last_seen,
                "status": bl.status.value if bl.status else "active",
                "language": bl.language,
                "country": bl.country,
            }
            for _, bl in pairs
        ]
        columns = _BACKLINK_CSV_COLUMNS
        filename = f"backlinks_{site_id}.csv"

    out = io.StringIO()
    writer = csv.writer(out, quoting=csv.QUOTE_MINIMAL, lineterminator="\n")
    writer.writerow(columns)
    for row in rows:
        writer.writerow(_to_csv_row(row, columns))

    csv_bytes = out.getvalue().encode("utf-8")
    return StreamingResponse(
        io.BytesIO(csv_bytes),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
