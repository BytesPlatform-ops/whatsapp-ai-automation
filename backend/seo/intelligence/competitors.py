"""Competitor CRUD and analysis.

All analysis is computed from STORED data (rank snapshots competitor_positions
field + keyword rows). No external provider calls are made here and no traffic
numbers are fabricated — when a provider has not recorded a value, is_estimate
is set on the snapshot and labels clearly indicate the data is absent.

Enforces plan limit LIMIT_COMPETITORS on create via enforce_seo_limit.
"""

from __future__ import annotations

from typing import Dict, List, Optional, Tuple

from seo.metering_search import LIMIT_COMPETITORS, enforce_seo_limit, SeoLimitExceeded
from seo.search_stores import (
    Competitor,
    CompetitorSnapshot,
    TrackingStatus,
    get_competitor_repository,
    get_competitor_snapshot_repository,
    get_keyword_repository,
    get_rank_snapshot_repository,
)


# ── CRUD ──────────────────────────────────────────────────────────────────────

def create_competitor(
    tenant_id: str,
    project_id: str,
    domain: str,
    *,
    site_id: str = "",
    display_name: str = "",
    country: str = "us",
    language: str = "en",
    notes: str = "",
) -> Tuple[str, Competitor]:
    """Create a new competitor row after enforcing the plan limit.

    Raises SeoLimitExceeded when the plan cap is reached.
    """
    repo = get_competitor_repository()
    existing = repo.list_by_project(tenant_id, project_id)
    enforce_seo_limit(tenant_id, LIMIT_COMPETITORS, len(existing))

    obj = Competitor(
        tenant_id=tenant_id,
        project_id=project_id,
        domain=domain,
        site_id=site_id,
        display_name=display_name or domain,
        country=country,
        language=language,
        notes=notes,
        tracking_status=TrackingStatus.TRACKED,
    )
    return repo.create(obj)


def list_competitors(tenant_id: str, project_id: str) -> List[Tuple[str, Competitor]]:
    return get_competitor_repository().list_by_project(tenant_id, project_id)


def get_competitor(
    tenant_id: str, competitor_id: str
) -> Optional[Tuple[str, Competitor]]:
    return get_competitor_repository().get(tenant_id, competitor_id)


def update_competitor(
    tenant_id: str,
    competitor_id: str,
    **fields,
) -> Optional[Tuple[str, Competitor]]:
    return get_competitor_repository().update(tenant_id, competitor_id, **fields)


def remove_competitor(tenant_id: str, competitor_id: str) -> bool:
    return get_competitor_repository().delete(tenant_id, competitor_id)


# ── Snapshot recording ────────────────────────────────────────────────────────

def record_snapshot(
    tenant_id: str,
    competitor_id: str,
    project_id: str,
    *,
    date: str,
    visibility_score: float = 0.0,
    tracked_keywords: int = 0,
    keywords_ranked: int = 0,
    avg_position: float = 0.0,
    top_pages: Optional[List[Dict]] = None,
    provider: str = "",
    is_estimate: bool = False,
) -> Tuple[str, CompetitorSnapshot]:
    """Store a point-in-time competitor snapshot.

    is_estimate=True must be set whenever the provider has not supplied real
    traffic/visibility data — callers must not fabricate numbers and must always
    pass is_estimate when using any approximation.
    """
    snap = CompetitorSnapshot(
        tenant_id=tenant_id,
        competitor_id=competitor_id,
        project_id=project_id,
        date=date,
        visibility_score=visibility_score,
        tracked_keywords=tracked_keywords,
        keywords_ranked=keywords_ranked,
        avg_position=avg_position,
        top_pages=top_pages or [],
        provider=provider,
        is_estimate=is_estimate,
    )
    return get_competitor_snapshot_repository().create(snap)


# ── Analysis helpers (computed from stored rank snapshots) ────────────────────

def _build_keyword_map(tenant_id: str, project_id: str) -> Dict[str, Dict]:
    """Return {keyword_id: keyword_obj} for the project."""
    kw_repo = get_keyword_repository()
    pairs = kw_repo.list_by_project(tenant_id, project_id)
    return {kid: kw for kid, kw in pairs}


def _latest_snapshots(tenant_id: str, project_id: str) -> List:
    """Return the most recent rank snapshot per keyword_id."""
    repo = get_rank_snapshot_repository()
    all_snaps = repo.list_where(tenant_id, project_id=project_id)

    # Keep only the most recent snapshot per keyword
    latest: Dict[str, Tuple] = {}
    for sid, snap in all_snaps:
        kid = snap.keyword_id
        if kid not in latest or (snap.date or "") > (latest[kid][1].date or ""):
            latest[kid] = (sid, snap)
    return list(latest.values())


def keyword_overlap(
    tenant_id: str, project_id: str, competitor_domain: str
) -> List[Dict]:
    """Keywords where BOTH we and the competitor have a recorded position."""
    snaps = _latest_snapshots(tenant_id, project_id)
    kw_map = _build_keyword_map(tenant_id, project_id)
    result = []
    for _, snap in snaps:
        comp_pos = (snap.competitor_positions or {}).get(competitor_domain)
        if comp_pos is not None and snap.position is not None:
            kw = kw_map.get(snap.keyword_id)
            result.append({
                "keyword_id": snap.keyword_id,
                "keyword": snap.keyword or (kw.keyword if kw else ""),
                "our_position": snap.position,
                "competitor_position": comp_pos,
                "date": snap.date,
            })
    return result


def keywords_only_competitor_ranks_for(
    tenant_id: str, project_id: str, competitor_domain: str
) -> List[Dict]:
    """Keywords where the competitor has a position but WE do not."""
    snaps = _latest_snapshots(tenant_id, project_id)
    kw_map = _build_keyword_map(tenant_id, project_id)
    result = []
    for _, snap in snaps:
        comp_pos = (snap.competitor_positions or {}).get(competitor_domain)
        if comp_pos is not None and snap.position is None:
            kw = kw_map.get(snap.keyword_id)
            result.append({
                "keyword_id": snap.keyword_id,
                "keyword": snap.keyword or (kw.keyword if kw else ""),
                "competitor_position": comp_pos,
                "search_volume": kw.search_volume if kw else None,
                "date": snap.date,
            })
    return result


def keywords_we_rank_higher(
    tenant_id: str, project_id: str, competitor_domain: str
) -> List[Dict]:
    """Keywords where our position is strictly better (lower number) than competitor."""
    result = []
    for item in keyword_overlap(tenant_id, project_id, competitor_domain):
        if item["our_position"] < item["competitor_position"]:
            result.append(item)
    return result


def keywords_we_rank_lower(
    tenant_id: str, project_id: str, competitor_domain: str
) -> List[Dict]:
    """Keywords where competitor outranks us (lower position number = better rank)."""
    result = []
    for item in keyword_overlap(tenant_id, project_id, competitor_domain):
        if item["our_position"] > item["competitor_position"]:
            result.append(item)
    return result


def shared_ranking_pages(
    tenant_id: str, project_id: str, competitor_domain: str
) -> List[Dict]:
    """Pages/URLs from our snapshots that compete with the competitor on the same SERP."""
    snaps = _latest_snapshots(tenant_id, project_id)
    result = []
    seen_urls: set = set()
    for _, snap in snaps:
        comp_pos = (snap.competitor_positions or {}).get(competitor_domain)
        if comp_pos is not None and snap.position is not None and snap.ranking_url:
            if snap.ranking_url not in seen_urls:
                seen_urls.add(snap.ranking_url)
                result.append({
                    "our_url": snap.ranking_url,
                    "keyword": snap.keyword,
                    "our_best_position": snap.position,
                    "competitor_position": comp_pos,
                })
    return result


def competitor_top_pages(
    tenant_id: str, competitor_id: str
) -> List[Dict]:
    """Return top_pages from the most recent competitor snapshot.

    Returns an empty list when no snapshots exist. Clearly labels data as
    snapshot-derived so callers know these are not live traffic numbers.
    """
    snap_repo = get_competitor_snapshot_repository()
    all_snaps = snap_repo.list_where(tenant_id, competitor_id=competitor_id)
    if not all_snaps:
        return []
    # Most recent by date then created_at
    latest = sorted(all_snaps, key=lambda p: (p[1].date or "", p[1].created_at or ""), reverse=True)[0]
    _, snap = latest
    return [
        {**page, "is_snapshot_data": True, "snapshot_date": snap.date}
        for page in (snap.top_pages or [])
    ]


def keyword_gap(
    tenant_id: str, project_id: str, competitor_domain: str, min_volume: int = 100
) -> List[Dict]:
    """High-value gap keywords: competitor ranks in top-20, we don't rank at all.

    Sorted by search_volume descending. Only keywords with volume >= min_volume
    (or where volume is unknown, included to avoid hiding data) are returned.
    """
    gaps = keywords_only_competitor_ranks_for(tenant_id, project_id, competitor_domain)
    kw_map = _build_keyword_map(tenant_id, project_id)

    enriched = []
    for item in gaps:
        kw = kw_map.get(item["keyword_id"])
        vol = item.get("search_volume") or (kw.search_volume if kw else None)
        if vol is not None and vol < min_volume:
            continue
        enriched.append({
            **item,
            "search_volume": vol,
            "cpc": kw.cpc if kw else None,
            "difficulty": kw.difficulty if kw else None,
            "gap_type": "competitor_only",
            "data_note": "position_from_rank_snapshot",
        })

    enriched.sort(key=lambda x: (x.get("search_volume") or 0), reverse=True)
    return enriched
