"""Local competitor tracking + local opportunity engine.

Every opportunity includes:
  source_data  — the raw stored data that triggered it
  evidence     — human-readable explanation
  score_inputs — named numeric inputs to priority_score (never a black box)
  priority_score — computed deterministically from score_inputs

Opportunity types:
  weak_review_response     — unanswered negative reviews
  missing_category         — no primary category set
  low_local_pack_rank      — not in local pack for tracked keywords
  missing_location_page    — no local_page_url set
  nap_inconsistency        — NAP mismatches detected
  local_content_gap        — keywords tracked with no location page content
  citation_gap             — high-priority directories with no citation
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Tuple

from seo.local.stores import (
    LocalCompetitor,
    _now,
    get_citation_repository,
    get_gbp_review_repository,
    get_local_competitor_repository,
    get_local_rank_snapshot_repository,
    get_location_repository,
    get_nap_audit_repository,
    ReplyStatus,
)

_log = logging.getLogger("pixie.seo.local.competitors")


# ── Competitor CRUD ────────────────────────────────────────────────────────────

def add_competitor(
    tenant_id: str,
    location_id: str,
    business_name: str,
    *,
    domain: str = "",
    gbp_profile_url: str = "",
    address: str = "",
    category: str = "",
    rating: Optional[float] = None,
    review_count: int = 0,
    notes: str = "",
) -> Tuple[str, LocalCompetitor]:
    """Add a local competitor for a location."""
    loc_repo = get_location_repository()
    if loc_repo.get(tenant_id, location_id) is None:
        raise ValueError(f"Location {location_id!r} not found for tenant {tenant_id!r}")

    comp = LocalCompetitor(
        tenant_id=tenant_id,
        location_id=location_id,
        business_name=business_name,
        domain=domain,
        gbp_profile_url=gbp_profile_url,
        address=address,
        category=category,
        rating=rating,
        review_count=review_count,
        notes=notes,
    )
    return get_local_competitor_repository().create(comp)


def get_competitor(
    tenant_id: str, comp_id: str
) -> Optional[Tuple[str, LocalCompetitor]]:
    return get_local_competitor_repository().get(tenant_id, comp_id)


def list_competitors(
    tenant_id: str,
    location_id: str,
) -> List[Tuple[str, LocalCompetitor]]:
    return get_local_competitor_repository().list_by_location(tenant_id, location_id)


def update_competitor(
    tenant_id: str,
    comp_id: str,
    **fields,
) -> Optional[Tuple[str, LocalCompetitor]]:
    return get_local_competitor_repository().update(tenant_id, comp_id, **fields)


def delete_competitor(tenant_id: str, comp_id: str) -> bool:
    return get_local_competitor_repository().delete(tenant_id, comp_id)


# ── Opportunity scoring ────────────────────────────────────────────────────────

def _score_review_response(unanswered: int, avg_rating: float) -> Tuple[float, Dict]:
    """Higher score when more unanswered negative reviews."""
    urgency = min(unanswered / 10.0, 1.0)
    rating_weight = max(0.0, (4.0 - avg_rating) / 3.0) if avg_rating > 0 else 0.5
    score = round(urgency * 0.6 + rating_weight * 0.4, 4)
    inputs = {
        "unanswered_count": unanswered,
        "avg_rating": avg_rating,
        "urgency_norm": round(urgency, 4),
        "rating_weight": round(rating_weight, 4),
    }
    return score, inputs


def _score_missing_category(competitor_count_with_category: int) -> Tuple[float, Dict]:
    """Score based on how many competitors have a category we're missing."""
    comp_norm = min(competitor_count_with_category / 5.0, 1.0)
    score = round(0.5 + comp_norm * 0.5, 4)
    inputs = {"competitors_with_category": competitor_count_with_category, "comp_norm": round(comp_norm, 4)}
    return score, inputs


def _score_local_pack_rank(keywords_not_in_pack: int, total_keywords: int) -> Tuple[float, Dict]:
    pack_gap = keywords_not_in_pack / max(total_keywords, 1)
    score = round(pack_gap, 4)
    inputs = {
        "keywords_not_in_pack": keywords_not_in_pack,
        "total_keywords": total_keywords,
        "pack_gap": round(pack_gap, 4),
    }
    return score, inputs


def _score_nap_inconsistency(mismatch_count: int) -> Tuple[float, Dict]:
    norm = min(mismatch_count / 10.0, 1.0)
    score = round(0.3 + norm * 0.7, 4)
    inputs = {"mismatch_count": mismatch_count, "norm": round(norm, 4)}
    return score, inputs


def _score_citation_gap(missing_dirs: int) -> Tuple[float, Dict]:
    norm = min(missing_dirs / 8.0, 1.0)
    score = round(norm, 4)
    inputs = {"missing_directories": missing_dirs, "norm": round(norm, 4)}
    return score, inputs


# ── Local opportunity generator ────────────────────────────────────────────────

def generate_local_opportunities(
    tenant_id: str,
    location_id: str,
) -> List[Dict[str, Any]]:
    """Generate local SEO opportunities from stored data.

    Returns a list of opportunity dicts with score_inputs, evidence, and
    recommended_action.  All data is grounded in stored records — no
    fabrication.
    """
    loc_repo = get_location_repository()
    loc_result = loc_repo.get(tenant_id, location_id)
    if loc_result is None:
        return []
    _, loc = loc_result

    opportunities: List[Dict[str, Any]] = []

    # ── 1. Weak review response ───────────────────────────────────────────────
    rev_repo = get_gbp_review_repository()
    reviews = rev_repo.list_by_location(tenant_id, location_id)
    unanswered = [
        r for _, r in reviews
        if not r.handled and r.reply_status in (ReplyStatus.NONE, ReplyStatus.DRAFTED)
    ]
    if unanswered:
        ratings = [r.rating for r in unanswered if r.rating > 0]
        avg_neg_rating = sum(ratings) / len(ratings) if ratings else 0.0
        score, score_inputs = _score_review_response(len(unanswered), avg_neg_rating)
        opportunities.append({
            "opp_type": "weak_review_response",
            "title": f"{len(unanswered)} unanswered review(s) need a response",
            "evidence": {
                "message": (
                    f"{len(unanswered)} review(s) are unanswered. "
                    f"Responding to reviews improves local ranking signals and customer trust."
                ),
                "unanswered_count": len(unanswered),
            },
            "source_data": {
                "location_id": location_id,
                "unanswered_review_ids": [
                    rev_repo.list_by_location(tenant_id, location_id)[i][0]
                    for i in range(min(5, len(unanswered)))
                ],
            },
            "recommended_action": "Draft and approve responses for unanswered reviews.",
            "effort": "low",
            "estimated_impact": "high",
            "priority_score": score,
            "score_inputs": score_inputs,
        })

    # ── 2. Missing primary category ───────────────────────────────────────────
    if not loc.primary_category:
        competitors = list_competitors(tenant_id, location_id)
        comps_with_cat = sum(1 for _, c in competitors if c.category)
        score, score_inputs = _score_missing_category(comps_with_cat)
        opportunities.append({
            "opp_type": "missing_category",
            "title": "No primary business category set",
            "evidence": {
                "message": (
                    "This location has no primary category configured. "
                    f"{comps_with_cat} competitor(s) have a category set, "
                    "which helps Google surface your business in relevant searches."
                ),
            },
            "source_data": {"location_id": location_id},
            "recommended_action": "Add a primary Google Business Profile category to the location.",
            "effort": "low",
            "estimated_impact": "high",
            "priority_score": score,
            "score_inputs": score_inputs,
        })

    # ── 3. Low local-pack rank ────────────────────────────────────────────────
    snap_repo = get_local_rank_snapshot_repository()
    all_snaps = snap_repo.list_by_location(tenant_id, location_id)
    latest_by_kw: Dict[str, Any] = {}
    for _, snap in all_snaps:
        kw = snap.keyword
        if kw not in latest_by_kw or (snap.date or "") > (latest_by_kw[kw].date or ""):
            latest_by_kw[kw] = snap

    not_in_pack = [s for s in latest_by_kw.values() if s.local_pack_position is None]
    total_kws = len(latest_by_kw)
    if total_kws > 0 and len(not_in_pack) > 0:
        score, score_inputs = _score_local_pack_rank(len(not_in_pack), total_kws)
        opportunities.append({
            "opp_type": "low_local_pack_rank",
            "title": f"Not appearing in local pack for {len(not_in_pack)} of {total_kws} keywords",
            "evidence": {
                "message": (
                    f"Out of {total_kws} tracked keywords, "
                    f"{len(not_in_pack)} don't appear in the local 3-pack. "
                    "Improving GBP completeness, reviews, and local citations can boost local pack visibility."
                ),
                "keywords_not_in_pack": [s.keyword for s in not_in_pack[:10]],
            },
            "source_data": {"location_id": location_id, "total_keywords": total_kws},
            "recommended_action": (
                "Complete GBP profile, build local citations, "
                "encourage reviews, and create location-specific content."
            ),
            "effort": "medium",
            "estimated_impact": "high",
            "priority_score": score,
            "score_inputs": score_inputs,
        })

    # ── 4. Missing location page ──────────────────────────────────────────────
    if not loc.local_page_url:
        opportunities.append({
            "opp_type": "missing_location_page",
            "title": "No location landing page URL configured",
            "evidence": {
                "message": (
                    "This location has no dedicated landing page URL. "
                    "A location-specific page can improve local organic rankings "
                    "and provide a better experience for local searchers."
                ),
            },
            "source_data": {"location_id": location_id},
            "recommended_action": "Create a dedicated location landing page and link it to this record.",
            "effort": "medium",
            "estimated_impact": "medium",
            "priority_score": 0.6,
            "score_inputs": {"location_page_missing": 1},
        })

    # ── 5. NAP inconsistency ─────────────────────────────────────────────────
    nap_repo = get_nap_audit_repository()
    nap_audits = nap_repo.list_by_location(tenant_id, location_id)
    mismatches = [(aid, a) for aid, a in nap_audits if a.mismatch]
    if mismatches:
        score, score_inputs = _score_nap_inconsistency(len(mismatches))
        affected_sources = list({a.source for _, a in mismatches})
        opportunities.append({
            "opp_type": "nap_inconsistency",
            "title": f"NAP inconsistencies detected on {len(affected_sources)} source(s)",
            "evidence": {
                "message": (
                    f"{len(mismatches)} NAP field mismatche(s) detected across "
                    f"{len(affected_sources)} source(s): {', '.join(affected_sources[:5])}. "
                    "Consistent NAP data is a key local ranking factor."
                ),
                "affected_sources": affected_sources,
                "mismatch_count": len(mismatches),
            },
            "source_data": {
                "location_id": location_id,
                "audit_ids": [aid for aid, _ in mismatches[:10]],
            },
            "recommended_action": "Correct NAP inconsistencies across citation sources and GBP.",
            "effort": "medium",
            "estimated_impact": "high",
            "priority_score": score,
            "score_inputs": score_inputs,
        })

    # ── 6. Citation gap ───────────────────────────────────────────────────────
    from seo.local.citations import detect_missing
    missing_dirs = detect_missing(tenant_id, location_id)
    if missing_dirs:
        score, score_inputs = _score_citation_gap(len(missing_dirs))
        opportunities.append({
            "opp_type": "citation_gap",
            "title": f"Missing citations on {len(missing_dirs)} high-priority directories",
            "evidence": {
                "message": (
                    f"This location is not listed on {len(missing_dirs)} high-priority "
                    f"directories: {', '.join(missing_dirs[:5])}. "
                    "Building citations on these directories improves local search visibility."
                ),
                "missing_directories": missing_dirs,
            },
            "source_data": {"location_id": location_id},
            "recommended_action": "Build citations on the missing high-priority directories.",
            "effort": "medium",
            "estimated_impact": "medium",
            "priority_score": score,
            "score_inputs": score_inputs,
        })

    # Sort by priority_score descending
    opportunities.sort(key=lambda x: x["priority_score"], reverse=True)
    return opportunities


def get_competitor_rank_comparison(
    tenant_id: str,
    location_id: str,
    keyword: str,
) -> Dict[str, Any]:
    """Compare our rank vs competitor ranks for a keyword."""
    snap_repo = get_local_rank_snapshot_repository()
    history = snap_repo.history(tenant_id, location_id, keyword)
    if not history:
        return {"keyword": keyword, "location_id": location_id, "our_organic_position": None, "our_local_pack_position": None, "competitors": {}}

    _, latest = history[-1]
    return {
        "keyword": keyword,
        "location_id": location_id,
        "our_organic_position": latest.organic_position,
        "our_local_pack_position": latest.local_pack_position,
        "competitors": latest.competitor_positions,
        "date": latest.date,
        "provider": latest.provider,
    }
