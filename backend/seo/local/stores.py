"""Durable, tenant-scoped repositories for the Local SEO vertical.

Reuses the same envelope convention + persistence seam as seo/stores.py and
seo/search_stores.py.  Records are in-memory for tests and durable + multi-
instance for ``file``/``supabase``.

Entity → table mapping (NO DIGITS in table names — migration-coverage regex is
digit-blind; spell out words instead):

  Location              → seo_locations              (loc_)
  GbpConnection         → seo_gbp_connections        (gbpconn_)
  GbpReview             → seo_gbp_reviews            (gbprev_)
  GbpPost               → seo_gbp_posts              (gbppost_)
  CitationSource        → seo_citation_sources       (citsrc_)
  Citation              → seo_citations              (cit_)
  LocalCompetitor       → seo_local_competitors      (lcomp_)
  LocalRankSnapshot     → seo_local_rank_snapshots   (lsnap_)
  NapAudit              → seo_nap_audits             (nap_)
  LocalSchema           → seo_local_schema           (lschema_)
"""

from __future__ import annotations

import dataclasses
from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Optional, Tuple

# Re-use the base repo + helpers so envelope/serialisation behaviour is
# byte-for-byte identical across all SEO store modules.
from seo.stores import _Repo, _uid, _now, _restore_enum  # noqa: F401
from seo.search_stores import _AutoRepo  # noqa: F401


# ── Enums ─────────────────────────────────────────────────────────────────────

class GbpConnStatus(str, Enum):
    PENDING   = "pending"
    CONNECTED = "connected"
    EXPIRED   = "expired"
    REVOKED   = "revoked"
    ERROR     = "error"


class ReplyStatus(str, Enum):
    NONE     = "none"
    DRAFTED  = "drafted"
    APPROVED = "approved"
    PUBLISHED = "published"


class PostType(str, Enum):
    UPDATE = "update"
    OFFER  = "offer"
    EVENT  = "event"


class PostStatus(str, Enum):
    DRAFT     = "draft"
    APPROVED  = "approved"
    PUBLISHED = "published"


class CitationStatus(str, Enum):
    ACTIVE    = "active"
    MISSING   = "missing"
    INCORRECT = "incorrect"
    DUPLICATE = "duplicate"
    PENDING   = "pending"


class ClaimedStatus(str, Enum):
    CLAIMED   = "claimed"
    UNCLAIMED = "unclaimed"
    UNKNOWN   = "unknown"


class SchemaStatus(str, Enum):
    PROPOSED = "proposed"
    APPROVED = "approved"
    PUBLISHED = "published"
    ARCHIVED  = "archived"


# ── Dataclasses ───────────────────────────────────────────────────────────────

@dataclass
class Location:
    """A physical business location managed by the workspace."""
    tenant_id: str
    site_id: str                     = ""
    business_name: str               = ""
    # Address
    address_line1: str               = ""
    address_line2: str               = ""
    city: str                        = ""
    region: str                      = ""   # state/province
    postal_code: str                 = ""
    country: str                     = "US"
    # Contact
    phone: str                       = ""
    website_url: str                 = ""
    # GBP category
    primary_category: str            = ""
    secondary_categories: List[str]  = field(default_factory=list)
    # Service scope
    service_areas: List[str]         = field(default_factory=list)
    hours: Dict                      = field(default_factory=dict)   # keyed by weekday
    # Geo
    lat: Optional[float]             = None
    lng: Optional[float]             = None
    # Integrations
    local_page_url: str              = ""   # URL of the location landing page
    gbp_location_id: str             = ""   # GBP resource name (e.g. accounts/X/locations/Y)
    nap_canonical: Dict              = field(default_factory=dict)   # override canonical values
    # Lifecycle
    archived: bool                   = False
    archived_at: str                 = ""
    created_at: str                  = ""
    updated_at: str                  = ""


@dataclass
class GbpConnection:
    """One Google Business Profile account connection for a workspace.

    Tokens are stored SEALED via seo.google.crypto; *_sealed fields hold
    ciphertext, never plaintext.  Refresh tokens are NEVER returned to the
    frontend."""
    tenant_id: str
    kind: str                        = "gbp"
    account_email: str               = ""
    gbp_account_name: str            = ""   # GBP resource name  (accounts/XXXXXXXX)
    status: GbpConnStatus            = GbpConnStatus.PENDING
    scopes: List[str]                = field(default_factory=list)
    access_token_sealed: str         = ""
    refresh_token_sealed: str        = ""
    token_expiry: str                = ""
    last_synced_at: str              = ""
    last_success_at: str             = ""
    last_error: str                  = ""
    created_at: str                  = ""
    updated_at: str                  = ""


@dataclass
class GbpReview:
    """A single GBP customer review for a location."""
    tenant_id: str
    location_id: str
    gbp_review_id: str               = ""   # reviewer.reviewId from GBP API
    reviewer_display_name: str       = ""
    reviewer_profile_photo_url: str  = ""
    rating: int                      = 0    # 1-5
    review_text: str                 = ""
    created_at: str                  = ""
    updated_at: str                  = ""
    # Reply state
    reply_text: str                  = ""
    reply_status: ReplyStatus        = ReplyStatus.NONE
    reply_drafted_at: str            = ""
    reply_approved_at: str           = ""
    reply_published_at: str          = ""
    assigned_to: str                 = ""   # tenant user id
    handled: bool                    = False
    # Analysis
    sentiment: str                   = ""   # "positive" | "neutral" | "negative"
    themes: List[str]                = field(default_factory=list)


@dataclass
class GbpPost:
    """A Google Business Profile post (update / offer / event)."""
    tenant_id: str
    location_id: str
    post_type: PostType              = PostType.UPDATE
    title: str                       = ""
    body: str                        = ""
    cta_label: str                   = ""
    cta_url: str                     = ""
    image_url: str                   = ""
    event_start: str                 = ""
    event_end: str                   = ""
    offer_coupon: str                = ""
    status: PostStatus               = PostStatus.DRAFT
    gbp_post_id: str                 = ""   # ID returned by GBP API after publish
    published_at: str                = ""
    created_at: str                  = ""
    updated_at: str                  = ""


@dataclass
class CitationSource:
    """A known citation directory / aggregator (shared across tenants)."""
    tenant_id: str                   # may be "global" for shared sources
    name: str                        = ""
    domain: str                      = ""
    kind: str                        = ""   # "aggregator" | "directory" | "vertical"
    priority: int                    = 0    # higher = more important
    created_at: str                  = ""
    updated_at: str                  = ""


@dataclass
class Citation:
    """A citation listing for a specific location on a specific directory."""
    tenant_id: str
    location_id: str
    directory: str                   = ""   # e.g. "Yelp", "YellowPages"
    directory_url: str               = ""   # base URL of the directory
    listing_url: str                 = ""   # direct URL to the listing
    # NAP data as observed on the directory
    business_name: str               = ""
    address: str                     = ""
    phone: str                       = ""
    website: str                     = ""
    category: str                    = ""
    # Status
    status: CitationStatus           = CitationStatus.PENDING
    claimed: ClaimedStatus           = ClaimedStatus.UNKNOWN
    consistency: Optional[float]     = None  # 0.0–1.0 NAP match score
    last_checked: str                = ""
    notes: str                       = ""
    # Provider details
    provider: str                    = ""   # e.g. "manual" | "brightlocal" | "mock"
    verification_method: str         = ""
    verification_history: List[Dict] = field(default_factory=list)
    created_at: str                  = ""
    updated_at: str                  = ""


@dataclass
class LocalCompetitor:
    """A local business competitor tracked for a location."""
    tenant_id: str
    location_id: str
    business_name: str               = ""
    domain: str                      = ""
    gbp_profile_url: str             = ""
    address: str                     = ""
    category: str                    = ""
    rating: Optional[float]          = None
    review_count: int                = 0
    notes: str                       = ""
    last_refreshed_at: str           = ""
    created_at: str                  = ""
    updated_at: str                  = ""


@dataclass
class LocalRankSnapshot:
    """A point-in-time local SERP rank for a keyword + location."""
    tenant_id: str
    location_id: str
    keyword: str                     = ""
    city: str                        = ""
    postal_code: str                 = ""
    device: str                      = "desktop"
    date: str                        = ""
    # Rank positions (None = not found in results)
    organic_position: Optional[int]  = None
    local_pack_position: Optional[int] = None
    maps_position: Optional[int]     = None
    featured_snippet: bool           = False
    # What URL is ranking
    ranking_url: str                 = ""
    # Competitor positions keyed by competitor domain
    competitor_positions: Dict       = field(default_factory=dict)
    # Provider metadata — ONLY store what the provider actually returns
    provider: str                    = ""
    is_geo_grid: bool                = False  # True only when provider supplied real grid data
    created_at: str                  = ""


@dataclass
class NapAudit:
    """A single NAP field comparison across sources for a location."""
    tenant_id: str
    location_id: str
    source: str                      = ""   # "gbp" | "website" | "citation:Yelp" | etc.
    field: str                       = ""   # "name" | "address" | "phone" | "website"
    canonical_value: str             = ""   # what we expect (from Location record)
    observed_value: str              = ""   # what was observed at the source
    mismatch: bool                   = False
    confirmed_variant: bool          = False  # True = intentional variant, not an error
    confirmed_at: str                = ""
    confirmed_by: str                = ""
    created_at: str                  = ""
    updated_at: str                  = ""


@dataclass
class LocalSchema:
    """A proposed or approved LocalBusiness JSON-LD schema for a location."""
    tenant_id: str
    location_id: str
    schema_type: str                 = "LocalBusiness"
    jsonld: Dict                     = field(default_factory=dict)
    status: SchemaStatus             = SchemaStatus.PROPOSED
    include_aggregate_rating: bool   = False  # only set when policy compliant
    approved_at: str                 = ""
    approved_by: str                 = ""
    published_at: str                = ""
    recrawl_verified: bool           = False
    notes: str                       = ""
    created_at: str                  = ""
    updated_at: str                  = ""


# ── Concrete repositories ──────────────────────────────────────────────────────

class LocationRepository(_AutoRepo):
    table_name = "seo_locations"
    model = Location
    id_prefix = "loc_"

    def list_by_site(self, tenant_id: str, site_id: str):
        return self.list_where(tenant_id, site_id=site_id)

    def list_active(self, tenant_id: str):
        """List non-archived locations."""
        return [(lid, loc) for lid, loc in self.list(tenant_id) if not loc.archived]


class GbpConnectionRepository(_AutoRepo):
    table_name = "seo_gbp_connections"
    model = GbpConnection
    id_prefix = "gbpconn_"
    enum_fields = {"status": GbpConnStatus}


class GbpReviewRepository(_AutoRepo):
    table_name = "seo_gbp_reviews"
    model = GbpReview
    id_prefix = "gbprev_"
    enum_fields = {"reply_status": ReplyStatus}

    def list_by_location(self, tenant_id: str, location_id: str):
        return self.list_where(tenant_id, location_id=location_id)

    def list_unanswered(self, tenant_id: str, location_id: str):
        return [
            (rid, r) for rid, r in self.list_by_location(tenant_id, location_id)
            if not r.handled and r.reply_status in (ReplyStatus.NONE, ReplyStatus.DRAFTED)
        ]


class GbpPostRepository(_AutoRepo):
    table_name = "seo_gbp_posts"
    model = GbpPost
    id_prefix = "gbppost_"
    enum_fields = {"post_type": PostType, "status": PostStatus}

    def list_by_location(self, tenant_id: str, location_id: str):
        return self.list_where(tenant_id, location_id=location_id)


class CitationSourceRepository(_AutoRepo):
    table_name = "seo_citation_sources"
    model = CitationSource
    id_prefix = "citsrc_"


class CitationRepository(_AutoRepo):
    table_name = "seo_citations"
    model = Citation
    id_prefix = "cit_"
    enum_fields = {"status": CitationStatus, "claimed": ClaimedStatus}

    def list_by_location(self, tenant_id: str, location_id: str):
        return self.list_where(tenant_id, location_id=location_id)


class LocalCompetitorRepository(_AutoRepo):
    table_name = "seo_local_competitors"
    model = LocalCompetitor
    id_prefix = "lcomp_"

    def list_by_location(self, tenant_id: str, location_id: str):
        return self.list_where(tenant_id, location_id=location_id)


class LocalRankSnapshotRepository(_AutoRepo):
    table_name = "seo_local_rank_snapshots"
    model = LocalRankSnapshot
    id_prefix = "lsnap_"
    stamp_on_create = ("created_at",)

    def list_by_location(self, tenant_id: str, location_id: str):
        return self.list_where(tenant_id, location_id=location_id)

    def history(self, tenant_id: str, location_id: str, keyword: str):
        rows = [
            (sid, s) for sid, s in self.list_by_location(tenant_id, location_id)
            if s.keyword == keyword
        ]
        rows.sort(key=lambda pair: (pair[1].date or "", pair[1].created_at or ""))
        return rows


class NapAuditRepository(_AutoRepo):
    table_name = "seo_nap_audits"
    model = NapAudit
    id_prefix = "nap_"

    def list_by_location(self, tenant_id: str, location_id: str):
        return self.list_where(tenant_id, location_id=location_id)


class LocalSchemaRepository(_AutoRepo):
    table_name = "seo_local_schema"
    model = LocalSchema
    id_prefix = "lschema_"
    enum_fields = {"status": SchemaStatus}

    def list_by_location(self, tenant_id: str, location_id: str):
        return self.list_where(tenant_id, location_id=location_id)

    def latest_approved(self, tenant_id: str, location_id: str):
        rows = [
            (sid, s) for sid, s in self.list_by_location(tenant_id, location_id)
            if s.status == SchemaStatus.APPROVED
        ]
        if not rows:
            return None
        rows.sort(key=lambda p: p[1].approved_at or "", reverse=True)
        return rows[0]


# ── Singletons ─────────────────────────────────────────────────────────────────

_REPOS: dict = {}


def _repo(key: str, cls):
    if key not in _REPOS:
        _REPOS[key] = cls()
    return _REPOS[key]


def reset_repositories() -> None:
    """Clear cached repo singletons.  Call between tests or after env changes."""
    _REPOS.clear()


def get_location_repository() -> LocationRepository:
    return _repo("location", LocationRepository)


def get_gbp_connection_repository() -> GbpConnectionRepository:
    return _repo("gbp_connection", GbpConnectionRepository)


def get_gbp_review_repository() -> GbpReviewRepository:
    return _repo("gbp_review", GbpReviewRepository)


def get_gbp_post_repository() -> GbpPostRepository:
    return _repo("gbp_post", GbpPostRepository)


def get_citation_source_repository() -> CitationSourceRepository:
    return _repo("citation_source", CitationSourceRepository)


def get_citation_repository() -> CitationRepository:
    return _repo("citation", CitationRepository)


def get_local_competitor_repository() -> LocalCompetitorRepository:
    return _repo("local_competitor", LocalCompetitorRepository)


def get_local_rank_snapshot_repository() -> LocalRankSnapshotRepository:
    return _repo("local_rank_snapshot", LocalRankSnapshotRepository)


def get_nap_audit_repository() -> NapAuditRepository:
    return _repo("nap_audit", NapAuditRepository)


def get_local_schema_repository() -> LocalSchemaRepository:
    return _repo("local_schema", LocalSchemaRepository)


# All repository classes — for migration-coverage tests / introspection.
ALL_REPOSITORIES = (
    LocationRepository,
    GbpConnectionRepository,
    GbpReviewRepository,
    GbpPostRepository,
    CitationSourceRepository,
    CitationRepository,
    LocalCompetitorRepository,
    LocalRankSnapshotRepository,
    NapAuditRepository,
    LocalSchemaRepository,
)
