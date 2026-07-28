"""Backlink sync service and view layer.

Public entry points:
  run_backlink_sync(tenant, site_id, *, provider=None)
    Durable, idempotent sync: creates/updates BacklinkProject, pages through
    provider.backlinks(), upserts records by dedup_key, aggregates
    ReferringDomain counts, computes new vs lost delta, writes a snapshot, and
    meters via seo.metering_search.record_backlink_sync.

View helpers (all read-only, never raise):
  get_profile(tenant, site_id)             — summary stats + provider freshness
  get_referring_domains(tenant, site_id)   — ReferringDomain list (enriched)
  get_new_lost(tenant, site_id, *, since)  — new/lost lists from stored records
  get_anchor_distribution(tenant, site_id) — anchor → count dict
  get_top_target_pages(tenant, site_id)    — target page → count dict
  get_link_velocity(tenant, site_id)       — snapshot sequence for velocity chart
  get_provider_freshness(tenant, site_id)  — data_freshness + sync_status

Every function is fail-safe — errors are caught and returned in an 'error' key
rather than propagating as exceptions (except run_backlink_sync which may raise
SeoLimitExceeded on plan limit violations).
"""

from __future__ import annotations

import hashlib
import logging
from collections import Counter
from datetime import datetime, timezone
from typing import Dict, List, Optional

from seo.metering_search import (
    LIMIT_BACKLINK_SITES,
    LIMIT_BACKLINK_STORED,
    enforce_seo_limit,
    record_backlink_sync,
)

from .provider import BacklinkProvider, MockBacklinkProvider, get_backlink_provider
from .stores import (
    Backlink,
    BacklinkProject,
    BacklinkSnapshot,
    DomainStatus,
    LinkStatus,
    ReferringDomain,
    SyncStatus,
    get_backlink_project_repository,
    get_backlink_repository,
    get_backlink_snapshot_repository,
    get_referring_domain_repository,
)

_log = logging.getLogger("pixie.seo.backlinks.service")

_PAGE_SIZE = 100  # rows per provider page


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="microseconds")


def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _dedup_key(source_url: str, target_url: str, anchor: str) -> str:
    raw = "|".join([source_url, target_url, anchor])
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()


def _is_mock_provider(provider: BacklinkProvider) -> bool:
    return isinstance(provider, MockBacklinkProvider) or getattr(provider, "name", "") == "mock"


# ── Sync ───────────────────────────────────────────────────────────────────────

def run_backlink_sync(
    tenant_id: str,
    site_id: str,
    *,
    provider: Optional[BacklinkProvider] = None,
    domain: Optional[str] = None,
) -> Dict:
    """Durable, idempotent backlink sync.

    Steps:
    1. Enforce LIMIT_BACKLINK_SITES plan limit (raises SeoLimitExceeded if breached).
    2. Create or update BacklinkProject record, set status=RUNNING.
    3. Page through provider.backlinks(), upsert each by dedup_key.
    4. Aggregate ReferringDomain counts from stored records.
    5. Compute new/lost delta vs previous snapshot.
    6. Write BacklinkSnapshot.
    7. Update project: status=COMPLETED, data_freshness, last_sync.
    8. Meter via record_backlink_sync (is_mock=True → 0 credits).
    """
    if provider is None:
        provider = get_backlink_provider()

    is_mock = _is_mock_provider(provider)

    # Use site_id as the domain hint when not provided explicitly.
    target_domain = domain or site_id

    proj_repo = get_backlink_project_repository()
    bl_repo = get_backlink_repository()
    rd_repo = get_referring_domain_repository()
    snap_repo = get_backlink_snapshot_repository()

    # ── 1. Plan limit check ─────────────────────────────────────────────────
    existing_projects = proj_repo.list_where(tenant_id)
    if not proj_repo.get_by_site(tenant_id, site_id):
        # Would be a new project; check site cap.
        enforce_seo_limit(tenant_id, LIMIT_BACKLINK_SITES, len(existing_projects))

    # ── 2. Project create/update ────────────────────────────────────────────
    now = _now_iso()
    proj_pair = proj_repo.get_by_site(tenant_id, site_id)
    if proj_pair is None:
        proj_id, project = proj_repo.create(BacklinkProject(
            tenant_id=tenant_id,
            site_id=site_id,
            provider=provider.name,
            sync_status=SyncStatus.RUNNING,
            last_sync="",
        ))
    else:
        proj_id, project = proj_pair
        proj_repo.update(tenant_id, proj_id,
                         sync_status=SyncStatus.RUNNING,
                         error="",
                         provider=provider.name)

    try:
        # ── 3. Paginate + upsert backlinks ──────────────────────────────────
        # Capture the PRIOR snapshot BEFORE the sync so we know whether this
        # is a first sync (no prior snapshot → don't mark anything lost) or
        # a subsequent sync (mark links absent from this run as lost).
        prev_snap = snap_repo.latest(tenant_id, site_id)

        total_upserted = 0
        pages_fetched = 0
        start_row = 0
        # Track all dedup_keys seen in THIS sync run for lost-link detection.
        synced_dedup_keys: set = set()

        while True:
            page_result = provider.backlinks(
                target_domain,
                start_row=start_row,
                row_limit=_PAGE_SIZE,
            )
            rows = page_result.get("rows", [])
            pages_fetched += 1

            for row in rows:
                src_url = row.get("source_url", "")
                tgt_url = row.get("target_url", "")
                anchor = row.get("anchor_text", "")
                key = row.get("dedup_key") or _dedup_key(src_url, tgt_url, anchor)

                synced_dedup_keys.add(key)
                existing = bl_repo.get_by_dedup_key(tenant_id, site_id, key)
                if existing is None:
                    # New record — check stored cap before inserting.
                    current_count = len(bl_repo.list_by_site(tenant_id, site_id))
                    enforce_seo_limit(tenant_id, LIMIT_BACKLINK_STORED, current_count)
                    from seo.backlinks.stores import LinkRel
                    rel_val = row.get("rel", "follow")
                    try:
                        rel = LinkRel(rel_val)
                    except ValueError:
                        rel = LinkRel.FOLLOW
                    bl_repo.create(Backlink(
                        tenant_id=tenant_id,
                        site_id=site_id,
                        source_url=src_url,
                        source_domain=row.get("source_domain", ""),
                        target_url=tgt_url,
                        anchor_text=anchor,
                        rel=rel,
                        link_type=row.get("link_type", "text"),
                        first_seen=row.get("first_seen", ""),
                        last_seen=row.get("last_seen", ""),
                        status=LinkStatus.ACTIVE,
                        provider_metrics=row.get("provider_metrics"),
                        language=row.get("language", ""),
                        country=row.get("country", ""),
                        redirect_chain=row.get("redirect_chain", []),
                        provider=row.get("provider", provider.name),
                        data_timestamp=row.get("data_timestamp", ""),
                        dedup_key=key,
                    ))
                    total_upserted += 1
                else:
                    # Update freshness fields only.
                    bl_id, _ = existing
                    bl_repo.update(tenant_id, bl_id,
                                   last_seen=row.get("last_seen", ""),
                                   data_timestamp=row.get("data_timestamp", ""),
                                   provider_metrics=row.get("provider_metrics"),
                                   status=LinkStatus.ACTIVE)

            next_row = page_result.get("next")
            if next_row is None:
                break
            start_row = next_row

        # ── 4. Mark lost links (present in DB, absent from this sync run) ─────
        # synced_dedup_keys contains every key seen during the main loop above.
        # Any previously-active stored link whose dedup_key was NOT seen in
        # this run is now lost. We only do this when there was a prior snapshot
        # so that on the very first sync nothing is incorrectly marked lost.
        if prev_snap is not None:
            stored_active = bl_repo.list_by_site(tenant_id, site_id, status=LinkStatus.ACTIVE)
            for bl_id, bl in stored_active:
                if bl.dedup_key and bl.dedup_key not in synced_dedup_keys:
                    bl_repo.update(tenant_id, bl_id, status=LinkStatus.LOST)

        # ── 5. Aggregate ReferringDomain records ────────────────────────────
        all_bls = bl_repo.list_by_site(tenant_id, site_id)
        domain_agg: Dict[str, Dict] = {}
        for _, bl in all_bls:
            d = bl.source_domain
            if d not in domain_agg:
                domain_agg[d] = {
                    "site_id": site_id,
                    "first_seen": bl.first_seen,
                    "last_seen": bl.last_seen,
                    "status": bl.status,
                    "backlink_count": 0,
                    "follow_count": 0,
                    "nofollow_count": 0,
                    "provider_metrics": bl.provider_metrics,
                    "top_anchors": [],
                }
            agg = domain_agg[d]
            agg["backlink_count"] += 1
            if bl.rel and bl.rel.value == "follow":
                agg["follow_count"] += 1
            else:
                agg["nofollow_count"] += 1
            if bl.first_seen and (not agg["first_seen"] or bl.first_seen < agg["first_seen"]):
                agg["first_seen"] = bl.first_seen
            if bl.last_seen and bl.last_seen > agg["last_seen"]:
                agg["last_seen"] = bl.last_seen
            agg["top_anchors"].append(bl.anchor_text)
            # Active if any link from this domain is active.
            if bl.status == LinkStatus.ACTIVE:
                agg["status"] = DomainStatus.ACTIVE

        for d, agg in domain_agg.items():
            anchor_counts = Counter(agg["top_anchors"])
            top_anchors = [a for a, _ in anchor_counts.most_common(5)]
            status_val = DomainStatus.ACTIVE if agg["status"] == DomainStatus.ACTIVE else DomainStatus.LOST

            existing_rd = rd_repo.get_by_domain(tenant_id, site_id, d)
            if existing_rd is None:
                rd_repo.create(ReferringDomain(
                    tenant_id=tenant_id,
                    site_id=site_id,
                    domain=d,
                    first_seen=agg["first_seen"],
                    last_seen=agg["last_seen"],
                    status=status_val,
                    backlink_count=agg["backlink_count"],
                    follow_count=agg["follow_count"],
                    nofollow_count=agg["nofollow_count"],
                    provider_metrics=agg["provider_metrics"],
                    top_anchors=top_anchors,
                ))
            else:
                rd_id, _ = existing_rd
                rd_repo.update(tenant_id, rd_id,
                               last_seen=agg["last_seen"],
                               status=status_val,
                               backlink_count=agg["backlink_count"],
                               follow_count=agg["follow_count"],
                               nofollow_count=agg["nofollow_count"],
                               provider_metrics=agg["provider_metrics"],
                               top_anchors=top_anchors)

        # ── 6. Compute delta vs previous snapshot ───────────────────────────
        # prev_snap was captured before the sync (before the loop) so it
        # correctly reflects the state prior to this sync run.
        prev_total = prev_snap[1].total_backlinks if prev_snap else 0
        prev_rd_count = prev_snap[1].referring_domains if prev_snap else 0

        active_bls = bl_repo.list_by_site(tenant_id, site_id, status=LinkStatus.ACTIVE)
        total_backlinks = len(active_bls)
        rd_active = rd_repo.list_by_site(tenant_id, site_id, status=DomainStatus.ACTIVE)
        rd_count = len(rd_active)

        new_links = max(0, total_backlinks - prev_total)
        lost_links_count = max(0, prev_total - total_backlinks)

        follow_c = sum(1 for _, bl in active_bls if bl.rel and bl.rel.value == "follow")
        nofollow_c = total_backlinks - follow_c

        # ── 7. Write snapshot ───────────────────────────────────────────────
        snap_repo.create(BacklinkSnapshot(
            tenant_id=tenant_id,
            site_id=site_id,
            date=_today(),
            total_backlinks=total_backlinks,
            referring_domains=rd_count,
            new_links=new_links,
            lost_links=lost_links_count,
            follow_count=follow_c,
            nofollow_count=nofollow_c,
        ))

        # ── 8. Update project ───────────────────────────────────────────────
        proj_repo.update(tenant_id, proj_id,
                         sync_status=SyncStatus.COMPLETED,
                         last_sync=now,
                         data_freshness=now,
                         error="")

        # ── Meter ───────────────────────────────────────────────────────────
        record_backlink_sync(tenant_id, job_id=proj_id, is_mock=is_mock, pages=pages_fetched)

        return {
            "project_id": proj_id,
            "site_id": site_id,
            "total_backlinks": total_backlinks,
            "referring_domains": rd_count,
            "new_links": new_links,
            "lost_links": lost_links_count,
            "pages_fetched": pages_fetched,
            "provider": provider.name,
            "synced_at": now,
        }

    except Exception as exc:
        _log.exception("backlink sync failed for site %s: %s", site_id, exc)
        try:
            proj_repo.update(tenant_id, proj_id,
                             sync_status=SyncStatus.FAILED,
                             error=str(exc))
        except Exception:
            pass
        raise


# ── View helpers ───────────────────────────────────────────────────────────────

def get_profile(tenant_id: str, site_id: str) -> Dict:
    """Summary stats + provider freshness for the backlink overview card."""
    try:
        proj_repo = get_backlink_project_repository()
        proj_pair = proj_repo.get_by_site(tenant_id, site_id)
        if proj_pair is None:
            return {"site_id": site_id, "status": "not_synced", "total_backlinks": 0,
                    "referring_domains": 0}
        _, project = proj_pair

        snap_repo = get_backlink_snapshot_repository()
        latest = snap_repo.latest(tenant_id, site_id)

        summary: Dict = {
            "site_id": site_id,
            "sync_status": project.sync_status.value if project.sync_status else "idle",
            "last_sync": project.last_sync,
            "data_freshness": project.data_freshness,
            "provider": project.provider,
        }
        if latest:
            _, snap = latest
            summary.update({
                "total_backlinks": snap.total_backlinks,
                "referring_domains": snap.referring_domains,
                "new_links": snap.new_links,
                "lost_links": snap.lost_links,
                "follow_count": snap.follow_count,
                "nofollow_count": snap.nofollow_count,
                "snapshot_date": snap.date,
            })
        else:
            summary.update({
                "total_backlinks": 0,
                "referring_domains": 0,
                "new_links": 0,
                "lost_links": 0,
            })
        return summary
    except Exception as exc:
        _log.warning("get_profile failed: %s", exc)
        return {"site_id": site_id, "error": str(exc)}


def get_referring_domains(
    tenant_id: str, site_id: str, *, status: Optional[str] = None
) -> List[Dict]:
    """Return stored ReferringDomain records as dicts."""
    try:
        rd_repo = get_referring_domain_repository()
        status_filter = DomainStatus(status) if status else None
        pairs = rd_repo.list_by_site(tenant_id, site_id, status=status_filter)
        return [
            {
                "domain": rd.domain,
                "status": rd.status.value if rd.status else "active",
                "backlink_count": rd.backlink_count,
                "follow_count": rd.follow_count,
                "nofollow_count": rd.nofollow_count,
                "first_seen": rd.first_seen,
                "last_seen": rd.last_seen,
                "top_anchors": rd.top_anchors,
                "risk_signals": rd.risk_signals,
                # Provider metrics passed through, never fabricated.
                "provider_metrics": rd.provider_metrics,
            }
            for _, rd in pairs
        ]
    except Exception as exc:
        _log.warning("get_referring_domains failed: %s", exc)
        return []


def get_new_lost(
    tenant_id: str, site_id: str, *, since: Optional[str] = None
) -> Dict:
    """Return new and lost backlinks from stored records (no new provider call)."""
    try:
        bl_repo = get_backlink_repository()
        all_pairs = bl_repo.list_by_site(tenant_id, site_id)

        new_links = []
        lost_links = []
        for _, bl in all_pairs:
            if since and bl.first_seen and bl.first_seen < since:
                continue
            entry = {
                "source_url": bl.source_url,
                "source_domain": bl.source_domain,
                "target_url": bl.target_url,
                "anchor_text": bl.anchor_text,
                "rel": bl.rel.value if bl.rel else "follow",
                "first_seen": bl.first_seen,
                "last_seen": bl.last_seen,
                "provider_metrics": bl.provider_metrics,
            }
            if bl.status == LinkStatus.LOST:
                lost_links.append(entry)
            else:
                new_links.append(entry)

        return {
            "new": new_links,
            "lost": lost_links,
            "since": since,
        }
    except Exception as exc:
        _log.warning("get_new_lost failed: %s", exc)
        return {"new": [], "lost": [], "error": str(exc)}


def get_anchor_distribution(tenant_id: str, site_id: str) -> List[Dict]:
    """Anchor text distribution from stored backlinks, sorted by count desc."""
    try:
        bl_repo = get_backlink_repository()
        all_pairs = bl_repo.list_by_site(tenant_id, site_id)
        counts: Dict[str, int] = {}
        follow_counts: Dict[str, int] = {}
        for _, bl in all_pairs:
            anchor = bl.anchor_text or ""
            counts[anchor] = counts.get(anchor, 0) + 1
            if bl.rel and bl.rel.value == "follow":
                follow_counts[anchor] = follow_counts.get(anchor, 0) + 1
        return [
            {
                "anchor": a,
                "count": c,
                "follow": follow_counts.get(a, 0),
                "percent": round(c / max(1, len(all_pairs)) * 100, 2),
            }
            for a, c in sorted(counts.items(), key=lambda x: -x[1])
        ]
    except Exception as exc:
        _log.warning("get_anchor_distribution failed: %s", exc)
        return []


def get_top_target_pages(tenant_id: str, site_id: str, *, top_n: int = 20) -> List[Dict]:
    """Target pages attracting the most backlinks, sorted by count desc."""
    try:
        bl_repo = get_backlink_repository()
        all_pairs = bl_repo.list_by_site(tenant_id, site_id)
        counts: Dict[str, int] = {}
        for _, bl in all_pairs:
            page = bl.target_url or ""
            counts[page] = counts.get(page, 0) + 1
        return [
            {"target_url": url, "backlink_count": c}
            for url, c in sorted(counts.items(), key=lambda x: -x[1])[:top_n]
        ]
    except Exception as exc:
        _log.warning("get_top_target_pages failed: %s", exc)
        return []


def get_link_velocity(tenant_id: str, site_id: str) -> List[Dict]:
    """Snapshot sequence for the velocity chart (ordered by date ascending)."""
    try:
        snap_repo = get_backlink_snapshot_repository()
        pairs = snap_repo.list_by_site(tenant_id, site_id)
        return [
            {
                "date": snap.date,
                "total_backlinks": snap.total_backlinks,
                "referring_domains": snap.referring_domains,
                "new_links": snap.new_links,
                "lost_links": snap.lost_links,
                "follow_count": snap.follow_count,
                "nofollow_count": snap.nofollow_count,
            }
            for _, snap in pairs
        ]
    except Exception as exc:
        _log.warning("get_link_velocity failed: %s", exc)
        return []


def get_provider_freshness(tenant_id: str, site_id: str) -> Dict:
    """Data freshness + sync_status for the provider health badge."""
    try:
        proj_repo = get_backlink_project_repository()
        proj_pair = proj_repo.get_by_site(tenant_id, site_id)
        if proj_pair is None:
            return {"site_id": site_id, "status": "not_synced", "data_freshness": None}
        _, project = proj_pair
        return {
            "site_id": site_id,
            "provider": project.provider,
            "sync_status": project.sync_status.value if project.sync_status else "idle",
            "last_sync": project.last_sync,
            "data_freshness": project.data_freshness,
            "error": project.error,
        }
    except Exception as exc:
        _log.warning("get_provider_freshness failed: %s", exc)
        return {"site_id": site_id, "error": str(exc)}
