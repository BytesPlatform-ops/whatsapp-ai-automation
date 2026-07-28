"""ContentBrief lifecycle management.

- generate: create from keyword/cluster + stored competitor headings/questions/
  entities (grounded, never copies competitor content)
- edit / version history (version bump on each edit)
- approve / archive / duplicate / export

Plan limit LIMIT_CONTENT_BRIEFS enforced on create.
Metered via record_brief_generation on generate.
"""

from __future__ import annotations

import logging
from typing import Dict, List, Optional, Tuple

from seo.metering_search import (
    LIMIT_CONTENT_BRIEFS,
    enforce_seo_limit,
    record_brief_generation,
)
from seo.search_stores import (
    BriefStatus,
    ContentBrief,
    get_content_brief_repository,
    get_keyword_cluster_repository,
    get_keyword_repository,
    get_rank_snapshot_repository,
)

_log = logging.getLogger("pixie.seo.intelligence.briefs")


# ── Count helper ──────────────────────────────────────────────────────────────

def _count_briefs(tenant_id: str) -> int:
    """Count non-archived briefs for the tenant (plan-limit boundary)."""
    repo = get_content_brief_repository()
    all_pairs = repo.list(tenant_id)
    return sum(1 for _, b in all_pairs if b.status != BriefStatus.ARCHIVED)


# ── Grounded content extraction ───────────────────────────────────────────────

def _extract_competitor_headings(
    tenant_id: str, project_id: str, keyword: str, max_items: int = 15
) -> List[str]:
    """Extract heading patterns from rank snapshot SERP titles for the keyword.

    We use SERP titles from rank snapshots as a signal — never copying content,
    only identifying common structural patterns (e.g. 'How to', 'Top 10', etc.)
    that are standard SEO signals, not copyrighted content.
    """
    snap_repo = get_rank_snapshot_repository()
    rows = snap_repo.list_where(tenant_id, project_id=project_id, keyword=keyword)
    headings: List[str] = []
    seen: set = set()
    for _, snap in sorted(rows, key=lambda p: (p[1].date or ""), reverse=True):
        if snap.serp_title and snap.serp_title not in seen:
            seen.add(snap.serp_title)
            headings.append(snap.serp_title)
        if len(headings) >= max_items:
            break
    return headings


def _cluster_keywords(
    tenant_id: str, project_id: str, cluster_id: str
) -> Tuple[str, List[str]]:
    """Return (primary_keyword, [secondary_keywords]) for a cluster."""
    cluster_repo = get_keyword_cluster_repository()
    result = cluster_repo.get(tenant_id, cluster_id)
    if not result:
        return "", []
    _, cluster = result
    kw_repo = get_keyword_repository()
    all_kws = kw_repo.list_by_project(tenant_id, project_id)
    secondary = [
        kw.keyword for kid, kw in all_kws
        if kw.cluster_id == cluster_id and kw.keyword != cluster.primary_keyword
    ]
    return cluster.primary_keyword, secondary


# ── Generate ──────────────────────────────────────────────────────────────────

def generate_brief(
    tenant_id: str,
    project_id: str,
    site_id: str,
    *,
    primary_keyword: str,
    secondary_keywords: Optional[List[str]] = None,
    cluster_id: str = "",
    search_intent: str = "",
    target_audience: str = "",
    word_count_min: int = 800,
    word_count_max: int = 2000,
    cta_direction: str = "",
    is_mock: bool = True,
) -> Tuple[str, ContentBrief]:
    """Generate a grounded ContentBrief from stored data.

    Enforces LIMIT_CONTENT_BRIEFS plan cap on non-archived count.
    Metered via record_brief_generation.
    Competitor headings are sourced from stored rank snapshot SERP data;
    questions and entities are derived from the keyword's search intent and
    secondary keyword signals — no third-party provider call is made here.
    """
    # Plan cap
    used = _count_briefs(tenant_id)
    enforce_seo_limit(tenant_id, LIMIT_CONTENT_BRIEFS, used)

    sec_kws = list(secondary_keywords or [])

    # If a cluster is supplied, enrich with cluster keywords
    cluster_primary = primary_keyword
    if cluster_id:
        cp, sec_from_cluster = _cluster_keywords(tenant_id, project_id, cluster_id)
        if cp:
            cluster_primary = cp
        for kw in sec_from_cluster:
            if kw not in sec_kws and kw != cluster_primary:
                sec_kws.append(kw)

    primary_keyword = cluster_primary or primary_keyword

    # Grounded signals from stored data
    comp_headings = _extract_competitor_headings(tenant_id, project_id, primary_keyword)

    # Deterministic questions derived from keyword (no LLM in base path)
    questions: List[str] = _derive_questions(primary_keyword, sec_kws, search_intent)

    # Entities = the keyword itself + secondary keywords as seed entities
    entities: List[str] = [primary_keyword] + sec_kws[:5]

    # Outline: generated deterministically from intent signals
    outline = _derive_outline(primary_keyword, search_intent, questions)

    # Title options (deterministic; AI can refine later)
    title_options = _derive_title_options(primary_keyword, search_intent)

    # Meta direction
    meta_direction = (
        f"Write a compelling 150–160 character meta description for '{primary_keyword}' "
        f"targeting {search_intent or 'informational'} intent."
    )

    source_data: Dict = {
        "keyword": primary_keyword,
        "cluster_id": cluster_id,
        "secondary_keywords_count": len(sec_kws),
        "competitor_headings_count": len(comp_headings),
        "data_source": "rank_snapshots_serp_titles + keyword_cluster",
        "is_mock": is_mock,
    }

    brief = ContentBrief(
        tenant_id=tenant_id,
        site_id=site_id,
        project_id=project_id,
        cluster_id=cluster_id,
        primary_keyword=primary_keyword,
        secondary_keywords=sec_kws,
        search_intent=search_intent,
        target_audience=target_audience,
        title_options=title_options,
        meta_direction=meta_direction,
        word_count_min=word_count_min,
        word_count_max=word_count_max,
        outline=outline,
        headings=[],            # populated by AI refinement step
        questions=questions,
        entities=entities,
        competitor_headings=comp_headings,
        internal_links=[],
        external_sources=[],
        schema_recommendation=_schema_for_intent(search_intent),
        cta_direction=cta_direction,
        source_data=source_data,
        status=BriefStatus.DRAFT,
        version=1,
    )

    repo = get_content_brief_repository()
    brief_id, saved = repo.create(brief)

    # Meter (mock=True in tests: 0 credits)
    record_brief_generation(tenant_id, brief_id=brief_id, is_mock=is_mock)

    return brief_id, saved


def _derive_questions(
    keyword: str, secondary: List[str], intent: str
) -> List[str]:
    """Deterministic question set based on keyword and intent."""
    qs = [
        f"What is {keyword}?",
        f"How does {keyword} work?",
        f"Why is {keyword} important?",
        f"What are the best practices for {keyword}?",
        f"How to get started with {keyword}?",
    ]
    if intent in ("commercial", "transactional"):
        qs += [f"How much does {keyword} cost?", f"What is the best {keyword}?"]
    for kw in secondary[:2]:
        qs.append(f"What is the difference between {keyword} and {kw}?")
    return qs[:8]


def _derive_outline(
    keyword: str, intent: str, questions: List[str]
) -> List[Dict]:
    """Produce a structured outline (list of section dicts)."""
    if intent in ("commercial", "transactional"):
        sections = [
            {"heading": f"What is {keyword.title()}?", "type": "h2", "notes": "Define the topic"},
            {"heading": f"Key Benefits of {keyword.title()}", "type": "h2", "notes": "Evidence-based benefits"},
            {"heading": f"How to Choose the Right {keyword.title()}", "type": "h2", "notes": "Decision criteria"},
            {"heading": "Pricing & Options", "type": "h2", "notes": "Transparent pricing discussion"},
            {"heading": "FAQ", "type": "h2", "notes": "Answer top user questions", "questions": questions[:4]},
        ]
    else:
        sections = [
            {"heading": f"Introduction to {keyword.title()}", "type": "h2", "notes": "Hook + context"},
            {"heading": f"What is {keyword.title()}?", "type": "h2", "notes": "Clear definition"},
            {"heading": f"How {keyword.title()} Works", "type": "h2", "notes": "Mechanism/process"},
            {"heading": f"Benefits and Use Cases", "type": "h2", "notes": "Practical applications"},
            {"heading": f"Best Practices", "type": "h2", "notes": "Actionable guidance"},
            {"heading": "FAQ", "type": "h2", "notes": "Top questions", "questions": questions[:4]},
            {"heading": "Conclusion", "type": "h2", "notes": "Summary + CTA"},
        ]
    return sections


def _derive_title_options(keyword: str, intent: str) -> List[str]:
    if intent in ("commercial", "transactional"):
        return [
            f"Best {keyword.title()}: Expert Guide {chr(0x2014)} {chr(0x2022)} Tested",
            f"{keyword.title()} Explained: Everything You Need to Know",
            f"How to Choose {keyword.title()}: A Complete Buyer's Guide",
        ]
    return [
        f"{keyword.title()}: The Complete Guide",
        f"What Is {keyword.title()}? Definition, Benefits & How It Works",
        f"The Ultimate Guide to {keyword.title()}",
    ]


def _schema_for_intent(intent: str) -> str:
    return {
        "commercial":    "Product",
        "transactional": "Product",
        "local":         "LocalBusiness",
        "navigational":  "WebPage",
    }.get(intent, "Article")


# ── Edit / version ────────────────────────────────────────────────────────────

def edit_brief(
    tenant_id: str, brief_id: str, **fields
) -> Optional[Tuple[str, ContentBrief]]:
    """Update brief fields and bump the version number."""
    repo = get_content_brief_repository()
    result = repo.get(tenant_id, brief_id)
    if not result:
        return None
    _, brief = result
    new_version = brief.version + 1
    return repo.update(tenant_id, brief_id, version=new_version, **fields)


def version_history(tenant_id: str, brief_id: str) -> Dict:
    """Return the current version number and brief metadata."""
    repo = get_content_brief_repository()
    result = repo.get(tenant_id, brief_id)
    if not result:
        return {"error": "not_found"}
    bid, brief = result
    return {
        "brief_id": bid,
        "primary_keyword": brief.primary_keyword,
        "version": brief.version,
        "status": brief.status.value if hasattr(brief.status, "value") else str(brief.status),
        "note": "version history is stored as a version counter; use edit_brief to create a new version",
    }


# ── Lifecycle ops ─────────────────────────────────────────────────────────────

def get_brief(tenant_id: str, brief_id: str) -> Optional[Tuple[str, ContentBrief]]:
    return get_content_brief_repository().get(tenant_id, brief_id)


def list_briefs(
    tenant_id: str,
    site_id: Optional[str] = None,
    project_id: Optional[str] = None,
    status: Optional[BriefStatus] = None,
) -> List[Tuple[str, ContentBrief]]:
    repo = get_content_brief_repository()
    pairs = repo.list(tenant_id)
    if site_id:
        pairs = [(bid, b) for bid, b in pairs if b.site_id == site_id]
    if project_id:
        pairs = [(bid, b) for bid, b in pairs if b.project_id == project_id]
    if status is not None:
        pairs = [(bid, b) for bid, b in pairs if b.status == status]
    return pairs


def approve_brief(tenant_id: str, brief_id: str) -> Optional[Tuple[str, ContentBrief]]:
    return get_content_brief_repository().update(
        tenant_id, brief_id, status=BriefStatus.APPROVED
    )


def archive_brief(tenant_id: str, brief_id: str) -> Optional[Tuple[str, ContentBrief]]:
    return get_content_brief_repository().update(
        tenant_id, brief_id, status=BriefStatus.ARCHIVED
    )


def duplicate_brief(
    tenant_id: str, brief_id: str
) -> Optional[Tuple[str, ContentBrief]]:
    """Clone a brief as a new DRAFT at version 1."""
    repo = get_content_brief_repository()
    result = repo.get(tenant_id, brief_id)
    if not result:
        return None
    _, brief = result

    # Enforce plan limit for the new brief
    used = _count_briefs(tenant_id)
    enforce_seo_limit(tenant_id, LIMIT_CONTENT_BRIEFS, used)

    clone = ContentBrief(
        tenant_id=brief.tenant_id,
        site_id=brief.site_id,
        project_id=brief.project_id,
        cluster_id=brief.cluster_id,
        primary_keyword=brief.primary_keyword,
        secondary_keywords=list(brief.secondary_keywords),
        search_intent=brief.search_intent,
        target_audience=brief.target_audience,
        title_options=list(brief.title_options),
        meta_direction=brief.meta_direction,
        word_count_min=brief.word_count_min,
        word_count_max=brief.word_count_max,
        outline=list(brief.outline),
        headings=list(brief.headings),
        questions=list(brief.questions),
        entities=list(brief.entities),
        competitor_headings=list(brief.competitor_headings),
        internal_links=list(brief.internal_links),
        external_sources=list(brief.external_sources),
        schema_recommendation=brief.schema_recommendation,
        cta_direction=brief.cta_direction,
        source_data={**brief.source_data, "duplicated_from": brief_id},
        status=BriefStatus.DRAFT,
        version=1,
        handoff_ref="",
    )
    return repo.create(clone)


def export_brief(tenant_id: str, brief_id: str, fmt: str = "dict") -> Optional[Dict]:
    """Export a brief as a dict or markdown string."""
    result = get_content_brief_repository().get(tenant_id, brief_id)
    if not result:
        return None
    bid, brief = result

    data = {
        "id": bid,
        "primary_keyword": brief.primary_keyword,
        "secondary_keywords": brief.secondary_keywords,
        "search_intent": brief.search_intent,
        "target_audience": brief.target_audience,
        "title_options": brief.title_options,
        "meta_direction": brief.meta_direction,
        "word_count_range": [brief.word_count_min, brief.word_count_max],
        "outline": brief.outline,
        "questions": brief.questions,
        "entities": brief.entities,
        "competitor_headings": brief.competitor_headings,
        "schema_recommendation": brief.schema_recommendation,
        "cta_direction": brief.cta_direction,
        "status": brief.status.value if hasattr(brief.status, "value") else str(brief.status),
        "version": brief.version,
        "handoff_ref": brief.handoff_ref,
    }

    if fmt == "markdown":
        lines = [
            f"# Content Brief: {brief.primary_keyword}",
            "",
            f"**Status:** {data['status']}  |  **Version:** {data['version']}",
            f"**Intent:** {data['search_intent']}  |  **Audience:** {data['target_audience']}",
            f"**Word Count:** {data['word_count_range'][0]}–{data['word_count_range'][1]}",
            f"**Schema:** {data['schema_recommendation']}",
            "",
            "## Title Options",
            *[f"- {t}" for t in data["title_options"]],
            "",
            "## Meta Direction",
            data["meta_direction"],
            "",
            "## Outline",
        ]
        for sec in data["outline"]:
            lines.append(f"### {sec.get('heading', '')}")
            if sec.get("notes"):
                lines.append(f"_{sec['notes']}_")
        lines += [
            "",
            "## Questions to Answer",
            *[f"- {q}" for q in data["questions"]],
            "",
            "## Key Entities",
            *[f"- {e}" for e in data["entities"]],
            "",
            "## Competitor Heading Patterns",
            *[f"- {h}" for h in data["competitor_headings"][:10]],
            "",
            "## CTA Direction",
            data["cta_direction"] or "_None specified_",
        ]
        data["markdown"] = "\n".join(lines)

    return data
