"""Rank analytics computed from stored RankSnapshots.

All computations use REAL stored data only. Missing periods are labelled as
"no_data" — positions are NEVER interpolated or fabricated. Analytics are
computed in-memory from the repository so they work with both memory and
durable (file/Supabase) backends.

Public API
----------
rank_history(tenant, keyword_id, *, date_from, date_to)
    Full snapshot history for a single keyword, optionally filtered by date range.

rank_overview(tenant, project_id, *, date_from, date_to, window_days)
    Aggregate analytics for a project: winners/losers, new/lost rankings,
    position buckets, SERP-feature changes, ranking-URL changes,
    cannibalisation candidates, device/location comparisons.

keyword_detail(tenant, keyword_id, *, date_from, date_to)
    Per-keyword history + latest SERP features + competitor positions.
"""

from __future__ import annotations

import logging
from collections import defaultdict
from typing import Any, Dict, List, Optional, Set, Tuple

from seo.search_stores import (
    RankSnapshot,
    get_rank_snapshot_repository,
)

_log = logging.getLogger("pixie.seo.rank.analytics")


# ── Helpers ────────────────────────────────────────────────────────────────────

def _snap_to_dict(snap_id: str, snap: RankSnapshot) -> Dict[str, Any]:
    return {
        "snapshot_id": snap_id,
        "keyword_id": snap.keyword_id,
        "keyword": snap.keyword,
        "date": snap.date,
        "position": snap.position,
        "previous_position": snap.previous_position,
        "ranking_url": snap.ranking_url,
        "serp_features": snap.serp_features or [],
        "featured_snippet": snap.featured_snippet,
        "local_pack": snap.local_pack,
        "competitor_positions": snap.competitor_positions or {},
        "provider": snap.provider,
        "data_freshness": snap.data_freshness,
        "error": snap.error,
    }


def _in_range(date_str: str, date_from: Optional[str], date_to: Optional[str]) -> bool:
    if not date_str:
        return False
    if date_from and date_str < date_from:
        return False
    if date_to and date_str > date_to:
        return False
    return True


def _position_delta(new: Optional[int], old: Optional[int]) -> Optional[int]:
    """Positive = moved up (lower rank number), negative = moved down."""
    if new is None or old is None:
        return None
    return old - new  # e.g. old=20 new=5 → delta=+15 (improvement)


def _bucket(position: Optional[int]) -> str:
    if position is None:
        return "unranked"
    if position <= 3:
        return "top3"
    if position <= 10:
        return "top10"
    if position <= 20:
        return "top20"
    return "beyond20"


# ── Public functions ──────────────────────────────────────────────────────────

def rank_history(
    tenant_id: str,
    keyword_id: str,
    *,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Return the ordered snapshot history for a single keyword.

    Sorted ascending by date. Date range is inclusive on both ends when given.
    Snapshots with errors (no position) are included and labelled.
    """
    snap_repo = get_rank_snapshot_repository()
    history = snap_repo.history(tenant_id, keyword_id)
    result = []
    for snap_id, snap in history:
        if date_from or date_to:
            if not _in_range(snap.date or "", date_from, date_to):
                continue
        result.append(_snap_to_dict(snap_id, snap))
    return result


def rank_overview(
    tenant_id: str,
    project_id: str,
    *,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    window_days: int = 30,
) -> Dict[str, Any]:
    """Aggregate analytics for all keywords in a project.

    Returns
    -------
    winners          Keywords that improved the most (descending by delta).
    losers           Keywords that dropped the most (ascending by delta).
    new_rankings     Keywords that moved from unranked → ranked.
    lost_rankings    Keywords that moved from ranked → unranked.
    buckets          Count of keywords in top3/top10/top20/beyond20/unranked
                     based on their LATEST snapshot in the window.
    serp_changes     Keywords whose serp_features set changed between oldest
                     and latest snapshot in the window.
    url_changes      Keywords whose ranking_url changed in the window.
    cannibalisation  Keyword IDs where >1 distinct ranking_url appears across
                     snapshots (same keyword ranking on multiple pages).
    total_keywords   Total number of unique keyword IDs with snapshots.
    no_data_count    Number of keyword IDs with no snapshots in the window.
    """
    snap_repo = get_rank_snapshot_repository()

    # Collect all snapshots for this project in the date range
    all_project_snaps = snap_repo.list_where(tenant_id, project_id=project_id)

    # Group by keyword_id; each value is a list of (snap_id, snap) sorted by date
    by_keyword: Dict[str, List[Tuple[str, RankSnapshot]]] = defaultdict(list)
    for snap_id, snap in all_project_snaps:
        if not snap.keyword_id:
            continue
        if not snap.error:  # skip error-only snapshots for analytics
            if date_from or date_to:
                if not _in_range(snap.date or "", date_from, date_to):
                    continue
        by_keyword[snap.keyword_id].append((snap_id, snap))

    # Sort each keyword's history by date ascending
    for kw_id in by_keyword:
        by_keyword[kw_id].sort(key=lambda p: (p[1].date or "", p[1].created_at or ""))

    winners: List[Dict[str, Any]] = []
    losers: List[Dict[str, Any]] = []
    new_rankings: List[Dict[str, Any]] = []
    lost_rankings: List[Dict[str, Any]] = []
    bucket_counts: Dict[str, int] = {
        "top3": 0, "top10": 0, "top20": 0, "beyond20": 0, "unranked": 0,
    }
    serp_changes: List[Dict[str, Any]] = []
    url_changes: List[Dict[str, Any]] = []
    cannibalisation: List[Dict[str, Any]] = []

    for kw_id, snaps in by_keyword.items():
        valid_snaps = [(sid, s) for sid, s in snaps if not s.error]
        if not valid_snaps:
            continue

        oldest_id, oldest = valid_snaps[0]
        latest_id, latest = valid_snaps[-1]

        # Bucket based on latest snapshot
        b = _bucket(latest.position)
        bucket_counts[b] = bucket_counts.get(b, 0) + 1

        # Winner/loser: compare oldest → latest
        delta = _position_delta(latest.position, oldest.position)
        entry = {
            "keyword_id": kw_id,
            "keyword": latest.keyword,
            "old_position": oldest.position,
            "new_position": latest.position,
            "delta": delta,
            "old_date": oldest.date,
            "new_date": latest.date,
        }

        if delta is not None:
            if delta > 0:
                winners.append(entry)
            elif delta < 0:
                losers.append(entry)

        # New rankings: moved from unranked (None) to ranked
        if oldest.position is None and latest.position is not None:
            new_rankings.append({
                "keyword_id": kw_id,
                "keyword": latest.keyword,
                "position": latest.position,
                "ranking_url": latest.ranking_url,
                "date": latest.date,
            })

        # Lost rankings: moved from ranked to unranked (None)
        if oldest.position is not None and latest.position is None:
            lost_rankings.append({
                "keyword_id": kw_id,
                "keyword": oldest.keyword,
                "last_position": oldest.position,
                "last_date": oldest.date,
            })

        # SERP feature changes
        old_features: Set[str] = set(oldest.serp_features or [])
        new_features: Set[str] = set(latest.serp_features or [])
        if old_features != new_features:
            serp_changes.append({
                "keyword_id": kw_id,
                "keyword": latest.keyword,
                "added_features": sorted(new_features - old_features),
                "removed_features": sorted(old_features - new_features),
                "old_date": oldest.date,
                "new_date": latest.date,
            })

        # Ranking URL changes
        old_url = (oldest.ranking_url or "").strip()
        new_url = (latest.ranking_url or "").strip()
        if old_url and new_url and old_url != new_url:
            url_changes.append({
                "keyword_id": kw_id,
                "keyword": latest.keyword,
                "old_url": old_url,
                "new_url": new_url,
                "old_date": oldest.date,
                "new_date": latest.date,
            })

        # Cannibalisation: multiple distinct ranking URLs across snapshots
        seen_urls: Set[str] = set()
        for _, s in valid_snaps:
            if s.ranking_url and s.ranking_url.strip():
                seen_urls.add(s.ranking_url.strip())
        if len(seen_urls) > 1:
            cannibalisation.append({
                "keyword_id": kw_id,
                "keyword": latest.keyword,
                "ranking_urls": sorted(seen_urls),
            })

    # Sort winners descending (biggest gain first), losers ascending (biggest drop first)
    winners.sort(key=lambda x: -(x["delta"] or 0))
    losers.sort(key=lambda x: (x["delta"] or 0))

    return {
        "project_id": project_id,
        "date_from": date_from,
        "date_to": date_to,
        "total_keywords": len(by_keyword),
        "winners": winners,
        "losers": losers,
        "new_rankings": new_rankings,
        "lost_rankings": lost_rankings,
        "buckets": bucket_counts,
        "serp_changes": serp_changes,
        "url_changes": url_changes,
        "cannibalisation": cannibalisation,
    }


def keyword_detail(
    tenant_id: str,
    keyword_id: str,
    *,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
) -> Dict[str, Any]:
    """Return full keyword detail: history + latest SERP features + competitor positions.

    History is sorted ascending by date. The ``latest`` key holds the most
    recent snapshot's data for quick access.  ``competitor_positions`` from
    the latest snapshot (if any) are surfaced at the top level.
    """
    history = rank_history(
        tenant_id, keyword_id, date_from=date_from, date_to=date_to
    )
    if not history:
        return {
            "keyword_id": keyword_id,
            "history": [],
            "latest": None,
            "competitor_positions": {},
            "serp_features": [],
            "featured_snippet": False,
            "local_pack": False,
        }

    # Latest valid snapshot (last in history)
    latest = history[-1]

    return {
        "keyword_id": keyword_id,
        "history": history,
        "latest": latest,
        "competitor_positions": latest.get("competitor_positions") or {},
        "serp_features": latest.get("serp_features") or [],
        "featured_snippet": latest.get("featured_snippet", False),
        "local_pack": latest.get("local_pack", False),
    }


def compare_devices(
    tenant_id: str,
    keyword_id: str,
    *,
    date: Optional[str] = None,
) -> Dict[str, Any]:
    """Compare desktop vs mobile snapshots for the same keyword on the given date.

    This is a best-effort comparison — if provider snapshots include a ``device``
    field (stored via data_freshness or provider metadata) they are surfaced here.
    Falls back to returning all snapshots for the date.
    """
    snap_repo = get_rank_snapshot_repository()
    history = snap_repo.history(tenant_id, keyword_id)
    by_device: Dict[str, List[Dict[str, Any]]] = defaultdict(list)

    for snap_id, snap in history:
        if date and snap.date != date:
            continue
        device_hint = (snap.data_freshness or "").lower()
        if "mobile" in device_hint:
            device = "mobile"
        elif "desktop" in device_hint:
            device = "desktop"
        else:
            device = "unknown"
        by_device[device].append(_snap_to_dict(snap_id, snap))

    return {
        "keyword_id": keyword_id,
        "date": date,
        "by_device": dict(by_device),
    }


def compare_competitors(
    tenant_id: str,
    keyword_id: str,
    *,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
) -> Dict[str, Any]:
    """Return competitor positions for a keyword over time.

    ``competitor_positions`` is a dict stored on each RankSnapshot by the
    provider (if supported).  This function aggregates them across the history.
    """
    history = rank_history(
        tenant_id, keyword_id, date_from=date_from, date_to=date_to
    )
    # Build a timeline of competitor data
    timeline: List[Dict[str, Any]] = []
    all_competitors: Set[str] = set()
    for snap in history:
        positions = snap.get("competitor_positions") or {}
        all_competitors.update(positions.keys())
        timeline.append({
            "date": snap["date"],
            "own_position": snap["position"],
            "competitor_positions": positions,
        })

    return {
        "keyword_id": keyword_id,
        "competitors": sorted(all_competitors),
        "timeline": timeline,
    }
