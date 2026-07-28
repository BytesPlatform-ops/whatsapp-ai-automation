"""FastAPI router for the keyword-intelligence vertical.

Prefix:  /api/agents/seo
Tags:    seo-keywords

Tenant resolution mirrors agent_routes.py:
  GET routes: Depends(resolve_tenant) — header wins, then ?tenant_id, then "demo_tenant"
  POST/PATCH routes: Depends(resolve_tenant_header) + effective_tenant(header, body.tenant_id)

Endpoint index:

  Projects
    POST   /keywords/projects                          create_project
    GET    /keywords/projects                          list_projects
    GET    /keywords/projects/{project_id}             get_project
    PATCH  /keywords/projects/{project_id}             update_project
    POST   /keywords/projects/{project_id}/archive     archive_project

  Keywords
    POST   /keywords/projects/{pid}/keywords           add_keyword (single)
    POST   /keywords/projects/{pid}/keywords/bulk      bulk_add_keywords
    GET    /keywords/projects/{pid}/keywords           list_keywords (filters)
    GET    /keywords/projects/{pid}/keywords/{kid}     get_keyword
    PATCH  /keywords/projects/{pid}/keywords/{kid}     update_keyword
    DELETE /keywords/projects/{pid}/keywords/{kid}     delete_keyword
    POST   /keywords/projects/{pid}/keywords/{kid}/track  set_tracking_status

  CSV
    POST   /keywords/projects/{pid}/keywords/import    csv_import
    GET    /keywords/projects/{pid}/keywords/export    csv_export

  Research
    POST   /keywords/research                          research

  Clusters
    POST   /keywords/projects/{pid}/clusters/auto      auto_cluster
    GET    /keywords/projects/{pid}/clusters           list_clusters
    GET    /keywords/projects/{pid}/clusters/{cid}     get_cluster
    PATCH  /keywords/projects/{pid}/clusters/{cid}     patch_cluster (rename/assign)
    POST   /keywords/projects/{pid}/clusters/merge     merge_clusters
    POST   /keywords/projects/{pid}/clusters/{cid}/split  split_cluster

  Intent
    POST   /keywords/intent/classify                   classify_intent_batch
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from ..tenant import effective_tenant, resolve_tenant, resolve_tenant_header

# Sub-service imports.
from . import projects as proj_svc
from . import keyword_service as kw_svc
from . import csv_io
from . import research_service as res_svc
from . import clustering as clust_svc
from seo.metering_search import SeoLimitExceeded

router = APIRouter(prefix="/api/agents/seo", tags=["seo-keywords"])


# ── Request body models ────────────────────────────────────────────────────────

class CreateProjectBody(BaseModel):
    tenant_id: Optional[str] = None
    name: str
    site_id: str = ""
    country: str = "us"
    language: str = "en"
    search_engine: str = "google"
    location: str = ""
    device: str = "desktop"
    default_domain: str = ""
    competitors: List[str] = []


class PatchProjectBody(BaseModel):
    tenant_id: Optional[str] = None
    name: Optional[str] = None
    site_id: Optional[str] = None
    country: Optional[str] = None
    language: Optional[str] = None
    search_engine: Optional[str] = None
    location: Optional[str] = None
    device: Optional[str] = None
    default_domain: Optional[str] = None
    competitors: Optional[List[str]] = None


class ArchiveProjectBody(BaseModel):
    tenant_id: Optional[str] = None


class AddKeywordBody(BaseModel):
    tenant_id: Optional[str] = None
    keyword: str
    site_id: str = ""
    search_volume: Optional[int] = None
    cpc: Optional[float] = None
    competition: Optional[float] = None
    difficulty: Optional[int] = None
    intent: str = "unknown"
    trend: List[int] = []
    serp_features: List[str] = []
    target_page: str = ""
    data_provider: str = ""
    data_timestamp: str = ""
    tags: List[str] = []
    notes: str = ""
    tracking_status: str = "untracked"


class BulkAddKeywordsBody(BaseModel):
    tenant_id: Optional[str] = None
    text: str
    site_id: str = ""
    tags: List[str] = []


class PatchKeywordBody(BaseModel):
    tenant_id: Optional[str] = None
    tags: Optional[List[str]] = None
    target_page: Optional[str] = None
    notes: Optional[str] = None
    intent: Optional[str] = None
    tracking_status: Optional[str] = None
    search_volume: Optional[int] = None
    cpc: Optional[float] = None
    competition: Optional[float] = None
    difficulty: Optional[int] = None
    data_provider: Optional[str] = None
    data_timestamp: Optional[str] = None
    serp_features: Optional[List[str]] = None
    trend: Optional[List[int]] = None


class TrackKeywordBody(BaseModel):
    tenant_id: Optional[str] = None
    tracking_status: str = "tracked"


class CsvImportBody(BaseModel):
    tenant_id: Optional[str] = None
    csv_text: str
    tags: List[str] = []
    auto_add: bool = False   # if True, add all parsed keywords immediately


class ResearchBody(BaseModel):
    tenant_id: Optional[str] = None
    project_id: str
    seed_keyword: str
    domain: str = ""
    gsc_queries: List[str] = []
    competitor_domain: str = ""
    country: str = "us"
    language: str = "en"
    location: str = ""
    device: str = "desktop"
    # Filters.
    volume_min: Optional[int] = None
    volume_max: Optional[int] = None
    difficulty_min: Optional[int] = None
    difficulty_max: Optional[int] = None
    cpc_min: Optional[float] = None
    cpc_max: Optional[float] = None
    intent: Optional[str] = None
    length_min: Optional[int] = None
    length_max: Optional[int] = None
    include_words: Optional[List[str]] = None
    exclude_words: Optional[List[str]] = None
    questions_only: bool = False
    unranked_only: bool = False
    content_gap_only: bool = False
    # Actions.
    add_selected: Optional[List[str]] = None     # keyword strings to add immediately
    track_keyword_ids: Optional[List[str]] = None


class AutoClusterBody(BaseModel):
    tenant_id: Optional[str] = None
    ai_assist: bool = False


class PatchClusterBody(BaseModel):
    tenant_id: Optional[str] = None
    name: Optional[str] = None
    primary_keyword: Optional[str] = None
    target_url: Optional[str] = None
    page_status: Optional[str] = None


class MergeClustersBody(BaseModel):
    tenant_id: Optional[str] = None
    source_cluster_ids: List[str]
    target_cluster_id: str


class SplitClusterBody(BaseModel):
    tenant_id: Optional[str] = None
    keyword_ids_to_split: List[str]
    new_cluster_name: str = ""


class ClassifyIntentBody(BaseModel):
    tenant_id: Optional[str] = None
    keywords: List[str]
    project_id: str = ""
    ai_assist: bool = False


# ── Helpers ───────────────────────────────────────────────────────────────────

def _limit_error(exc: SeoLimitExceeded) -> HTTPException:
    return HTTPException(
        status_code=402,
        detail={"error": "plan_limit_exceeded", "detail": exc.result},
    )


def _404(msg: str) -> HTTPException:
    return HTTPException(status_code=404, detail={"error": msg})


# ── Projects ──────────────────────────────────────────────────────────────────

@router.post("/keywords/projects")
def create_keyword_project(
    body: CreateProjectBody,
    _h: Optional[str] = Depends(resolve_tenant_header),
) -> dict:
    tenant = effective_tenant(_h, body.tenant_id)
    try:
        return proj_svc.create_project(
            tenant,
            name=body.name,
            site_id=body.site_id,
            country=body.country,
            language=body.language,
            search_engine=body.search_engine,
            location=body.location,
            device=body.device,
            default_domain=body.default_domain,
            competitors=body.competitors,
        )
    except SeoLimitExceeded as exc:
        raise _limit_error(exc) from exc


@router.get("/keywords/projects")
def list_keyword_projects(
    tenant: str = Depends(resolve_tenant),
    include_archived: bool = Query(default=False),
) -> dict:
    return proj_svc.list_projects(tenant, include_archived=include_archived)


@router.get("/keywords/projects/{project_id}")
def get_keyword_project(
    project_id: str,
    tenant: str = Depends(resolve_tenant),
) -> dict:
    result = proj_svc.get_project(tenant, project_id)
    if not result:
        raise _404("project_not_found")
    return result


@router.patch("/keywords/projects/{project_id}")
def patch_keyword_project(
    project_id: str,
    body: PatchProjectBody,
    _h: Optional[str] = Depends(resolve_tenant_header),
) -> dict:
    tenant = effective_tenant(_h, body.tenant_id)
    result = proj_svc.update_project(
        tenant, project_id,
        name=body.name,
        site_id=body.site_id,
        country=body.country,
        language=body.language,
        search_engine=body.search_engine,
        location=body.location,
        device=body.device,
        default_domain=body.default_domain,
        competitors=body.competitors,
    )
    if not result:
        raise _404("project_not_found")
    return result


@router.post("/keywords/projects/{project_id}/archive")
def archive_keyword_project(
    project_id: str,
    body: ArchiveProjectBody,
    _h: Optional[str] = Depends(resolve_tenant_header),
) -> dict:
    tenant = effective_tenant(_h, body.tenant_id)
    result = proj_svc.archive_project(tenant, project_id)
    if not result:
        raise _404("project_not_found")
    return result


# ── Keywords ──────────────────────────────────────────────────────────────────

@router.post("/keywords/projects/{project_id}/keywords")
def add_single_keyword(
    project_id: str,
    body: AddKeywordBody,
    _h: Optional[str] = Depends(resolve_tenant_header),
) -> dict:
    tenant = effective_tenant(_h, body.tenant_id)
    try:
        result = kw_svc.add_keyword(
            tenant, project_id, body.keyword,
            site_id=body.site_id,
            search_volume=body.search_volume,
            cpc=body.cpc,
            competition=body.competition,
            difficulty=body.difficulty,
            intent=body.intent,
            trend=body.trend,
            serp_features=body.serp_features,
            target_page=body.target_page,
            data_provider=body.data_provider,
            data_timestamp=body.data_timestamp,
            tags=body.tags,
            notes=body.notes,
            tracking_status=body.tracking_status,
        )
    except SeoLimitExceeded as exc:
        raise _limit_error(exc) from exc
    return result


@router.post("/keywords/projects/{project_id}/keywords/bulk")
def bulk_add_keywords(
    project_id: str,
    body: BulkAddKeywordsBody,
    _h: Optional[str] = Depends(resolve_tenant_header),
) -> dict:
    tenant = effective_tenant(_h, body.tenant_id)
    return kw_svc.bulk_add_keywords(
        tenant, project_id, body.text,
        site_id=body.site_id,
        tags=body.tags,
    )


@router.get("/keywords/projects/{project_id}/keywords")
def list_keywords_endpoint(
    project_id: str,
    tenant: str = Depends(resolve_tenant),
    intent: Optional[str] = Query(default=None),
    tracking_status: Optional[str] = Query(default=None),
    tag: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
) -> dict:
    return kw_svc.list_keywords(
        tenant, project_id,
        intent=intent,
        tracking_status=tracking_status,
        tag=tag,
        search=search,
    )


@router.get("/keywords/projects/{project_id}/keywords/export")
def export_keywords_csv(
    project_id: str,
    tenant: str = Depends(resolve_tenant),
) -> Any:
    from fastapi.responses import PlainTextResponse

    result = kw_svc.list_keywords(tenant, project_id)
    rows = result.get("keywords", [])
    csv_text = csv_io.export_csv(rows)
    return PlainTextResponse(
        content=csv_text,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=keywords_{project_id}.csv"},
    )


@router.post("/keywords/projects/{project_id}/keywords/import")
def import_keywords_csv(
    project_id: str,
    body: CsvImportBody,
    _h: Optional[str] = Depends(resolve_tenant_header),
) -> dict:
    tenant = effective_tenant(_h, body.tenant_id)
    parsed = csv_io.import_csv(body.csv_text)
    if not body.auto_add:
        return {"parsed": parsed, "count": len(parsed)}

    # Auto-add all parsed keywords.
    added = []
    skipped = []
    errors = []
    for row in parsed:
        kw_text = (row.get("keyword") or "").strip()
        if not kw_text:
            continue
        try:
            result = kw_svc.add_keyword(
                tenant, project_id, kw_text,
                search_volume=row.get("search_volume"),
                cpc=row.get("cpc"),
                competition=row.get("competition"),
                difficulty=row.get("difficulty"),
                intent=row.get("intent") or "unknown",
                target_page=row.get("target_page") or "",
                tags=row.get("tags") or body.tags,
                notes=row.get("notes") or "",
                data_provider=row.get("data_provider") or "",
                data_timestamp=row.get("data_timestamp") or "",
            )
        except SeoLimitExceeded as exc:
            errors.append({"keyword": kw_text, "reason": "plan_limit_exceeded"})
            continue

        if result.get("added"):
            added.append(result["keyword"])
        else:
            skipped.append({"keyword": kw_text, "reason": result.get("reason", "unknown")})

    return {
        "parsed_count": len(parsed),
        "added_count": len(added),
        "skipped": skipped,
        "errors": errors,
        "keywords": added,
    }


@router.get("/keywords/projects/{project_id}/keywords/{keyword_id}")
def get_single_keyword(
    project_id: str,
    keyword_id: str,
    tenant: str = Depends(resolve_tenant),
) -> dict:
    result = kw_svc.get_keyword(tenant, keyword_id)
    if not result:
        raise _404("keyword_not_found")
    return result


@router.patch("/keywords/projects/{project_id}/keywords/{keyword_id}")
def patch_keyword(
    project_id: str,
    keyword_id: str,
    body: PatchKeywordBody,
    _h: Optional[str] = Depends(resolve_tenant_header),
) -> dict:
    tenant = effective_tenant(_h, body.tenant_id)
    result = kw_svc.update_keyword(
        tenant, keyword_id,
        tags=body.tags,
        target_page=body.target_page,
        notes=body.notes,
        intent=body.intent,
        tracking_status=body.tracking_status,
        search_volume=body.search_volume,
        cpc=body.cpc,
        competition=body.competition,
        difficulty=body.difficulty,
        data_provider=body.data_provider,
        data_timestamp=body.data_timestamp,
        serp_features=body.serp_features,
        trend=body.trend,
    )
    if not result:
        raise _404("keyword_not_found")
    return result


@router.delete("/keywords/projects/{project_id}/keywords/{keyword_id}")
def delete_single_keyword(
    project_id: str,
    keyword_id: str,
    tenant: str = Depends(resolve_tenant),
) -> dict:
    return kw_svc.delete_keyword(tenant, keyword_id)


@router.post("/keywords/projects/{project_id}/keywords/{keyword_id}/track")
def track_keyword(
    project_id: str,
    keyword_id: str,
    body: TrackKeywordBody,
    _h: Optional[str] = Depends(resolve_tenant_header),
) -> dict:
    tenant = effective_tenant(_h, body.tenant_id)
    result = kw_svc.set_tracking_status(tenant, keyword_id, body.tracking_status)
    if not result.get("keyword") and result.get("error"):
        raise HTTPException(status_code=400, detail=result)
    return result


# ── Research ──────────────────────────────────────────────────────────────────

@router.post("/keywords/research")
def keyword_research(
    body: ResearchBody,
    _h: Optional[str] = Depends(resolve_tenant_header),
) -> dict:
    tenant = effective_tenant(_h, body.tenant_id)
    result = res_svc.research(
        tenant, body.project_id,
        seed_keyword=body.seed_keyword,
        domain=body.domain,
        gsc_queries=body.gsc_queries,
        competitor_domain=body.competitor_domain,
        country=body.country,
        language=body.language,
        location=body.location,
        device=body.device,
        volume_min=body.volume_min,
        volume_max=body.volume_max,
        difficulty_min=body.difficulty_min,
        difficulty_max=body.difficulty_max,
        cpc_min=body.cpc_min,
        cpc_max=body.cpc_max,
        intent=body.intent,
        length_min=body.length_min,
        length_max=body.length_max,
        include_words=body.include_words,
        exclude_words=body.exclude_words,
        questions_only=body.questions_only,
        unranked_only=body.unranked_only,
        content_gap_only=body.content_gap_only,
    )
    return result


# ── Clusters ──────────────────────────────────────────────────────────────────

@router.post("/keywords/projects/{project_id}/clusters/auto")
def auto_cluster_keywords(
    project_id: str,
    body: AutoClusterBody,
    _h: Optional[str] = Depends(resolve_tenant_header),
) -> dict:
    tenant = effective_tenant(_h, body.tenant_id)
    # In tests the mock provider is used (is_mock=True); detect from env.
    from seo.keywords.provider import get_keyword_provider
    provider = get_keyword_provider()
    is_mock = getattr(provider, "name", "mock") == "mock"
    return clust_svc.auto_cluster_project(
        tenant, project_id,
        ai_assist=body.ai_assist,
        is_mock=is_mock,
    )


@router.get("/keywords/projects/{project_id}/clusters")
def list_keyword_clusters(
    project_id: str,
    tenant: str = Depends(resolve_tenant),
) -> dict:
    return clust_svc.list_clusters(tenant, project_id)


@router.get("/keywords/projects/{project_id}/clusters/{cluster_id}")
def get_keyword_cluster(
    project_id: str,
    cluster_id: str,
    tenant: str = Depends(resolve_tenant),
) -> dict:
    result = clust_svc.get_cluster(tenant, cluster_id)
    if not result:
        raise _404("cluster_not_found")
    return result


@router.patch("/keywords/projects/{project_id}/clusters/{cluster_id}")
def patch_keyword_cluster(
    project_id: str,
    cluster_id: str,
    body: PatchClusterBody,
    _h: Optional[str] = Depends(resolve_tenant_header),
) -> dict:
    tenant = effective_tenant(_h, body.tenant_id)
    result: Dict[str, Any] = {}

    if body.name is not None:
        result = clust_svc.rename_cluster(tenant, cluster_id, body.name)
    if body.primary_keyword is not None:
        result = clust_svc.assign_primary_keyword(tenant, cluster_id, body.primary_keyword)
    if body.target_url is not None:
        result = clust_svc.assign_target_url(tenant, cluster_id, body.target_url)
    if body.page_status is not None:
        result = clust_svc.set_page_status(tenant, cluster_id, body.page_status)

    if not result:
        raise _404("cluster_not_found")
    return result


@router.post("/keywords/projects/{project_id}/clusters/merge")
def merge_keyword_clusters(
    project_id: str,
    body: MergeClustersBody,
    _h: Optional[str] = Depends(resolve_tenant_header),
) -> dict:
    tenant = effective_tenant(_h, body.tenant_id)
    result = clust_svc.merge_clusters(tenant, body.source_cluster_ids, body.target_cluster_id)
    if result.get("error"):
        raise HTTPException(status_code=400, detail=result)
    return result


@router.post("/keywords/projects/{project_id}/clusters/{cluster_id}/split")
def split_keyword_cluster(
    project_id: str,
    cluster_id: str,
    body: SplitClusterBody,
    _h: Optional[str] = Depends(resolve_tenant_header),
) -> dict:
    tenant = effective_tenant(_h, body.tenant_id)
    result = clust_svc.split_cluster(
        tenant, cluster_id,
        body.keyword_ids_to_split,
        new_cluster_name=body.new_cluster_name,
    )
    if result.get("error"):
        raise HTTPException(status_code=400, detail=result)
    return result


# ── Intent classify ───────────────────────────────────────────────────────────

@router.post("/keywords/intent/classify")
def classify_keywords_intent(
    body: ClassifyIntentBody,
    _h: Optional[str] = Depends(resolve_tenant_header),
) -> dict:
    tenant = effective_tenant(_h, body.tenant_id)
    # is_mock: derive from provider name (deterministic in tests).
    from seo.keywords.provider import get_keyword_provider
    provider = get_keyword_provider()
    is_mock = getattr(provider, "name", "mock") == "mock"
    results = clust_svc.classify_intents_batch(
        body.keywords,
        tenant_id=tenant,
        project_id=body.project_id,
        ai_assist=body.ai_assist,
        is_mock=is_mock,
    )
    return {"results": results, "count": len(results)}
