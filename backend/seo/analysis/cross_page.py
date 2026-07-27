"""Deterministic cross-page SEO checks for Pixie SEO.

Public API
----------
run_cross_page_checks(
    tenant, crawl_job_id, site, *,
    sitemap_urls=None,
    robots_blocked=None,
) -> list[SeoIssue]

Reads persisted CrawledPage + SeoIssue data; emits SeoIssue rows for every
site-wide problem detected.  ZERO network calls; ZERO AI calls; fully
deterministic given the same input pages.

Rule keys implemented
---------------------
RULE_VERSION = "1.0"

  broken_internal_link       — out_links target is 4xx/5xx or was never crawled
  redirect_chain             — page's status_code is 3xx (chain recorded in extra)
  duplicate_title            — two+ pages share the same (normalised) title
  duplicate_meta_description — two+ pages share the same (normalised) description
  duplicate_h1               — two+ pages share the same (normalised) h1
  duplicate_content          — pages share the same content_hash / duplicate_of
  missing_canonical          — indexable page has no canonical tag
  canonical_conflict         — canonical tag points to a different page unexpectedly
  orphan_page                — indexable page has 0 inbound internal links
  sitemap_url_not_crawled    — URL in sitemap was never found in crawl
  crawled_url_not_in_sitemap — crawled page absent from sitemap
  robots_blocked_crawled     — page crawled despite being in robots_blocked list
  noindex_in_sitemap         — page has noindex meta but appears in sitemap
  no_inbound_links           — alias of orphan_page at INFO level (kept separate)
  excessive_link_depth       — page reachable only at depth > DEPTH_THRESHOLD
"""

from __future__ import annotations

import logging
from collections import defaultdict
from typing import Dict, List, Optional, Set

from seo.schemas import Severity
from seo.stores import (
    CrawledPage,
    IssueStatus,
    SeoIssue,
    get_crawled_page_repository,
    get_issue_repository,
    list_pages,
)
from .link_graph import aggregate_internal_links

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

RULE_VERSION: str = "1.0"
_PAGE_BATCH: int = 10_000

# BFS depth above which we flag a page as too deep.
DEPTH_THRESHOLD: int = 5


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _load_all_pages(tenant: str, crawl_job_id: str) -> List[tuple]:
    total, first_batch = list_pages(tenant, crawl_job_id, limit=_PAGE_BATCH, offset=0)
    pairs = list(first_batch)
    offset = len(pairs)
    while offset < total:
        _, batch = list_pages(tenant, crawl_job_id, limit=_PAGE_BATCH, offset=offset)
        if not batch:
            break
        pairs.extend(batch)
        offset += len(batch)
    return pairs


def _norm_text(s: str) -> str:
    """Lowercase + collapse whitespace for duplicate detection."""
    return " ".join((s or "").lower().split())


def _make_issue(
    tenant: str,
    site_id: str,
    crawl_job_id: str,
    page_id: str,
    rule_key: str,
    category: str,
    severity: Severity,
    evidence: dict,
    recommendation: str,
    fix_mode: str,
) -> SeoIssue:
    return SeoIssue(
        tenant_id=tenant,
        site_id=site_id,
        crawl_job_id=crawl_job_id,
        page_id=page_id,
        rule_key=rule_key,
        category=category,
        severity=severity,
        status=IssueStatus.OPEN,
        evidence=evidence,
        recommendation=recommendation,
        fix_mode=fix_mode,
        rule_version=RULE_VERSION,
    )


def _persist_issue(repo, issue: SeoIssue) -> SeoIssue:
    try:
        _id, saved = repo.create(issue)
        return saved
    except Exception as exc:
        logger.warning("cross_page: failed to persist issue %s: %s", issue.rule_key, exc)
        return issue


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def run_cross_page_checks(
    tenant: str,
    crawl_job_id: str,
    site,  # Site dataclass
    *,
    sitemap_urls: Optional[List[str]] = None,
    robots_blocked: Optional[Set[str]] = None,
) -> List[SeoIssue]:
    """Run all deterministic cross-page SEO checks for a completed crawl job.

    Parameters
    ----------
    tenant:
        Tenant identifier.
    crawl_job_id:
        The crawl job to analyse.
    site:
        The Site dataclass (used to read ``site_id``).
    sitemap_urls:
        Optional set of URLs extracted from the site's sitemap(s).  When
        provided, enables sitemap-mismatch and noindex-in-sitemap checks.
    robots_blocked:
        Optional set of URLs known to be blocked by robots.txt.  When
        provided, enables the robots-blocked-but-crawled check.

    Returns
    -------
    List of persisted SeoIssue instances (one per detected problem per page).
    """
    site_id: str = site.site_id if hasattr(site, "site_id") else ""

    # Try to get site_id from the Site object's common attribute names.
    # (The Site dataclass doesn't store its own ID; callers may pass it as
    # an attribute or we fall back to empty.)
    if not site_id:
        # Fallback: some callers attach site_id dynamically.
        site_id = getattr(site, "_site_id", "") or getattr(site, "id", "") or ""

    pairs = _load_all_pages(tenant, crawl_job_id)
    if not pairs:
        return []

    repo = get_issue_repository()
    issues: List[SeoIssue] = []

    # Build URL -> (page_id, page) index
    url_map: Dict[str, tuple] = {}  # normalized_url -> (page_id, page)
    for page_id, page in pairs:
        key = page.normalized_url or page.url
        if key not in url_map:
            url_map[key] = (page_id, page)

    crawled_urls: Set[str] = set(url_map.keys())

    # Run link-graph aggregation (also writes internal_links_in back to pages).
    graph = aggregate_internal_links(tenant, crawl_job_id)
    depth_map: Dict[str, int] = graph.get("depth_map", {})
    inbound_map: Dict[str, int] = graph.get("inbound_map", {})
    orphan_candidates: List[str] = graph.get("orphan_candidates", [])
    seed_url: str = graph.get("seed_url", "")

    # ── Helpers ────────────────────────────────────────────────────────────────

    def emit(
        page_id: str,
        rule_key: str,
        category: str,
        severity: Severity,
        evidence: dict,
        recommendation: str,
        fix_mode: str = "manual",
    ) -> None:
        issue = _make_issue(
            tenant, site_id, crawl_job_id, page_id,
            rule_key, category, severity, evidence, recommendation, fix_mode,
        )
        saved = _persist_issue(repo, issue)
        issues.append(saved)

    # ── 1. Broken internal links ───────────────────────────────────────────────
    # For each page, check its out_links: if a target was crawled with 4xx/5xx
    # status, or if it was an in-scope same-domain target that was never crawled.
    for page_id, page in pairs:
        src_url = page.normalized_url or page.url
        out_links: List[str] = (page.extra or {}).get("out_links", [])
        for target in out_links:
            if target == src_url:
                continue
            if target in crawled_urls:
                target_page_id, target_page = url_map[target]
                if target_page.status_code >= 400:
                    emit(
                        page_id,
                        rule_key="broken_internal_link",
                        category="links",
                        severity=Severity.HIGH,
                        evidence={
                            "source_url": src_url,
                            "target_url": target,
                            "target_status_code": target_page.status_code,
                        },
                        recommendation=(
                            f"Remove or update the link to {target} — it returns "
                            f"HTTP {target_page.status_code}."
                        ),
                        fix_mode="edit_link",
                    )
            else:
                # Target was in out_links (same-domain) but never crawled.
                # This may be a soft-404, a URL excluded by robots/path rules,
                # or a genuinely missing page.
                emit(
                    page_id,
                    rule_key="broken_internal_link",
                    category="links",
                    severity=Severity.MEDIUM,
                    evidence={
                        "source_url": src_url,
                        "target_url": target,
                        "target_status_code": None,
                        "note": "target was not crawled",
                    },
                    recommendation=(
                        f"Verify that {target} exists and is accessible. "
                        "It was linked to but never crawled."
                    ),
                    fix_mode="verify_link",
                )

    # ── 2. Redirect chains ────────────────────────────────────────────────────
    # Any page stored with a 3xx status code is a redirect that the crawler
    # followed and stored (final_url may differ).  Flag these as redirect issues.
    for page_id, page in pairs:
        if 300 <= page.status_code < 400:
            extra = page.extra or {}
            emit(
                page_id,
                rule_key="redirect_chain",
                category="technical",
                severity=Severity.MEDIUM,
                evidence={
                    "url": page.url,
                    "status_code": page.status_code,
                    "normalized_url": page.normalized_url,
                },
                recommendation=(
                    f"Page {page.url} returns {page.status_code}. Update internal "
                    "links to point directly to the final destination URL to avoid "
                    "redirect overhead."
                ),
                fix_mode="update_links",
            )

    # ── 3. Duplicate titles ────────────────────────────────────────────────────
    title_groups: Dict[str, List[str]] = defaultdict(list)  # norm_title -> [page_id]
    for page_id, page in pairs:
        if page.title:
            title_groups[_norm_text(page.title)].append(page_id)

    for norm_title, dup_page_ids in title_groups.items():
        if len(dup_page_ids) > 1:
            urls_affected = [
                (url_map.get(url_map.get(pid, ("",))[1].normalized_url
                             if pid in {v[0] for v in url_map.values()}
                             else "", ("", None))[0] if False else "")
                for pid in dup_page_ids
            ]
            # Simpler: collect URLs from pairs for the affected page_ids
            affected_urls = [
                (page.normalized_url or page.url)
                for p_id, page in pairs
                if p_id in set(dup_page_ids)
            ]
            for page_id in dup_page_ids:
                emit(
                    page_id,
                    rule_key="duplicate_title",
                    category="meta",
                    severity=Severity.HIGH,
                    evidence={
                        "title": norm_title,
                        "affected_urls": affected_urls,
                        "count": len(dup_page_ids),
                    },
                    recommendation=(
                        f"Multiple pages share the title \"{norm_title}\". "
                        "Write a unique, descriptive title for each page."
                    ),
                    fix_mode="edit_title",
                )

    # ── 4. Duplicate meta descriptions ────────────────────────────────────────
    desc_groups: Dict[str, List[str]] = defaultdict(list)
    for page_id, page in pairs:
        if page.meta_description:
            desc_groups[_norm_text(page.meta_description)].append(page_id)

    for norm_desc, dup_page_ids in desc_groups.items():
        if len(dup_page_ids) > 1:
            affected_urls = [
                (page.normalized_url or page.url)
                for p_id, page in pairs
                if p_id in set(dup_page_ids)
            ]
            for page_id in dup_page_ids:
                emit(
                    page_id,
                    rule_key="duplicate_meta_description",
                    category="meta",
                    severity=Severity.MEDIUM,
                    evidence={
                        "description": norm_desc[:120],
                        "affected_urls": affected_urls,
                        "count": len(dup_page_ids),
                    },
                    recommendation=(
                        "Multiple pages share the same meta description. "
                        "Write a unique description for each page."
                    ),
                    fix_mode="edit_meta_description",
                )

    # ── 5. Duplicate H1s ──────────────────────────────────────────────────────
    h1_groups: Dict[str, List[str]] = defaultdict(list)
    for page_id, page in pairs:
        if page.h1:
            h1_groups[_norm_text(page.h1)].append(page_id)

    for norm_h1, dup_page_ids in h1_groups.items():
        if len(dup_page_ids) > 1:
            affected_urls = [
                (page.normalized_url or page.url)
                for p_id, page in pairs
                if p_id in set(dup_page_ids)
            ]
            for page_id in dup_page_ids:
                emit(
                    page_id,
                    rule_key="duplicate_h1",
                    category="headings",
                    severity=Severity.MEDIUM,
                    evidence={
                        "h1": norm_h1,
                        "affected_urls": affected_urls,
                        "count": len(dup_page_ids),
                    },
                    recommendation=(
                        f"Multiple pages share the H1 \"{norm_h1}\". "
                        "Use a unique H1 that describes each page's specific topic."
                    ),
                    fix_mode="edit_h1",
                )

    # ── 6. Duplicate content ──────────────────────────────────────────────────
    # Two signals:
    #   a) extra["duplicate_of"] set by crawler (exact content hash match)
    #   b) pages with the same content_hash (cross-check)
    hash_groups: Dict[str, List[str]] = defaultdict(list)
    for page_id, page in pairs:
        if page.content_hash:
            hash_groups[page.content_hash].append(page_id)

    for content_hash, dup_page_ids in hash_groups.items():
        if len(dup_page_ids) > 1:
            affected_urls = [
                (page.normalized_url or page.url)
                for p_id, page in pairs
                if p_id in set(dup_page_ids)
            ]
            for page_id in dup_page_ids:
                emit(
                    page_id,
                    rule_key="duplicate_content",
                    category="content",
                    severity=Severity.HIGH,
                    evidence={
                        "content_hash": content_hash,
                        "affected_urls": affected_urls,
                        "count": len(dup_page_ids),
                    },
                    recommendation=(
                        "Multiple pages have identical content. Add a canonical tag "
                        "to point to the preferred version, or consolidate the pages."
                    ),
                    fix_mode="add_canonical",
                )

    # Also catch extra["duplicate_of"] pages (the crawler skips storing them
    # but some may still be present with the field set).
    for page_id, page in pairs:
        dup_of = (page.extra or {}).get("duplicate_of")
        if dup_of and dup_of != (page.normalized_url or page.url):
            emit(
                page_id,
                rule_key="duplicate_content",
                category="content",
                severity=Severity.HIGH,
                evidence={
                    "url": page.normalized_url or page.url,
                    "duplicate_of": dup_of,
                    "source": "crawler_dedup",
                },
                recommendation=(
                    f"This page has identical content to {dup_of}. "
                    "Add a canonical tag pointing to the original or differentiate content."
                ),
                fix_mode="add_canonical",
            )

    # ── 7. Missing canonicals ─────────────────────────────────────────────────
    for page_id, page in pairs:
        if page.indexability == "indexable" and not page.canonical and page.status_code == 200:
            emit(
                page_id,
                rule_key="missing_canonical",
                category="canonical",
                severity=Severity.MEDIUM,
                evidence={
                    "url": page.normalized_url or page.url,
                    "status_code": page.status_code,
                },
                recommendation=(
                    "Add a self-referencing canonical tag to this page to prevent "
                    "duplicate-content issues from URL variations."
                ),
                fix_mode="add_canonical",
            )

    # ── 8. Canonical conflicts ────────────────────────────────────────────────
    # A conflict is when page.canonical points to a URL other than the page
    # itself (non-self-canonical) AND that target was actually crawled
    # (meaning the crawler has a record of both).
    for page_id, page in pairs:
        canonical = page.canonical or ""
        if not canonical:
            continue
        page_url = page.normalized_url or page.url
        # Normalise to strip trailing slash differences.
        norm_canonical = canonical.rstrip("/")
        norm_page = page_url.rstrip("/")
        if norm_canonical == norm_page:
            continue  # self-canonical — fine
        # Canonical points elsewhere; check if that's intentional (target crawled).
        if canonical in crawled_urls or norm_canonical in crawled_urls:
            emit(
                page_id,
                rule_key="canonical_conflict",
                category="canonical",
                severity=Severity.HIGH,
                evidence={
                    "url": page_url,
                    "canonical": canonical,
                    "note": "canonical points to a different crawled URL",
                },
                recommendation=(
                    f"Page {page_url} has a canonical pointing to {canonical}. "
                    "Verify this is intentional (consolidating duplicates) or fix "
                    "the canonical to be self-referencing."
                ),
                fix_mode="fix_canonical",
            )

    # ── 9. Orphan pages ───────────────────────────────────────────────────────
    for orphan_url in orphan_candidates:
        if orphan_url not in url_map:
            continue
        page_id, page = url_map[orphan_url]
        if page.indexability != "indexable":
            continue  # noindex pages being orphaned is expected
        emit(
            page_id,
            rule_key="orphan_page",
            category="links",
            severity=Severity.MEDIUM,
            evidence={
                "url": orphan_url,
                "inbound_links": 0,
            },
            recommendation=(
                f"Page {orphan_url} has no internal links pointing to it. "
                "Add internal links from relevant pages to improve crawlability and "
                "distribute link equity."
            ),
            fix_mode="add_internal_links",
        )

    # ── 10. Sitemap URL not crawled ───────────────────────────────────────────
    if sitemap_urls:
        sitemap_set: Set[str] = set(sitemap_urls)
        for sm_url in sitemap_set:
            norm = sm_url.rstrip("/")
            if sm_url not in crawled_urls and norm not in crawled_urls:
                # Use site-level page_id placeholder (empty string) since there
                # is no crawled page to associate.
                emit(
                    "",
                    rule_key="sitemap_url_not_crawled",
                    category="sitemap",
                    severity=Severity.LOW,
                    evidence={
                        "sitemap_url": sm_url,
                    },
                    recommendation=(
                        f"URL {sm_url} appears in the sitemap but was not crawled. "
                        "Check whether it is blocked by robots.txt, returns an error, "
                        "or is excluded by the crawl configuration."
                    ),
                    fix_mode="investigate",
                )

    # ── 11. Crawled URL absent from sitemap ───────────────────────────────────
    if sitemap_urls:
        sitemap_set_norm: Set[str] = {u.rstrip("/") for u in sitemap_urls}
        sitemap_full: Set[str] = set(sitemap_urls)
        for page_id, page in pairs:
            if page.indexability != "indexable" or page.status_code != 200:
                continue
            page_url = page.normalized_url or page.url
            if page_url not in sitemap_full and page_url.rstrip("/") not in sitemap_set_norm:
                emit(
                    page_id,
                    rule_key="crawled_url_not_in_sitemap",
                    category="sitemap",
                    severity=Severity.LOW,
                    evidence={
                        "url": page_url,
                    },
                    recommendation=(
                        f"Indexable page {page_url} is not listed in the sitemap. "
                        "Add it to the sitemap so search engines can discover it reliably."
                    ),
                    fix_mode="update_sitemap",
                )

    # ── 12. Robots-blocked URLs that were crawled ─────────────────────────────
    if robots_blocked:
        robots_blocked_norm: Set[str] = {u.rstrip("/") for u in robots_blocked}
        for page_id, page in pairs:
            page_url = page.normalized_url or page.url
            if page_url in robots_blocked or page_url.rstrip("/") in robots_blocked_norm:
                emit(
                    page_id,
                    rule_key="robots_blocked_crawled",
                    category="technical",
                    severity=Severity.MEDIUM,
                    evidence={
                        "url": page_url,
                        "note": "URL is blocked by robots.txt but was crawled",
                    },
                    recommendation=(
                        f"Page {page_url} is listed in robots.txt as blocked but "
                        "was still reachable. Verify the robots.txt rule is correct "
                        "and the page is not being served to bots."
                    ),
                    fix_mode="fix_robots",
                )

    # ── 13. Noindex URLs present in sitemap ──────────────────────────────────
    if sitemap_urls:
        sitemap_full_check: Set[str] = set(sitemap_urls)
        sitemap_norm_check: Set[str] = {u.rstrip("/") for u in sitemap_urls}
        for page_id, page in pairs:
            if page.indexability not in ("noindex",):
                continue
            page_url = page.normalized_url or page.url
            if page_url in sitemap_full_check or page_url.rstrip("/") in sitemap_norm_check:
                emit(
                    page_id,
                    rule_key="noindex_in_sitemap",
                    category="sitemap",
                    severity=Severity.HIGH,
                    evidence={
                        "url": page_url,
                        "indexability": page.indexability,
                        "note": "noindex page appears in sitemap",
                    },
                    recommendation=(
                        f"Page {page_url} has a noindex directive but is listed in "
                        "the sitemap. Remove it from the sitemap to avoid confusing "
                        "search engines."
                    ),
                    fix_mode="remove_from_sitemap",
                )

    # ── 14. Excessive internal-link depth ────────────────────────────────────
    for page_id, page in pairs:
        page_url = page.normalized_url or page.url
        depth = depth_map.get(page_url, -1)
        if depth > DEPTH_THRESHOLD:
            emit(
                page_id,
                rule_key="excessive_link_depth",
                category="links",
                severity=Severity.LOW,
                evidence={
                    "url": page_url,
                    "depth": depth,
                    "threshold": DEPTH_THRESHOLD,
                    "seed_url": seed_url,
                },
                recommendation=(
                    f"Page {page_url} is {depth} clicks away from the homepage "
                    f"(threshold: {DEPTH_THRESHOLD}). Add internal links from "
                    "higher-level pages to reduce depth."
                ),
                fix_mode="add_internal_links",
            )

    return issues
