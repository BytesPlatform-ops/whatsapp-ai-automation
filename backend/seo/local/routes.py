"""Local SEO API routes — all endpoints under /api/agents/seo.

Router: APIRouter(prefix="/api/agents/seo", tags=["seo-local"])

Tenant resolution mirrors seo/agent_routes.py:
  from ..tenant import effective_tenant, resolve_tenant, resolve_tenant_header

All endpoints are tenant-scoped.  No cross-tenant data is accessible.
"""

from __future__ import annotations

import csv
import io
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Header
from pydantic import BaseModel

from seo.tenant import effective_tenant, resolve_tenant, resolve_tenant_header
from seo.local.stores import (
    CitationStatus,
    ClaimedStatus,
    GbpConnStatus,
    PostType,
    PostStatus,
    SchemaStatus,
    reset_repositories,
)

_log = logging.getLogger("pixie.seo.local.routes")

router = APIRouter(prefix="/api/agents/seo", tags=["seo-local"])


# ── Request body models ────────────────────────────────────────────────────────

class CreateLocationBody(BaseModel):
    tenant_id: Optional[str] = None
    site_id: str = ""
    business_name: str
    address_line1: str = ""
    address_line2: str = ""
    city: str = ""
    region: str = ""
    postal_code: str = ""
    country: str = "US"
    phone: str = ""
    website_url: str = ""
    primary_category: str = ""
    secondary_categories: List[str] = []
    service_areas: List[str] = []
    hours: Dict = {}
    lat: Optional[float] = None
    lng: Optional[float] = None
    local_page_url: str = ""


class PatchLocationBody(BaseModel):
    tenant_id: Optional[str] = None
    business_name: Optional[str] = None
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    region: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None
    phone: Optional[str] = None
    website_url: Optional[str] = None
    primary_category: Optional[str] = None
    secondary_categories: Optional[List[str]] = None
    service_areas: Optional[List[str]] = None
    hours: Optional[Dict] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    local_page_url: Optional[str] = None


class GbpCallbackBody(BaseModel):
    tenant_id: Optional[str] = None
    state: str
    code: str


class GbpSelectLocationBody(BaseModel):
    tenant_id: Optional[str] = None
    connection_id: str
    gbp_location_name: str
    pixie_location_id: str


class GbpSyncBody(BaseModel):
    tenant_id: Optional[str] = None
    connection_id: str
    location_id: str


class ReviewDraftBody(BaseModel):
    tenant_id: Optional[str] = None
    custom_context: str = ""
    is_mock: bool = True


class ReviewEditBody(BaseModel):
    tenant_id: Optional[str] = None
    new_text: str


class ReviewApproveBody(BaseModel):
    tenant_id: Optional[str] = None
    approved_by: str = ""


class ReviewAssignBody(BaseModel):
    tenant_id: Optional[str] = None
    assigned_to: str


class CitationBody(BaseModel):
    tenant_id: Optional[str] = None
    directory: str
    directory_url: str = ""
    listing_url: str = ""
    business_name: str = ""
    address: str = ""
    phone: str = ""
    website: str = ""
    category: str = ""
    status: str = "pending"
    claimed: str = "unknown"
    notes: str = ""


class CitationCheckBody(BaseModel):
    tenant_id: Optional[str] = None
    is_mock: bool = True


class LocalRankCheckBody(BaseModel):
    tenant_id: Optional[str] = None
    location_id: str
    keywords: List[str]
    city: str = ""
    postal_code: str = ""
    device: str = "desktop"
    is_mock: bool = True
    geo_grid: bool = False


class CompetitorBody(BaseModel):
    tenant_id: Optional[str] = None
    location_id: str
    business_name: str
    domain: str = ""
    gbp_profile_url: str = ""
    address: str = ""
    category: str = ""
    rating: Optional[float] = None
    review_count: int = 0
    notes: str = ""


class LocationPageHandoffBody(BaseModel):
    tenant_id: Optional[str] = None
    location_id: str
    target_city: str
    primary_keyword: str
    supporting_keywords: List[str] = []
    schema_rec: str = "LocalBusiness"
    save: bool = False


class ProposeSchemaBody(BaseModel):
    tenant_id: Optional[str] = None
    location_id: str
    schema_type: str = "LocalBusiness"
    service_areas: List[str] = []
    same_as_urls: List[str] = []
    service_names: List[str] = []
    policy_compliant_rating: bool = False
    aggregate_rating: Optional[Dict] = None
    notes: str = ""


class ApproveSchemaBody(BaseModel):
    tenant_id: Optional[str] = None
    approved_by: str = ""


class NapConfirmVariantBody(BaseModel):
    tenant_id: Optional[str] = None
    confirmed_by: str = ""


# ── Location CRUD ──────────────────────────────────────────────────────────────

@router.post("/locations")
def create_location(
    body: CreateLocationBody,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
) -> dict:
    from seo.local.locations import create_location as _create, _safe_location_dict
    from seo.metering_search import SeoLimitExceeded
    tenant = effective_tenant(_header_tenant, body.tenant_id)
    try:
        loc_id, loc = _create(
            tenant,
            body.site_id,
            body.business_name,
            address_line1=body.address_line1,
            address_line2=body.address_line2,
            city=body.city,
            region=body.region,
            postal_code=body.postal_code,
            country=body.country,
            phone=body.phone,
            website_url=body.website_url,
            primary_category=body.primary_category,
            secondary_categories=body.secondary_categories,
            service_areas=body.service_areas,
            hours=body.hours,
            lat=body.lat,
            lng=body.lng,
            local_page_url=body.local_page_url,
        )
        return {"location": _safe_location_dict(loc_id, loc)}
    except SeoLimitExceeded as exc:
        raise HTTPException(status_code=402, detail={"error": "limit_exceeded", "detail": str(exc)}) from exc


@router.get("/locations")
def list_locations(
    site_id: Optional[str] = Query(default=None),
    include_archived: bool = Query(default=False),
    tenant: str = Depends(resolve_tenant),
) -> dict:
    from seo.local.locations import list_locations as _list, _safe_location_dict
    rows = _list(tenant, site_id=site_id, include_archived=include_archived)
    return {"locations": [_safe_location_dict(lid, loc) for lid, loc in rows]}


@router.get("/locations/{location_id}")
def get_location(
    location_id: str,
    tenant: str = Depends(resolve_tenant),
) -> dict:
    from seo.local.locations import get_location as _get, _safe_location_dict
    result = _get(tenant, location_id)
    if result is None:
        raise HTTPException(status_code=404, detail="location not found")
    lid, loc = result
    return {"location": _safe_location_dict(lid, loc)}


@router.patch("/locations/{location_id}")
def update_location(
    location_id: str,
    body: PatchLocationBody,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
) -> dict:
    from seo.local.locations import update_location as _update, _safe_location_dict
    tenant = effective_tenant(_header_tenant, body.tenant_id)
    fields = {k: v for k, v in body.model_dump().items() if k != "tenant_id" and v is not None}
    result = _update(tenant, location_id, **fields)
    if result is None:
        raise HTTPException(status_code=404, detail="location not found")
    lid, loc = result
    return {"location": _safe_location_dict(lid, loc)}


@router.post("/locations/{location_id}/archive")
def archive_location(
    location_id: str,
    tenant: str = Depends(resolve_tenant),
) -> dict:
    from seo.local.locations import archive_location as _archive, _safe_location_dict
    result = _archive(tenant, location_id)
    if result is None:
        raise HTTPException(status_code=404, detail="location not found")
    lid, loc = result
    return {"location": _safe_location_dict(lid, loc)}


@router.post("/locations/{location_id}/restore")
def restore_location(
    location_id: str,
    tenant: str = Depends(resolve_tenant),
) -> dict:
    from seo.local.locations import restore_location as _restore, _safe_location_dict
    result = _restore(tenant, location_id)
    if result is None:
        raise HTTPException(status_code=404, detail="location not found")
    lid, loc = result
    return {"location": _safe_location_dict(lid, loc)}


@router.delete("/locations/{location_id}")
def delete_location(
    location_id: str,
    tenant: str = Depends(resolve_tenant),
) -> dict:
    from seo.local.locations import delete_location as _delete
    deleted = _delete(tenant, location_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="location not found")
    return {"deleted": location_id}


# ── GBP OAuth + sync ───────────────────────────────────────────────────────────

@router.get("/gbp/connect")
def gbp_connect_start(
    tenant: str = Depends(resolve_tenant),
) -> dict:
    from seo.local.gbp import start_gbp_connect, GbpConnectionError
    try:
        return start_gbp_connect(tenant)
    except GbpConnectionError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/gbp/callback")
def gbp_callback(
    body: GbpCallbackBody,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
) -> dict:
    from seo.local.gbp import complete_gbp_connect, GbpConnectionError, _safe_connection_dict
    from seo.google.oauth import OAuthStateError
    from seo.metering_search import SeoLimitExceeded
    tenant = effective_tenant(_header_tenant, body.tenant_id)
    try:
        conn_id, conn = complete_gbp_connect(body.state, body.code)
        return {"connection": _safe_connection_dict(conn_id, conn)}
    except OAuthStateError as exc:
        raise HTTPException(status_code=400, detail={"error": "invalid_state", "message": str(exc)}) from exc
    except (GbpConnectionError, SeoLimitExceeded) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/gbp/connections")
def list_gbp_connections(
    tenant: str = Depends(resolve_tenant),
) -> dict:
    from seo.local.gbp import list_connections, _safe_connection_dict
    conns = list_connections(tenant)
    return {"connections": [_safe_connection_dict(cid, c) for cid, c in conns]}


@router.get("/gbp/connections/{connection_id}/accounts")
def list_gbp_accounts(
    connection_id: str,
    tenant: str = Depends(resolve_tenant),
) -> dict:
    from seo.local.gbp import list_gbp_accounts, GbpConnectionError
    try:
        return {"accounts": list_gbp_accounts(tenant, connection_id)}
    except GbpConnectionError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/gbp/connections/{connection_id}/accounts/{account_name:path}/locations")
def list_gbp_locations(
    connection_id: str,
    account_name: str,
    tenant: str = Depends(resolve_tenant),
) -> dict:
    from seo.local.gbp import list_gbp_locations, GbpConnectionError
    try:
        return {"locations": list_gbp_locations(tenant, connection_id, account_name)}
    except GbpConnectionError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/gbp/map-location")
def map_gbp_location(
    body: GbpSelectLocationBody,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
) -> dict:
    from seo.local.gbp import map_gbp_location_to_pixie, GbpConnectionError, GbpCrossWorkspaceError
    tenant = effective_tenant(_header_tenant, body.tenant_id)
    try:
        return map_gbp_location_to_pixie(
            tenant,
            body.connection_id,
            body.gbp_location_name,
            body.pixie_location_id,
        )
    except GbpCrossWorkspaceError as exc:
        raise HTTPException(status_code=403, detail={"error": "cross_workspace", "message": str(exc)}) from exc
    except GbpConnectionError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/gbp/sync")
def gbp_sync(
    body: GbpSyncBody,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
) -> dict:
    from seo.local.gbp import run_gbp_sync, GbpConnectionError
    tenant = effective_tenant(_header_tenant, body.tenant_id)
    try:
        return run_gbp_sync(tenant, body.connection_id, body.location_id)
    except GbpConnectionError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/gbp/connections/{connection_id}/refresh")
def refresh_gbp_connection(
    connection_id: str,
    tenant: str = Depends(resolve_tenant),
) -> dict:
    from seo.local.gbp import refresh_connection, GbpConnectionError
    try:
        return refresh_connection(tenant, connection_id)
    except GbpConnectionError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/gbp/connections/{connection_id}")
def disconnect_gbp(
    connection_id: str,
    tenant: str = Depends(resolve_tenant),
) -> dict:
    from seo.local.gbp import disconnect_gbp as _disconnect, GbpConnectionError
    try:
        return _disconnect(tenant, connection_id)
    except GbpConnectionError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


# ── Reviews ────────────────────────────────────────────────────────────────────

@router.get("/locations/{location_id}/reviews")
def list_reviews(
    location_id: str,
    handled: Optional[bool] = Query(default=None),
    min_rating: Optional[int] = Query(default=None),
    max_rating: Optional[int] = Query(default=None),
    tenant: str = Depends(resolve_tenant),
) -> dict:
    from seo.local.reviews import list_reviews as _list, get_review_workspace
    workspace = get_review_workspace(tenant, location_id)
    reviews = _list(tenant, location_id, handled=handled, min_rating=min_rating, max_rating=max_rating)
    return {
        "workspace": workspace,
        "reviews": [
            {
                "id": rid,
                "reviewer_display_name": r.reviewer_display_name,
                "rating": r.rating,
                "review_text": r.review_text,
                "created_at": r.created_at,
                "reply_text": r.reply_text,
                "reply_status": r.reply_status.value if hasattr(r.reply_status, "value") else r.reply_status,
                "handled": r.handled,
                "sentiment": r.sentiment,
                "themes": r.themes,
                "assigned_to": r.assigned_to,
            }
            for rid, r in reviews
        ],
    }


@router.post("/locations/{location_id}/reviews/ingest")
def ingest_reviews(
    location_id: str,
    connection_id: str = Query(...),
    is_mock: bool = Query(default=True),
    tenant: str = Depends(resolve_tenant),
) -> dict:
    from seo.local.reviews import ingest_reviews as _ingest
    from seo.local.gbp import GbpConnectionError
    try:
        return _ingest(tenant, location_id, connection_id, is_mock=is_mock)
    except GbpConnectionError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/reviews/{review_id}/draft")
def draft_review_response(
    review_id: str,
    body: ReviewDraftBody,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
) -> dict:
    from seo.local.reviews import draft_review_response as _draft
    tenant = effective_tenant(_header_tenant, body.tenant_id)
    return _draft(tenant, review_id, custom_context=body.custom_context, is_mock=body.is_mock)


@router.patch("/reviews/{review_id}/draft")
def edit_review_response(
    review_id: str,
    body: ReviewEditBody,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
) -> dict:
    from seo.local.reviews import edit_review_response as _edit
    tenant = effective_tenant(_header_tenant, body.tenant_id)
    result = _edit(tenant, review_id, body.new_text)
    if result is None:
        raise HTTPException(status_code=404, detail="review not found")
    rid, rev = result
    return {"review_id": rid, "reply_text": rev.reply_text, "reply_status": rev.reply_status.value}


@router.post("/reviews/{review_id}/approve")
def approve_review_response(
    review_id: str,
    body: ReviewApproveBody,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
) -> dict:
    from seo.local.reviews import approve_review_response as _approve
    tenant = effective_tenant(_header_tenant, body.tenant_id)
    return _approve(tenant, review_id, approved_by=body.approved_by)


@router.post("/reviews/{review_id}/handled")
def mark_review_handled(
    review_id: str,
    tenant: str = Depends(resolve_tenant),
) -> dict:
    from seo.local.reviews import mark_review_handled as _handled
    result = _handled(tenant, review_id)
    if result is None:
        raise HTTPException(status_code=404, detail="review not found")
    return {"review_id": review_id, "handled": True}


@router.post("/reviews/{review_id}/assign")
def assign_review(
    review_id: str,
    body: ReviewAssignBody,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
) -> dict:
    from seo.local.reviews import assign_review as _assign
    tenant = effective_tenant(_header_tenant, body.tenant_id)
    result = _assign(tenant, review_id, body.assigned_to)
    if result is None:
        raise HTTPException(status_code=404, detail="review not found")
    return {"review_id": review_id, "assigned_to": body.assigned_to}


# ── NAP Audit ─────────────────────────────────────────────────────────────────

@router.post("/locations/{location_id}/nap/audit")
def run_nap_audit(
    location_id: str,
    tenant: str = Depends(resolve_tenant),
) -> dict:
    from seo.local.nap import run_nap_audit as _audit, get_nap_summary
    results = _audit(tenant, location_id)
    summary = get_nap_summary(tenant, location_id)
    return {"location_id": location_id, "summary": summary, "results": results}


@router.get("/locations/{location_id}/nap")
def get_nap_summary(
    location_id: str,
    tenant: str = Depends(resolve_tenant),
) -> dict:
    from seo.local.nap import get_nap_summary as _summary
    return _summary(tenant, location_id)


@router.post("/nap/{audit_id}/confirm-variant")
def confirm_nap_variant(
    audit_id: str,
    body: NapConfirmVariantBody,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
) -> dict:
    from seo.local.nap import confirm_variant
    tenant = effective_tenant(_header_tenant, body.tenant_id)
    result = confirm_variant(tenant, audit_id, confirmed_by=body.confirmed_by)
    if result is None:
        raise HTTPException(status_code=404, detail="nap audit not found")
    aid, audit = result
    return {"audit_id": aid, "confirmed_variant": audit.confirmed_variant}


# ── Citations ─────────────────────────────────────────────────────────────────

@router.get("/locations/{location_id}/citations")
def list_citations(
    location_id: str,
    status: Optional[str] = Query(default=None),
    tenant: str = Depends(resolve_tenant),
) -> dict:
    from seo.local.citations import list_citations as _list, detect_missing, detect_duplicates
    status_enum = None
    if status:
        try:
            status_enum = CitationStatus(status)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid status: {status}")
    rows = _list(tenant, location_id, status=status_enum)
    missing = detect_missing(tenant, location_id)
    duplicates = detect_duplicates(tenant, location_id)
    return {
        "citations": [
            {
                "id": cid,
                "directory": c.directory,
                "listing_url": c.listing_url,
                "status": c.status.value,
                "claimed": c.claimed.value,
                "consistency": c.consistency,
                "last_checked": c.last_checked,
            }
            for cid, c in rows
        ],
        "missing_directories": missing,
        "duplicates": duplicates,
    }


@router.post("/locations/{location_id}/citations")
def add_citation(
    location_id: str,
    body: CitationBody,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
) -> dict:
    from seo.local.citations import add_citation as _add
    tenant = effective_tenant(_header_tenant, body.tenant_id)
    try:
        status = CitationStatus(body.status)
    except ValueError:
        status = CitationStatus.PENDING
    try:
        claimed = ClaimedStatus(body.claimed)
    except ValueError:
        claimed = ClaimedStatus.UNKNOWN
    cid, cit = _add(
        tenant, location_id, body.directory,
        directory_url=body.directory_url,
        listing_url=body.listing_url,
        business_name=body.business_name,
        address=body.address,
        phone=body.phone,
        website=body.website,
        category=body.category,
        status=status,
        claimed=claimed,
        notes=body.notes,
    )
    return {"citation_id": cid, "directory": cit.directory, "status": cit.status.value}


@router.delete("/citations/{citation_id}")
def delete_citation(
    citation_id: str,
    tenant: str = Depends(resolve_tenant),
) -> dict:
    from seo.local.citations import delete_citation as _delete
    deleted = _delete(tenant, citation_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="citation not found")
    return {"deleted": citation_id}


@router.get("/locations/{location_id}/citations/export")
def export_citations(
    location_id: str,
    tenant: str = Depends(resolve_tenant),
) -> dict:
    from seo.local.citations import export_citations_csv
    csv_text = export_citations_csv(tenant, location_id)
    return {"csv": csv_text, "location_id": location_id}


@router.post("/locations/{location_id}/citations/import")
async def import_citations(
    location_id: str,
    tenant: str = Depends(resolve_tenant),
    skip_duplicates: bool = Query(default=True),
    csv_text: str = "",
) -> dict:
    from seo.local.citations import import_citations_csv
    return import_citations_csv(tenant, location_id, csv_text, skip_duplicates=skip_duplicates)


@router.post("/citations/{citation_id}/check")
def check_citation(
    citation_id: str,
    body: CitationCheckBody,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
) -> dict:
    from seo.local.citations import check_citation as _check
    tenant = effective_tenant(_header_tenant, body.tenant_id)
    return _check(tenant, citation_id, is_mock=body.is_mock)


@router.post("/locations/{location_id}/citations/check-all")
def check_all_citations(
    location_id: str,
    body: CitationCheckBody,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
) -> dict:
    from seo.local.citations import check_all_citations as _check_all
    tenant = effective_tenant(_header_tenant, body.tenant_id)
    return _check_all(tenant, location_id, is_mock=body.is_mock)


# ── Local rank ────────────────────────────────────────────────────────────────

@router.post("/local-rank/check")
def local_rank_check(
    body: LocalRankCheckBody,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
) -> dict:
    from seo.local.local_rank import check_local_rank
    tenant = effective_tenant(_header_tenant, body.tenant_id)
    return check_local_rank(
        tenant,
        body.location_id,
        body.keywords,
        city=body.city,
        postal_code=body.postal_code,
        device=body.device,
        is_mock=body.is_mock,
        geo_grid=body.geo_grid,
    )


@router.get("/locations/{location_id}/local-rank/overview")
def local_rank_overview(
    location_id: str,
    tenant: str = Depends(resolve_tenant),
) -> dict:
    from seo.local.local_rank import get_rank_overview
    return get_rank_overview(tenant, location_id)


@router.get("/locations/{location_id}/local-rank/winners-losers")
def local_rank_winners_losers(
    location_id: str,
    top_n: int = Query(default=5),
    tenant: str = Depends(resolve_tenant),
) -> dict:
    from seo.local.local_rank import get_winners_losers
    return get_winners_losers(tenant, location_id, top_n=top_n)


@router.get("/locations/{location_id}/local-rank/pack-visibility")
def local_pack_visibility(
    location_id: str,
    tenant: str = Depends(resolve_tenant),
) -> dict:
    from seo.local.local_rank import get_local_pack_visibility
    return get_local_pack_visibility(tenant, location_id)


# ── Local competitors ─────────────────────────────────────────────────────────

@router.get("/locations/{location_id}/competitors")
def list_competitors(
    location_id: str,
    tenant: str = Depends(resolve_tenant),
) -> dict:
    from seo.local.competitors import list_competitors as _list
    rows = _list(tenant, location_id)
    return {
        "competitors": [
            {
                "id": cid,
                "business_name": c.business_name,
                "domain": c.domain,
                "category": c.category,
                "rating": c.rating,
                "review_count": c.review_count,
                "gbp_profile_url": c.gbp_profile_url,
            }
            for cid, c in rows
        ]
    }


@router.post("/locations/{location_id}/competitors")
def add_competitor(
    location_id: str,
    body: CompetitorBody,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
) -> dict:
    from seo.local.competitors import add_competitor as _add
    tenant = effective_tenant(_header_tenant, body.tenant_id)
    try:
        cid, comp = _add(
            tenant, location_id, body.business_name,
            domain=body.domain,
            gbp_profile_url=body.gbp_profile_url,
            address=body.address,
            category=body.category,
            rating=body.rating,
            review_count=body.review_count,
            notes=body.notes,
        )
        return {"competitor_id": cid, "business_name": comp.business_name}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/competitors/{comp_id}")
def delete_competitor(
    comp_id: str,
    tenant: str = Depends(resolve_tenant),
) -> dict:
    from seo.local.competitors import delete_competitor as _delete
    deleted = _delete(tenant, comp_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="competitor not found")
    return {"deleted": comp_id}


@router.get("/locations/{location_id}/opportunities")
def local_opportunities(
    location_id: str,
    tenant: str = Depends(resolve_tenant),
) -> dict:
    from seo.local.competitors import generate_local_opportunities
    opps = generate_local_opportunities(tenant, location_id)
    return {"location_id": location_id, "opportunities": opps}


@router.get("/locations/{location_id}/competitors/rank/{keyword}")
def competitor_rank_comparison(
    location_id: str,
    keyword: str,
    tenant: str = Depends(resolve_tenant),
) -> dict:
    from seo.local.competitors import get_competitor_rank_comparison
    return get_competitor_rank_comparison(tenant, location_id, keyword)


# ── Location-page opportunities ────────────────────────────────────────────────

@router.get("/locations/{location_id}/page-opportunities")
def location_page_opportunities(
    location_id: str,
    tenant: str = Depends(resolve_tenant),
) -> dict:
    from seo.local.location_pages import generate_location_page_opportunities
    opps = generate_location_page_opportunities(tenant, location_id)
    return {"location_id": location_id, "opportunities": opps}


@router.post("/location-pages/handoff")
def location_page_handoff(
    body: LocationPageHandoffBody,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
) -> dict:
    from seo.local.location_pages import handoff_location_page_to_content
    tenant = effective_tenant(_header_tenant, body.tenant_id)
    try:
        return handoff_location_page_to_content(
            tenant,
            body.location_id,
            body.target_city,
            body.primary_keyword,
            supporting_keywords=body.supporting_keywords,
            schema_rec=body.schema_rec,
            save=body.save,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


# ── Schema ────────────────────────────────────────────────────────────────────

@router.post("/locations/{location_id}/schema/propose")
def propose_schema(
    location_id: str,
    body: ProposeSchemaBody,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
) -> dict:
    from seo.local.schema import propose_schema as _propose
    tenant = effective_tenant(_header_tenant, body.tenant_id)
    return _propose(
        tenant,
        location_id,
        schema_type=body.schema_type,
        service_areas=body.service_areas,
        same_as_urls=body.same_as_urls,
        service_names=body.service_names,
        policy_compliant_rating=body.policy_compliant_rating,
        aggregate_rating=body.aggregate_rating,
        notes=body.notes,
    )


@router.get("/locations/{location_id}/schema")
def list_schemas(
    location_id: str,
    status: Optional[str] = Query(default=None),
    tenant: str = Depends(resolve_tenant),
) -> dict:
    from seo.local.schema import list_schemas as _list
    status_enum = None
    if status:
        try:
            status_enum = SchemaStatus(status)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid status: {status}")
    rows = _list(tenant, location_id, status=status_enum)
    return {
        "schemas": [
            {
                "id": sid,
                "schema_type": s.schema_type,
                "status": s.status.value,
                "approved_at": s.approved_at,
                "published_at": s.published_at,
                "recrawl_verified": s.recrawl_verified,
                "notes": s.notes,
            }
            for sid, s in rows
        ]
    }


@router.post("/schema/{schema_id}/approve")
def approve_schema(
    schema_id: str,
    body: ApproveSchemaBody,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
) -> dict:
    from seo.local.schema import approve_schema as _approve
    tenant = effective_tenant(_header_tenant, body.tenant_id)
    return _approve(tenant, schema_id, approved_by=body.approved_by)


@router.post("/schema/{schema_id}/published")
def mark_schema_published(
    schema_id: str,
    tenant: str = Depends(resolve_tenant),
) -> dict:
    from seo.local.schema import mark_published
    result = mark_published(tenant, schema_id)
    if result is None:
        raise HTTPException(status_code=404, detail="schema not found")
    sid, schema = result
    return {"schema_id": sid, "status": schema.status.value, "published_at": schema.published_at}


@router.get("/locations/{location_id}/schema/audit")
def schema_audit(
    location_id: str,
    tenant: str = Depends(resolve_tenant),
) -> dict:
    from seo.local.schema import audit_schema
    return audit_schema(tenant, location_id)
