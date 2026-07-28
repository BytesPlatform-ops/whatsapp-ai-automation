"""Backlink gap and opportunity engine.

Computes linkable opportunities by comparing client backlink profile against
competitor profiles. All opportunity scores expose ``score_inputs`` so users
can audit the computation — no black-box scoring.

Opportunity types returned:

  GAP_DOMAIN           — domain links to competitors but not the client
  MULTI_COMPETITOR     — domain links to 2+ competitors (stronger signal)
  COMPETITOR_PAGE      — competitor page attracting strong links (target to outcompete)
  LOST_RECLAMATION     — previously earned link now lost (easiest to reclaim)
  RESOURCE_CANDIDATE   — anchor/page heuristic suggests resource-page or guest opportunity
  INTERNAL_LINK_NEED   — high-value target page receives no internal links (basic heuristic)

Each opportunity dict:
  {
    opportunity_type, source_evidence, competitors, target_page, link_likelihood,
    estimated_value, effort, confidence, recommended_outreach_angle,
    provider_timestamp, score_inputs        ← always present, never empty
  }

Metering: record_backlink_gap is called once per gap-analysis run.

IMPORTANT: All estimates are labelled as such. We use stored provider data only;
we do not call any AI model or fabricate link values.
"""

from __future__ import annotations

import logging
from collections import Counter
from typing import Dict, List, Optional

from seo.metering_search import record_backlink_gap

from .provider import BacklinkProvider, get_backlink_provider
from .stores import (
    DomainStatus,
    LinkStatus,
    get_backlink_repository,
    get_referring_domain_repository,
)

_log = logging.getLogger("pixie.seo.backlinks.gaps")

# Opportunity type constants
GAP_DOMAIN         = "gap_domain"
MULTI_COMPETITOR   = "multi_competitor"
COMPETITOR_PAGE    = "competitor_page"
LOST_RECLAMATION   = "lost_reclamation"
RESOURCE_CANDIDATE = "resource_candidate"
INTERNAL_LINK_NEED = "internal_link_need"

# Effort labels
EFFORT_LOW    = "low"
EFFORT_MEDIUM = "medium"
EFFORT_HIGH   = "high"

# Heuristic anchor keywords that suggest resource/guest post opportunities.
_RESOURCE_ANCHOR_HINTS = frozenset({
    "resource", "guide", "tutorial", "how to", "list", "tools",
    "best", "top", "tips", "examples",
})
_GUEST_PAGE_HINTS = frozenset({
    "/blog/", "/article/", "/post/", "/resources/",
    "/guide/", "/tutorial/", "/news/",
})


def _opportunity_base(opp_type: str, score_inputs: Dict) -> Dict:
    """Build a skeleton opportunity dict with mandatory fields."""
    return {
        "opportunity_type": opp_type,
        "source_evidence": [],
        "competitors": [],
        "target_page": "",
        "link_likelihood": 0.0,
        "estimated_value": "estimate",   # always labelled
        "effort": EFFORT_MEDIUM,
        "confidence": 0.0,
        "recommended_outreach_angle": "",
        "provider_timestamp": "",
        "score_inputs": score_inputs,    # always present; never empty
    }


def _gap_opportunities(
    client_domains: set,
    competitor_intersections: List[Dict],
    client_domain: str,
) -> List[Dict]:
    """Generate GAP_DOMAIN and MULTI_COMPETITOR opportunities."""
    opportunities = []
    for item in competitor_intersections:
        rd = item.get("referring_domain", "")
        if not rd or rd in client_domains:
            continue
        comp_list = item.get("links_to_competitors", [])
        comp_count = len(set(comp_list))
        pm = item.get("provider_metrics") or {}
        dr = pm.get("domain_rating")

        # Score inputs: fully transparent
        score_inputs = {
            "referring_domain": rd,
            "competitor_count": comp_count,
            "links_to_client": False,
            "domain_rating": dr,   # provider-supplied or None
            "is_estimate": True,
        }

        opp_type = MULTI_COMPETITOR if comp_count >= 2 else GAP_DOMAIN
        # Likelihood heuristic: more competitors linking → higher signal
        likelihood = min(0.9, 0.3 + 0.15 * comp_count)
        # DR factor: higher DR → higher estimated value (when provided)
        if dr is not None:
            value_label = "high" if dr >= 50 else ("medium" if dr >= 20 else "low")
        else:
            value_label = "unknown"

        effort = EFFORT_HIGH if comp_count == 1 else EFFORT_MEDIUM

        opp = _opportunity_base(opp_type, score_inputs)
        opp.update({
            "source_evidence": [f"Referring domain '{rd}' links to {comp_count} competitor(s) "
                                 f"but not to '{client_domain}'"],
            "competitors": list(set(comp_list)),
            "target_page": f"https://{client_domain}/",
            "link_likelihood": round(likelihood, 3),
            "estimated_value": f"{value_label} (estimate; based on provider domain_rating={dr})",
            "effort": effort,
            "confidence": round(min(0.8, 0.3 + 0.1 * comp_count), 2),
            "recommended_outreach_angle": (
                f"This domain links to {comp_count} of your competitors. "
                "Reach out to their editorial team with a personalised pitch "
                "demonstrating the unique value of your content compared to the "
                "linked competitors."
            ),
            "provider_timestamp": pm.get("last_seen", ""),
        })
        opportunities.append(opp)
    return opportunities


def _lost_reclamation_opportunities(
    tenant_id: str, site_id: str, client_domain: str
) -> List[Dict]:
    """Generate LOST_RECLAMATION opportunities from stored lost backlinks."""
    try:
        bl_repo = get_backlink_repository()
        lost_pairs = bl_repo.list_by_site(tenant_id, site_id, status=LinkStatus.LOST)
        opportunities = []
        for _, bl in lost_pairs[:50]:  # cap to prevent oversized responses
            pm = bl.provider_metrics or {}
            dr = pm.get("domain_rating")
            score_inputs = {
                "source_domain": bl.source_domain,
                "source_url": bl.source_url,
                "target_url": bl.target_url,
                "anchor_text": bl.anchor_text,
                "last_seen": bl.last_seen,
                "domain_rating": dr,
                "is_estimate": True,
            }
            opp = _opportunity_base(LOST_RECLAMATION, score_inputs)
            opp.update({
                "source_evidence": [
                    f"Link from '{bl.source_url}' to '{bl.target_url}' "
                    f"(anchor: '{bl.anchor_text}') was last seen {bl.last_seen or 'unknown'}"
                ],
                "competitors": [],
                "target_page": bl.target_url,
                "link_likelihood": 0.6,   # lost links are often easiest to reclaim
                "estimated_value": f"existing (estimate; domain_rating={dr})",
                "effort": EFFORT_LOW,
                "confidence": 0.5,
                "recommended_outreach_angle": (
                    f"This link from '{bl.source_domain}' was previously pointing to your site "
                    f"but is now lost. Contact the site editor to verify whether the link was "
                    f"removed intentionally or is a technical issue."
                ),
                "provider_timestamp": bl.data_timestamp,
            })
            opportunities.append(opp)
        return opportunities
    except Exception as exc:
        _log.warning("lost_reclamation failed: %s", exc)
        return []


def _resource_candidates(tenant_id: str, site_id: str, client_domain: str) -> List[Dict]:
    """Heuristic resource-page and guest-post opportunity candidates."""
    try:
        bl_repo = get_backlink_repository()
        all_bls = bl_repo.list_by_site(tenant_id, site_id)
        opportunities = []

        for _, bl in all_bls[:200]:  # sample; not exhaustive
            anchor_lower = (bl.anchor_text or "").lower()
            url_lower = (bl.source_url or "").lower()

            is_resource = any(hint in anchor_lower for hint in _RESOURCE_ANCHOR_HINTS)
            is_guest_page = any(hint in url_lower for hint in _GUEST_PAGE_HINTS)

            if is_resource or is_guest_page:
                opp_reason = "resource-page anchor heuristic" if is_resource else "guest-post page pattern"
                score_inputs = {
                    "anchor_text": bl.anchor_text,
                    "source_url": bl.source_url,
                    "is_resource_anchor": is_resource,
                    "is_guest_page_url": is_guest_page,
                    "heuristic": opp_reason,
                    "is_estimate": True,
                }
                opp = _opportunity_base(RESOURCE_CANDIDATE, score_inputs)
                opp.update({
                    "source_evidence": [
                        f"Link from '{bl.source_url}' uses anchor '{bl.anchor_text}' "
                        f"— matches {opp_reason}"
                    ],
                    "competitors": [],
                    "target_page": bl.target_url,
                    "link_likelihood": 0.4,
                    "estimated_value": "medium (estimate; heuristic only)",
                    "effort": EFFORT_MEDIUM,
                    "confidence": 0.35,
                    "recommended_outreach_angle": (
                        f"This source page ({bl.source_url}) appears to be a resource or guest "
                        "post opportunity based on its URL pattern and anchor text. "
                        "Pitch your most relevant content or a guest article."
                    ),
                    "provider_timestamp": bl.data_timestamp,
                })
                opportunities.append(opp)

        return opportunities
    except Exception as exc:
        _log.warning("resource_candidates failed: %s", exc)
        return []


def run_gap_analysis(
    tenant_id: str,
    site_id: str,
    competitors: List[str],
    *,
    provider: Optional[BacklinkProvider] = None,
    client_domain: Optional[str] = None,
    report_id: Optional[str] = None,
    is_mock: bool = True,
) -> Dict:
    """Full backlink gap analysis comparing client vs competitors.

    Returns:
      {
        gap_opportunities: [...],
        lost_reclamation: [...],
        resource_candidates: [...],
        competitor_pages: [...],
        summary: { total, by_type, competitor_count },
        metering: {...}
      }
    """
    if provider is None:
        provider = get_backlink_provider()

    target_domain = client_domain or site_id
    rid = report_id or f"blgap_{tenant_id}_{site_id}"

    # Fetch competitor intersections from provider.
    try:
        intersections = provider.competitor_intersections(target_domain, competitors)
    except Exception as exc:
        _log.warning("competitor_intersections failed: %s", exc)
        intersections = []

    # Stored client referring domains.
    rd_repo = get_referring_domain_repository()
    try:
        client_rd_pairs = rd_repo.list_by_site(tenant_id, site_id)
        client_domains = {rd.domain for _, rd in client_rd_pairs}
    except Exception:
        client_domains = set()

    gap_opps = _gap_opportunities(client_domains, intersections, target_domain)
    lost_opps = _lost_reclamation_opportunities(tenant_id, site_id, target_domain)
    resource_opps = _resource_candidates(tenant_id, site_id, target_domain)

    # Competitor pages (pages on competitor sites that attract strong links).
    comp_page_opps = []
    for comp in competitors[:5]:
        try:
            comp_summary = provider.summary(comp)
            score_inputs = {
                "competitor": comp,
                "total_backlinks": comp_summary.get("total_backlinks", 0),
                "referring_domains": comp_summary.get("referring_domains", 0),
                "provider_metrics": comp_summary.get("provider_metrics"),
                "is_estimate": True,
            }
            opp = _opportunity_base(COMPETITOR_PAGE, score_inputs)
            opp.update({
                "source_evidence": [
                    f"Competitor '{comp}' has {comp_summary.get('total_backlinks', 0)} backlinks "
                    f"from {comp_summary.get('referring_domains', 0)} referring domains "
                    f"(provider: {comp_summary.get('provider', 'unknown')})"
                ],
                "competitors": [comp],
                "target_page": f"https://{comp}/",
                "link_likelihood": 0.3,
                "estimated_value": "medium (estimate; based on competitor profile)",
                "effort": EFFORT_HIGH,
                "confidence": 0.4,
                "recommended_outreach_angle": (
                    f"Create content that covers the same topic better than '{comp}' "
                    "and proactively pitch the sources already linking to them."
                ),
                "provider_timestamp": comp_summary.get("provider_metrics", {}).get(
                    "data_timestamp", "") if isinstance(comp_summary.get("provider_metrics"), dict) else "",
            })
            comp_page_opps.append(opp)
        except Exception as exc:
            _log.warning("competitor page opp failed for %s: %s", comp, exc)

    all_opps = gap_opps + lost_opps + resource_opps + comp_page_opps
    by_type: Dict[str, int] = {}
    for opp in all_opps:
        t = opp["opportunity_type"]
        by_type[t] = by_type.get(t, 0) + 1

    metering = record_backlink_gap(tenant_id, report_id=rid, is_mock=is_mock)

    return {
        "gap_opportunities": gap_opps,
        "lost_reclamation": lost_opps,
        "resource_candidates": resource_opps,
        "competitor_pages": comp_page_opps,
        "summary": {
            "total": len(all_opps),
            "by_type": by_type,
            "competitor_count": len(competitors),
            "client_domain": target_domain,
        },
        "metering": metering,
    }


def get_opportunities(
    tenant_id: str,
    site_id: str,
    competitors: List[str],
    *,
    provider: Optional[BacklinkProvider] = None,
    client_domain: Optional[str] = None,
    is_mock: bool = True,
) -> List[Dict]:
    """Convenience wrapper returning the flat list of all opportunities.

    Every opportunity is guaranteed to have a non-empty ``score_inputs`` dict.
    """
    result = run_gap_analysis(
        tenant_id, site_id, competitors,
        provider=provider,
        client_domain=client_domain,
        is_mock=is_mock,
    )
    all_opps = (
        result.get("gap_opportunities", [])
        + result.get("lost_reclamation", [])
        + result.get("resource_candidates", [])
        + result.get("competitor_pages", [])
    )
    # Safety: ensure every opportunity has score_inputs (never should be empty but be defensive)
    for opp in all_opps:
        if not opp.get("score_inputs"):
            opp["score_inputs"] = {"is_estimate": True}
    return all_opps
