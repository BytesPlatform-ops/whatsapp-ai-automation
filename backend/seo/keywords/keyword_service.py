"""Keyword CRUD service within a project.

Handles:
- Manual add / BULK paste (newline/comma split, normalized dedup)
- Archive / remove
- Tagging
- Target-page assignment
- Search / filter (by keyword text, intent, tracking status, tags)
- Tracking status toggle
- Storing provider metrics onto Keyword + appending a KeywordMetric snapshot

Duplicate detection is based on ``normalized_keyword`` within a project. The
normalisation is: lower-case + collapse whitespace. Duplicates from the same
project are silently skipped (idempotent bulk import).

Limit enforcement for LIMIT_KEYWORDS_PER_PROJECT is applied server-side before
adding new keywords (either manual or bulk).
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

from seo.metering_search import (
    LIMIT_KEYWORDS_PER_PROJECT,
    enforce_seo_limit,
)
from seo.search_stores import (
    Keyword,
    KeywordMetric,
    SearchIntent,
    TrackingStatus,
    get_keyword_metric_repository,
    get_keyword_repository,
)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _normalize(keyword: str) -> str:
    """Lower-case + collapse whitespace."""
    return " ".join((keyword or "").lower().split())


def _keyword_to_dict(keyword_id: str, kw: Keyword) -> Dict[str, Any]:
    return {
        "id": keyword_id,
        "tenant_id": kw.tenant_id,
        "project_id": kw.project_id,
        "keyword": kw.keyword,
        "normalized_keyword": kw.normalized_keyword,
        "site_id": kw.site_id,
        "search_volume": kw.search_volume,
        "cpc": kw.cpc,
        "competition": kw.competition,
        "difficulty": kw.difficulty,
        "intent": kw.intent.value if hasattr(kw.intent, "value") else kw.intent,
        "trend": kw.trend,
        "serp_features": kw.serp_features,
        "cluster_id": kw.cluster_id,
        "target_page": kw.target_page,
        "current_rank": kw.current_rank,
        "best_rank": kw.best_rank,
        "previous_rank": kw.previous_rank,
        "ranking_url": kw.ranking_url,
        "data_provider": kw.data_provider,
        "data_timestamp": kw.data_timestamp,
        "tracking_status": kw.tracking_status.value if hasattr(kw.tracking_status, "value") else kw.tracking_status,
        "tags": kw.tags,
        "notes": kw.notes,
        "created_at": kw.created_at,
        "updated_at": kw.updated_at,
    }


def _split_bulk(text: str) -> List[str]:
    """Split a bulk paste (newline/comma/semicolon) into individual keyword strings."""
    parts = re.split(r"[\n\r,;]+", text or "")
    result = []
    for p in parts:
        cleaned = p.strip()
        if cleaned:
            result.append(cleaned)
    return result


def _existing_normalized_set(tenant_id: str, project_id: str) -> set:
    repo = get_keyword_repository()
    pairs = repo.list_by_project(tenant_id, project_id)
    return {kw.normalized_keyword for _, kw in pairs}


def _count_project_keywords(tenant_id: str, project_id: str) -> int:
    repo = get_keyword_repository()
    return len(repo.list_by_project(tenant_id, project_id))


def _append_metric_snapshot(
    tenant_id: str,
    keyword_id: str,
    project_id: str,
    kw: Keyword,
) -> None:
    """Append a KeywordMetric point-in-time snapshot from current keyword data."""
    metric_repo = get_keyword_metric_repository()
    metric = KeywordMetric(
        tenant_id=tenant_id,
        keyword_id=keyword_id,
        project_id=project_id,
        search_volume=kw.search_volume,
        cpc=kw.cpc,
        competition=kw.competition,
        difficulty=kw.difficulty,
        trend=list(kw.trend or []),
        data_provider=kw.data_provider,
        data_timestamp=kw.data_timestamp,
    )
    metric_repo.create(metric)


# ── Public API ─────────────────────────────────────────────────────────────────

def add_keyword(
    tenant_id: str,
    project_id: str,
    keyword: str,
    *,
    site_id: str = "",
    search_volume: Optional[int] = None,
    cpc: Optional[float] = None,
    competition: Optional[float] = None,
    difficulty: Optional[int] = None,
    intent: str = "unknown",
    trend: Optional[List[int]] = None,
    serp_features: Optional[List[str]] = None,
    target_page: str = "",
    data_provider: str = "",
    data_timestamp: str = "",
    tags: Optional[List[str]] = None,
    notes: str = "",
    tracking_status: str = "untracked",
) -> Dict[str, Any]:
    """Add a single keyword to a project.

    Returns ``{"added": True, "keyword": {...}}`` or ``{"added": False, "reason": "..."}``
    on duplicate or limit exceeded.
    """
    repo = get_keyword_repository()
    normalized = _normalize(keyword)
    if not normalized:
        return {"added": False, "reason": "empty_keyword"}

    # Duplicate detection within project.
    existing_set = _existing_normalized_set(tenant_id, project_id)
    if normalized in existing_set:
        return {"added": False, "reason": "duplicate"}

    # Plan limit check.
    current_count = _count_project_keywords(tenant_id, project_id)
    enforce_seo_limit(tenant_id, LIMIT_KEYWORDS_PER_PROJECT, current_count)

    # Parse intent.
    try:
        intent_enum = SearchIntent(intent)
    except ValueError:
        intent_enum = SearchIntent.UNKNOWN

    # Parse tracking status.
    try:
        tracking_enum = TrackingStatus(tracking_status)
    except ValueError:
        tracking_enum = TrackingStatus.UNTRACKED

    kw = Keyword(
        tenant_id=tenant_id,
        project_id=project_id,
        keyword=keyword.strip(),
        normalized_keyword=normalized,
        site_id=site_id,
        search_volume=search_volume,
        cpc=cpc,
        competition=competition,
        difficulty=difficulty,
        intent=intent_enum,
        trend=list(trend or []),
        serp_features=list(serp_features or []),
        target_page=target_page,
        data_provider=data_provider,
        data_timestamp=data_timestamp,
        tracking_status=tracking_enum,
        tags=list(tags or []),
        notes=notes,
    )
    kw_id, saved = repo.create(kw)

    # Append metric snapshot when provider data is present.
    if search_volume is not None or cpc is not None or difficulty is not None:
        _append_metric_snapshot(tenant_id, kw_id, project_id, saved)

    return {"added": True, "keyword": _keyword_to_dict(kw_id, saved)}


def bulk_add_keywords(
    tenant_id: str,
    project_id: str,
    text: str,
    *,
    site_id: str = "",
    tags: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Bulk-add keywords from a newline/comma pasted string.

    Returns counts of added, skipped (duplicates), and rejected (limit exceeded)
    keywords plus the list of successfully added keyword dicts.
    """
    candidates = _split_bulk(text)
    existing_set = _existing_normalized_set(tenant_id, project_id)

    added = []
    skipped_duplicates: List[str] = []
    rejected_limit: List[str] = []

    for raw in candidates:
        normalized = _normalize(raw)
        if not normalized:
            continue
        if normalized in existing_set:
            skipped_duplicates.append(raw)
            continue

        current_count = _count_project_keywords(tenant_id, project_id)
        from seo.metering_search import check_seo_limit
        check = check_seo_limit(tenant_id, LIMIT_KEYWORDS_PER_PROJECT, current_count)
        if not check.get("allowed", True):
            rejected_limit.append(raw)
            continue

        kw = Keyword(
            tenant_id=tenant_id,
            project_id=project_id,
            keyword=raw.strip(),
            normalized_keyword=normalized,
            site_id=site_id,
            tags=list(tags or []),
        )
        kw_id, saved = get_keyword_repository().create(kw)
        added.append(_keyword_to_dict(kw_id, saved))
        existing_set.add(normalized)  # keep set fresh for this batch

    return {
        "added_count": len(added),
        "skipped_duplicates": len(skipped_duplicates),
        "rejected_limit": len(rejected_limit),
        "keywords": added,
    }


def list_keywords(
    tenant_id: str,
    project_id: str,
    *,
    intent: Optional[str] = None,
    tracking_status: Optional[str] = None,
    tag: Optional[str] = None,
    search: Optional[str] = None,
    include_archived: bool = False,
) -> Dict[str, Any]:
    """List keywords in a project with optional filters."""
    repo = get_keyword_repository()
    pairs = repo.list_by_project(tenant_id, project_id)

    results = []
    for kw_id, kw in pairs:
        # Filter by intent.
        if intent is not None:
            kw_intent = kw.intent.value if hasattr(kw.intent, "value") else kw.intent
            if kw_intent != intent:
                continue
        # Filter by tracking status.
        if tracking_status is not None:
            kw_ts = kw.tracking_status.value if hasattr(kw.tracking_status, "value") else kw.tracking_status
            if kw_ts != tracking_status:
                continue
        # Filter by tag.
        if tag is not None and tag not in (kw.tags or []):
            continue
        # Text search on normalized keyword.
        if search is not None:
            norm_search = _normalize(search)
            if norm_search not in kw.normalized_keyword:
                continue
        results.append(_keyword_to_dict(kw_id, kw))

    return {"keywords": results, "total": len(results)}


def get_keyword(tenant_id: str, keyword_id: str) -> Dict[str, Any]:
    """Fetch a single keyword by ID (tenant-scoped)."""
    repo = get_keyword_repository()
    result = repo.get(tenant_id, keyword_id)
    if not result:
        return {}
    kw_id, kw = result
    return {"keyword": _keyword_to_dict(kw_id, kw)}


def update_keyword(
    tenant_id: str,
    keyword_id: str,
    *,
    tags: Optional[List[str]] = None,
    target_page: Optional[str] = None,
    notes: Optional[str] = None,
    intent: Optional[str] = None,
    tracking_status: Optional[str] = None,
    search_volume: Optional[int] = None,
    cpc: Optional[float] = None,
    competition: Optional[float] = None,
    difficulty: Optional[int] = None,
    data_provider: Optional[str] = None,
    data_timestamp: Optional[str] = None,
    serp_features: Optional[List[str]] = None,
    trend: Optional[List[int]] = None,
) -> Dict[str, Any]:
    """Update mutable fields of a keyword. When provider metrics change a new
    KeywordMetric snapshot is appended."""
    repo = get_keyword_repository()
    result = repo.get(tenant_id, keyword_id)
    if not result:
        return {}

    _, old_kw = result
    fields: Dict[str, Any] = {}
    metric_fields_changed = False

    if tags is not None:
        fields["tags"] = list(tags)
    if target_page is not None:
        fields["target_page"] = target_page
    if notes is not None:
        fields["notes"] = notes
    if intent is not None:
        try:
            fields["intent"] = SearchIntent(intent)
        except ValueError:
            pass
    if tracking_status is not None:
        try:
            fields["tracking_status"] = TrackingStatus(tracking_status)
        except ValueError:
            pass
    if search_volume is not None:
        fields["search_volume"] = search_volume
        metric_fields_changed = True
    if cpc is not None:
        fields["cpc"] = cpc
        metric_fields_changed = True
    if competition is not None:
        fields["competition"] = competition
        metric_fields_changed = True
    if difficulty is not None:
        fields["difficulty"] = difficulty
        metric_fields_changed = True
    if data_provider is not None:
        fields["data_provider"] = data_provider
    if data_timestamp is not None:
        fields["data_timestamp"] = data_timestamp
    if serp_features is not None:
        fields["serp_features"] = list(serp_features)
    if trend is not None:
        fields["trend"] = list(trend)
        metric_fields_changed = True

    updated = repo.update(tenant_id, keyword_id, **fields)
    if not updated:
        return {}
    kw_id, new_kw = updated

    if metric_fields_changed:
        _append_metric_snapshot(tenant_id, kw_id, new_kw.project_id, new_kw)

    return {"keyword": _keyword_to_dict(kw_id, new_kw)}


def delete_keyword(tenant_id: str, keyword_id: str) -> Dict[str, Any]:
    """Permanently delete a keyword (and it will be excluded from future queries).

    For soft-delete, use update_keyword to set a custom tag or tracking_status.
    """
    repo = get_keyword_repository()
    deleted = repo.delete(tenant_id, keyword_id)
    return {"deleted": deleted}


def set_tracking_status(
    tenant_id: str,
    keyword_id: str,
    tracking_status: str,
) -> Dict[str, Any]:
    """Toggle the tracking status for a keyword."""
    try:
        ts = TrackingStatus(tracking_status)
    except ValueError:
        return {"error": f"invalid tracking_status: {tracking_status!r}"}
    return update_keyword(tenant_id, keyword_id, tracking_status=ts.value)


def assign_target_page(
    tenant_id: str,
    keyword_id: str,
    target_page: str,
) -> Dict[str, Any]:
    """Set the target page URL for a keyword."""
    return update_keyword(tenant_id, keyword_id, target_page=target_page)


def assign_cluster(
    tenant_id: str,
    keyword_id: str,
    cluster_id: str,
) -> Dict[str, Any]:
    """Assign a keyword to a cluster."""
    repo = get_keyword_repository()
    result = repo.get(tenant_id, keyword_id)
    if not result:
        return {}
    updated = repo.update(tenant_id, keyword_id, cluster_id=cluster_id)
    if not updated:
        return {}
    kw_id, kw = updated
    return {"keyword": _keyword_to_dict(kw_id, kw)}


def update_metrics_from_provider(
    tenant_id: str,
    keyword_id: str,
    *,
    search_volume: Optional[int],
    cpc: Optional[float],
    competition: Optional[float],
    difficulty: Optional[int],
    trend: Optional[List[int]],
    data_provider: str,
    data_timestamp: str,
    serp_features: Optional[List[str]] = None,
    intent: Optional[str] = None,
) -> Dict[str, Any]:
    """Store provider metrics onto a keyword and append a metric snapshot.

    Pass ``None`` for a metric to leave it as-is (provider returned unavailable).
    """
    return update_keyword(
        tenant_id,
        keyword_id,
        search_volume=search_volume,
        cpc=cpc,
        competition=competition,
        difficulty=difficulty,
        trend=trend,
        data_provider=data_provider,
        data_timestamp=data_timestamp,
        serp_features=serp_features,
        intent=intent,
    )
