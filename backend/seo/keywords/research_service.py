"""Full keyword research workflow.

Inputs:
  seed keyword, domain, existing GSC queries list, competitor domain,
  country/language/location/device.

Outputs: enriched ideas (keyword, volume, cpc, competition, difficulty, intent,
  serp_features, related_questions [when available], existing_ranking flag,
  content_gap flag).

Filters (all optional):
  volume_min/max, difficulty_min/max, cpc_min/max, intent, length_min/max,
  include_words, exclude_words, questions_only, unranked_only, content_gap_only.

Actions (service functions):
  add_selected_to_project, track_selected, create_cluster_from, assign_target_page_bulk.

Response cache (in-memory):
  Keyed by a normalised frozenset of params, TTL controlled by env var
  SEO_KEYWORD_CACHE_TTL_SECONDS (default 300). Avoids re-calling the provider for
  identical repeated requests within the TTL window. Never raises on cache misses.

Provider notes:
  - Calls get_keyword_provider().research(...) — always mock-safe offline.
  - Records provider name + timestamp on every result item.
  - Never invents volume/difficulty — passes provider "unavailable" (None) through.
"""

from __future__ import annotations

import hashlib
import json
import os
import time
from typing import Any, Dict, List, Optional

from seo.keywords.provider import get_keyword_provider
from seo.search_stores import (
    SearchIntent,
    TrackingStatus,
    get_keyword_cluster_repository,
    get_keyword_repository,
)


# ── In-memory cache ───────────────────────────────────────────────────────────

_CACHE: Dict[str, Dict[str, Any]] = {}  # cache_key -> {result, expires_at}

_DEFAULT_TTL = 300  # seconds


def _cache_ttl() -> int:
    try:
        return int(os.getenv("SEO_KEYWORD_CACHE_TTL_SECONDS", str(_DEFAULT_TTL)))
    except (ValueError, TypeError):
        return _DEFAULT_TTL


def _make_cache_key(params: Dict[str, Any]) -> str:
    """Stable cache key from a normalised dict of request parameters."""
    serialised = json.dumps(params, sort_keys=True, default=str)
    return hashlib.sha256(serialised.encode("utf-8")).hexdigest()


def _cache_get(key: str) -> Optional[Dict[str, Any]]:
    entry = _CACHE.get(key)
    if not entry:
        return None
    if time.monotonic() > entry["expires_at"]:
        _CACHE.pop(key, None)
        return None
    return entry["result"]


def _cache_set(key: str, result: Dict[str, Any]) -> None:
    _CACHE[key] = {
        "result": result,
        "expires_at": time.monotonic() + _cache_ttl(),
    }


def clear_research_cache() -> None:
    """Clear the in-memory research cache (useful in tests)."""
    _CACHE.clear()


# ── Normalise provider ideas ──────────────────────────────────────────────────

def _idea_to_enriched(idea, *, data_timestamp: str, data_provider: str) -> Dict[str, Any]:
    """Convert a KeywordIdea into the enriched research result shape.

    Preserves None values from the provider — never fabricates metrics.
    """
    volume = getattr(idea, "volume", None)
    difficulty = getattr(idea, "difficulty", None)
    cpc = getattr(idea, "cpc", None)
    competition = getattr(idea, "competition", None)
    intent_raw = getattr(idea, "intent", None)
    # Normalise intent to SearchIntent values; fall back to UNKNOWN.
    if intent_raw:
        try:
            intent_val = SearchIntent(intent_raw).value
        except ValueError:
            intent_val = SearchIntent.UNKNOWN.value
    else:
        intent_val = SearchIntent.UNKNOWN.value

    return {
        "keyword": idea.keyword,
        "volume": volume if volume and volume > 0 else None,
        "cpc": cpc,
        "competition": competition,
        "difficulty": difficulty,
        "intent": intent_val,
        "serp_features": list(getattr(idea, "serp_features", None) or []),
        "related_questions": list(getattr(idea, "related_questions", None) or []),
        "existing_ranking": False,   # enriched below
        "content_gap": False,        # enriched below
        "data_provider": data_provider,
        "data_timestamp": data_timestamp,
    }


# ── Filters ───────────────────────────────────────────────────────────────────

def _apply_filters(
    ideas: List[Dict[str, Any]],
    *,
    volume_min: Optional[int] = None,
    volume_max: Optional[int] = None,
    difficulty_min: Optional[int] = None,
    difficulty_max: Optional[int] = None,
    cpc_min: Optional[float] = None,
    cpc_max: Optional[float] = None,
    intent: Optional[str] = None,
    length_min: Optional[int] = None,
    length_max: Optional[int] = None,
    include_words: Optional[List[str]] = None,
    exclude_words: Optional[List[str]] = None,
    questions_only: bool = False,
    unranked_only: bool = False,
    content_gap_only: bool = False,
) -> List[Dict[str, Any]]:
    result = []
    for idea in ideas:
        kw = idea["keyword"].lower()
        vol = idea.get("volume")
        diff = idea.get("difficulty")
        cpc = idea.get("cpc")

        if volume_min is not None and (vol is None or vol < volume_min):
            continue
        if volume_max is not None and (vol is None or vol > volume_max):
            continue
        if difficulty_min is not None and (diff is None or diff < difficulty_min):
            continue
        if difficulty_max is not None and (diff is None or diff > difficulty_max):
            continue
        if cpc_min is not None and (cpc is None or cpc < cpc_min):
            continue
        if cpc_max is not None and (cpc is None or cpc > cpc_max):
            continue
        if intent is not None and idea.get("intent") != intent:
            continue
        words = kw.split()
        if length_min is not None and len(words) < length_min:
            continue
        if length_max is not None and len(words) > length_max:
            continue
        if include_words:
            if not all(w.lower() in kw for w in include_words):
                continue
        if exclude_words:
            if any(w.lower() in kw for w in exclude_words):
                continue
        if questions_only:
            if not any(kw.startswith(q) for q in ("how", "what", "why", "when", "where", "which", "who", "is ", "are ", "can ", "do ", "does ")):
                continue
        if unranked_only and idea.get("existing_ranking"):
            continue
        if content_gap_only and not idea.get("content_gap"):
            continue

        result.append(idea)
    return result


# ── Main workflow ─────────────────────────────────────────────────────────────

def research(
    tenant_id: str,
    project_id: str,
    *,
    seed_keyword: str,
    domain: str = "",
    gsc_queries: Optional[List[str]] = None,
    competitor_domain: str = "",
    country: str = "us",
    language: str = "en",
    location: str = "",
    device: str = "desktop",
    # Filters.
    volume_min: Optional[int] = None,
    volume_max: Optional[int] = None,
    difficulty_min: Optional[int] = None,
    difficulty_max: Optional[int] = None,
    cpc_min: Optional[float] = None,
    cpc_max: Optional[float] = None,
    intent: Optional[str] = None,
    length_min: Optional[int] = None,
    length_max: Optional[int] = None,
    include_words: Optional[List[str]] = None,
    exclude_words: Optional[List[str]] = None,
    questions_only: bool = False,
    unranked_only: bool = False,
    content_gap_only: bool = False,
) -> Dict[str, Any]:
    """Execute the full research workflow for a project.

    Results are cached by normalised params for SEO_KEYWORD_CACHE_TTL_SECONDS.
    The existing_ranking flag is True when the keyword already exists in the
    project. The content_gap flag is True when the keyword appears in
    gsc_queries but is NOT already tracked in the project.

    Returns a dict with keys: ideas (enriched list), provider, cache_hit, total.
    """
    cache_params = {
        "tenant_id": tenant_id,
        "project_id": project_id,
        "seed_keyword": seed_keyword.strip().lower() if seed_keyword else "",
        "domain": domain,
        "gsc_queries": sorted(gsc_queries or []),
        "competitor_domain": competitor_domain,
        "country": country,
        "language": language,
        "location": location,
        "device": device,
    }
    cache_key = _make_cache_key(cache_params)
    cached = _cache_get(cache_key)
    if cached is not None:
        # Apply filters to the cached result list before returning.
        filtered = _apply_filters(
            cached["_raw_ideas"],
            volume_min=volume_min,
            volume_max=volume_max,
            difficulty_min=difficulty_min,
            difficulty_max=difficulty_max,
            cpc_min=cpc_min,
            cpc_max=cpc_max,
            intent=intent,
            length_min=length_min,
            length_max=length_max,
            include_words=include_words,
            exclude_words=exclude_words,
            questions_only=questions_only,
            unranked_only=unranked_only,
            content_gap_only=content_gap_only,
        )
        return {
            "ideas": filtered,
            "provider": cached["provider"],
            "cache_hit": True,
            "total": len(filtered),
        }

    # Not cached — call the provider.
    provider = get_keyword_provider()
    data_timestamp = _utc_now()
    data_provider = getattr(provider, "name", "unknown")

    seed_list: List[str] = []
    if gsc_queries:
        seed_list.extend(gsc_queries[:50])  # cap seeds to avoid huge requests

    raw_ideas = provider.research(seed_keyword or "", seed_list)

    # Build existing-keyword set for this project (normalized).
    kw_repo = get_keyword_repository()
    existing_pairs = kw_repo.list_by_project(tenant_id, project_id)
    existing_normalized = {kw.normalized_keyword for _, kw in existing_pairs}

    # Build GSC queries set (normalised) for content-gap detection.
    gsc_norm = set()
    for q in (gsc_queries or []):
        gsc_norm.add(" ".join(q.lower().split()))

    enriched: List[Dict[str, Any]] = []
    for idea in raw_ideas:
        item = _idea_to_enriched(
            idea,
            data_timestamp=data_timestamp,
            data_provider=data_provider,
        )
        norm_kw = " ".join(item["keyword"].lower().split())
        item["existing_ranking"] = norm_kw in existing_normalized
        # Content gap: appears in GSC queries but NOT in the project yet.
        item["content_gap"] = (norm_kw in gsc_norm) and (norm_kw not in existing_normalized)
        enriched.append(item)

    # Store raw (unfiltered) ideas in cache under a private key.
    cache_entry = {
        "_raw_ideas": enriched,
        "provider": {
            "name": data_provider,
            "timestamp": data_timestamp,
            "is_mock": data_provider == "mock",
        },
    }
    _cache_set(cache_key, cache_entry)

    filtered = _apply_filters(
        enriched,
        volume_min=volume_min,
        volume_max=volume_max,
        difficulty_min=difficulty_min,
        difficulty_max=difficulty_max,
        cpc_min=cpc_min,
        cpc_max=cpc_max,
        intent=intent,
        length_min=length_min,
        length_max=length_max,
        include_words=include_words,
        exclude_words=exclude_words,
        questions_only=questions_only,
        unranked_only=unranked_only,
        content_gap_only=content_gap_only,
    )
    return {
        "ideas": filtered,
        "provider": {
            "name": data_provider,
            "timestamp": data_timestamp,
            "is_mock": data_provider == "mock",
        },
        "cache_hit": False,
        "total": len(filtered),
    }


# ── Action helpers ────────────────────────────────────────────────────────────

def add_selected_to_project(
    tenant_id: str,
    project_id: str,
    ideas: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Add a selection of research result ideas to the project as keywords.

    Uses keyword_service to get duplicate detection and limit enforcement.
    Returns counts: added, skipped_duplicates, rejected_limit.
    """
    from seo.keywords.keyword_service import add_keyword

    added = []
    skipped = []
    rejected = []

    for idea in ideas:
        kw_text = (idea.get("keyword") or "").strip()
        if not kw_text:
            continue
        result = add_keyword(
            tenant_id,
            project_id,
            kw_text,
            search_volume=idea.get("volume"),
            cpc=idea.get("cpc"),
            competition=idea.get("competition"),
            difficulty=idea.get("difficulty"),
            intent=idea.get("intent") or "unknown",
            serp_features=idea.get("serp_features") or [],
            data_provider=idea.get("data_provider") or "",
            data_timestamp=idea.get("data_timestamp") or "",
        )
        if result.get("added"):
            added.append(result["keyword"])
        elif result.get("reason") == "duplicate":
            skipped.append(kw_text)
        else:
            rejected.append(kw_text)

    return {
        "added_count": len(added),
        "skipped_duplicates": len(skipped),
        "rejected": len(rejected),
        "keywords": added,
    }


def track_selected(
    tenant_id: str,
    keyword_ids: List[str],
) -> Dict[str, Any]:
    """Set tracking_status=tracked for a list of keyword IDs."""
    from seo.keywords.keyword_service import set_tracking_status

    updated = []
    for kw_id in keyword_ids:
        result = set_tracking_status(tenant_id, kw_id, TrackingStatus.TRACKED.value)
        if result.get("keyword"):
            updated.append(result["keyword"])
    return {"updated_count": len(updated), "keywords": updated}


def create_cluster_from(
    tenant_id: str,
    project_id: str,
    keyword_ids: List[str],
    cluster_name: str = "",
) -> Dict[str, Any]:
    """Create a new cluster from a selection of keyword IDs.

    The cluster name defaults to the first keyword in the selection.
    """
    from seo.keywords.clustering import cluster_keywords_deterministic

    kw_repo = get_keyword_repository()
    kws = []
    for kw_id in keyword_ids:
        result = kw_repo.get(tenant_id, kw_id)
        if result:
            kws.append(result)

    if not kws:
        return {"error": "no_keywords_found"}

    # Build synthetic ideas list for clustering.
    ideas = [
        {"keyword": kw.keyword, "intent": kw.intent.value if hasattr(kw.intent, "value") else kw.intent}
        for _, kw in kws
    ]
    clusters = cluster_keywords_deterministic(ideas)
    if not clusters:
        return {"error": "clustering_returned_empty"}

    first = clusters[0]
    name = cluster_name or first.get("name") or kws[0][1].keyword

    cluster_repo = get_keyword_cluster_repository()
    from seo.search_stores import KeywordCluster

    try:
        intent_enum = SearchIntent(first.get("intent", "unknown"))
    except ValueError:
        intent_enum = SearchIntent.UNKNOWN

    cluster_obj = KeywordCluster(
        tenant_id=tenant_id,
        project_id=project_id,
        name=name,
        primary_keyword=kws[0][1].keyword if kws else "",
        intent=intent_enum,
        method="manual",
        keyword_ids=list(keyword_ids),
    )
    cid, saved = cluster_repo.create(cluster_obj)
    return {
        "cluster": {
            "id": cid,
            "name": saved.name,
            "primary_keyword": saved.primary_keyword,
            "intent": saved.intent.value,
            "keyword_ids": saved.keyword_ids,
        }
    }


def assign_target_page_bulk(
    tenant_id: str,
    keyword_ids: List[str],
    target_page: str,
) -> Dict[str, Any]:
    """Assign the same target page to multiple keywords."""
    from seo.keywords.keyword_service import assign_target_page

    updated = []
    for kw_id in keyword_ids:
        result = assign_target_page(tenant_id, kw_id, target_page)
        if result.get("keyword"):
            updated.append(result["keyword"])
    return {"updated_count": len(updated), "keywords": updated}


# ── Internal helpers ──────────────────────────────────────────────────────────

def _utc_now() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat(timespec="seconds")
