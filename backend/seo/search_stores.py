"""Durable, tenant-scoped repositories for the SEO *search-intelligence* layer.

This is the persistence keystone for Google connections, Search Console / GA4
sync, keyword projects, rank tracking, competitors, opportunities, content
briefs, alerts and fix-verification. It deliberately lives in its OWN module
(new file, no edits to ``seo/stores.py``) and reuses the exact same envelope
convention + ``persistence`` seam as ``seo/stores.py`` so records are in-memory
for tests and durable + multi-instance for ``file``/``supabase``.

Every repository stores the normalised ROW envelope::

    { id, tenant_id, created_at, updated_at, data (jsonb) }

Queryable fields live inside ``data`` and are indexed via ``data->>'field'``
expression indexes (see supabase/migrations/20260729_seo_search_intelligence.sql).

Entity → table mapping (no digits in table names — the migration-coverage
regex is digit-blind; GA4 tables are named ``seo_analytics_*``):

  GoogleConnection    → seo_google_connections     (gconn_)
  GoogleProperty      → seo_google_properties      (gprop_)
  GscSyncJob          → seo_gsc_sync_jobs           (gscjob_)
  GscQueryRow         → seo_gsc_query_rows          (gscrow_)
  Ga4SyncJob          → seo_analytics_sync_jobs     (ga4job_)
  Ga4LandingRow       → seo_analytics_landing_rows  (ga4row_)
  KeywordProject      → seo_keyword_projects        (kwproj_)
  Keyword             → seo_keywords                (kw_)
  KeywordMetric       → seo_keyword_metrics         (kwm_)
  KeywordCluster      → seo_keyword_clusters        (kwc_)
  RankJob             → seo_rank_jobs               (rankjob_)
  RankSnapshot        → seo_rank_snapshots          (ranksnap_)
  Competitor          → seo_competitors             (comp_)
  CompetitorSnapshot  → seo_competitor_snapshots    (compsnap_)
  SeoOpportunity      → seo_opportunities           (opp_)
  ContentBrief        → seo_content_briefs          (brief_)
  SeoAlert            → seo_alerts                  (alert_)
  FixVerification     → seo_fix_verification        (fixver_)
"""

from __future__ import annotations

import dataclasses
from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Optional, Tuple

# Reuse the base repo + helpers from the existing SEO stores module so the
# envelope/serialisation behaviour is byte-for-byte identical.
from seo.stores import _Repo, _uid, _now, _restore_enum  # noqa: F401
from seo.schemas import Severity


# ── Enums ─────────────────────────────────────────────────────────────────────

class GoogleConnStatus(str, Enum):
    PENDING   = "pending"
    CONNECTED = "connected"
    EXPIRED   = "expired"
    REVOKED   = "revoked"
    ERROR     = "error"


class SyncJobStatus(str, Enum):
    QUEUED    = "queued"
    RUNNING   = "running"
    COMPLETED = "completed"
    FAILED    = "failed"
    CANCELLED = "cancelled"


class DeviceType(str, Enum):
    DESKTOP = "desktop"
    MOBILE  = "mobile"


class SearchIntent(str, Enum):
    INFORMATIONAL = "informational"
    COMMERCIAL    = "commercial"
    TRANSACTIONAL = "transactional"
    NAVIGATIONAL  = "navigational"
    LOCAL         = "local"
    UNKNOWN       = "unknown"


class TrackingStatus(str, Enum):
    TRACKED   = "tracked"
    PAUSED    = "paused"
    UNTRACKED = "untracked"


class OpportunityStatus(str, Enum):
    OPEN      = "open"
    ACTIONED  = "actioned"
    DISMISSED = "dismissed"


class BriefStatus(str, Enum):
    DRAFT    = "draft"
    APPROVED = "approved"
    ARCHIVED = "archived"


class AlertStatus(str, Enum):
    UNREAD    = "unread"
    READ      = "read"
    DISMISSED = "dismissed"


class VerifyStatus(str, Enum):
    PENDING  = "pending"
    VERIFIED = "verified"
    FAILED   = "failed"


# ── Dataclasses ───────────────────────────────────────────────────────────────

@dataclass
class GoogleConnection:
    """One Google account connection (GSC and/or GA4) for a workspace.

    Tokens are stored SEALED (see seo.google.crypto); the *_sealed fields hold
    ciphertext refs, never plaintext. Refresh tokens are never returned to the
    frontend (the repository is backend-only)."""
    tenant_id: str
    kind: str                       = "google"     # "gsc" | "ga4" | "google"
    account_email: str              = ""
    status: GoogleConnStatus        = GoogleConnStatus.PENDING
    scopes: List[str]               = field(default_factory=list)
    access_token_sealed: str        = ""
    refresh_token_sealed: str       = ""
    token_expiry: str               = ""
    last_synced_at: str             = ""
    last_success_at: str            = ""
    last_error: str                 = ""
    created_at: str                 = ""
    updated_at: str                 = ""


@dataclass
class GoogleProperty:
    """A GSC property or GA4 property discovered on a connection, optionally
    mapped to a Pixie SEO site."""
    tenant_id: str
    connection_id: str
    kind: str                       = "gsc"        # "gsc" | "ga4"
    property_id: str                = ""           # sc-domain:example.com | properties/123
    property_type: str              = ""           # "domain" | "url_prefix" | "ga4"
    display_name: str               = ""
    permission_level: str           = ""
    site_id: str                    = ""           # mapped Pixie SEO site (empty = unmapped)
    selected: bool                  = False
    created_at: str                 = ""
    updated_at: str                 = ""


@dataclass
class GscSyncJob:
    tenant_id: str
    connection_id: str
    property_id: str
    site_id: str                    = ""
    status: SyncJobStatus           = SyncJobStatus.QUEUED
    window_start: str               = ""
    window_end: str                 = ""
    cursor_date: str                = ""           # last-success cursor for incremental sync
    rows_upserted: int              = 0
    retry_count: int                = 0
    lock_owner: str                 = ""
    lock_expires_at: str            = ""
    error: str                      = ""
    queued_at: str                  = ""
    started_at: str                 = ""
    finished_at: str                = ""
    created_at: str                 = ""
    updated_at: str                 = ""


@dataclass
class GscQueryRow:
    tenant_id: str
    property_id: str
    site_id: str                    = ""
    date: str                       = ""
    query: str                      = ""
    page: str                       = ""
    country: str                    = ""
    device: str                     = ""
    search_appearance: str          = ""
    clicks: int                     = 0
    impressions: int                = 0
    ctr: float                      = 0.0
    position: float                 = 0.0
    created_at: str                 = ""


@dataclass
class Ga4SyncJob:
    tenant_id: str
    connection_id: str
    property_id: str
    site_id: str                    = ""
    status: SyncJobStatus           = SyncJobStatus.QUEUED
    window_start: str               = ""
    window_end: str                 = ""
    cursor_date: str                = ""
    rows_upserted: int              = 0
    retry_count: int                = 0
    lock_owner: str                 = ""
    lock_expires_at: str            = ""
    error: str                      = ""
    queued_at: str                  = ""
    started_at: str                 = ""
    finished_at: str                = ""
    created_at: str                 = ""
    updated_at: str                 = ""


@dataclass
class Ga4LandingRow:
    tenant_id: str
    property_id: str
    site_id: str                    = ""
    date: str                       = ""
    landing_page: str               = ""
    channel: str                    = ""           # e.g. "Organic Search"
    source_medium: str              = ""
    device_category: str            = ""
    country: str                    = ""
    sessions: int                   = 0
    engaged_sessions: int           = 0
    engagement_rate: float          = 0.0
    avg_engagement_time: float      = 0.0
    new_users: int                  = 0
    returning_users: int            = 0
    conversions: float              = 0.0
    revenue: float                  = 0.0
    created_at: str                 = ""


@dataclass
class KeywordProject:
    tenant_id: str
    site_id: str                    = ""
    name: str                       = ""
    country: str                    = "us"
    language: str                   = "en"
    search_engine: str              = "google"
    location: str                   = ""
    device: DeviceType              = DeviceType.DESKTOP
    default_domain: str             = ""
    competitors: List[str]          = field(default_factory=list)
    archived: bool                  = False
    created_at: str                 = ""
    updated_at: str                 = ""


@dataclass
class Keyword:
    tenant_id: str
    project_id: str
    keyword: str
    normalized_keyword: str         = ""
    site_id: str                    = ""
    search_volume: Optional[int]    = None
    cpc: Optional[float]            = None
    competition: Optional[float]    = None
    difficulty: Optional[int]       = None
    intent: SearchIntent            = SearchIntent.UNKNOWN
    trend: List[int]                = field(default_factory=list)
    serp_features: List[str]        = field(default_factory=list)
    cluster_id: str                 = ""
    target_page: str                = ""
    current_rank: Optional[int]     = None
    best_rank: Optional[int]        = None
    previous_rank: Optional[int]    = None
    ranking_url: str                = ""
    data_provider: str              = ""
    data_timestamp: str             = ""
    tracking_status: TrackingStatus = TrackingStatus.UNTRACKED
    tags: List[str]                 = field(default_factory=list)
    notes: str                      = ""
    created_at: str                 = ""
    updated_at: str                 = ""


@dataclass
class KeywordMetric:
    """A point-in-time provider metric snapshot for a keyword (volume/cpc/etc.)."""
    tenant_id: str
    keyword_id: str
    project_id: str                 = ""
    search_volume: Optional[int]    = None
    cpc: Optional[float]            = None
    competition: Optional[float]    = None
    difficulty: Optional[int]       = None
    trend: List[int]                = field(default_factory=list)
    data_provider: str              = ""
    data_timestamp: str             = ""
    created_at: str                 = ""


@dataclass
class KeywordCluster:
    tenant_id: str
    project_id: str
    name: str                       = ""
    primary_keyword: str            = ""
    target_url: str                 = ""
    intent: SearchIntent            = SearchIntent.UNKNOWN
    method: str                     = "semantic"   # "semantic" | "serp" | "manual"
    version: int                    = 1
    page_status: str                = ""           # "new_page" | "existing_page"
    keyword_ids: List[str]          = field(default_factory=list)
    created_at: str                 = ""
    updated_at: str                 = ""


@dataclass
class RankJob:
    tenant_id: str
    project_id: str
    site_id: str                    = ""
    status: SyncJobStatus           = SyncJobStatus.QUEUED
    frequency: str                  = "manual"     # "daily" | "weekly" | "manual"
    keyword_ids: List[str]          = field(default_factory=list)
    scheduled_for: str              = ""
    checked_count: int              = 0
    error_count: int                = 0
    retry_count: int                = 0
    lock_owner: str                 = ""
    lock_expires_at: str            = ""
    error: str                      = ""
    queued_at: str                  = ""
    started_at: str                 = ""
    finished_at: str                = ""
    created_at: str                 = ""
    updated_at: str                 = ""


@dataclass
class RankSnapshot:
    tenant_id: str
    project_id: str
    keyword_id: str
    keyword: str                    = ""
    date: str                       = ""
    position: Optional[int]         = None
    previous_position: Optional[int] = None
    ranking_url: str                = ""
    serp_url: str                   = ""
    serp_title: str                 = ""
    serp_features: List[str]        = field(default_factory=list)
    featured_snippet: bool          = False
    local_pack: bool                = False
    competitor_positions: Dict      = field(default_factory=dict)
    provider: str                   = ""
    data_freshness: str             = ""
    error: str                      = ""
    rank_job_id: str                = ""
    created_at: str                 = ""


@dataclass
class Competitor:
    tenant_id: str
    project_id: str
    domain: str
    site_id: str                    = ""
    display_name: str               = ""
    country: str                    = "us"
    language: str                   = "en"
    tracking_status: TrackingStatus = TrackingStatus.TRACKED
    notes: str                      = ""
    last_refreshed_at: str          = ""
    created_at: str                 = ""
    updated_at: str                 = ""


@dataclass
class CompetitorSnapshot:
    tenant_id: str
    competitor_id: str
    project_id: str                 = ""
    date: str                       = ""
    visibility_score: float         = 0.0
    tracked_keywords: int           = 0
    keywords_ranked: int            = 0
    avg_position: float             = 0.0
    top_pages: List[Dict]           = field(default_factory=list)
    provider: str                   = ""
    is_estimate: bool               = False
    created_at: str                 = ""


@dataclass
class SeoOpportunity:
    tenant_id: str
    site_id: str                    = ""
    project_id: str                 = ""
    opp_type: str                   = ""           # e.g. "low_ctr", "striking_distance"
    page_id: str                    = ""
    page_url: str                   = ""
    keyword_id: str                 = ""
    keyword: str                    = ""
    evidence: Dict                  = field(default_factory=dict)
    source_data: Dict               = field(default_factory=dict)
    estimated_impact: str           = ""
    confidence: float               = 0.0
    recommended_action: str         = ""
    effort: str                     = ""           # "low" | "medium" | "high"
    priority_score: float           = 0.0
    score_inputs: Dict              = field(default_factory=dict)
    status: OpportunityStatus       = OpportunityStatus.OPEN
    data_timestamp: str             = ""
    created_at: str                 = ""
    updated_at: str                 = ""


@dataclass
class ContentBrief:
    tenant_id: str
    site_id: str                    = ""
    project_id: str                 = ""
    cluster_id: str                 = ""
    primary_keyword: str            = ""
    secondary_keywords: List[str]   = field(default_factory=list)
    search_intent: str              = ""
    target_audience: str            = ""
    title_options: List[str]        = field(default_factory=list)
    meta_direction: str             = ""
    word_count_min: int             = 0
    word_count_max: int             = 0
    outline: List[Dict]             = field(default_factory=list)
    headings: List[str]             = field(default_factory=list)
    questions: List[str]            = field(default_factory=list)
    entities: List[str]             = field(default_factory=list)
    competitor_headings: List[str]  = field(default_factory=list)
    internal_links: List[Dict]      = field(default_factory=list)
    external_sources: List[str]     = field(default_factory=list)
    schema_recommendation: str      = ""
    cta_direction: str              = ""
    source_data: Dict               = field(default_factory=dict)
    status: BriefStatus             = BriefStatus.DRAFT
    version: int                    = 1
    handoff_ref: str                = ""           # content-agent document id, once handed off
    created_at: str                 = ""
    updated_at: str                 = ""


@dataclass
class SeoAlert:
    tenant_id: str
    site_id: str                    = ""
    project_id: str                 = ""
    alert_type: str                 = ""
    severity: Severity              = Severity.MEDIUM
    title: str                      = ""
    message: str                    = ""
    evidence: Dict                  = field(default_factory=dict)
    data_source: str                = ""
    affected_item_type: str         = ""
    affected_item_id: str           = ""
    affected_url: str               = ""
    link: str                       = ""
    status: AlertStatus             = AlertStatus.UNREAD
    read_at: str                    = ""
    created_at: str                 = ""
    updated_at: str                 = ""


@dataclass
class FixVerification:
    tenant_id: str
    site_id: str                    = ""
    issue_id: str                   = ""
    page_id: str                    = ""
    page_url: str                   = ""
    rule_key: str                   = ""
    applied_fix: str                = ""
    field_name: str                 = ""
    before_value: str               = ""
    intended_after_value: str       = ""
    recrawl_job_id: str             = ""
    observed_after_value: str       = ""
    result: VerifyStatus            = VerifyStatus.PENDING
    remaining_evidence: Dict        = field(default_factory=dict)
    verified_at: str                = ""
    created_at: str                 = ""
    updated_at: str                 = ""


# ── Generic auto-repository ────────────────────────────────────────────────────
# 18 entities share the identical create/get/update/delete/list contract, so we
# derive it once from the dataclass definition rather than hand-writing each
# _build. Enum fields are declared per-repo so they round-trip as enums (the
# store contract test asserts this). tenant scoping is inherited from _Repo
# (list_by_tenant only returns the caller's rows).

class _AutoRepo(_Repo):
    model: type = None
    id_prefix: str = ""
    enum_fields: Dict[str, type] = {}
    # fields to stamp with _now() at create time if empty
    stamp_on_create: Tuple[str, ...] = ("created_at", "updated_at")

    def _build(self, row: Optional[dict]):
        if not row:
            return None
        d = row.get("data", {})
        kwargs = {}
        for f in dataclasses.fields(self.model):
            if f.name not in d:
                continue
            val = d[f.name]
            if f.name in self.enum_fields and isinstance(val, str):
                val = _restore_enum(self.enum_fields[f.name], val)
            kwargs[f.name] = val
        return row["id"], self.model(**kwargs)

    def create(self, obj):
        rid = _uid(self.id_prefix)
        ts = _now()
        for name in self.stamp_on_create:
            if hasattr(obj, name) and not getattr(obj, name):
                setattr(obj, name, ts)
        self._save(rid, obj.tenant_id, obj)
        return rid, obj

    def get(self, tenant_id: str, row_id: str):
        return self._build(self._repo.get(tenant_id, row_id))

    def update(self, tenant_id: str, row_id: str, **fields):
        row = self._repo.get(tenant_id, row_id)
        if not row:
            return None
        _, obj = self._build(row)
        for k, v in fields.items():
            if hasattr(obj, k):
                setattr(obj, k, v)
        if hasattr(obj, "updated_at"):
            obj.updated_at = _now()
        self._save(row_id, tenant_id, obj)
        return row_id, obj

    def delete(self, tenant_id: str, row_id: str) -> bool:
        return self._repo.delete(tenant_id, row_id)

    def list(self, tenant_id: str):
        return [p for p in (self._build(r) for r in self._rows(tenant_id)) if p]

    def list_where(self, tenant_id: str, **eq):
        """List rows whose data fields all equal the given values (in insertion order)."""
        out = []
        for r in self._rows(tenant_id):
            data = r.get("data", {})
            if all(data.get(k) == v for k, v in eq.items()):
                built = self._build(r)
                if built:
                    out.append(built)
        return out


# ── Concrete repositories ──────────────────────────────────────────────────────

class GoogleConnectionRepository(_AutoRepo):
    table_name = "seo_google_connections"
    model = GoogleConnection
    id_prefix = "gconn_"
    enum_fields = {"status": GoogleConnStatus}


class GooglePropertyRepository(_AutoRepo):
    table_name = "seo_google_properties"
    model = GoogleProperty
    id_prefix = "gprop_"


class GscSyncJobRepository(_AutoRepo):
    table_name = "seo_gsc_sync_jobs"
    model = GscSyncJob
    id_prefix = "gscjob_"
    enum_fields = {"status": SyncJobStatus}


class GscQueryRowRepository(_AutoRepo):
    table_name = "seo_gsc_query_rows"
    model = GscQueryRow
    id_prefix = "gscrow_"
    stamp_on_create = ("created_at",)


class Ga4SyncJobRepository(_AutoRepo):
    table_name = "seo_analytics_sync_jobs"
    model = Ga4SyncJob
    id_prefix = "ga4job_"
    enum_fields = {"status": SyncJobStatus}


class Ga4LandingRowRepository(_AutoRepo):
    table_name = "seo_analytics_landing_rows"
    model = Ga4LandingRow
    id_prefix = "ga4row_"
    stamp_on_create = ("created_at",)


class KeywordProjectRepository(_AutoRepo):
    table_name = "seo_keyword_projects"
    model = KeywordProject
    id_prefix = "kwproj_"
    enum_fields = {"device": DeviceType}


class KeywordRepository(_AutoRepo):
    table_name = "seo_keywords"
    model = Keyword
    id_prefix = "kw_"
    enum_fields = {"intent": SearchIntent, "tracking_status": TrackingStatus}

    def list_by_project(self, tenant_id: str, project_id: str):
        return self.list_where(tenant_id, project_id=project_id)


class KeywordMetricRepository(_AutoRepo):
    table_name = "seo_keyword_metrics"
    model = KeywordMetric
    id_prefix = "kwm_"
    stamp_on_create = ("created_at",)


class KeywordClusterRepository(_AutoRepo):
    table_name = "seo_keyword_clusters"
    model = KeywordCluster
    id_prefix = "kwc_"
    enum_fields = {"intent": SearchIntent}

    def list_by_project(self, tenant_id: str, project_id: str):
        return self.list_where(tenant_id, project_id=project_id)


class RankJobRepository(_AutoRepo):
    table_name = "seo_rank_jobs"
    model = RankJob
    id_prefix = "rankjob_"
    enum_fields = {"status": SyncJobStatus}


class RankSnapshotRepository(_AutoRepo):
    table_name = "seo_rank_snapshots"
    model = RankSnapshot
    id_prefix = "ranksnap_"
    stamp_on_create = ("created_at",)

    def history(self, tenant_id: str, keyword_id: str):
        rows = self.list_where(tenant_id, keyword_id=keyword_id)
        rows.sort(key=lambda pair: (pair[1].date or "", pair[1].created_at or ""))
        return rows


class CompetitorRepository(_AutoRepo):
    table_name = "seo_competitors"
    model = Competitor
    id_prefix = "comp_"
    enum_fields = {"tracking_status": TrackingStatus}

    def list_by_project(self, tenant_id: str, project_id: str):
        return self.list_where(tenant_id, project_id=project_id)


class CompetitorSnapshotRepository(_AutoRepo):
    table_name = "seo_competitor_snapshots"
    model = CompetitorSnapshot
    id_prefix = "compsnap_"
    stamp_on_create = ("created_at",)


class SeoOpportunityRepository(_AutoRepo):
    table_name = "seo_opportunities"
    model = SeoOpportunity
    id_prefix = "opp_"
    enum_fields = {"status": OpportunityStatus}

    def list_by_site(self, tenant_id: str, site_id: str):
        return self.list_where(tenant_id, site_id=site_id)


class ContentBriefRepository(_AutoRepo):
    table_name = "seo_content_briefs"
    model = ContentBrief
    id_prefix = "brief_"
    enum_fields = {"status": BriefStatus}


class SeoAlertRepository(_AutoRepo):
    table_name = "seo_alerts"
    model = SeoAlert
    id_prefix = "alert_"
    enum_fields = {"severity": Severity, "status": AlertStatus}


class FixVerificationRepository(_AutoRepo):
    table_name = "seo_fix_verification"
    model = FixVerification
    id_prefix = "fixver_"
    enum_fields = {"result": VerifyStatus}


# ── Singletons ─────────────────────────────────────────────────────────────────

_REPOS: dict = {}


def _repo(key: str, cls):
    if key not in _REPOS:
        _REPOS[key] = cls()
    return _REPOS[key]


def reset_repositories() -> None:
    """Clear cached repo singletons. Call between tests or after env changes."""
    _REPOS.clear()


def get_google_connection_repository() -> GoogleConnectionRepository:
    return _repo("google_connection", GoogleConnectionRepository)


def get_google_property_repository() -> GooglePropertyRepository:
    return _repo("google_property", GooglePropertyRepository)


def get_gsc_sync_job_repository() -> GscSyncJobRepository:
    return _repo("gsc_sync_job", GscSyncJobRepository)


def get_gsc_query_row_repository() -> GscQueryRowRepository:
    return _repo("gsc_query_row", GscQueryRowRepository)


def get_ga4_sync_job_repository() -> Ga4SyncJobRepository:
    return _repo("ga4_sync_job", Ga4SyncJobRepository)


def get_ga4_landing_row_repository() -> Ga4LandingRowRepository:
    return _repo("ga4_landing_row", Ga4LandingRowRepository)


def get_keyword_project_repository() -> KeywordProjectRepository:
    return _repo("keyword_project", KeywordProjectRepository)


def get_keyword_repository() -> KeywordRepository:
    return _repo("keyword", KeywordRepository)


def get_keyword_metric_repository() -> KeywordMetricRepository:
    return _repo("keyword_metric", KeywordMetricRepository)


def get_keyword_cluster_repository() -> KeywordClusterRepository:
    return _repo("keyword_cluster", KeywordClusterRepository)


def get_rank_job_repository() -> RankJobRepository:
    return _repo("rank_job", RankJobRepository)


def get_rank_snapshot_repository() -> RankSnapshotRepository:
    return _repo("rank_snapshot", RankSnapshotRepository)


def get_competitor_repository() -> CompetitorRepository:
    return _repo("competitor", CompetitorRepository)


def get_competitor_snapshot_repository() -> CompetitorSnapshotRepository:
    return _repo("competitor_snapshot", CompetitorSnapshotRepository)


def get_opportunity_repository() -> SeoOpportunityRepository:
    return _repo("opportunity", SeoOpportunityRepository)


def get_content_brief_repository() -> ContentBriefRepository:
    return _repo("content_brief", ContentBriefRepository)


def get_alert_repository() -> SeoAlertRepository:
    return _repo("alert", SeoAlertRepository)


def get_fix_verification_repository() -> FixVerificationRepository:
    return _repo("fix_verification", FixVerificationRepository)


# All repository classes, for migration-coverage tests / introspection.
ALL_REPOSITORIES = (
    GoogleConnectionRepository,
    GooglePropertyRepository,
    GscSyncJobRepository,
    GscQueryRowRepository,
    Ga4SyncJobRepository,
    Ga4LandingRowRepository,
    KeywordProjectRepository,
    KeywordRepository,
    KeywordMetricRepository,
    KeywordClusterRepository,
    RankJobRepository,
    RankSnapshotRepository,
    CompetitorRepository,
    CompetitorSnapshotRepository,
    SeoOpportunityRepository,
    ContentBriefRepository,
    SeoAlertRepository,
    FixVerificationRepository,
)
