"""Content Agent handoff.

Builds a GenerationRequest-compatible payload from a brief/cluster/opportunity
and optionally calls the Content Agent generate service in-process (via direct
import) or returns the payload for the route to forward.

Security:
  - Cross-tenant handoff MUST fail: brief/opportunity tenant_id must equal the
    caller tenant.
  - The seo_context block carries source IDs for traceability.

Billing:
  - Content generation is billed by the Content Agent (its own code meters it).
  - SEO side only records SEO analysis metering — NO metering of content
    generation here.

Handoff types:
  - keyword_cluster    → blog/article
  - brief              → blog/article
  - low_ctr_query      → title/meta rewrite (ad copy)
  - existing_page      → rewrite (blog)
  - missing_title      → ad_copy (title)
  - missing_description→ ad_copy (meta)
  - content_gap        → blog/article
  - faq_opportunity    → faq_page
"""

from __future__ import annotations

import logging
from typing import Dict, List, Optional, Tuple

from seo.search_stores import (
    BriefStatus,
    get_content_brief_repository,
    get_opportunity_repository,
)

_log = logging.getLogger("pixie.seo.intelligence.content_handoff")


# ── Payload builders ───────────────────────────────────────────────────────────

def _build_payload(
    *,
    tenant_id: str,
    content_type: str,
    keyword: str,
    secondary_keywords: List[str],
    topic: str,
    audience: str,
    goal: str,
    outline: str,
    search_intent: str,
    seo_context: Dict,
) -> Dict:
    """Build a GenerationRequest-shaped dict (not a Pydantic model to avoid
    importing the content_agent package at module load — it may not always be
    available in tests that mock it)."""
    return {
        "tenant_id": tenant_id,
        "content_type": content_type,
        "inputs": {
            "keyword": keyword,
            "secondary_keywords": secondary_keywords,
            "topic": topic,
            "audience": audience or "general audience",
            "goal": goal or "inform and educate",
            "outline": outline,
            "search_intent": search_intent or "informational",
        },
        "options": {
            "tone": "professional",
            "length": "long",
            "language": "en",
        },
        "title": topic or keyword,
        "save": False,  # caller can flip to True if they want immediate persistence
        "seo_context": seo_context,
    }


# ── Handoff: brief ────────────────────────────────────────────────────────────

def handoff_from_brief(
    caller_tenant_id: str,
    brief_id: str,
    *,
    save: bool = False,
) -> Dict:
    """Build a generation payload from a ContentBrief.

    Raises ValueError on cross-tenant access or unknown brief.
    """
    repo = get_content_brief_repository()
    result = repo.get(caller_tenant_id, brief_id)
    if not result:
        raise ValueError(f"brief {brief_id!r} not found for tenant {caller_tenant_id!r}")
    bid, brief = result

    # Cross-tenant guard
    if brief.tenant_id != caller_tenant_id:
        raise ValueError("cross_tenant_handoff_rejected")

    outline_text = "\n".join(
        f"## {sec.get('heading', '')}" + (f"\n{sec.get('notes', '')}" if sec.get("notes") else "")
        for sec in (brief.outline or [])
    )

    seo_context = {
        "source": "content_brief",
        "brief_id": bid,
        "primary_keyword": brief.primary_keyword,
        "secondary_keywords": brief.secondary_keywords,
        "site_id": brief.site_id,
        "project_id": brief.project_id,
        "cluster_id": brief.cluster_id,
        "status": brief.status.value if hasattr(brief.status, "value") else str(brief.status),
        "version": brief.version,
    }

    payload = _build_payload(
        tenant_id=caller_tenant_id,
        content_type="blog",
        keyword=brief.primary_keyword,
        secondary_keywords=brief.secondary_keywords,
        topic=brief.title_options[0] if brief.title_options else brief.primary_keyword,
        audience=brief.target_audience,
        goal=brief.cta_direction or "inform and convert",
        outline=outline_text,
        search_intent=brief.search_intent,
        seo_context=seo_context,
    )
    payload["save"] = save
    return payload


# ── Handoff: keyword cluster ──────────────────────────────────────────────────

def handoff_from_cluster(
    caller_tenant_id: str,
    cluster_id: str,
    project_id: str,
    site_id: str = "",
    *,
    save: bool = False,
) -> Dict:
    """Build a generation payload from a keyword cluster."""
    from seo.search_stores import get_keyword_cluster_repository, get_keyword_repository

    cluster_repo = get_keyword_cluster_repository()
    result = cluster_repo.get(caller_tenant_id, cluster_id)
    if not result:
        raise ValueError(f"cluster {cluster_id!r} not found for tenant {caller_tenant_id!r}")
    cid, cluster = result

    kw_repo = get_keyword_repository()
    all_kws = kw_repo.list_by_project(caller_tenant_id, project_id)
    secondary = [
        kw.keyword for kid, kw in all_kws
        if kw.cluster_id == cid and kw.keyword != cluster.primary_keyword
    ]

    seo_context = {
        "source": "keyword_cluster",
        "cluster_id": cid,
        "cluster_name": cluster.name,
        "primary_keyword": cluster.primary_keyword,
        "secondary_keywords": secondary,
        "project_id": project_id,
        "site_id": site_id,
    }

    payload = _build_payload(
        tenant_id=caller_tenant_id,
        content_type="article",
        keyword=cluster.primary_keyword,
        secondary_keywords=secondary,
        topic=cluster.name or cluster.primary_keyword,
        audience="",
        goal="inform and rank",
        outline="",
        search_intent=cluster.intent.value if hasattr(cluster.intent, "value") else str(cluster.intent),
        seo_context=seo_context,
    )
    payload["save"] = save
    return payload


# ── Handoff: opportunity ──────────────────────────────────────────────────────

def handoff_from_opportunity(
    caller_tenant_id: str,
    opportunity_id: str,
    *,
    save: bool = False,
) -> Dict:
    """Build a generation payload from a SeoOpportunity.

    Selects content_type based on opp_type:
      low_ctr        → ad_copy (title/meta rewrite)
      faq_opportunity→ faq_page
      missing_title  → ad_copy
      content_gap    → blog
      default        → blog
    """
    repo = get_opportunity_repository()
    result = repo.get(caller_tenant_id, opportunity_id)
    if not result:
        raise ValueError(f"opportunity {opportunity_id!r} not found for tenant {caller_tenant_id!r}")
    oid, opp = result

    if opp.tenant_id != caller_tenant_id:
        raise ValueError("cross_tenant_handoff_rejected")

    opp_type = opp.opp_type

    _CONTENT_TYPE_MAP = {
        "low_ctr":        "ad_copy",
        "faq_opportunity":"faq_page",
        "missing_title":  "ad_copy",
        "missing_description": "ad_copy",
        "content_gap":    "blog",
        "missing_cluster_page": "article",
    }
    content_type = _CONTENT_TYPE_MAP.get(opp_type, "blog")

    seo_context = {
        "source": "seo_opportunity",
        "opportunity_id": oid,
        "opp_type": opp_type,
        "keyword": opp.keyword,
        "page_url": opp.page_url,
        "site_id": opp.site_id,
        "project_id": opp.project_id,
        "evidence": opp.evidence,
        "recommended_action": opp.recommended_action,
    }

    payload = _build_payload(
        tenant_id=caller_tenant_id,
        content_type=content_type,
        keyword=opp.keyword,
        secondary_keywords=[],
        topic=opp.recommended_action or opp.keyword,
        audience="",
        goal="resolve seo opportunity",
        outline="",
        search_intent="informational",
        seo_context=seo_context,
    )
    payload["save"] = save
    return payload


# ── In-process execution (optional) ──────────────────────────────────────────

def execute_handoff(
    payload: Dict,
    *,
    is_mock: bool = True,
) -> Dict:
    """Attempt to call the Content Agent generate service in-process.

    Tries direct import of content_agent.generator.generate. Falls back to
    returning the payload as-is with a `requires_http_forward=True` flag so
    the route can POST it to the content-agent endpoint.

    Billing: content generation is billed by the content_agent's own code; we
    do NOT meter it here.
    """
    try:
        from content_agent.enums import ContentType
        from content_agent.schemas import GenerationInputs, GenerationOptions, GenerationRequest
        from content_agent.generator import generate as _ca_generate

        ct_str = payload.get("content_type", "blog")
        try:
            ct = ContentType(ct_str)
        except ValueError:
            ct = ContentType("blog")

        req = GenerationRequest(
            tenant_id=payload["tenant_id"],
            content_type=ct,
            inputs=GenerationInputs(**{
                k: v for k, v in payload.get("inputs", {}).items()
                if hasattr(GenerationInputs, k) or k in GenerationInputs.model_fields
            }),
            options=GenerationOptions(**{
                k: v for k, v in payload.get("options", {}).items()
                if hasattr(GenerationOptions, k) or k in GenerationOptions.model_fields
            }),
            title=payload.get("title", ""),
            save=payload.get("save", False),
        )
        result = _ca_generate(ct, req.inputs, req.options)
        return {
            "executed_in_process": True,
            "is_mock": is_mock,
            "result": result.model_dump(),
            "seo_context": payload.get("seo_context", {}),
            "requires_http_forward": False,
        }
    except Exception as exc:
        _log.debug("in-process content_agent call failed, will forward: %s", exc)
        return {
            "executed_in_process": False,
            "is_mock": is_mock,
            "payload": payload,
            "requires_http_forward": True,
            "forward_to": "/api/content-agent/generate",
        }


def record_handoff_on_brief(
    caller_tenant_id: str,
    brief_id: str,
    handoff_ref: str,
) -> Optional[Tuple]:
    """Store the content-agent document id on the brief after a successful handoff.

    Raises ValueError when the brief does not belong to the caller tenant (which
    naturally covers cross-tenant access because the repo is tenant-scoped and
    returns None when another tenant's id is used).
    """
    repo = get_content_brief_repository()
    result = repo.get(caller_tenant_id, brief_id)
    if not result:
        raise ValueError(f"brief {brief_id!r} not found for tenant {caller_tenant_id!r}")
    bid, brief = result
    if brief.tenant_id != caller_tenant_id:
        raise ValueError("cross_tenant_handoff_rejected")
    return repo.update(caller_tenant_id, brief_id, handoff_ref=handoff_ref)
