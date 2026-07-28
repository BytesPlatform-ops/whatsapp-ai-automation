"""Report data assembler for SEO PDF generation.

Gathers data from all available durable repositories for a given tenant+site and
returns a structured report dict ready for the PDF renderer (or for JSON/CSV export).

Each section carries:
  - data_source: str — which repo / vertical provided the data
  - timestamp: str  — ISO timestamp of when data was gathered (now) or when the
                      most recent record was created
  - unavailable: bool — True when the vertical is absent, empty, or import failed
  - data: ... — the actual section payload (empty dict/list when unavailable)

SECURITY:
  - Never fabricates values. When data is absent, the section is marked unavailable.
  - All string values are passed through to the PDF renderer; the renderer escapes them.

Public API:
  assemble_report(tenant, site_id, *, kind, date_from, date_to,
                  location_id=None, client_facing=False) -> dict
"""

from __future__ import annotations

import logging
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

_log = logging.getLogger("pixie.seo.reporting.assembler")

# ── REPORT_KINDS ──────────────────────────────────────────────────────────────

REPORT_KINDS = (
    "technical_audit",
    "search_performance",
    "keyword_ranking",
    "competitor",
    "backlink",
    "local_seo",
    "executive",
)

# ── Defensive imports (sibling packages may not exist yet) ────────────────────

def _try_import(module_path: str):
    """Return the module or None if it cannot be imported."""
    import importlib
    try:
        return importlib.import_module(module_path)
    except ImportError:
        return None


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="microseconds")


def _unavailable(data_source: str, reason: str = "") -> dict:
    return {
        "data_source": data_source,
        "timestamp": _now_iso(),
        "unavailable": True,
        "reason": reason or "data unavailable",
        "data": {},
    }


def _available(data_source: str, data: Any, timestamp: str = "") -> dict:
    return {
        "data_source": data_source,
        "timestamp": timestamp or _now_iso(),
        "unavailable": False,
        "data": data,
    }


# ── Repo getters (guarded) ────────────────────────────────────────────────────

def _get_site_repo():
    try:
        from seo.stores import get_site_repository
        return get_site_repository()
    except Exception:
        return None


def _get_report_repo():
    try:
        from seo.stores import get_report_repository
        return get_report_repository()
    except Exception:
        return None


def _get_issue_repo():
    try:
        from seo.stores import get_issue_repository
        return get_issue_repository()
    except Exception:
        return None


def _get_crawl_job_repo():
    try:
        from seo.stores import get_crawl_job_repository
        return get_crawl_job_repository()
    except Exception:
        return None


def _get_gsc_row_repo():
    try:
        from seo.search_stores import get_gsc_query_row_repository
        return get_gsc_query_row_repository()
    except Exception:
        return None


def _get_ga4_row_repo():
    try:
        from seo.search_stores import get_ga4_landing_row_repository
        return get_ga4_landing_row_repository()
    except Exception:
        return None


def _get_keyword_repo():
    try:
        from seo.search_stores import get_keyword_repository
        return get_keyword_repository()
    except Exception:
        return None


def _get_rank_snapshot_repo():
    try:
        from seo.search_stores import get_rank_snapshot_repository
        return get_rank_snapshot_repository()
    except Exception:
        return None


def _get_competitor_repo():
    try:
        from seo.search_stores import get_competitor_repository
        return get_competitor_repository()
    except Exception:
        return None


def _get_competitor_snapshot_repo():
    try:
        from seo.search_stores import get_competitor_snapshot_repository
        return get_competitor_snapshot_repository()
    except Exception:
        return None


def _get_opportunity_repo():
    try:
        from seo.search_stores import get_opportunity_repository
        return get_opportunity_repository()
    except Exception:
        return None


def _get_fix_verify_repo():
    try:
        from seo.search_stores import get_fix_verification_repository
        return get_fix_verification_repository()
    except Exception:
        return None


def _get_alert_repo():
    try:
        from seo.search_stores import get_alert_repository
        return get_alert_repository()
    except Exception:
        return None


# ── Section assemblers ────────────────────────────────────────────────────────

def _section_site_info(tenant: str, site_id: str) -> dict:
    """Site metadata (domain, display name, canonical URL)."""
    repo = _get_site_repo()
    if not repo:
        return _unavailable("seo_sites", "SiteRepository unavailable")
    pair = repo.get(tenant, site_id)
    if not pair:
        return _unavailable("seo_sites", f"site {site_id!r} not found for tenant")
    _, site = pair
    return _available("seo_sites", {
        "site_id": site_id,
        "domain": site.domain,
        "display_name": site.display_name or site.domain,
        "canonical_base_url": site.canonical_base_url,
        "country": site.country,
        "language": site.language,
    }, site.updated_at or _now_iso())


def _section_technical_health(tenant: str, site_id: str) -> dict:
    """Latest crawl report: score, category scores, issue counts."""
    rpt_repo = _get_report_repo()
    if not rpt_repo:
        return _unavailable("seo_reports", "ReportRepository unavailable")
    pair = rpt_repo.latest_report(tenant, site_id)
    if not pair:
        return _unavailable("seo_reports", "no crawl report found for site")
    rpt_id, report = pair
    return _available("seo_reports", {
        "report_id": rpt_id,
        "score": report.score,
        "category_scores": report.category_scores,
        "issue_counts": report.issue_counts,
        "crawl_job_id": report.crawl_job_id,
        "export_metadata": report.export_metadata,
    }, report.created_at or _now_iso())


def _section_technical_issues(tenant: str, site_id: str, max_rows: int = 200) -> dict:
    """Open SEO issues for the site, grouped by severity."""
    issue_repo = _get_issue_repo()
    if not issue_repo:
        return _unavailable("seo_issues", "SeoIssueRepository unavailable")
    try:
        from seo.stores import IssueStatus
        pairs = issue_repo.list_by_site(tenant, site_id, status=IssueStatus.OPEN)
    except Exception as exc:
        return _unavailable("seo_issues", str(exc))

    if not pairs:
        return _unavailable("seo_issues", "no open issues found for site")

    truncated = len(pairs) > max_rows
    pairs = pairs[:max_rows]

    by_severity: Dict[str, List[dict]] = defaultdict(list)
    for iid, issue in pairs:
        by_severity[str(getattr(issue.severity, "value", issue.severity))].append({
            "issue_id": iid,
            "rule_key": issue.rule_key,
            "category": issue.category,
            "severity": str(getattr(issue.severity, "value", issue.severity)),
            "recommendation": issue.recommendation,
            "page_id": issue.page_id,
            "first_detected_at": issue.first_detected_at,
        })

    return _available("seo_issues", {
        "total_shown": len(pairs),
        "truncated": truncated,
        "by_severity": dict(by_severity),
    })


def _section_gsc_summary(
    tenant: str, site_id: str, date_from: str, date_to: str
) -> dict:
    """Google Search Console: aggregate clicks/impressions/CTR/position in date range."""
    repo = _get_gsc_row_repo()
    if not repo:
        return _unavailable("seo_gsc_query_rows", "GscQueryRowRepository unavailable")
    try:
        pairs = repo.list_where(tenant, site_id=site_id)
    except Exception as exc:
        return _unavailable("seo_gsc_query_rows", str(exc))

    # Filter to date range (ISO string comparison works for YYYY-MM-DD)
    in_range = [
        row for _, row in pairs
        if date_from <= (row.date or "") <= date_to
    ]
    if not in_range:
        return _unavailable("seo_gsc_query_rows", "no GSC data for date range")

    total_clicks = sum(r.clicks for r in in_range)
    total_impressions = sum(r.impressions for r in in_range)
    avg_ctr = (sum(r.ctr for r in in_range) / len(in_range)) if in_range else 0.0
    avg_position = (sum(r.position for r in in_range) / len(in_range)) if in_range else 0.0

    # Top 10 queries by clicks
    by_query: Dict[str, dict] = {}
    for row in in_range:
        q = row.query or "(not set)"
        if q not in by_query:
            by_query[q] = {"query": q, "clicks": 0, "impressions": 0, "position_sum": 0.0, "count": 0}
        by_query[q]["clicks"] += row.clicks
        by_query[q]["impressions"] += row.impressions
        by_query[q]["position_sum"] += row.position
        by_query[q]["count"] += 1
    top_queries = sorted(by_query.values(), key=lambda x: x["clicks"], reverse=True)[:10]
    for q in top_queries:
        q["avg_position"] = round(q["position_sum"] / q["count"], 1) if q["count"] else 0.0
        del q["position_sum"], q["count"]

    return _available("seo_gsc_query_rows", {
        "date_from": date_from,
        "date_to": date_to,
        "total_clicks": total_clicks,
        "total_impressions": total_impressions,
        "avg_ctr": round(avg_ctr, 4),
        "avg_position": round(avg_position, 1),
        "row_count": len(in_range),
        "top_queries": top_queries,
    })


def _section_ga4_summary(
    tenant: str, site_id: str, date_from: str, date_to: str
) -> dict:
    """GA4: aggregate sessions/engaged sessions/new users in date range."""
    repo = _get_ga4_row_repo()
    if not repo:
        return _unavailable("seo_analytics_landing_rows", "Ga4LandingRowRepository unavailable")
    try:
        pairs = repo.list_where(tenant, site_id=site_id)
    except Exception as exc:
        return _unavailable("seo_analytics_landing_rows", str(exc))

    in_range = [
        row for _, row in pairs
        if date_from <= (row.date or "") <= date_to
    ]
    if not in_range:
        return _unavailable("seo_analytics_landing_rows", "no GA4 data for date range")

    total_sessions = sum(r.sessions for r in in_range)
    total_engaged = sum(r.engaged_sessions for r in in_range)
    total_new_users = sum(r.new_users for r in in_range)
    avg_engagement = (
        sum(r.engagement_rate for r in in_range) / len(in_range)
        if in_range else 0.0
    )

    # Top landing pages by sessions
    by_page: Dict[str, dict] = {}
    for row in in_range:
        pg = row.landing_page or "/"
        if pg not in by_page:
            by_page[pg] = {"landing_page": pg, "sessions": 0, "engaged_sessions": 0}
        by_page[pg]["sessions"] += row.sessions
        by_page[pg]["engaged_sessions"] += row.engaged_sessions
    top_pages = sorted(by_page.values(), key=lambda x: x["sessions"], reverse=True)[:10]

    return _available("seo_analytics_landing_rows", {
        "date_from": date_from,
        "date_to": date_to,
        "total_sessions": total_sessions,
        "total_engaged_sessions": total_engaged,
        "total_new_users": total_new_users,
        "avg_engagement_rate": round(avg_engagement, 4),
        "row_count": len(in_range),
        "top_landing_pages": top_pages,
    })


def _section_keyword_rankings(tenant: str, site_id: str, max_rows: int = 100) -> dict:
    """Keyword rankings: current rank, search volume, intent."""
    kw_repo = _get_keyword_repo()
    if not kw_repo:
        return _unavailable("seo_keywords", "KeywordRepository unavailable")
    try:
        pairs = kw_repo.list_where(tenant, site_id=site_id)
    except Exception as exc:
        return _unavailable("seo_keywords", str(exc))

    if not pairs:
        return _unavailable("seo_keywords", "no keywords tracked for site")

    truncated = len(pairs) > max_rows
    pairs = pairs[:max_rows]

    keywords = []
    for kid, kw in pairs:
        keywords.append({
            "keyword_id": kid,
            "keyword": kw.keyword,
            "current_rank": kw.current_rank,
            "previous_rank": kw.previous_rank,
            "best_rank": kw.best_rank,
            "search_volume": kw.search_volume,
            "intent": str(getattr(kw.intent, "value", kw.intent)),
            "ranking_url": kw.ranking_url,
            "target_page": kw.target_page,
        })

    # Sort by rank (None last)
    keywords.sort(key=lambda k: (k["current_rank"] is None, k["current_rank"] or 9999))

    return _available("seo_keywords", {
        "total_shown": len(keywords),
        "truncated": truncated,
        "keywords": keywords,
    })


def _section_competitor_comparison(tenant: str, site_id: str, max_rows: int = 10) -> dict:
    """Competitor domains + latest visibility snapshots."""
    comp_repo = _get_competitor_repo()
    snap_repo = _get_competitor_snapshot_repo()
    if not comp_repo:
        return _unavailable("seo_competitors", "CompetitorRepository unavailable")
    try:
        pairs = comp_repo.list_where(tenant, site_id=site_id)
    except Exception as exc:
        return _unavailable("seo_competitors", str(exc))

    if not pairs:
        return _unavailable("seo_competitors", "no competitors tracked for site")

    competitors = []
    for cid, comp in pairs[:max_rows]:
        entry: Dict[str, Any] = {
            "competitor_id": cid,
            "domain": comp.domain,
            "display_name": comp.display_name or comp.domain,
            "tracking_status": str(getattr(comp.tracking_status, "value", comp.tracking_status)),
            "snapshot": None,
        }
        if snap_repo:
            try:
                snaps = snap_repo.list_where(tenant, competitor_id=cid)
                if snaps:
                    snaps.sort(key=lambda p: p[1].date or "", reverse=True)
                    _, latest = snaps[0]
                    entry["snapshot"] = {
                        "date": latest.date,
                        "visibility_score": latest.visibility_score,
                        "avg_position": latest.avg_position,
                        "keywords_ranked": latest.keywords_ranked,
                    }
            except Exception:
                pass
        competitors.append(entry)

    return _available("seo_competitors", {
        "total_shown": len(competitors),
        "competitors": competitors,
    })


def _section_opportunities(tenant: str, site_id: str, max_rows: int = 50) -> dict:
    """Priority SEO opportunities (open, sorted by priority_score desc)."""
    repo = _get_opportunity_repo()
    if not repo:
        return _unavailable("seo_opportunities", "SeoOpportunityRepository unavailable")
    try:
        pairs = repo.list_by_site(tenant, site_id)
    except Exception as exc:
        return _unavailable("seo_opportunities", str(exc))

    open_pairs = [
        (oid, opp) for oid, opp in pairs
        if str(getattr(opp.status, "value", opp.status)) == "open"
    ]
    if not open_pairs:
        return _unavailable("seo_opportunities", "no open opportunities for site")

    open_pairs.sort(key=lambda p: p[1].priority_score, reverse=True)
    truncated = len(open_pairs) > max_rows
    shown = open_pairs[:max_rows]

    opps = [{
        "opportunity_id": oid,
        "opp_type": opp.opp_type,
        "keyword": opp.keyword,
        "page_url": opp.page_url,
        "estimated_impact": opp.estimated_impact,
        "effort": opp.effort,
        "priority_score": opp.priority_score,
        "recommended_action": opp.recommended_action,
        "confidence": opp.confidence,
    } for oid, opp in shown]

    return _available("seo_opportunities", {
        "total_open": len(open_pairs),
        "total_shown": len(opps),
        "truncated": truncated,
        "opportunities": opps,
    })


def _section_completed_fixes(tenant: str, site_id: str, max_rows: int = 50) -> dict:
    """Completed fix verifications (verified status)."""
    repo = _get_fix_verify_repo()
    if not repo:
        return _unavailable("seo_fix_verification", "FixVerificationRepository unavailable")
    try:
        pairs = repo.list_where(tenant, site_id=site_id)
    except Exception as exc:
        return _unavailable("seo_fix_verification", str(exc))

    verified = [
        (fid, fv) for fid, fv in pairs
        if str(getattr(fv.result, "value", fv.result)) == "verified"
    ]
    if not verified:
        return _unavailable("seo_fix_verification", "no verified fixes for site")

    truncated = len(verified) > max_rows
    shown = verified[:max_rows]

    fixes = [{
        "fix_id": fid,
        "rule_key": fv.rule_key,
        "page_url": fv.page_url,
        "applied_fix": fv.applied_fix,
        "before_value": fv.before_value,
        "intended_after_value": fv.intended_after_value,
        "observed_after_value": fv.observed_after_value,
        "verified_at": fv.verified_at,
    } for fid, fv in shown]

    return _available("seo_fix_verification", {
        "total_verified": len(verified),
        "total_shown": len(fixes),
        "truncated": truncated,
        "fixes": fixes,
    })


def _section_alerts(tenant: str, site_id: str, max_rows: int = 30) -> dict:
    """Recent unread/read SEO alerts for the site."""
    repo = _get_alert_repo()
    if not repo:
        return _unavailable("seo_alerts", "SeoAlertRepository unavailable")
    try:
        pairs = repo.list_where(tenant, site_id=site_id)
    except Exception as exc:
        return _unavailable("seo_alerts", str(exc))

    if not pairs:
        return _unavailable("seo_alerts", "no alerts for site")

    pairs.sort(key=lambda p: p[1].created_at or "", reverse=True)
    truncated = len(pairs) > max_rows
    shown = pairs[:max_rows]

    alerts = [{
        "alert_id": aid,
        "alert_type": a.alert_type,
        "title": a.title,
        "message": a.message,
        "severity": str(getattr(a.severity, "value", a.severity)),
        "status": str(getattr(a.status, "value", a.status)),
        "created_at": a.created_at,
    } for aid, a in shown]

    return _available("seo_alerts", {
        "total_shown": len(alerts),
        "truncated": truncated,
        "alerts": alerts,
    })


# ── Main assembler ────────────────────────────────────────────────────────────

def assemble_report(
    tenant: str,
    site_id: str,
    *,
    kind: str,
    date_from: str,
    date_to: str,
    location_id: Optional[str] = None,
    client_facing: bool = False,
) -> dict:
    """Assemble all report sections for the given tenant + site.

    Parameters
    ----------
    tenant:       Tenant identifier (never fabricated — resolves from request).
    site_id:      The SEO site to report on.
    kind:         One of REPORT_KINDS.
    date_from:    ISO date string (YYYY-MM-DD) — start of reporting window.
    date_to:      ISO date string (YYYY-MM-DD) — end of reporting window.
    location_id:  Optional local SEO location filter.
    client_facing: When True, omit internal fields (issue_ids, etc.) — reserved
                   for future use; currently no-op.

    Returns
    -------
    A dict with keys: tenant, site_id, kind, date_from, date_to,
    assembled_at, and one key per section.

    Each section value is a dict with:
      data_source, timestamp, unavailable, data (or reason when unavailable).

    NEVER fabricates values — unavailable verticals are marked explicitly.
    """
    if kind not in REPORT_KINDS:
        raise ValueError(f"Unknown report kind {kind!r}; must be one of {REPORT_KINDS}")

    assembled_at = _now_iso()
    report: Dict[str, Any] = {
        "tenant": tenant,
        "site_id": site_id,
        "kind": kind,
        "date_from": date_from,
        "date_to": date_to,
        "assembled_at": assembled_at,
        "location_id": location_id,
    }

    # Always include site info
    report["site_info"] = _section_site_info(tenant, site_id)

    include_technical = kind in ("technical_audit", "executive")
    include_search    = kind in ("search_performance", "executive")
    include_keywords  = kind in ("keyword_ranking", "executive")
    include_competitor= kind in ("competitor", "executive")
    include_opps      = kind in ("technical_audit", "search_performance",
                                  "keyword_ranking", "executive")
    include_fixes     = kind in ("technical_audit", "executive")
    include_backlink  = kind in ("backlink", "executive")
    include_local     = kind in ("local_seo", "executive")

    if include_technical:
        report["technical_health"] = _section_technical_health(tenant, site_id)
        report["technical_issues"] = _section_technical_issues(tenant, site_id)

    if include_search:
        report["gsc_summary"] = _section_gsc_summary(tenant, site_id, date_from, date_to)
        report["ga4_summary"] = _section_ga4_summary(tenant, site_id, date_from, date_to)

    if include_keywords:
        report["keyword_rankings"] = _section_keyword_rankings(tenant, site_id)

    if include_competitor:
        report["competitor_comparison"] = _section_competitor_comparison(tenant, site_id)

    if include_opps:
        report["opportunities"] = _section_opportunities(tenant, site_id)

    if include_fixes:
        report["completed_fixes"] = _section_completed_fixes(tenant, site_id)

    if include_backlink:
        # Backlink stores are a future vertical — mark unavailable explicitly.
        report["backlinks"] = _unavailable(
            "seo_backlinks",
            "backlink vertical not yet integrated; data unavailable",
        )

    if include_local:
        # Local SEO stores are a future vertical — mark unavailable explicitly.
        report["local_seo"] = _unavailable(
            "seo_local",
            "local SEO vertical not yet integrated; data unavailable",
        )

    # Always include alerts for executive + technical
    if kind in ("technical_audit", "executive"):
        report["alerts"] = _section_alerts(tenant, site_id)

    return report
