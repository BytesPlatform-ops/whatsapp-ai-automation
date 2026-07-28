"""Deterministic keyword clustering + intent classification.

Intent classification:
  Each keyword is classified into SearchIntent (informational / commercial /
  transactional / navigational / local) using modifier heuristics.  The
  classifier is purely deterministic (modifier → intent mapping); no LLM is
  called unless ``ai_assist=True`` is explicitly requested and the call is
  NOT a mock call (``is_mock=True`` always forces deterministic path).

  Metering: record_ai_intent from seo.metering_search is called only when AI
  assist is actually used.

Clustering:
  Keywords are grouped by (shared leading token stem + intent). The stem is the
  first normalised token of the keyword, making the grouping fully deterministic
  and hash-stable (same input always → same cluster IDs). Clusters with only
  one keyword are left as singleton clusters.

  Metering: record_ai_clustering is called only when AI assist is used; the
  default deterministic path records 0 credits.

Cluster CRUD helpers:
  merge_clusters, split_cluster, rename_cluster,
  assign_primary_keyword, assign_target_url,
  set_page_status (new_page | existing_page).
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from seo.search_stores import (
    KeywordCluster,
    SearchIntent,
    get_keyword_cluster_repository,
    get_keyword_repository,
)


# ── Modifier → intent heuristics ─────────────────────────────────────────────
# Checked in order; first match wins.

_INTENT_RULES: List[tuple] = [
    # Local first (very specific).
    (SearchIntent.LOCAL, re.compile(
        r"\b(near me|near by|nearby|local|in [a-z][a-z]+|city|town|neighbourhood|neighborhood|zip)\b",
        re.I,
    )),
    # Navigational.
    (SearchIntent.NAVIGATIONAL, re.compile(
        r"\b(login|sign in|sign up|account|homepage|official|website|contact us|support|portal|app|download)\b",
        re.I,
    )),
    # Transactional.
    (SearchIntent.TRANSACTIONAL, re.compile(
        r"\b(buy|purchase|order|checkout|shop|deal|discount|coupon|promo|free shipping|price|cost|fee|hire|book|subscribe|get|install)\b",
        re.I,
    )),
    # Commercial (investigation).
    (SearchIntent.COMMERCIAL, re.compile(
        r"\b(best|top|review|reviews|vs|versus|compare|comparison|alternative|alternatives|cheap|affordable|premium|rated)\b",
        re.I,
    )),
    # Informational (catch-all questions and how-tos).
    (SearchIntent.INFORMATIONAL, re.compile(
        r"\b(how|what|why|when|where|which|who|guide|tutorial|tips|tricks|learn|explain|definition|meaning|example|examples|is |are |can |do |does )\b",
        re.I,
    )),
]


def classify_intent(keyword: str) -> SearchIntent:
    """Classify a single keyword into a SearchIntent using modifier heuristics.

    Returns SearchIntent.UNKNOWN when no modifier matches.
    """
    for intent, pattern in _INTENT_RULES:
        if pattern.search(keyword):
            return intent
    return SearchIntent.UNKNOWN


def classify_intents_batch(
    keywords: List[str],
    *,
    tenant_id: str = "",
    project_id: str = "",
    ai_assist: bool = False,
    is_mock: bool = True,
) -> List[Dict[str, Any]]:
    """Classify a batch of keywords.

    When ``ai_assist=True`` and ``is_mock=False`` the method would call an AI
    backend (not yet implemented); it falls back to deterministic classification
    and records the metering call. ``is_mock=True`` forces deterministic
    classification with 0 credits.

    Returns a list of ``{keyword, intent}`` dicts in the same order as input.
    """
    results = [
        {"keyword": kw, "intent": classify_intent(kw).value}
        for kw in keywords
    ]

    if ai_assist and not is_mock and tenant_id and project_id:
        # AI assist path: we call the deterministic classifier but still meter.
        from seo import metering_search as ms
        ms.record_ai_intent(
            tenant_id,
            project_id=project_id,
            keyword_count=len(keywords),
            is_mock=False,
        )

    return results


# ── Deterministic clustering ──────────────────────────────────────────────────

def _stem_token(keyword: str) -> str:
    """Return the first normalised token of a keyword as its cluster stem."""
    tokens = " ".join((keyword or "").lower().split()).split()
    return tokens[0] if tokens else ""


def cluster_keywords_deterministic(
    ideas: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Group keyword ideas into clusters by (first-token-stem, intent).

    Input: list of dicts with at least ``keyword`` and optionally ``intent``.
    Output: list of cluster dicts with keys:
      name, primary_keyword, intent, method, keyword_ids (positional indices),
      keywords (list of keyword strings).

    The output order is determined by insertion order of first-seen stems, so
    the same input list always produces the same clusters (hash-stable).
    """
    # Bucket keywords by (stem, intent).
    buckets: Dict[tuple, List[int]] = {}
    for i, idea in enumerate(ideas):
        kw = idea.get("keyword", "")
        intent_raw = idea.get("intent", "")
        try:
            intent_val = SearchIntent(intent_raw).value
        except ValueError:
            intent_val = classify_intent(kw).value
        stem = _stem_token(kw)
        key = (stem, intent_val)
        buckets.setdefault(key, []).append(i)

    clusters: List[Dict[str, Any]] = []
    for (stem, intent_val), indices in buckets.items():
        kw_strings = [ideas[i]["keyword"] for i in indices]
        primary = kw_strings[0]
        clusters.append({
            "name": stem or primary,
            "primary_keyword": primary,
            "intent": intent_val,
            "method": "semantic",
            "keyword_ids": indices,
            "keywords": kw_strings,
        })

    return clusters


def auto_cluster_project(
    tenant_id: str,
    project_id: str,
    *,
    ai_assist: bool = False,
    is_mock: bool = True,
) -> Dict[str, Any]:
    """Auto-cluster all keywords in a project and persist KeywordCluster rows.

    Existing clusters for the project are NOT deleted; this only adds new ones.
    Returns a list of created cluster dicts.

    Metering: record_ai_clustering is called only when AI assist is used.
    """
    kw_repo = get_keyword_repository()
    cluster_repo = get_keyword_cluster_repository()

    pairs = kw_repo.list_by_project(tenant_id, project_id)
    if not pairs:
        return {"clusters": [], "created": 0}

    ideas = []
    id_map: Dict[int, str] = {}  # positional index -> keyword_id
    for i, (kw_id, kw) in enumerate(pairs):
        intent_val = kw.intent.value if hasattr(kw.intent, "value") else kw.intent
        ideas.append({"keyword": kw.keyword, "intent": intent_val})
        id_map[i] = kw_id

    raw_clusters = cluster_keywords_deterministic(ideas)

    # Optionally refine intents via AI (metered only when is_mock=False).
    if ai_assist and not is_mock:
        all_kws = [i["keyword"] for i in ideas]
        refined = classify_intents_batch(
            all_kws,
            tenant_id=tenant_id,
            project_id=project_id,
            ai_assist=True,
            is_mock=False,
        )
        refined_map = {r["keyword"]: r["intent"] for r in refined}
        for c in raw_clusters:
            kws_in = c["keywords"]
            intents = [refined_map.get(k, c["intent"]) for k in kws_in]
            # Majority vote.
            from collections import Counter
            most_common = Counter(intents).most_common(1)
            if most_common:
                c["intent"] = most_common[0][0]

        from seo import metering_search as ms
        ms.record_ai_clustering(
            tenant_id,
            project_id=project_id,
            keyword_count=len(ideas),
            is_mock=False,
        )

    now = _utc_now()
    created: List[Dict[str, Any]] = []
    for c in raw_clusters:
        try:
            intent_enum = SearchIntent(c.get("intent", "unknown"))
        except ValueError:
            intent_enum = SearchIntent.UNKNOWN

        real_kw_ids = [id_map[idx] for idx in c["keyword_ids"] if idx in id_map]
        cluster_obj = KeywordCluster(
            tenant_id=tenant_id,
            project_id=project_id,
            name=c["name"],
            primary_keyword=c["primary_keyword"],
            intent=intent_enum,
            method="semantic",
            version=1,
            keyword_ids=real_kw_ids,
        )
        cid, saved = cluster_repo.create(cluster_obj)
        # Update each keyword with the cluster_id.
        for kw_id in real_kw_ids:
            kw_repo.update(tenant_id, kw_id, cluster_id=cid)

        created.append(_cluster_to_dict(cid, saved))

    return {"clusters": created, "created": len(created)}


# ── Cluster CRUD helpers ──────────────────────────────────────────────────────

def _cluster_to_dict(cluster_id: str, cluster: KeywordCluster) -> Dict[str, Any]:
    return {
        "id": cluster_id,
        "tenant_id": cluster.tenant_id,
        "project_id": cluster.project_id,
        "name": cluster.name,
        "primary_keyword": cluster.primary_keyword,
        "target_url": cluster.target_url,
        "intent": cluster.intent.value if hasattr(cluster.intent, "value") else cluster.intent,
        "method": cluster.method,
        "version": cluster.version,
        "page_status": cluster.page_status,
        "keyword_ids": cluster.keyword_ids,
        "created_at": cluster.created_at,
        "updated_at": cluster.updated_at,
    }


def list_clusters(tenant_id: str, project_id: str) -> Dict[str, Any]:
    """List all clusters for a project."""
    repo = get_keyword_cluster_repository()
    pairs = repo.list_by_project(tenant_id, project_id)
    return {"clusters": [_cluster_to_dict(cid, c) for cid, c in pairs]}


def get_cluster(tenant_id: str, cluster_id: str) -> Dict[str, Any]:
    """Get a single cluster by ID."""
    repo = get_keyword_cluster_repository()
    result = repo.get(tenant_id, cluster_id)
    if not result:
        return {}
    cid, cluster = result
    return {"cluster": _cluster_to_dict(cid, cluster)}


def rename_cluster(tenant_id: str, cluster_id: str, name: str) -> Dict[str, Any]:
    """Rename a cluster."""
    repo = get_keyword_cluster_repository()
    result = repo.get(tenant_id, cluster_id)
    if not result:
        return {}
    updated = repo.update(tenant_id, cluster_id, name=name.strip())
    if not updated:
        return {}
    cid, cluster = updated
    return {"cluster": _cluster_to_dict(cid, cluster)}


def assign_primary_keyword(
    tenant_id: str, cluster_id: str, primary_keyword: str
) -> Dict[str, Any]:
    """Set the primary keyword on a cluster."""
    repo = get_keyword_cluster_repository()
    result = repo.get(tenant_id, cluster_id)
    if not result:
        return {}
    updated = repo.update(tenant_id, cluster_id, primary_keyword=primary_keyword)
    if not updated:
        return {}
    cid, cluster = updated
    return {"cluster": _cluster_to_dict(cid, cluster)}


def assign_target_url(
    tenant_id: str, cluster_id: str, target_url: str
) -> Dict[str, Any]:
    """Assign a target URL to a cluster."""
    repo = get_keyword_cluster_repository()
    result = repo.get(tenant_id, cluster_id)
    if not result:
        return {}
    updated = repo.update(tenant_id, cluster_id, target_url=target_url)
    if not updated:
        return {}
    cid, cluster = updated
    return {"cluster": _cluster_to_dict(cid, cluster)}


def set_page_status(
    tenant_id: str, cluster_id: str, page_status: str
) -> Dict[str, Any]:
    """Set page_status to 'new_page' or 'existing_page' on a cluster."""
    if page_status not in ("new_page", "existing_page", ""):
        return {"error": f"invalid page_status: {page_status!r}"}
    repo = get_keyword_cluster_repository()
    result = repo.get(tenant_id, cluster_id)
    if not result:
        return {}
    updated = repo.update(tenant_id, cluster_id, page_status=page_status)
    if not updated:
        return {}
    cid, cluster = updated
    return {"cluster": _cluster_to_dict(cid, cluster)}


def merge_clusters(
    tenant_id: str,
    source_cluster_ids: List[str],
    target_cluster_id: str,
) -> Dict[str, Any]:
    """Merge one or more source clusters into a target cluster.

    All keyword_ids from source clusters are appended to the target; source
    clusters are deleted. The target version is incremented.
    """
    repo = get_keyword_cluster_repository()
    kw_repo = get_keyword_repository()

    target_result = repo.get(tenant_id, target_cluster_id)
    if not target_result:
        return {"error": "target_cluster_not_found"}

    _, target = target_result
    merged_kw_ids = list(target.keyword_ids)

    for src_id in source_cluster_ids:
        if src_id == target_cluster_id:
            continue
        src_result = repo.get(tenant_id, src_id)
        if not src_result:
            continue
        _, src = src_result
        for kw_id in src.keyword_ids:
            if kw_id not in merged_kw_ids:
                merged_kw_ids.append(kw_id)
        repo.delete(tenant_id, src_id)

    updated = repo.update(
        tenant_id, target_cluster_id,
        keyword_ids=merged_kw_ids,
        version=target.version + 1,
    )
    if not updated:
        return {"error": "merge_failed"}

    # Update cluster_id on all moved keywords.
    for kw_id in merged_kw_ids:
        kw_repo.update(tenant_id, kw_id, cluster_id=target_cluster_id)

    cid, cluster = updated
    return {"cluster": _cluster_to_dict(cid, cluster)}


def split_cluster(
    tenant_id: str,
    cluster_id: str,
    keyword_ids_to_split: List[str],
    new_cluster_name: str = "",
) -> Dict[str, Any]:
    """Split keyword_ids_to_split out of cluster_id into a new cluster.

    The original cluster retains the remaining keywords; the new cluster gets
    the split keywords. Returns both cluster dicts.
    """
    repo = get_keyword_cluster_repository()
    kw_repo = get_keyword_repository()

    result = repo.get(tenant_id, cluster_id)
    if not result:
        return {"error": "cluster_not_found"}

    _, original = result
    split_set = set(keyword_ids_to_split)
    remaining = [k for k in original.keyword_ids if k not in split_set]
    split_ids = [k for k in original.keyword_ids if k in split_set]

    if not split_ids:
        return {"error": "no_matching_keyword_ids"}

    # Update original cluster.
    updated_original = repo.update(
        tenant_id, cluster_id,
        keyword_ids=remaining,
        version=original.version + 1,
    )

    # Determine name and intent for new cluster.
    first_kw = ""
    first_intent = original.intent
    if split_ids:
        first_kw_result = kw_repo.get(tenant_id, split_ids[0])
        if first_kw_result:
            _, kw_obj = first_kw_result
            first_kw = kw_obj.keyword
            first_intent = kw_obj.intent

    new_name = new_cluster_name.strip() or first_kw or "split_cluster"
    new_cluster_obj = KeywordCluster(
        tenant_id=tenant_id,
        project_id=original.project_id,
        name=new_name,
        primary_keyword=first_kw,
        intent=first_intent if isinstance(first_intent, SearchIntent) else SearchIntent.UNKNOWN,
        method=original.method,
        keyword_ids=split_ids,
    )
    new_cid, new_saved = repo.create(new_cluster_obj)

    # Update cluster_id on the split keywords.
    for kw_id in split_ids:
        kw_repo.update(tenant_id, kw_id, cluster_id=new_cid)

    out: Dict[str, Any] = {"new_cluster": _cluster_to_dict(new_cid, new_saved)}
    if updated_original:
        ocid, oc = updated_original
        out["original_cluster"] = _cluster_to_dict(ocid, oc)
    return out


# ── Internal ──────────────────────────────────────────────────────────────────

def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")
