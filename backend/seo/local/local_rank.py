"""Local rank tracking for the Local SEO vertical.

Uses the existing RankProvider abstraction (seo.jobs.provider) extended
with local-pack and maps positions.

Design principles:
  - NEVER fabricate geo-grid map positions — only store what the provider returns.
  - Geo-grid data is stored only when is_geo_grid=True and provider supplied real data.
  - Organic, local-pack, and maps positions are all Optional[int] (None = not ranking).
  - Competitor positions are keyed by domain.
  - Metered via record_local_rank_check.
"""

from __future__ import annotations

import hashlib
import logging
from typing import Any, Dict, List, Optional, Tuple

from seo.jobs.provider import MockRankProvider, RankProvider, get_rank_provider
from seo.metering_search import record_local_rank_check, LIMIT_LOCAL_KEYWORDS, enforce_seo_limit
from seo.local.stores import (
    LocalRankSnapshot,
    _now,
    _uid,
    get_local_rank_snapshot_repository,
    get_location_repository,
    get_local_competitor_repository,
)

_log = logging.getLogger("pixie.seo.local.local_rank")


# ── Local-pack mock positions ──────────────────────────────────────────────────

def _mock_local_pack_position(
    keyword: str,
    location_name: str,
) -> Optional[int]:
    """Deterministic mock local-pack position (1-3 or None)."""
    digest = hashlib.sha1(
        f"localpak|{keyword}|{location_name}".encode("utf-8")
    ).hexdigest()
    n = int(digest, 16)
    # ~25% chance of not appearing in local pack
    if n % 4 == 0:
        return None
    return (n % 3) + 1  # 1, 2, or 3


def _mock_maps_position(
    keyword: str,
    location_name: str,
) -> Optional[int]:
    """Deterministic mock maps/local-finder position (1-10 or None)."""
    digest = hashlib.sha1(
        f"maps|{keyword}|{location_name}".encode("utf-8")
    ).hexdigest()
    n = int(digest, 16)
    if n % 5 == 0:
        return None
    return (n % 10) + 1


# ── Rank check ────────────────────────────────────────────────────────────────

def check_local_rank(
    tenant_id: str,
    location_id: str,
    keywords: List[str],
    *,
    city: str = "",
    postal_code: str = "",
    device: str = "desktop",
    provider: Optional[RankProvider] = None,
    is_mock: bool = True,
    geo_grid: bool = False,
) -> Dict[str, Any]:
    """Check local rank for a list of keywords at a location.

    Geo-grid mode (geo_grid=True) is ONLY supported when the provider
    supplies real grid data.  In mock/offline mode, geo_grid is silently
    ignored and is_geo_grid=False is stored on all snapshots.

    Competitor positions are recorded from the rank snapshot's surrounding
    results (mock: deterministic per keyword).

    Meters record_local_rank_check.
    Returns: {location_id, results: [...], metered, is_mock}
    """
    loc_repo = get_location_repository()
    loc_result = loc_repo.get(tenant_id, location_id)
    if loc_result is None:
        return {"error": "location_not_found"}
    _, loc = loc_result

    enforce_seo_limit(tenant_id, LIMIT_LOCAL_KEYWORDS, len(keywords))

    rank_provider = provider or get_rank_provider()
    is_real_provider = not isinstance(rank_provider, MockRankProvider)

    # Geo-grid only valid when provider is real and supplies grid data
    actual_geo_grid = geo_grid and is_real_provider and not is_mock

    snap_repo = get_local_rank_snapshot_repository()
    comp_repo = get_local_competitor_repository()
    competitors = comp_repo.list_by_location(tenant_id, location_id)
    competitor_domains = [c.domain for _, c in competitors if c.domain]

    date_str = _now()[:10]  # YYYY-MM-DD
    location_key = f"{loc.business_name}|{city or loc.city}"
    website_url = loc.website_url or "https://unknown.example.com"

    results = []
    for keyword in keywords:
        # Organic rank via standard provider
        rank_result = rank_provider.lookup(
            keyword,
            website_url,
            location=city or loc.city or "us",
            device=device,
        )

        # Local-pack / maps positions
        if is_mock or not is_real_provider:
            lp_pos = _mock_local_pack_position(keyword, location_key)
            maps_pos = _mock_maps_position(keyword, location_key)
        else:
            # Real provider: only store if it returns these fields
            lp_pos = None
            maps_pos = None

        # Competitor positions (mock: deterministic)
        comp_positions: Dict[str, Optional[int]] = {}
        for domain in competitor_domains[:5]:  # limit to 5 competitors in snapshot
            if is_mock or not is_real_provider:
                digest = hashlib.sha1(
                    f"comp|{keyword}|{domain}".encode("utf-8")
                ).hexdigest()
                n = int(digest, 16)
                comp_positions[domain] = None if n % 6 == 0 else (n % 20) + 1
            else:
                comp_positions[domain] = None

        snap = LocalRankSnapshot(
            tenant_id=tenant_id,
            location_id=location_id,
            keyword=keyword,
            city=city,
            postal_code=postal_code,
            device=device,
            date=date_str,
            organic_position=rank_result.position,
            local_pack_position=lp_pos,
            maps_position=maps_pos,
            featured_snippet=False,
            ranking_url=website_url if rank_result.position else "",
            competitor_positions=comp_positions,
            provider=rank_result.provider,
            is_geo_grid=actual_geo_grid,
        )
        _, saved = snap_repo.create(snap)

        results.append({
            "keyword": keyword,
            "organic_position": rank_result.position,
            "local_pack_position": lp_pos,
            "maps_position": maps_pos,
            "competitor_positions": comp_positions,
            "is_geo_grid": actual_geo_grid,
            "provider": rank_result.provider,
        })

    job_id = _uid("lrank_")
    metering = record_local_rank_check(
        tenant_id,
        job_id=job_id,
        keyword_count=len(keywords),
        is_mock=is_mock,
        geo_grid=actual_geo_grid,
    )

    return {
        "location_id": location_id,
        "results": results,
        "date": date_str,
        "metered": True,
        "is_mock": is_mock,
        "metering": metering,
    }


# ── Analytics ─────────────────────────────────────────────────────────────────

def get_rank_overview(
    tenant_id: str,
    location_id: str,
    *,
    keywords: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Return the latest rank position per keyword for a location."""
    snap_repo = get_local_rank_snapshot_repository()
    all_snaps = snap_repo.list_by_location(tenant_id, location_id)

    if keywords:
        all_snaps = [(sid, s) for sid, s in all_snaps if s.keyword in keywords]

    # Latest snapshot per keyword
    latest: Dict[str, Tuple[str, LocalRankSnapshot]] = {}
    for sid, snap in all_snaps:
        key = snap.keyword
        if key not in latest or (snap.date or "") > (latest[key][1].date or ""):
            latest[key] = (sid, snap)

    ranked = [(kw, sid, s) for kw, (sid, s) in latest.items() if s.organic_position is not None]
    not_ranking = [(kw, sid, s) for kw, (sid, s) in latest.items() if s.organic_position is None]

    ranked_in_pack = [(kw, sid, s) for kw, sid, s in ranked if s.local_pack_position is not None]

    return {
        "location_id": location_id,
        "keywords_tracked": len(latest),
        "keywords_ranking": len(ranked),
        "keywords_not_ranking": len(not_ranking),
        "keywords_in_local_pack": len(ranked_in_pack),
        "latest": [
            {
                "keyword": kw,
                "organic_position": s.organic_position,
                "local_pack_position": s.local_pack_position,
                "maps_position": s.maps_position,
                "date": s.date,
                "provider": s.provider,
            }
            for kw, _, s in sorted(ranked, key=lambda x: (x[2].organic_position or 999))
        ],
    }


def get_winners_losers(
    tenant_id: str,
    location_id: str,
    *,
    top_n: int = 5,
) -> Dict[str, Any]:
    """Return keywords with the biggest position gains and drops."""
    snap_repo = get_local_rank_snapshot_repository()
    all_snaps = snap_repo.list_by_location(tenant_id, location_id)

    keyword_history: Dict[str, List[Tuple[str, LocalRankSnapshot]]] = {}
    for sid, snap in all_snaps:
        keyword_history.setdefault(snap.keyword, []).append((sid, snap))

    for kw in keyword_history:
        keyword_history[kw].sort(key=lambda p: (p[1].date or "", p[1].created_at or ""))

    winners = []
    losers = []
    for kw, history in keyword_history.items():
        if len(history) < 2:
            continue
        oldest_pos = history[0][1].organic_position
        newest_pos = history[-1][1].organic_position
        if oldest_pos is None or newest_pos is None:
            continue
        delta = oldest_pos - newest_pos  # positive = improved (lower rank number is better)
        entry = {"keyword": kw, "position_change": delta,
                 "old_position": oldest_pos, "new_position": newest_pos}
        if delta > 0:
            winners.append(entry)
        elif delta < 0:
            losers.append(entry)

    winners.sort(key=lambda x: x["position_change"], reverse=True)
    losers.sort(key=lambda x: x["position_change"])

    return {
        "location_id": location_id,
        "winners": winners[:top_n],
        "losers": losers[:top_n],
    }


def get_local_pack_visibility(
    tenant_id: str,
    location_id: str,
) -> Dict[str, Any]:
    """Return local-pack visibility summary."""
    snap_repo = get_local_rank_snapshot_repository()
    all_snaps = snap_repo.list_by_location(tenant_id, location_id)

    latest: Dict[str, LocalRankSnapshot] = {}
    for _, snap in all_snaps:
        key = snap.keyword
        if key not in latest or (snap.date or "") > (latest[key].date or ""):
            latest[key] = snap

    in_pack = [s for s in latest.values() if s.local_pack_position is not None]
    total = len(latest)

    position_counts = {1: 0, 2: 0, 3: 0}
    for s in in_pack:
        if s.local_pack_position in position_counts:
            position_counts[s.local_pack_position] += 1

    return {
        "location_id": location_id,
        "total_keywords": total,
        "keywords_in_local_pack": len(in_pack),
        "pack_position_breakdown": position_counts,
        "local_pack_rate": round(len(in_pack) / total, 3) if total else 0.0,
    }
