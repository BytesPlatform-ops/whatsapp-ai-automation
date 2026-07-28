"""SEO Intelligence HTTP surface.

APIRouter(prefix="/api/agents/seo", tags=["seo-intelligence"]).

All endpoints are tenant-scoped following the same precedence as agent_routes.py:
  1. X-Pixie-Tenant header → always wins
  2. Strict mode (PIXIE_REQUIRE_INTERNAL_SECRET=1) + no header → HTTP 400
  3. Dev/test → body tenant_id / query tenant_id / "demo_tenant"

Endpoints
---------
Competitors:
  POST   /competitors
  GET    /competitors?project_id=
  GET    /competitors/{id}
  PATCH  /competitors/{id}
  DELETE /competitors/{id}
  POST   /competitors/{id}/snapshot
  GET    /competitors/gap?project_id=&competitor_domain=&min_volume=

Opportunities:
  POST   /opportunities/generate
  GET    /opportunities?site_id=&project_id=&status=&opp_type=
  GET    /opportunities/{id}
  POST   /opportunities/{id}/dismiss
  POST   /opportunities/{id}/action
  POST   /opportunities/{id}/explain

Optimise workspace:
  GET    /optimise?site_id=&project_id=&page_id=&page_url=&keyword=
  POST   /optimise/ai?site_id=&page_id=&page_url=&keyword=&project_id=

Briefs:
  POST   /briefs/generate
  GET    /briefs?site_id=&project_id=&status=
  GET    /briefs/{id}
  PATCH  /briefs/{id}
  POST   /briefs/{id}/approve
  POST   /briefs/{id}/archive
  POST   /briefs/{id}/duplicate
  GET    /briefs/{id}/export?fmt=dict|markdown
  POST   /briefs/{id}/handoff

Alerts:
  POST   /alerts/generate
  GET    /alerts?site_id=&project_id=&severity=&status=&alert_type=
  POST   /alerts/{id}/read
  POST   /alerts/{id}/dismiss
"""

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from ..tenant import effective_tenant, resolve_tenant, resolve_tenant_header

from .competitors import (
    competitor_top_pages,
    create_competitor,
    get_competitor,
    keyword_gap,
    keyword_overlap,
    list_competitors,
    record_snapshot,
    remove_competitor,
    update_competitor,
)
from .opportunities import (
    action_opportunity,
    dismiss_opportunity,
    explain_opportunity,
    generate_opportunities,
    get_opportunity,
    list_opportunities,
)
from .optimise_workspace import assemble_workspace, generate_ai_optimisations
from .briefs import (
    approve_brief,
    archive_brief,
    duplicate_brief,
    edit_brief,
    export_brief,
    generate_brief,
    get_brief,
    list_briefs,
)
from .content_handoff import (
    execute_handoff,
    handoff_from_brief,
    record_handoff_on_brief,
)
from .alerts import (
    dismiss_alert,
    generate_alerts,
    list_alerts,
    mark_read,
)
from seo.metering_search import SeoLimitExceeded
from seo.search_stores import (
    AlertStatus,
    BriefStatus,
    OpportunityStatus,
    TrackingStatus,
)
from seo.schemas import Severity

router = APIRouter(prefix="/api/agents/seo", tags=["seo-intelligence"])


# ── Shared helpers ────────────────────────────────────────────────────────────

def _enum_val(v) -> str:
    return v.value if hasattr(v, "value") else str(v)


def _competitor_out(cid: str, comp) -> dict:
    return {
        "id": cid,
        "tenant_id": comp.tenant_id,
        "project_id": comp.project_id,
        "domain": comp.domain,
        "site_id": comp.site_id,
        "display_name": comp.display_name,
        "country": comp.country,
        "language": comp.language,
        "tracking_status": _enum_val(comp.tracking_status),
        "notes": comp.notes,
        "last_refreshed_at": comp.last_refreshed_at,
        "created_at": comp.created_at,
        "updated_at": comp.updated_at,
    }


def _opp_out(oid: str, opp) -> dict:
    return {
        "id": oid,
        "opp_type": opp.opp_type,
        "site_id": opp.site_id,
        "project_id": opp.project_id,
        "page_id": opp.page_id,
        "page_url": opp.page_url,
        "keyword_id": opp.keyword_id,
        "keyword": opp.keyword,
        "evidence": opp.evidence,
        "source_data": opp.source_data,
        "estimated_impact": opp.estimated_impact,
        "confidence": opp.confidence,
        "recommended_action": opp.recommended_action,
        "effort": opp.effort,
        "priority_score": opp.priority_score,
        "score_inputs": opp.score_inputs,
        "status": _enum_val(opp.status),
        "data_timestamp": opp.data_timestamp,
        "created_at": opp.created_at,
        "updated_at": opp.updated_at,
    }


def _brief_out(bid: str, brief) -> dict:
    return {
        "id": bid,
        "tenant_id": brief.tenant_id,
        "site_id": brief.site_id,
        "project_id": brief.project_id,
        "cluster_id": brief.cluster_id,
        "primary_keyword": brief.primary_keyword,
        "secondary_keywords": brief.secondary_keywords,
        "search_intent": brief.search_intent,
        "target_audience": brief.target_audience,
        "title_options": brief.title_options,
        "meta_direction": brief.meta_direction,
        "word_count_min": brief.word_count_min,
        "word_count_max": brief.word_count_max,
        "outline": brief.outline,
        "questions": brief.questions,
        "entities": brief.entities,
        "competitor_headings": brief.competitor_headings,
        "internal_links": brief.internal_links,
        "schema_recommendation": brief.schema_recommendation,
        "cta_direction": brief.cta_direction,
        "source_data": brief.source_data,
        "status": _enum_val(brief.status),
        "version": brief.version,
        "handoff_ref": brief.handoff_ref,
        "created_at": brief.created_at,
        "updated_at": brief.updated_at,
    }


def _alert_out(aid: str, alert) -> dict:
    return {
        "id": aid,
        "site_id": alert.site_id,
        "project_id": alert.project_id,
        "alert_type": alert.alert_type,
        "severity": _enum_val(alert.severity),
        "title": alert.title,
        "message": alert.message,
        "evidence": alert.evidence,
        "data_source": alert.data_source,
        "affected_item_type": alert.affected_item_type,
        "affected_item_id": alert.affected_item_id,
        "affected_url": alert.affected_url,
        "status": _enum_val(alert.status),
        "read_at": alert.read_at,
        "created_at": alert.created_at,
        "updated_at": alert.updated_at,
    }


def _limit_exceeded(exc: SeoLimitExceeded):
    raise HTTPException(status_code=429, detail={
        "error": "seo_limit_exceeded",
        **exc.result,
    })


# ── Pydantic request bodies ───────────────────────────────────────────────────

class _Base(BaseModel):
    model_config = {"extra": "ignore"}


class _Tenanted(_Base):
    tenant_id: str = Field(default="")


class CreateCompetitorBody(_Tenanted):
    project_id: str
    domain: str
    site_id: str = ""
    display_name: str = ""
    country: str = "us"
    language: str = "en"
    notes: str = ""


class PatchCompetitorBody(_Tenanted):
    display_name: Optional[str] = None
    country: Optional[str] = None
    language: Optional[str] = None
    notes: Optional[str] = None
    tracking_status: Optional[str] = None


class RecordSnapshotBody(_Tenanted):
    project_id: str
    date: str
    visibility_score: float = 0.0
    tracked_keywords: int = 0
    keywords_ranked: int = 0
    avg_position: float = 0.0
    top_pages: List[dict] = Field(default_factory=list)
    provider: str = ""
    is_estimate: bool = False


class GenerateOpportunitiesBody(_Tenanted):
    site_id: str
    project_id: str
    data_timestamp: str = ""


class GenerateBriefBody(_Tenanted):
    project_id: str
    site_id: str
    primary_keyword: str
    secondary_keywords: List[str] = Field(default_factory=list)
    cluster_id: str = ""
    search_intent: str = ""
    target_audience: str = ""
    word_count_min: int = 800
    word_count_max: int = 2000
    cta_direction: str = ""


class PatchBriefBody(_Tenanted):
    primary_keyword: Optional[str] = None
    secondary_keywords: Optional[List[str]] = None
    search_intent: Optional[str] = None
    target_audience: Optional[str] = None
    title_options: Optional[List[str]] = None
    meta_direction: Optional[str] = None
    word_count_min: Optional[int] = None
    word_count_max: Optional[int] = None
    outline: Optional[List[dict]] = None
    questions: Optional[List[str]] = None
    entities: Optional[List[str]] = None
    cta_direction: Optional[str] = None


class BriefHandoffBody(_Tenanted):
    save: bool = False
    execute: bool = False


class GenerateAlertsBody(_Tenanted):
    site_id: str
    project_id: str = ""
    data_timestamp: str = ""


class OptimiseAIBody(_Tenanted):
    site_id: str
    project_id: str = ""
    page_id: str = ""
    page_url: str = ""
    keyword: str = ""


# ── Competitors ───────────────────────────────────────────────────────────────

@router.post("/competitors")
def create_competitor_endpoint(
    body: CreateCompetitorBody,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
) -> dict:
    tenant = effective_tenant(_header_tenant, body.tenant_id)
    try:
        cid, comp = create_competitor(
            tenant, body.project_id, body.domain,
            site_id=body.site_id, display_name=body.display_name,
            country=body.country, language=body.language, notes=body.notes,
        )
    except SeoLimitExceeded as exc:
        _limit_exceeded(exc)
    return {"competitor": _competitor_out(cid, comp)}


@router.get("/competitors")
def list_competitors_endpoint(
    project_id: str = Query(..., min_length=1),
    tenant: str = Depends(resolve_tenant),
) -> dict:
    pairs = list_competitors(tenant, project_id)
    return {"competitors": [_competitor_out(cid, c) for cid, c in pairs]}


@router.get("/competitors/gap")
def competitor_gap_endpoint(
    project_id: str = Query(..., min_length=1),
    competitor_domain: str = Query(..., min_length=1),
    min_volume: int = Query(default=100, ge=0),
    tenant: str = Depends(resolve_tenant),
) -> dict:
    gaps = keyword_gap(tenant, project_id, competitor_domain, min_volume=min_volume)
    overlap = keyword_overlap(tenant, project_id, competitor_domain)
    top_pages_list = []
    # Find competitor_id for this domain
    pairs = list_competitors(tenant, project_id)
    for cid, comp in pairs:
        if comp.domain == competitor_domain:
            top_pages_list = competitor_top_pages(tenant, cid)
            break
    return {
        "keyword_gap": gaps,
        "keyword_overlap": overlap,
        "competitor_top_pages": top_pages_list,
    }


@router.get("/competitors/{competitor_id}")
def get_competitor_endpoint(
    competitor_id: str,
    tenant: str = Depends(resolve_tenant),
) -> dict:
    result = get_competitor(tenant, competitor_id)
    if not result:
        raise HTTPException(status_code=404, detail={"error": "competitor_not_found"})
    cid, comp = result
    return {"competitor": _competitor_out(cid, comp)}


@router.patch("/competitors/{competitor_id}")
def patch_competitor_endpoint(
    competitor_id: str,
    body: PatchCompetitorBody,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
) -> dict:
    tenant = effective_tenant(_header_tenant, body.tenant_id)
    fields = {}
    if body.display_name is not None:
        fields["display_name"] = body.display_name
    if body.country is not None:
        fields["country"] = body.country
    if body.language is not None:
        fields["language"] = body.language
    if body.notes is not None:
        fields["notes"] = body.notes
    if body.tracking_status is not None:
        try:
            fields["tracking_status"] = TrackingStatus(body.tracking_status)
        except ValueError:
            raise HTTPException(status_code=422, detail={"error": "invalid_tracking_status"})
    result = update_competitor(tenant, competitor_id, **fields)
    if not result:
        raise HTTPException(status_code=404, detail={"error": "competitor_not_found"})
    cid, comp = result
    return {"competitor": _competitor_out(cid, comp)}


@router.delete("/competitors/{competitor_id}")
def delete_competitor_endpoint(
    competitor_id: str,
    tenant: str = Depends(resolve_tenant),
) -> dict:
    if not get_competitor(tenant, competitor_id):
        raise HTTPException(status_code=404, detail={"error": "competitor_not_found"})
    remove_competitor(tenant, competitor_id)
    return {"deleted": competitor_id}


@router.post("/competitors/{competitor_id}/snapshot")
def record_snapshot_endpoint(
    competitor_id: str,
    body: RecordSnapshotBody,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
) -> dict:
    tenant = effective_tenant(_header_tenant, body.tenant_id)
    if not get_competitor(tenant, competitor_id):
        raise HTTPException(status_code=404, detail={"error": "competitor_not_found"})
    snap_id, snap = record_snapshot(
        tenant, competitor_id, body.project_id,
        date=body.date, visibility_score=body.visibility_score,
        tracked_keywords=body.tracked_keywords, keywords_ranked=body.keywords_ranked,
        avg_position=body.avg_position, top_pages=body.top_pages,
        provider=body.provider, is_estimate=body.is_estimate,
    )
    return {"snapshot_id": snap_id, "is_estimate": snap.is_estimate}


# ── Opportunities ─────────────────────────────────────────────────────────────

@router.post("/opportunities/generate")
def generate_opportunities_endpoint(
    body: GenerateOpportunitiesBody,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
) -> dict:
    tenant = effective_tenant(_header_tenant, body.tenant_id)
    created = generate_opportunities(
        tenant, body.site_id, body.project_id, data_timestamp=body.data_timestamp
    )
    return {"created": len(created), "opportunities": [_opp_out(oid, o) for oid, o in created]}


@router.get("/opportunities")
def list_opportunities_endpoint(
    site_id: Optional[str] = Query(default=None),
    project_id: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    opp_type: Optional[str] = Query(default=None),
    tenant: str = Depends(resolve_tenant),
) -> dict:
    status_enum = None
    if status:
        try:
            status_enum = OpportunityStatus(status)
        except ValueError:
            raise HTTPException(status_code=422, detail={"error": "invalid_status"})
    pairs = list_opportunities(tenant, site_id=site_id, project_id=project_id,
                               status=status_enum, opp_type=opp_type)
    return {"opportunities": [_opp_out(oid, o) for oid, o in pairs]}


@router.get("/opportunities/{opp_id}")
def get_opportunity_endpoint(
    opp_id: str,
    tenant: str = Depends(resolve_tenant),
) -> dict:
    result = get_opportunity(tenant, opp_id)
    if not result:
        raise HTTPException(status_code=404, detail={"error": "opportunity_not_found"})
    oid, opp = result
    return {"opportunity": _opp_out(oid, opp)}


@router.post("/opportunities/{opp_id}/dismiss")
def dismiss_opportunity_endpoint(
    opp_id: str,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
    tenant_id: Optional[str] = Query(default=None),
) -> dict:
    tenant = effective_tenant(_header_tenant, tenant_id)
    result = dismiss_opportunity(tenant, opp_id)
    if not result:
        raise HTTPException(status_code=404, detail={"error": "opportunity_not_found"})
    oid, opp = result
    return {"opportunity": _opp_out(oid, opp)}


@router.post("/opportunities/{opp_id}/action")
def action_opportunity_endpoint(
    opp_id: str,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
    tenant_id: Optional[str] = Query(default=None),
) -> dict:
    tenant = effective_tenant(_header_tenant, tenant_id)
    result = action_opportunity(tenant, opp_id)
    if not result:
        raise HTTPException(status_code=404, detail={"error": "opportunity_not_found"})
    oid, opp = result
    return {"opportunity": _opp_out(oid, opp)}


@router.post("/opportunities/{opp_id}/explain")
def explain_opportunity_endpoint(
    opp_id: str,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
    tenant_id: Optional[str] = Query(default=None),
) -> dict:
    tenant = effective_tenant(_header_tenant, tenant_id)
    return explain_opportunity(tenant, opp_id, is_mock=True)


# ── Optimise workspace ────────────────────────────────────────────────────────

@router.get("/optimise")
def optimise_workspace_endpoint(
    site_id: str = Query(..., min_length=1),
    project_id: str = Query(default=""),
    page_id: str = Query(default=""),
    page_url: str = Query(default=""),
    keyword: str = Query(default=""),
    tenant: str = Depends(resolve_tenant),
) -> dict:
    workspace = assemble_workspace(
        tenant, site_id, project_id,
        page_id=page_id, page_url=page_url, keyword=keyword,
    )
    return {"workspace": workspace}


@router.post("/optimise/ai")
def optimise_ai_endpoint(
    body: OptimiseAIBody,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
) -> dict:
    tenant = effective_tenant(_header_tenant, body.tenant_id)
    workspace = assemble_workspace(
        tenant, body.site_id, body.project_id,
        page_id=body.page_id, page_url=body.page_url, keyword=body.keyword,
    )
    page_ref = body.page_url or body.page_id or "unknown"
    enriched = generate_ai_optimisations(workspace, tenant_id=tenant, page_ref=page_ref, is_mock=True)
    return {"workspace": enriched}


# ── Briefs ────────────────────────────────────────────────────────────────────

@router.post("/briefs/generate")
def generate_brief_endpoint(
    body: GenerateBriefBody,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
) -> dict:
    tenant = effective_tenant(_header_tenant, body.tenant_id)
    try:
        bid, brief = generate_brief(
            tenant, body.project_id, body.site_id,
            primary_keyword=body.primary_keyword,
            secondary_keywords=body.secondary_keywords,
            cluster_id=body.cluster_id,
            search_intent=body.search_intent,
            target_audience=body.target_audience,
            word_count_min=body.word_count_min,
            word_count_max=body.word_count_max,
            cta_direction=body.cta_direction,
            is_mock=True,
        )
    except SeoLimitExceeded as exc:
        _limit_exceeded(exc)
    return {"brief": _brief_out(bid, brief)}


@router.get("/briefs")
def list_briefs_endpoint(
    site_id: Optional[str] = Query(default=None),
    project_id: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    tenant: str = Depends(resolve_tenant),
) -> dict:
    status_enum = None
    if status:
        try:
            status_enum = BriefStatus(status)
        except ValueError:
            raise HTTPException(status_code=422, detail={"error": "invalid_status"})
    pairs = list_briefs(tenant, site_id=site_id, project_id=project_id, status=status_enum)
    return {"briefs": [_brief_out(bid, b) for bid, b in pairs]}


@router.get("/briefs/{brief_id}")
def get_brief_endpoint(
    brief_id: str,
    tenant: str = Depends(resolve_tenant),
) -> dict:
    result = get_brief(tenant, brief_id)
    if not result:
        raise HTTPException(status_code=404, detail={"error": "brief_not_found"})
    bid, brief = result
    return {"brief": _brief_out(bid, brief)}


@router.patch("/briefs/{brief_id}")
def patch_brief_endpoint(
    brief_id: str,
    body: PatchBriefBody,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
) -> dict:
    tenant = effective_tenant(_header_tenant, body.tenant_id)
    fields = {
        k: v for k, v in body.model_dump(exclude={"tenant_id"}).items()
        if v is not None
    }
    result = edit_brief(tenant, brief_id, **fields)
    if not result:
        raise HTTPException(status_code=404, detail={"error": "brief_not_found"})
    bid, brief = result
    return {"brief": _brief_out(bid, brief)}


@router.post("/briefs/{brief_id}/approve")
def approve_brief_endpoint(
    brief_id: str,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
    tenant_id: Optional[str] = Query(default=None),
) -> dict:
    tenant = effective_tenant(_header_tenant, tenant_id)
    result = approve_brief(tenant, brief_id)
    if not result:
        raise HTTPException(status_code=404, detail={"error": "brief_not_found"})
    bid, brief = result
    return {"brief": _brief_out(bid, brief)}


@router.post("/briefs/{brief_id}/archive")
def archive_brief_endpoint(
    brief_id: str,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
    tenant_id: Optional[str] = Query(default=None),
) -> dict:
    tenant = effective_tenant(_header_tenant, tenant_id)
    result = archive_brief(tenant, brief_id)
    if not result:
        raise HTTPException(status_code=404, detail={"error": "brief_not_found"})
    bid, brief = result
    return {"brief": _brief_out(bid, brief)}


@router.post("/briefs/{brief_id}/duplicate")
def duplicate_brief_endpoint(
    brief_id: str,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
    tenant_id: Optional[str] = Query(default=None),
) -> dict:
    tenant = effective_tenant(_header_tenant, tenant_id)
    try:
        result = duplicate_brief(tenant, brief_id)
    except SeoLimitExceeded as exc:
        _limit_exceeded(exc)
    if not result:
        raise HTTPException(status_code=404, detail={"error": "brief_not_found"})
    bid, brief = result
    return {"brief": _brief_out(bid, brief)}


@router.get("/briefs/{brief_id}/export")
def export_brief_endpoint(
    brief_id: str,
    fmt: str = Query(default="dict"),
    tenant: str = Depends(resolve_tenant),
) -> dict:
    result = export_brief(tenant, brief_id, fmt=fmt)
    if not result:
        raise HTTPException(status_code=404, detail={"error": "brief_not_found"})
    return {"export": result}


@router.post("/briefs/{brief_id}/handoff")
def brief_handoff_endpoint(
    brief_id: str,
    body: BriefHandoffBody,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
) -> dict:
    tenant = effective_tenant(_header_tenant, body.tenant_id)
    try:
        payload = handoff_from_brief(tenant, brief_id, save=body.save)
    except ValueError as exc:
        msg = str(exc)
        if "cross_tenant" in msg:
            raise HTTPException(status_code=403, detail={"error": "cross_tenant_handoff_rejected"})
        raise HTTPException(status_code=404, detail={"error": "brief_not_found", "detail": msg})

    if body.execute:
        result = execute_handoff(payload, is_mock=True)
        # If in-process execution succeeded and returned a doc id, store it
        if result.get("executed_in_process") and not result.get("requires_http_forward"):
            variations = result.get("result", {}).get("variations", [])
            doc_ref = variations[0].get("title", "") if variations else ""
            if doc_ref:
                record_handoff_on_brief(tenant, brief_id, doc_ref)
        return {"handoff": result}

    return {"payload": payload}


# ── Alerts ────────────────────────────────────────────────────────────────────

@router.post("/alerts/generate")
def generate_alerts_endpoint(
    body: GenerateAlertsBody,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
) -> dict:
    tenant = effective_tenant(_header_tenant, body.tenant_id)
    created = generate_alerts(
        tenant, body.site_id, body.project_id, data_timestamp=body.data_timestamp
    )
    return {"created": len(created), "alerts": [_alert_out(aid, a) for aid, a in created]}


@router.get("/alerts")
def list_alerts_endpoint(
    site_id: Optional[str] = Query(default=None),
    project_id: Optional[str] = Query(default=None),
    severity: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    alert_type: Optional[str] = Query(default=None),
    tenant: str = Depends(resolve_tenant),
) -> dict:
    sev_enum = None
    if severity:
        try:
            sev_enum = Severity(severity)
        except ValueError:
            raise HTTPException(status_code=422, detail={"error": "invalid_severity"})

    status_enum = None
    if status:
        try:
            status_enum = AlertStatus(status)
        except ValueError:
            raise HTTPException(status_code=422, detail={"error": "invalid_status"})

    pairs = list_alerts(
        tenant, site_id=site_id, project_id=project_id,
        severity=sev_enum, status=status_enum, alert_type=alert_type,
    )
    return {"alerts": [_alert_out(aid, a) for aid, a in pairs]}


@router.post("/alerts/{alert_id}/read")
def mark_alert_read_endpoint(
    alert_id: str,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
    tenant_id: Optional[str] = Query(default=None),
) -> dict:
    tenant = effective_tenant(_header_tenant, tenant_id)
    result = mark_read(tenant, alert_id)
    if not result:
        raise HTTPException(status_code=404, detail={"error": "alert_not_found"})
    aid, alert = result
    return {"alert": _alert_out(aid, alert)}


@router.post("/alerts/{alert_id}/dismiss")
def dismiss_alert_endpoint(
    alert_id: str,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
    tenant_id: Optional[str] = Query(default=None),
) -> dict:
    tenant = effective_tenant(_header_tenant, tenant_id)
    result = dismiss_alert(tenant, alert_id)
    if not result:
        raise HTTPException(status_code=404, detail={"error": "alert_not_found"})
    aid, alert = result
    return {"alert": _alert_out(aid, alert)}
