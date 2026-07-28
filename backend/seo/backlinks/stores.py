"""Durable, tenant-scoped repositories for the SEO *backlinks* layer.

Same envelope convention + ``_AutoRepo`` base as ``seo/search_stores.py``.
Records are in-memory for tests (``PIXIE_PERSIST`` unset/memory) and durable
+ multi-instance for ``file``/``supabase`` backends.

Entity → table mapping (no digits in table names):
  BacklinkProject  → seo_backlink_projects  (blproj_)
  Backlink         → seo_backlinks          (bl_)
  ReferringDomain  → seo_referring_domains  (bldom_)
  BacklinkSnapshot → seo_backlink_snapshots (blsnap_)

Id prefixes match the entity so audit logs are readable at a glance.
"""

from __future__ import annotations

import dataclasses
from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Optional, Tuple

# Reuse the base repo + helpers from the existing SEO stores module so the
# envelope/serialisation behaviour is byte-for-byte identical.
from seo.stores import _uid, _now, _restore_enum  # noqa: F401
from seo.search_stores import _AutoRepo           # noqa: F401


# ── Enums ─────────────────────────────────────────────────────────────────────

class SyncStatus(str, Enum):
    IDLE      = "idle"
    RUNNING   = "running"
    COMPLETED = "completed"
    FAILED    = "failed"


class LinkRel(str, Enum):
    FOLLOW    = "follow"
    NOFOLLOW  = "nofollow"
    UGC       = "ugc"
    SPONSORED = "sponsored"


class LinkStatus(str, Enum):
    ACTIVE = "active"
    LOST   = "lost"


class DomainStatus(str, Enum):
    ACTIVE = "active"
    LOST   = "lost"


# ── Dataclasses ───────────────────────────────────────────────────────────────

@dataclass
class BacklinkProject:
    """One backlink-tracking project, keyed by (tenant_id, site_id).

    A single site has at most one active BacklinkProject; the provider field
    records which data source last synced it."""
    tenant_id: str
    site_id: str                    = ""
    provider: str                   = "mock"
    last_sync: str                  = ""        # ISO timestamp of last successful sync
    next_sync: str                  = ""        # ISO timestamp of next scheduled sync
    sync_status: SyncStatus         = SyncStatus.IDLE
    error: str                      = ""        # last sync error message
    data_freshness: str             = ""        # ISO timestamp provider considers data fresh to
    created_at: str                 = ""
    updated_at: str                 = ""


@dataclass
class Backlink:
    """One individual backlink (source URL → target URL).

    The ``dedup_key`` is a stable hash of (source_url + target_url + anchor_text)
    so idempotent upsert works without a unique Postgres column on JSONB.
    Provider-supplied metrics are stored verbatim in ``provider_metrics`` — we
    never fabricate authority scores; the field is None if the provider returned
    nothing.

    The ``redirect_chain`` list captures any redirect hops between source and
    target as recorded by the provider (empty list means direct or unknown)."""
    tenant_id: str
    site_id: str                    = ""
    source_url: str                 = ""
    source_domain: str              = ""
    target_url: str                 = ""
    anchor_text: str                = ""
    rel: LinkRel                    = LinkRel.FOLLOW
    link_type: str                  = ""        # "text" | "image" | "redirect" | …
    first_seen: str                 = ""        # ISO date as reported by provider
    last_seen: str                  = ""        # ISO date as reported by provider
    status: LinkStatus              = LinkStatus.ACTIVE
    provider_metrics: Optional[Dict] = None     # pass-through; never fabricated
    language: str                   = ""
    country: str                    = ""
    redirect_chain: List[str]       = field(default_factory=list)
    provider: str                   = "mock"
    data_timestamp: str             = ""        # when the provider last updated this record
    dedup_key: str                  = ""        # sha1(source_url+target_url+anchor_text)
    created_at: str                 = ""
    updated_at: str                 = ""


@dataclass
class ReferringDomain:
    """Aggregated view of one referring root domain.

    Counts (backlink_count, follow_count, nofollow_count) are aggregated from
    stored Backlink records during sync and cached here for fast summary views.
    ``risk_signals`` is a list of signal-key strings produced by risk.py.
    ``top_anchors`` and ``top_target_pages`` are pre-computed top-N lists."""
    tenant_id: str
    site_id: str                    = ""
    domain: str                     = ""
    first_seen: str                 = ""
    last_seen: str                  = ""
    status: DomainStatus            = DomainStatus.ACTIVE
    backlink_count: int             = 0
    follow_count: int               = 0
    nofollow_count: int             = 0
    provider_metrics: Optional[Dict] = None     # pass-through; never fabricated
    risk_signals: List[str]         = field(default_factory=list)
    top_anchors: List[str]          = field(default_factory=list)
    top_target_pages: List[str]     = field(default_factory=list)
    created_at: str                 = ""
    updated_at: str                 = ""


@dataclass
class BacklinkSnapshot:
    """Point-in-time aggregate snapshot of a site's backlink health.

    Written once per sync so the velocity chart (new vs lost over time) is
    computable from the sequence of snapshots without replaying every backlink.
    ``risk_distribution`` maps risk-signal keys to counts."""
    tenant_id: str
    site_id: str                    = ""
    date: str                       = ""        # YYYY-MM-DD snapshot date
    total_backlinks: int            = 0
    referring_domains: int          = 0
    new_links: int                  = 0
    lost_links: int                 = 0
    follow_count: int               = 0
    nofollow_count: int             = 0
    risk_distribution: Dict         = field(default_factory=dict)
    created_at: str                 = ""


# ── Concrete repositories ──────────────────────────────────────────────────────

class BacklinkProjectRepository(_AutoRepo):
    table_name = "seo_backlink_projects"
    model = BacklinkProject
    id_prefix = "blproj_"
    enum_fields = {"sync_status": SyncStatus}

    def get_by_site(self, tenant_id: str, site_id: str) -> Optional[Tuple[str, BacklinkProject]]:
        """Return the first project matching site_id, or None."""
        rows = self.list_where(tenant_id, site_id=site_id)
        return rows[0] if rows else None


class BacklinkRepository(_AutoRepo):
    table_name = "seo_backlinks"
    model = Backlink
    id_prefix = "bl_"
    enum_fields = {"rel": LinkRel, "status": LinkStatus}

    def list_by_site(self, tenant_id: str, site_id: str,
                     status: Optional[LinkStatus] = None) -> List[Tuple[str, Backlink]]:
        rows = self.list_where(tenant_id, site_id=site_id)
        if status is not None:
            rows = [(rid, bl) for rid, bl in rows if bl.status == status]
        return rows

    def get_by_dedup_key(self, tenant_id: str, site_id: str,
                         dedup_key: str) -> Optional[Tuple[str, Backlink]]:
        """Find an existing backlink by its stable dedup key."""
        for r in self._rows(tenant_id):
            d = r.get("data", {})
            if d.get("site_id") == site_id and d.get("dedup_key") == dedup_key:
                return self._build(r)
        return None

    def list_by_source_domain(self, tenant_id: str, site_id: str,
                               source_domain: str) -> List[Tuple[str, Backlink]]:
        return [
            self._build(r) for r in self._rows(tenant_id)
            if r.get("data", {}).get("site_id") == site_id
            and r.get("data", {}).get("source_domain") == source_domain
        ]


class ReferringDomainRepository(_AutoRepo):
    table_name = "seo_referring_domains"
    model = ReferringDomain
    id_prefix = "bldom_"
    enum_fields = {"status": DomainStatus}

    def get_by_domain(self, tenant_id: str, site_id: str,
                      domain: str) -> Optional[Tuple[str, ReferringDomain]]:
        """Return the referring-domain record for this domain, or None."""
        rows = self.list_where(tenant_id, site_id=site_id, domain=domain)
        return rows[0] if rows else None

    def list_by_site(self, tenant_id: str, site_id: str,
                     status: Optional[DomainStatus] = None) -> List[Tuple[str, ReferringDomain]]:
        rows = self.list_where(tenant_id, site_id=site_id)
        if status is not None:
            rows = [(rid, rd) for rid, rd in rows if rd.status == status]
        return rows


class BacklinkSnapshotRepository(_AutoRepo):
    table_name = "seo_backlink_snapshots"
    model = BacklinkSnapshot
    id_prefix = "blsnap_"
    stamp_on_create = ("created_at",)

    def list_by_site(self, tenant_id: str, site_id: str) -> List[Tuple[str, BacklinkSnapshot]]:
        rows = self.list_where(tenant_id, site_id=site_id)
        rows.sort(key=lambda pair: (pair[1].date or "", pair[1].created_at or ""))
        return rows

    def latest(self, tenant_id: str, site_id: str) -> Optional[Tuple[str, BacklinkSnapshot]]:
        rows = self.list_by_site(tenant_id, site_id)
        return rows[-1] if rows else None


# ── Singletons ─────────────────────────────────────────────────────────────────

_REPOS: dict = {}


def _repo(key: str, cls):
    if key not in _REPOS:
        _REPOS[key] = cls()
    return _REPOS[key]


def reset_repositories() -> None:
    """Clear cached repo singletons. Call between tests or after env changes."""
    _REPOS.clear()


def get_backlink_project_repository() -> BacklinkProjectRepository:
    return _repo("backlink_project", BacklinkProjectRepository)


def get_backlink_repository() -> BacklinkRepository:
    return _repo("backlink", BacklinkRepository)


def get_referring_domain_repository() -> ReferringDomainRepository:
    return _repo("referring_domain", ReferringDomainRepository)


def get_backlink_snapshot_repository() -> BacklinkSnapshotRepository:
    return _repo("backlink_snapshot", BacklinkSnapshotRepository)


# All repository classes, for migration-coverage tests / introspection.
ALL_REPOSITORIES = (
    BacklinkProjectRepository,
    BacklinkRepository,
    ReferringDomainRepository,
    BacklinkSnapshotRepository,
)
