"""On-page optimisation workspace.

Assembles a GROUNDED context object from STORED data (crawled page, GSC/GA4
rows, rank snapshots, technical issues, competitor SERP positions, keyword
clusters). Produces recommendations that CITE the evidence used via an
`evidence` block.

AI generation (title/meta rewrites, heading suggestions) is optional, metered
via record_page_optimisation, and deterministic/mocked in tests.

This module is a READ-SIDE workspace assembler — it does NOT edit seo/optimize.py.
"""

from __future__ import annotations

import logging
from typing import Dict, List, Optional, Tuple

from seo.metering_search import record_page_optimisation
from seo.search_stores import (
    get_ga4_landing_row_repository,
    get_gsc_query_row_repository,
    get_keyword_cluster_repository,
    get_keyword_repository,
    get_rank_snapshot_repository,
)
from seo.stores import get_issue_repository

_log = logging.getLogger("pixie.seo.intelligence.optimise_workspace")


def _get_crawled_page(tenant_id: str, site_id: str, page_id: str) -> Optional[Dict]:
    """Retrieve crawled page fields from the pages store.

    Returns a dict of crawled fields or None if not found.
    We access the page store via seo.stores internals (list_pages returns
    paginated; for a single lookup we use the repo directly).
    """
    try:
        from seo.stores import get_crawled_page_repository
        result = get_crawled_page_repository().get(tenant_id, page_id)
        if not result:
            return None
        _, page = result
        return {
            "title": page.title,
            "meta_description": page.meta_description,
            "h1": page.h1,
            "word_count": page.word_count,
            "url": page.url,
            "canonical": page.canonical,
            "indexability": page.indexability,
            "internal_links_in": page.internal_links_in,
            "internal_links_out": page.internal_links_out,
            "status_code": page.status_code,
        }
    except Exception as exc:
        _log.debug("page repo lookup failed: %s", exc)
        return None


def _gsc_for_page(tenant_id: str, site_id: str, page_url: str) -> List[Dict]:
    """GSC query rows for a specific page URL."""
    repo = get_gsc_query_row_repository()
    rows = repo.list_where(tenant_id, site_id=site_id, page=page_url)
    return [
        {
            "query": r.query,
            "clicks": r.clicks,
            "impressions": r.impressions,
            "ctr": r.ctr,
            "position": r.position,
            "date": r.date,
        }
        for _, r in rows
    ]


def _ga4_for_page(tenant_id: str, site_id: str, page_url: str) -> Optional[Dict]:
    """Aggregate GA4 engagement for a landing page."""
    repo = get_ga4_landing_row_repository()
    rows = repo.list_where(tenant_id, site_id=site_id, landing_page=page_url)
    if not rows:
        return None
    total_sessions = sum(r.sessions for _, r in rows)
    total_engaged  = sum(r.engaged_sessions for _, r in rows)
    avg_engagement = (
        sum(r.avg_engagement_time * r.sessions for _, r in rows) / total_sessions
        if total_sessions > 0 else 0.0
    )
    return {
        "sessions": total_sessions,
        "engaged_sessions": total_engaged,
        "engagement_rate": total_engaged / total_sessions if total_sessions > 0 else 0.0,
        "avg_engagement_time": round(avg_engagement, 2),
        "channels": list({r.channel for _, r in rows}),
        "data_note": "aggregated_from_ga4_landing_rows",
    }


def _issues_for_page(tenant_id: str, site_id: str, page_id: str) -> List[Dict]:
    """Open technical issues for the page."""
    repo = get_issue_repository()
    all_issues = repo.list_by_site(tenant_id, site_id) if hasattr(repo, "list_by_site") else []
    return [
        {
            "issue_id": iid,
            "rule_key": iss.rule_key,
            "severity": iss.severity.value if hasattr(iss.severity, "value") else str(iss.severity),
            "category": iss.category,
            "status": iss.status.value if hasattr(iss.status, "value") else str(iss.status),
            "recommendation": getattr(iss, "recommendation", ""),
        }
        for iid, iss in all_issues
        if getattr(iss, "page_id", None) == page_id
    ]


def _competitor_positions_for_keyword(
    tenant_id: str, project_id: str, keyword: str
) -> Dict[str, int]:
    """Return {competitor_domain: position} for the given keyword from the latest snapshots."""
    snap_repo = get_rank_snapshot_repository()
    rows = snap_repo.list_where(tenant_id, project_id=project_id, keyword=keyword)
    if not rows:
        return {}
    # Most recent snapshot
    latest = sorted(rows, key=lambda p: (p[1].date or "", p[1].created_at or ""), reverse=True)
    if not latest:
        return {}
    _, snap = latest[0]
    return dict(snap.competitor_positions or {})


def _cluster_for_keyword(
    tenant_id: str, project_id: str, keyword: str
) -> Optional[Dict]:
    """Find the keyword cluster whose primary_keyword matches."""
    repo = get_keyword_cluster_repository()
    clusters = repo.list_by_project(tenant_id, project_id)
    for cid, cluster in clusters:
        if cluster.primary_keyword == keyword:
            return {"cluster_id": cid, "name": cluster.name, "target_url": cluster.target_url}
    return None


def _secondary_keywords_for_cluster(
    tenant_id: str, project_id: str, cluster_id: str
) -> List[str]:
    """Return keyword strings for all members of the cluster."""
    kw_repo = get_keyword_repository()
    pairs = kw_repo.list_by_project(tenant_id, project_id)
    result = []
    for kid, kw in pairs:
        if kw.cluster_id == cluster_id:
            result.append(kw.keyword)
    return result


def assemble_workspace(
    tenant_id: str,
    site_id: str,
    project_id: str,
    *,
    page_id: str = "",
    page_url: str = "",
    keyword: str = "",
) -> Dict:
    """Assemble a grounded optimisation workspace from stored data.

    Returns a workspace dict with:
      page_data    — crawled page fields (title/meta/h1/word_count/…)
      gsc_data     — GSC query rows for the page
      ga4_data     — GA4 engagement summary (or None)
      issues       — open technical issues on the page
      rank_context — current position, SERP competitor comparison
      cluster      — keyword cluster info (secondary keywords, target URL)
      evidence     — summary of which data sources were found/missing
      recommendations — computed recommendations with evidence citations
    """
    evidence: Dict = {
        "page_data_found": False,
        "gsc_rows_found": 0,
        "ga4_found": False,
        "issues_found": 0,
        "rank_data_found": False,
        "competitor_positions_found": 0,
        "cluster_found": False,
        "data_note": "all_data_from_stored_records_only",
    }

    # 1. Crawled page
    page_data = _get_crawled_page(tenant_id, site_id, page_id) if page_id else None
    if page_data:
        evidence["page_data_found"] = True

    # 2. GSC data
    gsc_rows = _gsc_for_page(tenant_id, site_id, page_url) if page_url else []
    evidence["gsc_rows_found"] = len(gsc_rows)

    # 3. GA4 data
    ga4_data = _ga4_for_page(tenant_id, site_id, page_url) if page_url else None
    evidence["ga4_found"] = ga4_data is not None

    # 4. Technical issues
    issues = _issues_for_page(tenant_id, site_id, page_id) if page_id else []
    evidence["issues_found"] = len(issues)

    # 5. Rank / competitor context
    rank_context: Dict = {}
    if keyword and project_id:
        snap_repo = get_rank_snapshot_repository()
        kw_repo = get_keyword_repository()
        kw_pairs = kw_repo.list_where(tenant_id, project_id=project_id, keyword=keyword)
        if kw_pairs:
            kid, _ = kw_pairs[0]
            history = snap_repo.history(tenant_id, kid)
            if history:
                _, latest_snap = history[-1]
                rank_context = {
                    "keyword": keyword,
                    "current_position": latest_snap.position,
                    "previous_position": latest_snap.previous_position,
                    "ranking_url": latest_snap.ranking_url,
                    "date": latest_snap.date,
                }
                evidence["rank_data_found"] = True

            comp_positions = _competitor_positions_for_keyword(tenant_id, project_id, keyword)
            rank_context["competitor_positions"] = comp_positions
            evidence["competitor_positions_found"] = len(comp_positions)

    # 6. Cluster context
    cluster_info = _cluster_for_keyword(tenant_id, project_id, keyword) if keyword and project_id else None
    secondary_keywords: List[str] = []
    if cluster_info:
        secondary_keywords = _secondary_keywords_for_cluster(tenant_id, project_id, cluster_info["cluster_id"])
        evidence["cluster_found"] = True

    # 7. Compute recommendations
    recommendations = _compute_recommendations(page_data, gsc_rows, issues, rank_context, keyword, secondary_keywords)

    return {
        "site_id": site_id,
        "project_id": project_id,
        "page_id": page_id,
        "page_url": page_url,
        "keyword": keyword,
        "page_data": page_data,
        "gsc_data": gsc_rows,
        "ga4_data": ga4_data,
        "issues": issues,
        "rank_context": rank_context,
        "cluster": cluster_info,
        "secondary_keywords": secondary_keywords,
        "evidence": evidence,
        "recommendations": recommendations,
    }


def _compute_recommendations(
    page_data: Optional[Dict],
    gsc_rows: List[Dict],
    issues: List[Dict],
    rank_context: Dict,
    keyword: str,
    secondary_keywords: List[str],
) -> List[Dict]:
    """Produce deterministic, evidence-cited recommendations from stored data."""
    recs: List[Dict] = []

    # Title recommendation
    if page_data:
        title = page_data.get("title", "") or ""
        if not title:
            recs.append({
                "type": "title",
                "priority": "critical",
                "recommendation": f"Add a title tag containing the target keyword '{keyword}'.",
                "evidence": {"page_title_missing": True, "source": "crawled_page"},
            })
        elif keyword and keyword.lower() not in title.lower():
            recs.append({
                "type": "title",
                "priority": "high",
                "recommendation": (
                    f"Include the target keyword '{keyword}' in the title tag. "
                    f"Current title: '{title[:80]}'"
                ),
                "evidence": {"keyword_in_title": False, "current_title": title[:80],
                             "target_keyword": keyword, "source": "crawled_page"},
            })
        elif len(title) < 30 or len(title) > 65:
            recs.append({
                "type": "title",
                "priority": "medium",
                "recommendation": (
                    f"Title length is {len(title)} chars — aim for 30–65. "
                    f"Current: '{title[:80]}'"
                ),
                "evidence": {"title_length": len(title), "title_range": [30, 65], "source": "crawled_page"},
            })

    # Meta description
    if page_data:
        meta = page_data.get("meta_description", "") or ""
        if not meta:
            recs.append({
                "type": "meta_description",
                "priority": "high",
                "recommendation": "Add a meta description summarising the page and including the target keyword.",
                "evidence": {"meta_missing": True, "source": "crawled_page"},
            })
        elif keyword and keyword.lower() not in meta.lower():
            recs.append({
                "type": "meta_description",
                "priority": "medium",
                "recommendation": f"Include '{keyword}' in the meta description.",
                "evidence": {"keyword_in_meta": False, "source": "crawled_page"},
            })

    # Heading (H1)
    if page_data:
        h1 = page_data.get("h1", "") or ""
        if not h1:
            recs.append({
                "type": "headings",
                "priority": "high",
                "recommendation": "Add an H1 tag with the target keyword.",
                "evidence": {"h1_missing": True, "source": "crawled_page"},
            })
        elif keyword and keyword.lower() not in h1.lower():
            recs.append({
                "type": "headings",
                "priority": "medium",
                "recommendation": f"Include '{keyword}' in the H1.",
                "evidence": {"keyword_in_h1": False, "current_h1": h1[:80], "source": "crawled_page"},
            })

    # Word count
    if page_data:
        wc = page_data.get("word_count", 0) or 0
        if wc < 300:
            recs.append({
                "type": "content_depth",
                "priority": "high",
                "recommendation": f"Page has only {wc} words — aim for 600+ for better topical coverage.",
                "evidence": {"word_count": wc, "minimum": 300, "source": "crawled_page"},
            })

    # Internal links
    if page_data:
        int_in = page_data.get("internal_links_in", 0) or 0
        if int_in < 2:
            recs.append({
                "type": "internal_links",
                "priority": "medium",
                "recommendation": f"Only {int_in} internal links point to this page — add more to boost authority.",
                "evidence": {"internal_links_in": int_in, "minimum": 2, "source": "crawled_page"},
            })

    # Content gap (secondary keywords)
    if secondary_keywords:
        recs.append({
            "type": "content_gap",
            "priority": "medium",
            "recommendation": (
                f"Consider covering related terms in your content: "
                + ", ".join(f"'{kw}'" for kw in secondary_keywords[:5])
            ),
            "evidence": {"secondary_keywords": secondary_keywords[:5], "source": "keyword_cluster"},
        })

    # Low CTR from GSC
    low_ctr_queries = [
        r for r in gsc_rows if r.get("impressions", 0) > 50 and r.get("ctr", 1.0) < 0.03
    ]
    if low_ctr_queries:
        worst = sorted(low_ctr_queries, key=lambda r: -r["impressions"])[:3]
        recs.append({
            "type": "serp_snippet",
            "priority": "high",
            "recommendation": (
                "Queries with high impressions but low CTR: "
                + ", ".join(f"'{r['query']}' ({r['impressions']:,} impr, {r['ctr']:.1%} CTR)" for r in worst)
                + ". Rewrite title/meta to improve SERP appeal."
            ),
            "evidence": {"low_ctr_queries": worst, "ctr_threshold": 0.03, "source": "gsc"},
        })

    # Technical issues
    critical_issues = [iss for iss in issues if iss.get("severity") in ("critical", "high")]
    if critical_issues:
        recs.append({
            "type": "technical",
            "priority": "critical",
            "recommendation": (
                f"Fix {len(critical_issues)} critical/high technical issue(s): "
                + "; ".join(i["rule_key"] for i in critical_issues[:3])
            ),
            "evidence": {"critical_issue_count": len(critical_issues), "source": "issues"},
        })

    # Competitor comparison
    comp_positions = rank_context.get("competitor_positions", {})
    our_pos = rank_context.get("current_position")
    if comp_positions and our_pos:
        better_comps = {d: p for d, p in comp_positions.items() if p < our_pos}
        if better_comps:
            recs.append({
                "type": "competitor_gap",
                "priority": "medium",
                "recommendation": (
                    f"Competitors outrank you for '{keyword}': "
                    + ", ".join(f"{d} (pos {p})" for d, p in list(better_comps.items())[:3])
                    + f". Your current position: {our_pos}."
                ),
                "evidence": {
                    "our_position": our_pos,
                    "competitor_positions": comp_positions,
                    "source": "rank_snapshots",
                },
            })

    return recs


def generate_ai_optimisations(
    workspace: Dict,
    *,
    tenant_id: str,
    page_ref: str,
    is_mock: bool = True,
) -> Dict:
    """Optionally augment workspace with AI-generated copy suggestions.

    Metered via record_page_optimisation. In tests/mock mode this returns
    deterministic suggestions derived from stored workspace data.
    """
    metering = record_page_optimisation(tenant_id, page_ref=page_ref, is_mock=is_mock)

    keyword = workspace.get("keyword", "")
    page_data = workspace.get("page_data") or {}
    current_title = page_data.get("title", "") or ""

    if is_mock:
        ai_suggestions = {
            "title_options": [
                f"{keyword.title()} — Complete Guide" if keyword else "Complete Guide",
                f"How to {keyword.title()}: Tips & Strategies" if keyword else "Tips & Strategies",
            ],
            "meta_suggestion": (
                f"Discover everything about {keyword}. Expert tips, best practices, and actionable strategies."
                if keyword else "Expert guide with actionable tips."
            ),
            "h1_suggestion": f"{keyword.title()}: What You Need to Know" if keyword else "What You Need to Know",
            "content_questions": [
                f"What is {keyword}?",
                f"How does {keyword} work?",
                f"Why is {keyword} important?",
            ] if keyword else [],
            "schema_recommendation": "Article" if keyword else "WebPage",
            "intent_alignment": "informational",
            "is_mock": True,
        }
    else:
        # Real mode would invoke an LLM here using workspace context.
        ai_suggestions = {
            "title_options": [current_title or f"{keyword.title()} Guide"],
            "meta_suggestion": page_data.get("meta_description", ""),
            "h1_suggestion": page_data.get("h1", ""),
            "content_questions": [],
            "schema_recommendation": "Article",
            "intent_alignment": "informational",
            "is_mock": False,
        }

    return {
        **workspace,
        "ai_suggestions": ai_suggestions,
        "metering": metering,
    }
