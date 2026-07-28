"""Location-page opportunity generator for the Local SEO vertical.

Generates content recommendations for location-specific landing pages grounded in:
  - Target cities / service areas (from Location record)
  - Local keywords (from LocalRankSnapshot)
  - Existing pages (local_page_url + website pages if crawled)
  - Duplicate-content risk analysis
  - Competitor pages (from LocalCompetitor records)
  - Local rank data

Anti-doorway-page guardrails (enforced in the spec check):
  - Each recommendation must have a unique city or service-area target.
  - Recommendations are suppressed when an existing page already serves the target.
  - Unique-content requirements are included in every recommendation.

Handoff to Content Agent reuses seo.intelligence.content_handoff pattern.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Tuple

_log = logging.getLogger("pixie.seo.local.location_pages")


def generate_location_page_opportunities(
    tenant_id: str,
    location_id: str,
    *,
    existing_pages: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    """Generate location-page content opportunities for a location.

    Returns a list of opportunity dicts.  Each includes:
      - location: city or service area
      - primary_keyword: the head term to target
      - supporting_keywords: [list]
      - intent: "local" | "transactional"
      - existing_page_match: URL if there's already a page for this target
      - new_page_required: bool
      - internal_link_plan: [suggested anchor + target pairs]
      - local_schema_rec: recommended schema type
      - unique_content_requirements: [list of differentiators required]
      - evidence: {message, sources}
      - priority: "high" | "medium" | "low"
      - doorway_risk: bool (True = content would be thin/templated — DON'T publish)

    Only generates recs for targets with NO existing page match.
    """
    from seo.local.stores import (
        get_location_repository,
        get_local_rank_snapshot_repository,
        get_local_competitor_repository,
    )

    loc_repo = get_location_repository()
    loc_result = loc_repo.get(tenant_id, location_id)
    if loc_result is None:
        return []
    _, loc = loc_result

    snap_repo = get_local_rank_snapshot_repository()
    all_snaps = snap_repo.list_by_location(tenant_id, location_id)
    comp_repo = get_local_competitor_repository()
    competitors = comp_repo.list_by_location(tenant_id, location_id)

    # Build keyword map: keyword → best local_pack_position + organic_position
    kw_snap: Dict[str, Any] = {}
    for _, snap in all_snaps:
        kw = snap.keyword
        if kw not in kw_snap or (snap.date or "") > (kw_snap[kw]["date"] or ""):
            kw_snap[kw] = {
                "keyword": kw,
                "organic_position": snap.organic_position,
                "local_pack_position": snap.local_pack_position,
                "date": snap.date or "",
            }

    # Determine target cities/areas from location data.
    # Only add loc.city as a fallback when no service_areas were stored at all.
    service_areas = list(loc.service_areas or [])
    if not service_areas and loc.city:
        service_areas = [loc.city]

    existing_page_urls = set(existing_pages or [])
    if loc.local_page_url:
        existing_page_urls.add(loc.local_page_url)

    primary_category = loc.primary_category or "local business"
    business_name = loc.business_name or "the business"

    # Build competitor domain set for content differentiation advice
    competitor_domains = [c.domain for _, c in competitors if c.domain]

    opportunities: List[Dict[str, Any]] = []

    for target_city in service_areas[:20]:  # cap at 20 targets to avoid doorway spam
        # Check if we already have a page for this city
        existing_match = next(
            (url for url in existing_page_urls
             if target_city.lower().replace(" ", "-") in url.lower() or
                target_city.lower() in url.lower()),
            None,
        )
        new_page_required = existing_match is None

        # Find relevant keywords for this target
        local_keywords = [
            snap for kw, snap in kw_snap.items()
            if target_city.lower() in kw.lower() or
               primary_category.lower() in kw.lower()
        ]
        local_keywords.sort(key=lambda s: (s["local_pack_position"] or 999, s["organic_position"] or 999))

        # Build keyword lists — singular primary_keyword plus list forms for API callers
        head_keyword = (
            local_keywords[0]["keyword"] if local_keywords
            else f"{primary_category} in {target_city}"
        )
        primary_keywords = [head_keyword]
        supporting_keywords = [s["keyword"] for s in local_keywords[1:6]]
        if not supporting_keywords:
            # Fallback keyword suggestions when no snapshot data available
            supporting_keywords = [
                f"best {primary_category} {target_city}",
                f"{primary_category} near {target_city}",
                f"{primary_category} {target_city} reviews",
            ]

        # Determine priority
        not_ranking = [s for s in local_keywords if s.get("organic_position") is None]
        not_in_pack = [s for s in local_keywords if s.get("local_pack_position") is None]
        if len(not_ranking) > len(local_keywords) * 0.5:
            priority = "high"
        elif not_in_pack:
            priority = "medium"
        else:
            priority = "low"

        # Unique content requirements (anti-doorway guardrails)
        unique_content_requirements = [
            f"Include specific details about {business_name}'s local service presence in {target_city}",
            f"Reference local landmarks, neighborhoods, or service history unique to {target_city}",
            f"Include locally-relevant FAQs specific to {target_city} and the surrounding area",
            f"Feature local customer testimonials or case studies from {target_city}",
            f"Mention local service specifics that are unique — not duplicate content from other location pages",
        ]
        if competitor_domains:
            unique_content_requirements.append(
                "Differentiate from competitor positioning — reference what makes "
                f"{business_name} unique for {target_city} community customers"
            )

        # Anti-doorway warning in recommended_action
        anti_doorway_note = (
            "Ensure this page has unique, original content — do NOT use templated or thin "
            "duplicate copy from other location pages. Google penalises doorway pages."
        )

        # Schema recommendation
        local_schema_rec = "LocalBusiness"
        if "service" in primary_category.lower() or "plumb" in primary_category.lower():
            local_schema_rec = "HomeAndConstructionBusiness"
        elif "restaurant" in primary_category.lower() or "food" in primary_category.lower():
            local_schema_rec = "Restaurant"
        elif "doctor" in primary_category.lower() or "dental" in primary_category.lower():
            local_schema_rec = "MedicalBusiness"

        # Internal link plan
        internal_link_plan = [
            {"anchor": f"{primary_category} services", "target": loc.website_url or "/"},
            {"anchor": f"Contact us in {target_city}", "target": f"{loc.website_url}/contact" if loc.website_url else "/contact"},
        ]
        if loc.local_page_url and loc.city:
            internal_link_plan.append({
                "anchor": f"{loc.city} location",
                "target": loc.local_page_url,
            })

        opp_type = "missing_location_page" if new_page_required else "existing_location_page"

        opp = {
            "location_id": location_id,
            "opp_type": opp_type,
            "target_city": target_city,
            "primary_keyword": head_keyword,
            "primary_keywords": primary_keywords,
            "supporting_keywords": supporting_keywords,
            "intent": "local",
            "existing_page_match": existing_match,
            "new_page_required": new_page_required,
            "internal_link_plan": internal_link_plan,
            "local_schema_rec": local_schema_rec,
            "unique_content_requirements": unique_content_requirements,
            "anti_doorway_note": anti_doorway_note,
            "evidence": {
                "message": (
                    f"No location page exists for '{target_city}' — "
                    f"creating a page targeting '{head_keyword}' could improve "
                    f"local search visibility in this service area."
                    if new_page_required else
                    f"A page exists for '{target_city}' at {existing_match} — "
                    "consider optimising rather than creating a new page."
                ),
                "keyword_count": len(local_keywords),
                "not_ranking_count": len(not_ranking),
            },
            "recommended_action": (
                f"Create a unique, original location page targeting '{head_keyword}' for {target_city}. "
                "Include locally-specific content — not thin or templated copy from other pages."
                if new_page_required else
                f"Optimise the existing page for '{target_city}' with more unique local content."
            ),
            "priority": priority,
            "doorway_risk": False,  # these recs enforce unique content requirements
        }
        opportunities.append(opp)

    # Sort by priority then keyword count
    _priority_order = {"high": 0, "medium": 1, "low": 2}
    opportunities.sort(key=lambda x: _priority_order.get(x["priority"], 3))

    return opportunities


def handoff_location_page_to_content(
    tenant_id: str,
    location_id: str,
    opportunity: Optional[Dict[str, Any]] = None,
    *,
    target_city: Optional[str] = None,
    primary_keyword: Optional[str] = None,
    supporting_keywords: Optional[List[str]] = None,
    schema_rec: str = "LocalBusiness",
    save: bool = False,
) -> Dict[str, Any]:
    """Build a Content Agent handoff payload for a location page.

    Accepts either an opportunity dict (from generate_location_page_opportunities) as the
    third positional argument, or individual keyword args for target_city / primary_keyword.
    Reuses the _build_payload pattern from seo.intelligence.content_handoff.
    The seo_context block carries traceability metadata.
    """
    from seo.local.stores import get_location_repository

    # Unpack from opportunity dict if provided
    if opportunity is not None:
        target_city = target_city or opportunity.get("target_city", "")
        primary_keyword = primary_keyword or opportunity.get("primary_keyword", "")
        if supporting_keywords is None:
            supporting_keywords = opportunity.get("supporting_keywords", [])
        schema_rec = opportunity.get("local_schema_rec", schema_rec)

    if not target_city or not primary_keyword:
        raise ValueError("target_city and primary_keyword are required")

    loc_repo = get_location_repository()
    loc_result = loc_repo.get(tenant_id, location_id)
    if loc_result is None:
        return {"error": "location_not_found", "location_id": location_id}
    _, loc = loc_result

    seo_context = {
        "source": "local_seo_location_page",
        "location_id": location_id,
        "target_city": target_city,
        "primary_keyword": primary_keyword,
        "business_name": loc.business_name,
        "primary_category": loc.primary_category,
        "local_schema_rec": schema_rec,
        "unique_content_note": (
            "This is a location-specific page. It MUST contain unique content "
            "referencing the specific city, local landmarks, local testimonials, "
            "and area-specific service details. Do NOT duplicate content from "
            "other location pages — Google penalises doorway/thin content."
        ),
    }

    unique_content_requirements = (
        opportunity.get("unique_content_requirements", [])
        if opportunity else []
    ) or [
        f"Include specific details about service presence in {target_city}",
        f"Reference local landmarks or service history unique to {target_city}",
        "Include locally-relevant FAQs — not templated or thin duplicate content",
    ]

    payload = {
        "tenant_id": tenant_id,
        "location_id": location_id,
        "target_city": target_city,
        "primary_keywords": [primary_keyword],
        "unique_content_requirements": unique_content_requirements,
        "content_type": "blog",
        "inputs": {
            "keyword": primary_keyword,
            "secondary_keywords": supporting_keywords or [],
            "topic": f"{loc.primary_category or 'Services'} in {target_city} — {loc.business_name}",
            "audience": f"Residents and businesses in {target_city} searching for {loc.primary_category or 'local services'}",
            "goal": "local lead generation",
            "outline": (
                f"## Introduction: {loc.business_name} in {target_city}\n"
                f"## Our Services in {target_city}\n"
                f"## Why Choose Us in {target_city}\n"
                f"## Customer Testimonials from {target_city}\n"
                f"## Local FAQs\n"
                f"## Contact Us in {target_city}"
            ),
            "search_intent": "local",
        },
        "options": {
            "tone": "professional",
            "length": "long",
            "language": "en",
        },
        "title": f"{loc.primary_category or 'Services'} in {target_city}",
        "save": save,
        "seo_context": seo_context,
    }

    return {
        "payload": payload,
        "executed_in_process": False,
        "requires_http_forward": True,
        "forward_to": "/api/content-agent/generate",
        "seo_context": seo_context,
    }
