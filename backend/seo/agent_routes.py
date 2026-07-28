"""Platform-aware SEO agent HTTP surface (/api/agents/seo/*).

Audit (real crawl), platform detect, per-platform connection status/connect, and
approval-gated one-tap optimize. Reuses approvals/activity/persistence.

Tenant resolution follows a fail-closed precedence:
  1. X-Pixie-Tenant header (trusted, proxy-set) → always wins, body/query ignored.
  2. Strict mode (PIXIE_REQUIRE_INTERNAL_SECRET=1) + no header → HTTP 400.
  3. Dev/test (flag off) → body tenant_id / query tenant_id / "demo_tenant".

Durable pipeline endpoints (all tenant-scoped):
  Sites:  POST /sites, GET /sites, GET /sites/{site_id},
          PATCH /sites/{site_id}, DELETE /sites/{site_id}
  Crawls: POST /crawl/start, GET /crawl/{job_id}, GET /crawls,
          POST /crawl/{job_id}/cancel, POST /crawl/{job_id}/retry
  Pages:  GET /pages?crawl_job_id=&limit=&offset=
  Issues: GET /issues?crawl_job_id=|site_id=&severity=&status=&category=
          POST /issues/{issue_id}/resolve
  Reports: GET /reports?site_id=, GET /report/{crawl_job_id}
"""

from __future__ import annotations

import uuid
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Query

from . import audit_agent as aa
from . import optimize  # noqa: F401 — registers the seo-agent executor on import
from . import website_connections as wc
from .agent_schemas import (
    AuditStartBody,
    ConnectTokenBody,
    ConnectWordPressBody,
    CrawlStartBody,
    CrawlEstimateBody,
    CreateSiteBody,
    IssueResolveBody,
    OptimizePrepareBody,
    PageSpeedBody,
    PatchSiteBody,
    CRAWL_LIMIT_MAX,
)
from .httpx_fetch import fetch_full
from .platform_detector import detect_platform
from .stores import (
    ConnectionStatus,
    CrawlStatus,
    CrawlType,
    IssueStatus,
    RobotsPolicy,
    Site,
    get_crawl_job_repository,
    get_issue_repository,
    get_report_repository,
    get_site_repository,
    list_issues,
    list_pages,
    list_sites,
    get_site,
)
from .tenant import effective_tenant, resolve_tenant, resolve_tenant_header
from .url_guard import UrlRejected, assert_safe_url
from .crawler.worker import (
    enqueue_crawl,
    poll_once,
    cancel_job as _cancel_job_fn,
    retry_job as _retry_job_fn,
)
from .stores import CrawlType as _CrawlType

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


@router.post("/audit/{audit_id}/save-site")
def audit_save_site(
    audit_id: str,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
    tenant_id: Optional[str] = Query(default=None),
) -> dict:
    """Promote an ad-hoc audit into a tracked Site.

    Reads the audit's domain; if a Site for that domain+tenant already exists,
    returns it with ``created=false`` (no duplicates). Otherwise creates a new
    Site from the audited URL and returns it with ``created=true``.

    The same server-side crawl_limit cap (CRAWL_LIMIT_MAX) is applied.
    """
    from urllib.parse import urlsplit as _urlsplit

    tenant = effective_tenant(_header_tenant, tenant_id)
    audit = aa.get_audit(tenant, audit_id)
    if not audit:
        raise HTTPException(status_code=404, detail={"error": "audit_not_found"})

    # Extract the bare domain from the final_url / website_url.
    raw_url = audit.get("final_url") or audit.get("website_url") or ""
    if not raw_url.startswith(("http://", "https://")):
        raw_url = "https://" + raw_url
    parsed = _urlsplit(raw_url)
    domain = parsed.netloc or parsed.path.split("/")[0]
    if not domain:
        raise HTTPException(status_code=422, detail={"error": "cannot_determine_domain"})

    canonical_base_url = f"{parsed.scheme}://{domain}"

    # Check for an existing Site with the same domain for this tenant
    # (compare against all sites including archived ones so we never accidentally
    #  create a duplicate for a soft-deleted site).
    site_repo = get_site_repository()
    existing_pairs = site_repo.list(tenant, include_archived=True)
    for sid, s in existing_pairs:
        if s.domain == domain:
            return {"created": False, "site": _site_to_dict(sid, s)}

    # No existing site — create one from the audit.
    site = Site(
        tenant_id=tenant,
        domain=domain,
        canonical_base_url=canonical_base_url,
        display_name=domain,
        connection_status=ConnectionStatus.PENDING,
        crawl_limit=CRAWL_LIMIT_MAX,
    )
    site_id, saved = site_repo.create(site)
    return {"created": True, "site": _site_to_dict(site_id, saved)}


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


# ── Helpers ────────────────────────────────────────────────────────────────────

def _site_to_dict(site_id: str, site: Site) -> dict:
    return {
        "id": site_id,
        "tenant_id": site.tenant_id,
        "domain": site.domain,
        "canonical_base_url": site.canonical_base_url,
        "display_name": site.display_name,
        "connection_status": site.connection_status.value if hasattr(site.connection_status, "value") else site.connection_status,
        "country": site.country,
        "language": site.language,
        "target_location": site.target_location,
        "crawl_limit": site.crawl_limit,
        "crawl_frequency": site.crawl_frequency,
        "robots_policy": site.robots_policy.value if hasattr(site.robots_policy, "value") else site.robots_policy,
        "sitemap_urls": site.sitemap_urls,
        "included_paths": site.included_paths,
        "excluded_paths": site.excluded_paths,
        "archived": site.archived,
        "archived_at": site.archived_at,
        "created_at": site.created_at,
        "updated_at": site.updated_at,
    }


def _job_to_dict(job_id: str, job) -> dict:
    return {
        "id": job_id,
        "tenant_id": job.tenant_id,
        "site_id": job.site_id,
        "status": job.status.value if hasattr(job.status, "value") else job.status,
        "crawl_type": job.crawl_type.value if hasattr(job.crawl_type, "value") else job.crawl_type,
        "requested_limit": job.requested_limit,
        "discovered_count": job.discovered_count,
        "crawled_count": job.crawled_count,
        "failed_count": job.failed_count,
        "queued_at": job.queued_at,
        "started_at": job.started_at,
        "finished_at": job.finished_at,
        "cancelled_at": job.cancelled_at,
        "error_category": job.error_category,
        "retry_count": job.retry_count,
        "progress": job.progress,
        "config_snapshot": job.config_snapshot,
    }


def _page_to_dict(page_id: str, page) -> dict:
    return {
        "id": page_id,
        "site_id": page.site_id,
        "crawl_job_id": page.crawl_job_id,
        "url": page.url,
        "normalized_url": page.normalized_url,
        "status_code": page.status_code,
        "content_type": page.content_type,
        "canonical": page.canonical,
        "title": page.title,
        "meta_description": page.meta_description,
        "h1": page.h1,
        "word_count": page.word_count,
        "indexability": page.indexability,
        "internal_links_in": page.internal_links_in,
        "internal_links_out": page.internal_links_out,
        "response_time_ms": page.response_time_ms,
        "page_size_bytes": page.page_size_bytes,
        "crawled_at": page.crawled_at,
    }


def _issue_to_dict(issue_id: str, issue) -> dict:
    return {
        "id": issue_id,
        "site_id": issue.site_id,
        "crawl_job_id": issue.crawl_job_id,
        "page_id": issue.page_id,
        "rule_key": issue.rule_key,
        "category": issue.category,
        "severity": issue.severity.value if hasattr(issue.severity, "value") else issue.severity,
        "status": issue.status.value if hasattr(issue.status, "value") else issue.status,
        "evidence": issue.evidence,
        "recommendation": issue.recommendation,
        "fix_mode": issue.fix_mode,
        "rule_version": issue.rule_version,
        "first_detected_at": issue.first_detected_at,
        "last_detected_at": issue.last_detected_at,
        "resolved_at": issue.resolved_at,
    }


def _report_to_dict(report_id: str, report) -> dict:
    return {
        "id": report_id,
        "site_id": report.site_id,
        "crawl_job_id": report.crawl_job_id,
        "score": report.score,
        "category_scores": report.category_scores,
        "issue_counts": report.issue_counts,
        "created_at": report.created_at,
        "export_metadata": report.export_metadata,
    }


# ── Sites endpoints ────────────────────────────────────────────────────────────

@router.post("/sites")
def create_site(
    body: CreateSiteBody,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
) -> dict:
    """Register a new site for recurring crawls."""
    tenant = effective_tenant(_header_tenant, body.tenant_id)
    repo = get_site_repository()
    robots_policy = RobotsPolicy(body.robots_policy) if body.robots_policy in ("respect", "ignore") else RobotsPolicy.RESPECT
    site = Site(
        tenant_id=tenant,
        domain=body.domain,
        canonical_base_url=body.canonical_base_url or f"https://{body.domain}",
        display_name=body.display_name or body.domain,
        connection_status=ConnectionStatus.PENDING,
        country=body.country,
        language=body.language,
        target_location=body.target_location,
        crawl_limit=min(body.crawl_limit, CRAWL_LIMIT_MAX),
        crawl_frequency=body.crawl_frequency,
        robots_policy=robots_policy,
        sitemap_urls=body.sitemap_urls,
        included_paths=body.included_paths,
        excluded_paths=body.excluded_paths,
    )
    site_id, saved = repo.create(site)
    return {"site": _site_to_dict(site_id, saved)}


@router.get("/sites")
def list_sites_endpoint(
    archived: Optional[str] = Query(default=None),
    include_archived: Optional[str] = Query(default=None),
    tenant: str = Depends(resolve_tenant),
) -> dict:
    """List sites for the tenant.

    ?archived=true           — return ONLY archived sites (Archived filter).
    ?include_archived=true   — return both active and archived.
    (default)                — return only non-archived sites.
    """
    archived_only = (archived or "").lower() in ("true", "1", "yes")
    include_both = (include_archived or "").lower() in ("true", "1", "yes")

    if archived_only:
        pairs = list_sites(tenant, include_archived=True)
        pairs = [(sid, s) for sid, s in pairs if s.archived]
    elif include_both:
        pairs = list_sites(tenant, include_archived=True)
    else:
        pairs = list_sites(tenant, include_archived=False)
    return {"sites": [_site_to_dict(sid, s) for sid, s in pairs]}


@router.get("/sites/{site_id}")
def get_site_endpoint(
    site_id: str,
    include_archived: Optional[str] = Query(default=None),
    tenant: str = Depends(resolve_tenant),
) -> dict:
    """Get a single site by ID (tenant-scoped).

    Archived sites return 404 by default (same as if they were deleted).
    Pass ?include_archived=true to retrieve an archived site explicitly.
    """
    result = get_site(tenant, site_id)
    if not result:
        raise HTTPException(status_code=404, detail={"error": "site_not_found"})
    sid, site = result
    # Archived sites are invisible by default (contract: same as hard-delete from callers' view)
    allow_archived = (include_archived or "").lower() in ("true", "1", "yes")
    if site.archived and not allow_archived:
        raise HTTPException(status_code=404, detail={"error": "site_not_found"})
    return {"site": _site_to_dict(sid, site)}


@router.patch("/sites/{site_id}")
def patch_site(
    site_id: str,
    body: PatchSiteBody,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
) -> dict:
    """Edit crawl settings for an existing site."""
    tenant = effective_tenant(_header_tenant, body.tenant_id)
    repo = get_site_repository()
    # Only forward non-None fields to the update.
    update_fields: dict = {}
    if body.crawl_limit is not None:
        update_fields["crawl_limit"] = min(body.crawl_limit, CRAWL_LIMIT_MAX)
    if body.crawl_frequency is not None:
        update_fields["crawl_frequency"] = body.crawl_frequency
    if body.country is not None:
        update_fields["country"] = body.country
    if body.language is not None:
        update_fields["language"] = body.language
    if body.target_location is not None:
        update_fields["target_location"] = body.target_location
    if body.included_paths is not None:
        update_fields["included_paths"] = body.included_paths
    if body.excluded_paths is not None:
        update_fields["excluded_paths"] = body.excluded_paths
    if body.sitemap_urls is not None:
        update_fields["sitemap_urls"] = body.sitemap_urls
    if body.robots_policy is not None:
        rp = RobotsPolicy(body.robots_policy) if body.robots_policy in ("respect", "ignore") else RobotsPolicy.RESPECT
        update_fields["robots_policy"] = rp
    if body.display_name is not None:
        update_fields["display_name"] = body.display_name
    if body.canonical_base_url is not None:
        update_fields["canonical_base_url"] = body.canonical_base_url

    result = repo.update(tenant, site_id, **update_fields)
    if not result:
        raise HTTPException(status_code=404, detail={"error": "site_not_found"})
    sid, site = result
    return {"site": _site_to_dict(sid, site)}


@router.delete("/sites/{site_id}")
def delete_site(
    site_id: str,
    permanent: Optional[str] = Query(default=None),
    tenant: str = Depends(resolve_tenant),
) -> dict:
    """Soft-archive a site (default). Hard-delete only when ?permanent=true.

    Default (no ?permanent): sets archived=True.  Historical crawl/issue/report
    rows are preserved; the site is hidden from the normal list.
    ?permanent=true: permanently deletes the site row (irreversible).
    """
    result = get_site(tenant, site_id)
    if not result:
        raise HTTPException(status_code=404, detail={"error": "site_not_found"})
    repo = get_site_repository()
    is_permanent = (permanent or "").lower() in ("true", "1", "yes")
    if is_permanent:
        repo.delete(tenant, site_id)
        return {"deleted": site_id}
    # Soft archive: site row is preserved with archived=True
    archived_result = repo.archive(tenant, site_id)
    if not archived_result:
        raise HTTPException(status_code=404, detail={"error": "site_not_found"})
    _aid, archived_site = archived_result
    return {"archived": True, "site": _site_to_dict(_aid, archived_site)}


@router.post("/sites/{site_id}/archive")
def archive_site(
    site_id: str,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
    tenant_id: Optional[str] = Query(default=None),
) -> dict:
    """Soft-archive a site (same effect as DELETE without ?permanent)."""
    tenant = effective_tenant(_header_tenant, tenant_id)
    repo = get_site_repository()
    result = repo.archive(tenant, site_id)
    if not result:
        raise HTTPException(status_code=404, detail={"error": "site_not_found"})
    sid, site = result
    return {"archived": True, "site": _site_to_dict(sid, site)}


@router.post("/sites/{site_id}/restore")
def restore_site(
    site_id: str,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
    tenant_id: Optional[str] = Query(default=None),
) -> dict:
    """Restore an archived site back to active."""
    tenant = effective_tenant(_header_tenant, tenant_id)
    repo = get_site_repository()
    # Must use include_archived=True to find the archived site
    result = repo.get(tenant, site_id)
    if not result:
        raise HTTPException(status_code=404, detail={"error": "site_not_found"})
    restored = repo.restore(tenant, site_id)
    if not restored:
        raise HTTPException(status_code=404, detail={"error": "site_not_found"})
    sid, site = restored
    return {"archived": False, "site": _site_to_dict(sid, site)}


# ── Crawl endpoints ────────────────────────────────────────────────────────────

@router.post("/crawl/start")
def crawl_start(
    body: CrawlStartBody,
    background_tasks: BackgroundTasks,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
) -> dict:
    """Enqueue a crawl job and kick execution off the request thread.

    The endpoint returns the job_id immediately; actual crawling happens in
    a FastAPI BackgroundTask (off the request thread).  Poll GET /crawl/{job_id}
    for status and progress.

    Server-side rules
    -----------------
    - ``requested_limit`` is clamped to ``CRAWL_LIMIT_MAX`` (500) and further
      to the site's ``crawl_limit`` — the browser value is never trusted for
      billable limits.
    - The seed URL (``url`` or ``site.canonical_base_url``) is validated with
      ``assert_safe_url`` before any enqueue; private/internal targets → 400.
    - A valid ``site_id`` is required in the store; the tenant must own it.
    """
    tenant = effective_tenant(_header_tenant, body.tenant_id)

    # Resolve site.
    if not body.site_id:
        raise HTTPException(status_code=422, detail={"error": "site_id_required"})
    site_result = get_site(tenant, body.site_id)
    if not site_result:
        raise HTTPException(status_code=404, detail={"error": "site_not_found"})
    site_id, site = site_result

    # Resolve seed URL for SSRF check.
    # Only add https:// prefix when the caller passed a bare domain (no scheme at all).
    # If the caller supplied a non-http/https scheme (e.g. ftp://), pass it through
    # verbatim so assert_safe_url can reject it with the correct reason.
    raw_seed = (body.url or "").strip()
    if raw_seed:
        # Caller supplied an explicit URL.
        from urllib.parse import urlsplit as _urlsplit
        _scheme = (_urlsplit(raw_seed).scheme or "").lower()
        if not _scheme:
            # Bare domain / path with no scheme → assume https.
            seed_url = f"https://{raw_seed}"
        else:
            # Pass through with original scheme — let assert_safe_url validate it.
            seed_url = raw_seed
    else:
        seed_url = site.canonical_base_url or f"https://{site.domain}"
        if not seed_url.startswith(("http://", "https://")):
            seed_url = f"https://{seed_url}"
    try:
        assert_safe_url(seed_url)
    except UrlRejected as exc:
        raise HTTPException(
            status_code=400,
            detail={"error": "unsafe_url", "reason": exc.reason},
        ) from exc

    # Resolve crawl type.
    crawl_type_str = (body.crawl_type or "site").lower()
    crawl_type = _CrawlType.SINGLE if crawl_type_str == "single" else _CrawlType.SITE

    # Server-side clamp: browser-supplied limit is clamped first to the global
    # max, then further to the site's configured limit (never trust the client).
    raw_limit = body.requested_limit if body.requested_limit is not None else site.crawl_limit
    clamped_limit = min(int(raw_limit), CRAWL_LIMIT_MAX, site.crawl_limit)

    # Enqueue (creates a QUEUED job in the store and returns immediately).
    worker_id = f"bg-{uuid.uuid4().hex[:8]}"
    job_id, job = enqueue_crawl(
        site_id=site_id,
        tenant_id=tenant,
        requested_limit=clamped_limit,
        crawl_type=crawl_type,
        config_snapshot={
            "seed_url": seed_url,
            "crawl_type": crawl_type.value,
            "crawl_limit": clamped_limit,
        },
    )

    # Kick execution off the request thread via BackgroundTasks.
    # Pass include_pagespeed so the worker knows to run PSI after the crawl.
    include_ps = body.include_pagespeed
    background_tasks.add_task(
        poll_once, worker_id, tenant, include_pagespeed=include_ps
    )

    return {
        "job_id": job_id,
        "status": job.status.value if hasattr(job.status, "value") else job.status,
        "requested_limit": clamped_limit,
        "crawl_type": crawl_type.value,
        "site_id": site_id,
        "include_pagespeed": include_ps,
    }


@router.get("/crawl/{job_id}")
def crawl_status(
    job_id: str,
    tenant: str = Depends(resolve_tenant),
) -> dict:
    """Return the status and progress of a crawl job."""
    repo = get_crawl_job_repository()
    result = repo.get(tenant, job_id)
    if not result:
        raise HTTPException(status_code=404, detail={"error": "job_not_found"})
    jid, job = result
    return {"job": _job_to_dict(jid, job)}


@router.get("/crawls")
def list_crawls(
    site_id: Optional[str] = Query(default=None),
    tenant: str = Depends(resolve_tenant),
) -> dict:
    """List crawl jobs for the tenant, optionally filtered by site_id."""
    repo = get_crawl_job_repository()
    if site_id:
        pairs = repo.list_by_site(tenant, site_id)
    else:
        pairs = repo.list(tenant)
    return {"jobs": [_job_to_dict(jid, j) for jid, j in pairs]}


@router.post("/crawl/{job_id}/cancel")
def crawl_cancel(
    job_id: str,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
    tenant_id: Optional[str] = Query(default=None),
) -> dict:
    """Cancel a queued or running crawl job."""
    tenant = effective_tenant(_header_tenant, tenant_id)
    ok = _cancel_job_fn(tenant, job_id)
    if not ok:
        raise HTTPException(
            status_code=400,
            detail={"error": "cannot_cancel", "reason": "job not found or already in terminal state"},
        )
    return {"cancelled": job_id}


@router.post("/crawl/{job_id}/retry")
def crawl_retry(
    job_id: str,
    background_tasks: BackgroundTasks,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
    tenant_id: Optional[str] = Query(default=None),
) -> dict:
    """Reset a failed/cancelled job to QUEUED and kick execution."""
    tenant = effective_tenant(_header_tenant, tenant_id)
    ok = _retry_job_fn(tenant, job_id)
    if not ok:
        raise HTTPException(
            status_code=400,
            detail={"error": "cannot_retry", "reason": "job not found or not in a retryable state"},
        )
    worker_id = f"retry-{uuid.uuid4().hex[:8]}"
    background_tasks.add_task(poll_once, worker_id, tenant)
    return {"retried": job_id}


# ── Pages endpoint ─────────────────────────────────────────────────────────────

@router.get("/pages")
def list_pages_endpoint(
    crawl_job_id: Optional[str] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    tenant: str = Depends(resolve_tenant),
) -> dict:
    """List crawled pages for a crawl job with pagination."""
    if not crawl_job_id:
        raise HTTPException(status_code=422, detail={"error": "crawl_job_id_required"})
    total, pairs = list_pages(tenant, crawl_job_id, limit=limit, offset=offset)
    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "pages": [_page_to_dict(pid, p) for pid, p in pairs],
    }


# ── Issues endpoints ───────────────────────────────────────────────────────────

@router.get("/issues")
def list_issues_endpoint(
    crawl_job_id: Optional[str] = Query(default=None),
    site_id: Optional[str] = Query(default=None),
    severity: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    category: Optional[str] = Query(default=None),
    tenant: str = Depends(resolve_tenant),
) -> dict:
    """List SEO issues, filtered by crawl job, site, severity, status, or category."""
    from .schemas import Severity as _Severity

    sev_enum = None
    if severity:
        try:
            sev_enum = _Severity(severity)
        except ValueError:
            raise HTTPException(status_code=422, detail={"error": "invalid_severity", "valid": [s.value for s in _Severity]})

    status_enum = None
    if status:
        try:
            status_enum = IssueStatus(status)
        except ValueError:
            raise HTTPException(status_code=422, detail={"error": "invalid_status", "valid": [s.value for s in IssueStatus]})

    pairs = list_issues(
        tenant,
        site_id=site_id,
        crawl_job_id=crawl_job_id,
        severity=sev_enum,
        status=status_enum,
    )

    if category:
        pairs = [(iid, iss) for iid, iss in pairs if iss.category == category]

    return {"issues": [_issue_to_dict(iid, iss) for iid, iss in pairs]}


@router.post("/issues/{issue_id}/resolve")
def resolve_issue(
    issue_id: str,
    body: IssueResolveBody,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
) -> dict:
    """Mark an issue as resolved."""
    from datetime import datetime, timezone
    tenant = effective_tenant(_header_tenant, body.tenant_id)
    repo = get_issue_repository()
    result = repo.get(tenant, issue_id)
    if not result:
        raise HTTPException(status_code=404, detail={"error": "issue_not_found"})
    now_str = datetime.now(timezone.utc).isoformat(timespec="microseconds")
    result2 = repo.update(
        tenant, issue_id,
        status=IssueStatus.RESOLVED,
        resolved_at=now_str,
    )
    if not result2:
        raise HTTPException(status_code=404, detail={"error": "issue_not_found"})
    iid, issue = result2
    return {"issue": _issue_to_dict(iid, issue)}


# ── Reports endpoints ──────────────────────────────────────────────────────────

@router.get("/reports")
def list_reports(
    site_id: Optional[str] = Query(default=None),
    tenant: str = Depends(resolve_tenant),
) -> dict:
    """Return the latest report for a site (or all reports for the tenant)."""
    repo = get_report_repository()
    if site_id:
        result = repo.latest_report(tenant, site_id)
        if not result:
            return {"report": None}
        rid, report = result
        return {"report": _report_to_dict(rid, report)}
    # No site_id: list all reports for tenant
    pairs = [repo._build(r) for r in repo._rows(tenant)]
    pairs = [p for p in pairs if p]
    return {"reports": [_report_to_dict(rid, rep) for rid, rep in pairs]}


@router.get("/report/{crawl_job_id}")
def get_report_by_job(
    crawl_job_id: str,
    tenant: str = Depends(resolve_tenant),
) -> dict:
    """Return the report for a specific crawl job."""
    repo = get_report_repository()
    pairs = [repo._build(r) for r in repo._rows(tenant)]
    pairs = [p for p in pairs if p and p[1].crawl_job_id == crawl_job_id]
    if not pairs:
        raise HTTPException(status_code=404, detail={"error": "report_not_found"})
    # There should be exactly one report per crawl job; return the latest if multiple.
    pairs.sort(key=lambda p: p[1].created_at, reverse=True)
    rid, report = pairs[0]
    return {"report": _report_to_dict(rid, report)}


# ── PageSpeed / CWV on-demand endpoint ────────────────────────────────────────

@router.post("/pagespeed")
def pagespeed_single(
    body: PageSpeedBody,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
) -> dict:
    """On-demand PageSpeed / Core Web Vitals for a single URL.

    Validates the URL with assert_safe_url (→ 400 on UrlRejected) before any
    outbound call. Returns mobile+desktop CWV (or whichever strategy was
    requested). Meters real PSI calls against the tenant's seo_agent product.

    Body
    ----
    url         — the page to analyse (must be a public http/https URL).
    strategy    — "mobile" | "desktop" | "both"  (default "both").
    tenant_id   — resolved from X-Pixie-Tenant header first; body fallback.
    """
    import datetime

    tenant = effective_tenant(_header_tenant, body.tenant_id)

    raw_url = (body.url or "").strip()
    if not raw_url.startswith(("http://", "https://")):
        raw_url = "https://" + raw_url
    try:
        assert_safe_url(raw_url)
    except UrlRejected as exc:
        raise HTTPException(
            status_code=400,
            detail={"error": "unsafe_url", "reason": exc.reason},
        ) from exc

    from .technical.pagespeed import (
        get_pagespeed_provider,
        run_pagespeed_for_job,
        VALID_STRATEGIES,
        _cwv_to_full_dict,
    )
    from .metering import record_pagespeed_requests

    strategy_input = (body.strategy or "both").lower()
    if strategy_input == "both":
        strategies = tuple(VALID_STRATEGIES)
    elif strategy_input in VALID_STRATEGIES:
        strategies = (strategy_input,)
    else:
        raise HTTPException(
            status_code=422,
            detail={"error": "invalid_strategy", "valid": list(VALID_STRATEGIES) + ["both"]},
        )

    provider = get_pagespeed_provider()
    request_ts = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")

    results: dict = {}
    real_request_count = 0

    for strategy in strategies:
        try:
            cwv = provider.fetch(raw_url, strategy)
            is_mock_result = (
                getattr(provider, "is_mock", True)
                or "fallback" in (cwv.provider or "")
                or "no_key" in (cwv.provider or "")
            )
            entry = _cwv_to_full_dict(cwv, strategy=strategy, mock=is_mock_result, request_ts=request_ts)
            if not is_mock_result:
                real_request_count += 1
        except Exception as exc:
            entry = {
                "strategy": strategy,
                "status": "provider_unavailable",
                "error": str(exc)[:200],
                "request_timestamp": request_ts,
                "mock": True,
                "field_data_available": False,
            }
        results[strategy] = entry

    # Meter real PSI calls (no-op when credit system is off or mock).
    if real_request_count > 0:
        op_id = f"psi_ondemand:{tenant}:{raw_url}"
        record_pagespeed_requests(
            tenant,
            real_request_count=real_request_count,
            job_id=op_id,
            is_mock=False,
        )

    return {
        "url": raw_url,
        "results": results,
        "real_request_count": real_request_count,
    }


# ── Crawl cost estimate endpoint ───────────────────────────────────────────────

@router.post("/crawl/estimate")
def crawl_estimate(
    body: CrawlEstimateBody,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
) -> dict:
    """Preview the credit cost for a crawl BEFORE starting it.

    Returns an estimate broken down by sub-operation (crawl pages, PageSpeed
    calls, report generation). No job is created; no network call is made.
    The estimate is server-authoritative (browser-supplied ``requested_limit``
    is clamped to CRAWL_LIMIT_MAX server-side).

    Body
    ----
    requested_limit   — number of pages to estimate for (clamped to CRAWL_LIMIT_MAX).
    include_pagespeed — whether PSI runs should be included in the estimate.
    tenant_id         — resolved from X-Pixie-Tenant header first; body fallback.
    """
    tenant = effective_tenant(_header_tenant, body.tenant_id)

    # Server-side clamp — never trust client value as-is.
    clamped_limit = min(int(body.requested_limit or 1), CRAWL_LIMIT_MAX)

    from .metering import estimate_crawl

    estimate = estimate_crawl(
        tenant,
        clamped_limit,
        include_pagespeed=body.include_pagespeed,
    )

    return {
        "tenant_id": tenant,
        "requested_limit": clamped_limit,
        "include_pagespeed": body.include_pagespeed,
        "estimate": estimate,
    }
