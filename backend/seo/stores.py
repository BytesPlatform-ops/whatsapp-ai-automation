"""Durable, tenant-scoped repositories for the SEO crawler pipeline.

Backed by the shared ``persistence`` seam, so records are in-memory for tests
(``PIXIE_PERSIST`` unset/memory) and durable + multi-instance for
``file``/``supabase``. Same envelope convention as content_agent/store.py.

Entity → table mapping:
  Site          → seo_sites
  CrawlJob      → seo_crawl_jobs
  CrawledPage   → seo_crawled_pages
  SeoIssue      → seo_issues
  Report        → seo_reports

Id prefixes:
  site_, crawl_, page_, issue_, rpt_

Activate with:  PIXIE_PERSIST=supabase  (+ SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
In memory/file mode these tables are unused (local dev / tests stay hermetic).
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Dict, List, Optional, Tuple

import persistence

# ── Reuse the Severity enum from seo.schemas to stay compatible ──────────────
from seo.schemas import Severity


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="microseconds")


def _uid(prefix: str) -> str:
    return prefix + str(uuid.uuid4()).replace("-", "")


# ── Enums ─────────────────────────────────────────────────────────────────────

class CrawlStatus(str, Enum):
    QUEUED    = "queued"
    RUNNING   = "running"
    COMPLETED = "completed"
    FAILED    = "failed"
    CANCELLED = "cancelled"


class CrawlType(str, Enum):
    SINGLE = "single"
    SITE   = "site"


class IssueStatus(str, Enum):
    OPEN     = "open"
    RESOLVED = "resolved"
    IGNORED  = "ignored"


class ConnectionStatus(str, Enum):
    PENDING      = "pending"
    CONNECTED    = "connected"
    DISCONNECTED = "disconnected"
    ERROR        = "error"


class RobotsPolicy(str, Enum):
    RESPECT = "respect"
    IGNORE  = "ignore"


# ── Dataclasses ───────────────────────────────────────────────────────────────

@dataclass
class Site:
    tenant_id: str
    domain: str
    canonical_base_url: str        = ""
    display_name: str              = ""
    connection_status: ConnectionStatus = ConnectionStatus.PENDING
    country: str                   = "us"
    language: str                  = "en"
    target_location: str           = ""
    crawl_limit: int               = 500
    crawl_frequency: str           = "weekly"
    robots_policy: RobotsPolicy    = RobotsPolicy.RESPECT
    sitemap_urls: List[str]        = field(default_factory=list)
    included_paths: List[str]      = field(default_factory=list)
    excluded_paths: List[str]      = field(default_factory=list)
    archived: bool                 = False
    archived_at: str               = ""
    created_at: str                = ""
    updated_at: str                = ""


@dataclass
class CrawlJob:
    tenant_id: str
    site_id: str
    status: CrawlStatus     = CrawlStatus.QUEUED
    crawl_type: CrawlType   = CrawlType.SITE
    requested_limit: int    = 500
    discovered_count: int   = 0
    crawled_count: int      = 0
    failed_count: int       = 0
    queued_at: str          = ""
    started_at: str         = ""
    finished_at: str        = ""
    cancelled_at: str       = ""
    error_category: str     = ""
    retry_count: int        = 0
    lock_owner: str         = ""
    lock_expires_at: str    = ""
    progress: float         = 0.0
    config_snapshot: Dict   = field(default_factory=dict)


@dataclass
class CrawledPage:
    tenant_id: str
    site_id: str
    crawl_job_id: str
    url: str
    normalized_url: str     = ""
    status_code: int        = 0
    content_type: str       = "text/html"
    canonical: str          = ""
    title: str              = ""
    meta_description: str   = ""
    h1: str                 = ""
    word_count: int         = 0
    content_hash: str       = ""
    indexability: str       = "indexable"
    internal_links_in: int  = 0
    internal_links_out: int = 0
    response_time_ms: int   = 0
    page_size_bytes: int    = 0
    crawled_at: str         = ""
    extra: Dict             = field(default_factory=dict)


@dataclass
class SeoIssue:
    tenant_id: str
    site_id: str
    crawl_job_id: str
    page_id: str
    rule_key: str
    category: str
    severity: Severity        = Severity.MEDIUM
    status: IssueStatus       = IssueStatus.OPEN
    evidence: Dict            = field(default_factory=dict)
    recommendation: str       = ""
    fix_mode: str             = ""
    rule_version: str         = ""
    first_detected_at: str    = ""
    last_detected_at: str     = ""
    resolved_at: str          = ""


@dataclass
class Report:
    tenant_id: str
    site_id: str
    crawl_job_id: str
    score: int                  = 0
    category_scores: Dict       = field(default_factory=dict)
    issue_counts: Dict          = field(default_factory=dict)
    created_at: str             = ""
    export_metadata: Dict       = field(default_factory=dict)


# ── Shared base repo ──────────────────────────────────────────────────────────

class _Repo:
    table_name: str = ""

    def __init__(self) -> None:
        self._repo = persistence.table(self.table_name)

    def _save(self, row_id: str, tenant_id: str, obj) -> None:
        existing = self._repo.get(tenant_id, row_id)
        created  = existing.get("created_at") if existing else None
        self._repo.upsert(
            persistence.envelope(row_id, tenant_id, _dataclass_to_dict(obj), created)
        )

    def _rows(self, tenant_id: str) -> List[dict]:
        return self._repo.list_by_tenant(tenant_id)


def _dataclass_to_dict(obj) -> dict:
    """Serialize a dataclass to a dict, converting enums to their .value."""
    import dataclasses
    d = dataclasses.asdict(obj)
    return _unwrap_enums(d)


def _unwrap_enums(v):
    if isinstance(v, Enum):
        return v.value
    if isinstance(v, dict):
        return {k: _unwrap_enums(val) for k, val in v.items()}
    if isinstance(v, list):
        return [_unwrap_enums(i) for i in v]
    return v


def _restore_enum(cls, value):
    """Restore an enum from a string value; return the raw string on failure."""
    try:
        return cls(value)
    except (ValueError, KeyError):
        return value


# ── SiteRepository ────────────────────────────────────────────────────────────

class SiteRepository(_Repo):
    table_name = "seo_sites"

    def _build(self, row: Optional[dict]) -> Optional[Tuple[str, Site]]:
        if not row:
            return None
        d = row["data"]
        site = Site(
            tenant_id          = d["tenant_id"],
            domain             = d["domain"],
            canonical_base_url = d.get("canonical_base_url", ""),
            display_name       = d.get("display_name", ""),
            connection_status  = _restore_enum(ConnectionStatus, d.get("connection_status", "pending")),
            country            = d.get("country", "us"),
            language           = d.get("language", "en"),
            target_location    = d.get("target_location", ""),
            crawl_limit        = d.get("crawl_limit", 500),
            crawl_frequency    = d.get("crawl_frequency", "weekly"),
            robots_policy      = _restore_enum(RobotsPolicy, d.get("robots_policy", "respect")),
            sitemap_urls       = d.get("sitemap_urls", []),
            included_paths     = d.get("included_paths", []),
            excluded_paths     = d.get("excluded_paths", []),
            archived           = d.get("archived", False),
            archived_at        = d.get("archived_at", ""),
            created_at         = row.get("created_at", ""),
            updated_at         = row.get("updated_at", ""),
        )
        return row["id"], site

    def create(self, site: Site) -> Tuple[str, Site]:
        sid = _uid("site_")
        ts  = _now()
        site.created_at = ts
        site.updated_at = ts
        self._save(sid, site.tenant_id, site)
        return sid, site

    def get(self, tenant_id: str, site_id: str) -> Optional[Tuple[str, Site]]:
        return self._build(self._repo.get(tenant_id, site_id))

    def update(self, tenant_id: str, site_id: str, **fields) -> Optional[Tuple[str, Site]]:
        row = self._repo.get(tenant_id, site_id)
        if not row:
            return None
        _, site = self._build(row)
        for k, v in fields.items():
            if hasattr(site, k):
                setattr(site, k, v)
        site.updated_at = _now()
        self._save(site_id, tenant_id, site)
        return site_id, site

    def delete(self, tenant_id: str, site_id: str) -> bool:
        return self._repo.delete(tenant_id, site_id)

    def archive(self, tenant_id: str, site_id: str) -> Optional[Tuple[str, "Site"]]:
        """Soft-delete: set archived=True and archived_at=now."""
        return self.update(tenant_id, site_id, archived=True, archived_at=_now())

    def restore(self, tenant_id: str, site_id: str) -> Optional[Tuple[str, "Site"]]:
        """Restore a soft-deleted site: set archived=False and archived_at=''."""
        return self.update(tenant_id, site_id, archived=False, archived_at="")

    def list(self, tenant_id: str, include_archived: bool = False) -> List[Tuple[str, "Site"]]:
        pairs = [self._build(r) for r in self._rows(tenant_id)]
        pairs = [p for p in pairs if p]
        if not include_archived:
            pairs = [(sid, s) for sid, s in pairs if not s.archived]
        return pairs


# ── CrawlJobRepository ────────────────────────────────────────────────────────

class CrawlJobRepository(_Repo):
    table_name = "seo_crawl_jobs"

    def _build(self, row: Optional[dict]) -> Optional[Tuple[str, CrawlJob]]:
        if not row:
            return None
        d = row["data"]
        job = CrawlJob(
            tenant_id       = d["tenant_id"],
            site_id         = d["site_id"],
            status          = _restore_enum(CrawlStatus, d.get("status", "queued")),
            crawl_type      = _restore_enum(CrawlType,   d.get("crawl_type", "site")),
            requested_limit = d.get("requested_limit", 500),
            discovered_count= d.get("discovered_count", 0),
            crawled_count   = d.get("crawled_count", 0),
            failed_count    = d.get("failed_count", 0),
            queued_at       = d.get("queued_at", ""),
            started_at      = d.get("started_at", ""),
            finished_at     = d.get("finished_at", ""),
            cancelled_at    = d.get("cancelled_at", ""),
            error_category  = d.get("error_category", ""),
            retry_count     = d.get("retry_count", 0),
            lock_owner      = d.get("lock_owner", ""),
            lock_expires_at = d.get("lock_expires_at", ""),
            progress        = d.get("progress", 0.0),
            config_snapshot = d.get("config_snapshot", {}),
        )
        return row["id"], job

    def create(self, job: CrawlJob) -> Tuple[str, CrawlJob]:
        jid = _uid("crawl_")
        if not job.queued_at:
            job.queued_at = _now()
        self._save(jid, job.tenant_id, job)
        return jid, job

    def get(self, tenant_id: str, job_id: str) -> Optional[Tuple[str, CrawlJob]]:
        return self._build(self._repo.get(tenant_id, job_id))

    def update(self, tenant_id: str, job_id: str, **fields) -> Optional[Tuple[str, CrawlJob]]:
        row = self._repo.get(tenant_id, job_id)
        if not row:
            return None
        _, job = self._build(row)
        for k, v in fields.items():
            if hasattr(job, k):
                setattr(job, k, v)
        self._save(job_id, tenant_id, job)
        return job_id, job

    def delete(self, tenant_id: str, job_id: str) -> bool:
        return self._repo.delete(tenant_id, job_id)

    def list_by_site(self, tenant_id: str, site_id: str) -> List[Tuple[str, CrawlJob]]:
        pairs = [self._build(r) for r in self._rows(tenant_id)]
        return [(i, j) for p in [pairs] for i, j in (p if p else []) if j.site_id == site_id]

    def list(self, tenant_id: str) -> List[Tuple[str, CrawlJob]]:
        pairs = [self._build(r) for r in self._rows(tenant_id)]
        return [p for p in pairs if p]


# ── CrawledPageRepository ─────────────────────────────────────────────────────

class CrawledPageRepository(_Repo):
    table_name = "seo_crawled_pages"

    def _build(self, row: Optional[dict]) -> Optional[Tuple[str, CrawledPage]]:
        if not row:
            return None
        d = row["data"]
        page = CrawledPage(
            tenant_id          = d["tenant_id"],
            site_id            = d["site_id"],
            crawl_job_id       = d["crawl_job_id"],
            url                = d["url"],
            normalized_url     = d.get("normalized_url", ""),
            status_code        = d.get("status_code", 0),
            content_type       = d.get("content_type", "text/html"),
            canonical          = d.get("canonical", ""),
            title              = d.get("title", ""),
            meta_description   = d.get("meta_description", ""),
            h1                 = d.get("h1", ""),
            word_count         = d.get("word_count", 0),
            content_hash       = d.get("content_hash", ""),
            indexability       = d.get("indexability", "indexable"),
            internal_links_in  = d.get("internal_links_in", 0),
            internal_links_out = d.get("internal_links_out", 0),
            response_time_ms   = d.get("response_time_ms", 0),
            page_size_bytes    = d.get("page_size_bytes", 0),
            crawled_at         = d.get("crawled_at", ""),
            extra              = d.get("extra", {}),
        )
        return row["id"], page

    def create(self, page: CrawledPage) -> Tuple[str, CrawledPage]:
        pid = _uid("page_")
        if not page.crawled_at:
            page.crawled_at = _now()
        self._save(pid, page.tenant_id, page)
        return pid, page

    def get(self, tenant_id: str, page_id: str) -> Optional[Tuple[str, CrawledPage]]:
        return self._build(self._repo.get(tenant_id, page_id))

    def delete(self, tenant_id: str, page_id: str) -> bool:
        return self._repo.delete(tenant_id, page_id)

    def list_by_crawl_job(
        self, tenant_id: str, crawl_job_id: str,
        limit: int = 100, offset: int = 0,
    ) -> Tuple[int, List[Tuple[str, CrawledPage]]]:
        all_rows = self._rows(tenant_id)
        matched  = [self._build(r) for r in all_rows
                    if r["data"].get("crawl_job_id") == crawl_job_id]
        matched  = [p for p in matched if p]
        # insertion order (created_at asc is the natural order from list_by_tenant)
        total    = len(matched)
        page     = matched[offset: offset + limit]
        return total, page

    def list_by_site(
        self, tenant_id: str, site_id: str,
        limit: int = 100, offset: int = 0,
    ) -> Tuple[int, List[Tuple[str, CrawledPage]]]:
        all_rows = self._rows(tenant_id)
        matched  = [self._build(r) for r in all_rows
                    if r["data"].get("site_id") == site_id]
        matched  = [p for p in matched if p]
        total    = len(matched)
        page     = matched[offset: offset + limit]
        return total, page


# ── SeoIssueRepository ────────────────────────────────────────────────────────

class SeoIssueRepository(_Repo):
    table_name = "seo_issues"

    def _build(self, row: Optional[dict]) -> Optional[Tuple[str, SeoIssue]]:
        if not row:
            return None
        d = row["data"]
        issue = SeoIssue(
            tenant_id         = d["tenant_id"],
            site_id           = d["site_id"],
            crawl_job_id      = d["crawl_job_id"],
            page_id           = d["page_id"],
            rule_key          = d["rule_key"],
            category          = d.get("category", ""),
            severity          = _restore_enum(Severity,     d.get("severity", "medium")),
            status            = _restore_enum(IssueStatus,  d.get("status", "open")),
            evidence          = d.get("evidence", {}),
            recommendation    = d.get("recommendation", ""),
            fix_mode          = d.get("fix_mode", ""),
            rule_version      = d.get("rule_version", ""),
            first_detected_at = d.get("first_detected_at", ""),
            last_detected_at  = d.get("last_detected_at", ""),
            resolved_at       = d.get("resolved_at", ""),
        )
        return row["id"], issue

    def create(self, issue: SeoIssue) -> Tuple[str, SeoIssue]:
        iid = _uid("issue_")
        ts  = _now()
        if not issue.first_detected_at:
            issue.first_detected_at = ts
        if not issue.last_detected_at:
            issue.last_detected_at = ts
        self._save(iid, issue.tenant_id, issue)
        return iid, issue

    def get(self, tenant_id: str, issue_id: str) -> Optional[Tuple[str, SeoIssue]]:
        return self._build(self._repo.get(tenant_id, issue_id))

    def update(self, tenant_id: str, issue_id: str, **fields) -> Optional[Tuple[str, SeoIssue]]:
        row = self._repo.get(tenant_id, issue_id)
        if not row:
            return None
        _, issue = self._build(row)
        for k, v in fields.items():
            if hasattr(issue, k):
                setattr(issue, k, v)
        self._save(issue_id, tenant_id, issue)
        return issue_id, issue

    def delete(self, tenant_id: str, issue_id: str) -> bool:
        return self._repo.delete(tenant_id, issue_id)

    def list_by_site(
        self, tenant_id: str, site_id: str,
        severity: Optional[Severity] = None,
        status: Optional[IssueStatus] = None,
    ) -> List[Tuple[str, SeoIssue]]:
        pairs = [self._build(r) for r in self._rows(tenant_id)]
        pairs = [p for p in pairs if p and p[1].site_id == site_id]
        if severity is not None:
            pairs = [(i, iss) for i, iss in pairs if iss.severity == severity]
        if status is not None:
            pairs = [(i, iss) for i, iss in pairs if iss.status == status]
        return pairs

    def list_by_crawl_job(
        self, tenant_id: str, crawl_job_id: str,
        severity: Optional[Severity] = None,
        status: Optional[IssueStatus] = None,
    ) -> List[Tuple[str, SeoIssue]]:
        pairs = [self._build(r) for r in self._rows(tenant_id)]
        pairs = [p for p in pairs if p and p[1].crawl_job_id == crawl_job_id]
        if severity is not None:
            pairs = [(i, iss) for i, iss in pairs if iss.severity == severity]
        if status is not None:
            pairs = [(i, iss) for i, iss in pairs if iss.status == status]
        return pairs


# ── ReportRepository ──────────────────────────────────────────────────────────

class ReportRepository(_Repo):
    table_name = "seo_reports"

    def _build(self, row: Optional[dict]) -> Optional[Tuple[str, Report]]:
        if not row:
            return None
        d = row["data"]
        report = Report(
            tenant_id       = d["tenant_id"],
            site_id         = d["site_id"],
            crawl_job_id    = d["crawl_job_id"],
            score           = d.get("score", 0),
            category_scores = d.get("category_scores", {}),
            issue_counts    = d.get("issue_counts", {}),
            created_at      = row.get("created_at", ""),
            export_metadata = d.get("export_metadata", {}),
        )
        return row["id"], report

    def create(self, report: Report) -> Tuple[str, Report]:
        rid = _uid("rpt_")
        ts  = _now()
        report.created_at = ts
        self._save(rid, report.tenant_id, report)
        return rid, report

    def get(self, tenant_id: str, report_id: str) -> Optional[Tuple[str, Report]]:
        return self._build(self._repo.get(tenant_id, report_id))

    def delete(self, tenant_id: str, report_id: str) -> bool:
        return self._repo.delete(tenant_id, report_id)

    def list_by_site(self, tenant_id: str, site_id: str) -> List[Tuple[str, Report]]:
        pairs = [self._build(r) for r in self._rows(tenant_id)]
        return [(i, rep) for p in [pairs] for i, rep in (p if p else []) if rep.site_id == site_id]

    def latest_report(self, tenant_id: str, site_id: str) -> Optional[Tuple[str, Report]]:
        reports = self.list_by_site(tenant_id, site_id)
        if not reports:
            return None
        # sort by created_at descending (ISO strings compare correctly)
        reports.sort(key=lambda pair: pair[1].created_at, reverse=True)
        return reports[0]


# ── Singletons + reset ────────────────────────────────────────────────────────

_REPOS: dict = {}


def _repo(key: str, cls):
    if key not in _REPOS:
        _REPOS[key] = cls()
    return _REPOS[key]


def reset_repositories() -> None:
    """Clear cached repo singletons. Call between tests or after env changes."""
    _REPOS.clear()


def get_site_repository() -> SiteRepository:
    return _repo("site", SiteRepository)


def get_crawl_job_repository() -> CrawlJobRepository:
    return _repo("crawl_job", CrawlJobRepository)


def get_crawled_page_repository() -> CrawledPageRepository:
    return _repo("crawled_page", CrawledPageRepository)


def get_issue_repository() -> SeoIssueRepository:
    return _repo("issue", SeoIssueRepository)


def get_report_repository() -> ReportRepository:
    return _repo("report", ReportRepository)


# ── Convenience query helpers ─────────────────────────────────────────────────

def list_sites(tenant_id: str, include_archived: bool = False) -> List[Tuple[str, Site]]:
    return get_site_repository().list(tenant_id, include_archived=include_archived)


def get_site(tenant_id: str, site_id: str) -> Optional[Tuple[str, Site]]:
    return get_site_repository().get(tenant_id, site_id)


def create_crawl_job(
    tenant_id: str,
    site_id: str,
    crawl_type: CrawlType = CrawlType.SITE,
    requested_limit: int = 500,
    **extra,
) -> Tuple[str, CrawlJob]:
    job = CrawlJob(
        tenant_id=tenant_id,
        site_id=site_id,
        crawl_type=crawl_type,
        requested_limit=requested_limit,
        queued_at=_now(),
        **extra,
    )
    return get_crawl_job_repository().create(job)


def update_crawl_job(
    tenant_id: str, job_id: str, **fields
) -> Optional[Tuple[str, CrawlJob]]:
    return get_crawl_job_repository().update(tenant_id, job_id, **fields)


def list_pages(
    tenant_id: str,
    crawl_job_id: str,
    limit: int = 100,
    offset: int = 0,
) -> Tuple[int, List[Tuple[str, CrawledPage]]]:
    return get_crawled_page_repository().list_by_crawl_job(
        tenant_id, crawl_job_id, limit=limit, offset=offset
    )


def list_issues(
    tenant_id: str,
    site_id: Optional[str] = None,
    crawl_job_id: Optional[str] = None,
    severity: Optional[Severity] = None,
    status: Optional[IssueStatus] = None,
) -> List[Tuple[str, SeoIssue]]:
    repo = get_issue_repository()
    if crawl_job_id:
        return repo.list_by_crawl_job(tenant_id, crawl_job_id, severity=severity, status=status)
    if site_id:
        return repo.list_by_site(tenant_id, site_id, severity=severity, status=status)
    # fallback: all issues for tenant (filtered)
    pairs = [repo._build(r) for r in repo._rows(tenant_id)]
    pairs = [p for p in pairs if p]
    if severity is not None:
        pairs = [(i, iss) for i, iss in pairs if iss.severity == severity]
    if status is not None:
        pairs = [(i, iss) for i, iss in pairs if iss.status == status]
    return pairs


def latest_report(tenant_id: str, site_id: str) -> Optional[Tuple[str, Report]]:
    return get_report_repository().latest_report(tenant_id, site_id)
