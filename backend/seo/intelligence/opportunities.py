"""Transparent SEO opportunity engine.

Every opportunity row includes:
  source_data  — the raw stored rows that triggered it
  evidence     — human-readable explanation of why this is an opportunity
  score_inputs — named numeric inputs to the priority_score formula
  priority_score — computed deterministically from score_inputs; NEVER a black box

AI explanations are optional and metered via record_opportunity_explanation.
They are mocked/deterministic in tests.

Opportunity types generated:
  low_ctr               — high impressions + low CTR from gsc_query_rows
  striking_distance_4   — position 4–10 (one push to top-3)
  striking_distance_11  — position 11–20 (page 2 escape)
  declining_keyword     — position worsened across snapshots
  lost_keyword          — keyword dropped out of top-100
  competitor_keyword    — keyword only competitor ranks for (gap)
  weak_title            — issue: missing/short title on a ranked page
  weak_meta             — issue: missing meta description on a ranked page
  cannibalisation       — multiple pages ranking for the same keyword
  content_gap           — keyword with volume but no ranking URL
  missing_cluster_page  — keyword cluster with no target_url
  technical_on_value    — critical/high issue on a page with GSC impressions
  internal_link         — page has traffic but low internal_links_in

PLAN LIMIT: LIMIT_CONTENT_BRIEFS is not checked here (briefs are a downstream
step). LIMIT_COMPETITORS is not applicable. No metering on listing — only on
AI-assisted explanation.
"""

from __future__ import annotations

import logging
from typing import Dict, List, Optional, Tuple

from seo.metering_search import record_opportunity_explanation
from seo.schemas import Severity
from seo.search_stores import (
    OpportunityStatus,
    SeoOpportunity,
    get_gsc_query_row_repository,
    get_keyword_cluster_repository,
    get_keyword_repository,
    get_opportunity_repository,
    get_rank_snapshot_repository,
)
from seo.stores import get_issue_repository, get_report_repository

_log = logging.getLogger("pixie.seo.intelligence.opportunities")

# ── Scoring constants (all named, no magic numbers) ──────────────────────────
_CTR_LOW_THRESHOLD      = 0.03    # 3% — below this triggers low_ctr opp
_IMPR_HIGH_THRESHOLD    = 100     # minimum impressions to qualify
_STRK_DIST_4_BOUND      = (4, 10)
_STRK_DIST_11_BOUND     = (11, 20)
_CRITICAL_SEVERITIES    = {Severity.CRITICAL, Severity.HIGH}
_MIN_IMPR_FOR_TECH      = 50      # impressions needed for tech-issue opp
_MIN_INTERNAL_LINKS_IN  = 2       # below this is "low internal links"


# ── Scoring formula (explainable, named inputs) ───────────────────────────────

def _score_low_ctr(impressions: int, ctr: float, position: float) -> Tuple[float, Dict]:
    """priority_score for low_ctr opportunities."""
    impr_norm = min(impressions / 10_000.0, 1.0)  # cap at 10k
    ctr_gap   = max(0.0, _CTR_LOW_THRESHOLD - ctr)  # how far below threshold
    pos_boost = max(0.0, 1.0 - (position - 1) / 20.0) if position else 0.5
    score = round(impr_norm * 0.5 + ctr_gap * 10 * 0.3 + pos_boost * 0.2, 4)
    inputs = {
        "impressions": impressions,
        "ctr": ctr,
        "ctr_gap_from_threshold": round(ctr_gap, 4),
        "position": position,
        "impr_norm": round(impr_norm, 4),
        "pos_boost": round(pos_boost, 4),
    }
    return score, inputs


def _score_striking(position: float, volume: Optional[int]) -> Tuple[float, Dict]:
    """priority_score for striking_distance opportunities."""
    pos_gap = max(0.0, 11.0 - position) / 10.0 if position else 0.5
    vol_norm = min((volume or 0) / 5_000.0, 1.0)
    score = round(pos_gap * 0.6 + vol_norm * 0.4, 4)
    inputs = {
        "position": position,
        "position_gap_to_top10": round(max(0.0, position - 10.0), 2),
        "search_volume": volume,
        "pos_gap_norm": round(pos_gap, 4),
        "vol_norm": round(vol_norm, 4),
    }
    return score, inputs


def _score_declining(position_drop: int, volume: Optional[int]) -> Tuple[float, Dict]:
    drop_norm = min(position_drop / 20.0, 1.0)
    vol_norm  = min((volume or 0) / 5_000.0, 1.0)
    score = round(drop_norm * 0.7 + vol_norm * 0.3, 4)
    inputs = {
        "position_drop": position_drop,
        "search_volume": volume,
        "drop_norm": round(drop_norm, 4),
        "vol_norm": round(vol_norm, 4),
    }
    return score, inputs


def _score_technical(severity: str, impressions: int) -> Tuple[float, Dict]:
    sev_weight = {"critical": 1.0, "high": 0.7, "medium": 0.4, "low": 0.2}.get(severity, 0.3)
    impr_norm  = min(impressions / 5_000.0, 1.0)
    score = round(sev_weight * 0.6 + impr_norm * 0.4, 4)
    inputs = {
        "severity": severity,
        "severity_weight": sev_weight,
        "impressions": impressions,
        "impr_norm": round(impr_norm, 4),
    }
    return score, inputs


def _score_content_gap(volume: Optional[int]) -> Tuple[float, Dict]:
    vol_norm = min((volume or 0) / 5_000.0, 1.0)
    inputs = {"search_volume": volume, "vol_norm": round(vol_norm, 4)}
    return round(vol_norm, 4), inputs


# ── Generator ─────────────────────────────────────────────────────────────────

def generate_opportunities(
    tenant_id: str,
    site_id: str,
    project_id: str,
    *,
    data_timestamp: str = "",
) -> List[Tuple[str, SeoOpportunity]]:
    """Generate and PERSIST opportunity rows from stored data.

    Returns the list of (id, opportunity) pairs created in this run.
    Existing OPEN opportunities of the same type+keyword are NOT duplicated;
    dismissed/actioned ones are always re-evaluated fresh.

    This function is purely deterministic — no AI calls.
    """
    repo = get_opportunity_repository()
    gsc_repo = get_gsc_query_row_repository()
    rank_repo = get_rank_snapshot_repository()
    kw_repo   = get_keyword_repository()
    cluster_repo = get_keyword_cluster_repository()
    issue_repo = get_issue_repository()

    ts = data_timestamp

    # Pre-load existing open opportunities to avoid duplicates
    existing_open = {
        (o.opp_type, o.keyword, o.page_url)
        for _, o in repo.list_where(tenant_id, site_id=site_id)
        if o.status == OpportunityStatus.OPEN
    }

    created: List[Tuple[str, SeoOpportunity]] = []

    # ── Helper ──────────────────────────────────────────────────────────────
    def _save(opp: SeoOpportunity) -> None:
        key = (opp.opp_type, opp.keyword, opp.page_url)
        if key in existing_open:
            return
        oid, saved = repo.create(opp)
        created.append((oid, saved))
        existing_open.add(key)

    # ── 1. Low CTR (from gsc_query_rows) ────────────────────────────────────
    gsc_rows = gsc_repo.list_where(tenant_id, site_id=site_id)
    for _, row in gsc_rows:
        if row.impressions >= _IMPR_HIGH_THRESHOLD and row.ctr < _CTR_LOW_THRESHOLD and row.ctr >= 0:
            score, score_inputs = _score_low_ctr(row.impressions, row.ctr, row.position)
            _save(SeoOpportunity(
                tenant_id=tenant_id,
                site_id=site_id,
                project_id=project_id,
                opp_type="low_ctr",
                page_url=row.page,
                keyword=row.query,
                source_data={"gsc_impressions": row.impressions, "gsc_ctr": row.ctr,
                             "gsc_position": row.position, "gsc_clicks": row.clicks,
                             "gsc_date": row.date},
                evidence={
                    "message": (
                        f"'{row.query}' received {row.impressions:,} impressions "
                        f"but only {row.ctr:.1%} CTR (threshold {_CTR_LOW_THRESHOLD:.0%}). "
                        "Improving title/meta for this page could capture more clicks."
                    ),
                    "ctr_threshold": _CTR_LOW_THRESHOLD,
                },
                estimated_impact="medium",
                confidence=0.85,
                recommended_action="Rewrite title and meta description to improve click-through rate.",
                effort="low",
                priority_score=score,
                score_inputs=score_inputs,
                data_timestamp=ts or row.date,
            ))

    # ── 2. Striking distance (from rank snapshots) ───────────────────────────
    kw_map = {kid: kw for kid, kw in kw_repo.list_by_project(tenant_id, project_id)}

    latest_snaps: Dict[str, Tuple] = {}
    all_snaps = rank_repo.list_where(tenant_id, project_id=project_id)
    for sid, snap in all_snaps:
        kid = snap.keyword_id
        if kid not in latest_snaps or (snap.date or "") > (latest_snaps[kid][1].date or ""):
            latest_snaps[kid] = (sid, snap)

    for kid, (_, snap) in latest_snaps.items():
        if snap.position is None:
            continue
        kw = kw_map.get(kid)
        volume = kw.search_volume if kw else None

        if _STRK_DIST_4_BOUND[0] <= snap.position <= _STRK_DIST_4_BOUND[1]:
            score, sinputs = _score_striking(snap.position, volume)
            _save(SeoOpportunity(
                tenant_id=tenant_id,
                site_id=site_id,
                project_id=project_id,
                opp_type="striking_distance_4",
                keyword_id=kid,
                keyword=snap.keyword or (kw.keyword if kw else ""),
                page_url=snap.ranking_url,
                source_data={"position": snap.position, "date": snap.date,
                             "ranking_url": snap.ranking_url},
                evidence={
                    "message": (
                        f"'{snap.keyword}' ranks at position {snap.position} — "
                        "within striking distance of the top 3. Small improvements "
                        "could drive significant traffic gains."
                    ),
                    "position_range": list(_STRK_DIST_4_BOUND),
                },
                estimated_impact="high",
                confidence=0.9,
                recommended_action="Improve on-page signals: title, content depth, internal links, structured data.",
                effort="medium",
                priority_score=score,
                score_inputs=sinputs,
                data_timestamp=ts or snap.date,
            ))

        elif _STRK_DIST_11_BOUND[0] <= snap.position <= _STRK_DIST_11_BOUND[1]:
            score, sinputs = _score_striking(snap.position, volume)
            _save(SeoOpportunity(
                tenant_id=tenant_id,
                site_id=site_id,
                project_id=project_id,
                opp_type="striking_distance_11",
                keyword_id=kid,
                keyword=snap.keyword or (kw.keyword if kw else ""),
                page_url=snap.ranking_url,
                source_data={"position": snap.position, "date": snap.date,
                             "ranking_url": snap.ranking_url},
                evidence={
                    "message": (
                        f"'{snap.keyword}' is on page 2 at position {snap.position}. "
                        "Moving to page 1 could dramatically increase organic traffic."
                    ),
                    "position_range": list(_STRK_DIST_11_BOUND),
                },
                estimated_impact="high",
                confidence=0.8,
                recommended_action="Audit page relevance, add content depth, build quality backlinks.",
                effort="high",
                priority_score=score,
                score_inputs=sinputs,
                data_timestamp=ts or snap.date,
            ))

    # ── 3. Declining / lost keywords (rank delta from history) ───────────────
    for kid, kw in kw_map.items():
        history = rank_repo.history(tenant_id, kid)
        if len(history) < 2:
            continue
        _, oldest = history[0]
        _, newest = history[-1]

        if oldest.position is not None and newest.position is None:
            score, sinputs = _score_declining(100, kw.search_volume)
            _save(SeoOpportunity(
                tenant_id=tenant_id,
                site_id=site_id,
                project_id=project_id,
                opp_type="lost_keyword",
                keyword_id=kid,
                keyword=kw.keyword,
                page_url=oldest.ranking_url,
                source_data={"last_position": oldest.position, "last_date": oldest.date,
                             "current_position": None},
                evidence={
                    "message": (
                        f"'{kw.keyword}' previously ranked at {oldest.position} "
                        f"on {oldest.date} but no longer appears in top results."
                    ),
                },
                estimated_impact="high",
                confidence=0.75,
                recommended_action="Investigate content freshness, technical issues, or algorithm changes for this keyword.",
                effort="high",
                priority_score=score,
                score_inputs=sinputs,
                data_timestamp=ts or (newest.date or ""),
            ))
        elif oldest.position is not None and newest.position is not None:
            drop = newest.position - oldest.position
            if drop >= 3:
                score, sinputs = _score_declining(drop, kw.search_volume)
                _save(SeoOpportunity(
                    tenant_id=tenant_id,
                    site_id=site_id,
                    project_id=project_id,
                    opp_type="declining_keyword",
                    keyword_id=kid,
                    keyword=kw.keyword,
                    page_url=newest.ranking_url or oldest.ranking_url,
                    source_data={"old_position": oldest.position, "new_position": newest.position,
                                 "drop": drop, "old_date": oldest.date, "new_date": newest.date},
                    evidence={
                        "message": (
                            f"'{kw.keyword}' dropped {drop} positions "
                            f"(from {oldest.position} to {newest.position})."
                        ),
                        "drop_threshold": 3,
                    },
                    estimated_impact="medium",
                    confidence=0.8,
                    recommended_action="Review page for content freshness, on-page signals, and link authority.",
                    effort="medium",
                    priority_score=score,
                    score_inputs=sinputs,
                    data_timestamp=ts or (newest.date or ""),
                ))

    # ── 4. Content gap (keyword with volume, no ranking URL) ──────────────────
    for kid, kw in kw_map.items():
        if not kw.search_volume:
            continue
        snap_pairs = latest_snaps.get(kid)
        if snap_pairs is None or snap_pairs[1].ranking_url == "":
            score, sinputs = _score_content_gap(kw.search_volume)
            _save(SeoOpportunity(
                tenant_id=tenant_id,
                site_id=site_id,
                project_id=project_id,
                opp_type="content_gap",
                keyword_id=kid,
                keyword=kw.keyword,
                source_data={"search_volume": kw.search_volume, "difficulty": kw.difficulty},
                evidence={
                    "message": (
                        f"'{kw.keyword}' has {kw.search_volume:,} monthly searches "
                        "but no page currently ranks for it."
                    ),
                },
                estimated_impact="high" if (kw.search_volume or 0) > 1000 else "medium",
                confidence=0.7,
                recommended_action="Create targeted content for this keyword.",
                effort="high",
                priority_score=score,
                score_inputs=sinputs,
                data_timestamp=ts or kw.data_timestamp,
            ))

    # ── 5. Missing cluster page ───────────────────────────────────────────────
    clusters = cluster_repo.list_by_project(tenant_id, project_id)
    for cid, cluster in clusters:
        if not cluster.target_url:
            vol = 0
            for kid2 in (cluster.keyword_ids or []):
                kw2 = kw_map.get(kid2)
                vol += kw2.search_volume or 0 if kw2 else 0
            score, sinputs = _score_content_gap(vol)
            _save(SeoOpportunity(
                tenant_id=tenant_id,
                site_id=site_id,
                project_id=project_id,
                opp_type="missing_cluster_page",
                keyword=cluster.primary_keyword,
                source_data={"cluster_id": cid, "cluster_name": cluster.name,
                             "keyword_count": len(cluster.keyword_ids),
                             "estimated_cluster_volume": vol},
                evidence={
                    "message": (
                        f"Cluster '{cluster.name}' has {len(cluster.keyword_ids)} keywords "
                        "but no target URL has been set."
                    ),
                },
                estimated_impact="high",
                confidence=0.65,
                recommended_action="Create or assign a target page for this keyword cluster.",
                effort="high",
                priority_score=score,
                score_inputs=sinputs,
                data_timestamp=ts or cluster.created_at,
            ))

    # ── 6. Technical issue on high-value page ────────────────────────────────
    page_impressions: Dict[str, int] = {}
    for _, row in gsc_rows:
        page_impressions[row.page] = page_impressions.get(row.page, 0) + row.impressions

    issues = issue_repo.list_by_site(tenant_id, site_id) if hasattr(issue_repo, "list_by_site") else []
    for iid, issue in issues:
        if issue.severity not in _CRITICAL_SEVERITIES:
            continue
        page_impr = page_impressions.get(issue.page_id, 0)
        if page_impr < _MIN_IMPR_FOR_TECH:
            continue
        sev_val = issue.severity.value if hasattr(issue.severity, "value") else str(issue.severity)
        score, sinputs = _score_technical(sev_val, page_impr)
        _save(SeoOpportunity(
            tenant_id=tenant_id,
            site_id=site_id,
            project_id=project_id,
            opp_type="technical_on_value",
            page_id=issue.page_id or "",
            page_url=getattr(issue, "page_url", ""),
            source_data={"issue_id": iid, "rule_key": issue.rule_key,
                         "severity": sev_val, "page_impressions": page_impr},
            evidence={
                "message": (
                    f"A {sev_val} technical issue ({issue.rule_key}) affects a page "
                    f"receiving ~{page_impr:,} monthly impressions."
                ),
            },
            estimated_impact="high",
            confidence=0.9,
            recommended_action=getattr(issue, "recommendation", "Fix the technical issue on this high-traffic page."),
            effort="medium",
            priority_score=score,
            score_inputs=sinputs,
            data_timestamp=ts or getattr(issue, "last_detected_at", ""),
        ))

    return created


# ── Lifecycle ─────────────────────────────────────────────────────────────────

def list_opportunities(
    tenant_id: str,
    site_id: Optional[str] = None,
    project_id: Optional[str] = None,
    status: Optional[OpportunityStatus] = None,
    opp_type: Optional[str] = None,
) -> List[Tuple[str, SeoOpportunity]]:
    repo = get_opportunity_repository()
    if site_id:
        rows = repo.list_by_site(tenant_id, site_id)
    else:
        rows = repo.list(tenant_id)

    if project_id:
        rows = [(oid, o) for oid, o in rows if o.project_id == project_id]
    if status is not None:
        rows = [(oid, o) for oid, o in rows if o.status == status]
    if opp_type:
        rows = [(oid, o) for oid, o in rows if o.opp_type == opp_type]
    return rows


def get_opportunity(tenant_id: str, opp_id: str) -> Optional[Tuple[str, SeoOpportunity]]:
    return get_opportunity_repository().get(tenant_id, opp_id)


def dismiss_opportunity(tenant_id: str, opp_id: str) -> Optional[Tuple[str, SeoOpportunity]]:
    return get_opportunity_repository().update(
        tenant_id, opp_id, status=OpportunityStatus.DISMISSED
    )


def action_opportunity(tenant_id: str, opp_id: str) -> Optional[Tuple[str, SeoOpportunity]]:
    return get_opportunity_repository().update(
        tenant_id, opp_id, status=OpportunityStatus.ACTIONED
    )


def explain_opportunity(
    tenant_id: str,
    opp_id: str,
    *,
    is_mock: bool = True,
) -> Dict:
    """Return an AI-generated (or mock) explanation for the opportunity.

    Metered via record_opportunity_explanation. In tests/mock mode this returns
    a deterministic explanation built from the stored evidence field.
    """
    result = get_opportunity_repository().get(tenant_id, opp_id)
    if not result:
        return {"error": "not_found"}
    _, opp = result

    metering = record_opportunity_explanation(tenant_id, opportunity_id=opp_id, is_mock=is_mock)

    if is_mock:
        explanation = (
            f"[mock] This {opp.opp_type} opportunity was identified for "
            f"keyword '{opp.keyword}' on '{opp.page_url}'. "
            f"{opp.evidence.get('message', '')} "
            f"Recommended action: {opp.recommended_action}"
        )
    else:
        # In real mode a provider call would go here.
        explanation = (
            f"Opportunity type '{opp.opp_type}': {opp.evidence.get('message', '')} "
            f"Recommended action: {opp.recommended_action}"
        )

    return {
        "opportunity_id": opp_id,
        "explanation": explanation,
        "is_mock": is_mock,
        "metering": metering,
    }
