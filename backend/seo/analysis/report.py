"""Site-wide SEO report builder for Pixie SEO.

Public API
----------
build_report(tenant, crawl_job_id, site) -> Report

Reads persisted CrawledPage + SeoIssue rows, computes a deterministic overall
score and per-category scores, and persists a Report row.

Scoring Formula
---------------
The score is computed purely from the persisted issues (no fabricated metrics,
no AI, no external signals).

Base score: 100 (perfect site)

Each OPEN issue deducts a weighted penalty:
    CRITICAL  →  12 points
    HIGH      →   6 points
    MEDIUM    →   3 points
    LOW       →   1 point
    INFO      →   0 points (informational only, no deduction)

Total deduction is capped so the score never goes below 0.
Final score = max(0, 100 - total_deduction)

Per-category scores follow the same formula applied only to issues in that
category, with the base score of 100.

Properties:
- Deterministic: same input issues always produce the same score.
- Monotonic: adding more issues (or severer issues) can only decrease or
  maintain the score, never increase it.
- Transparent: the formula is fully documented here; no hidden weights.
- No fabricated data: CWV, traffic, impressions, etc. are never invented.
"""

from __future__ import annotations

import logging
from collections import defaultdict
from typing import Dict, List, Optional, Tuple

from seo.schemas import Severity
from seo.stores import (
    IssueStatus,
    Report,
    SeoIssue,
    get_report_repository,
    list_issues,
    list_pages,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Scoring weights — deduction per open issue by severity
# ---------------------------------------------------------------------------

_SEVERITY_DEDUCTION: Dict[Severity, int] = {
    Severity.CRITICAL: 12,
    Severity.HIGH:      6,
    Severity.MEDIUM:    3,
    Severity.LOW:       1,
    Severity.INFO:      0,
}

_SEVERITY_LABEL: Dict[str, Severity] = {s.value: s for s in Severity}


def _severity_of(issue: SeoIssue) -> Severity:
    """Return the Severity enum for an issue, coercing strings if needed."""
    sv = issue.severity
    if isinstance(sv, Severity):
        return sv
    if isinstance(sv, str):
        return _SEVERITY_LABEL.get(sv, Severity.INFO)
    return Severity.INFO


def _score_from_issues(issues: List[SeoIssue]) -> int:
    """Compute a 0–100 score from a list of open issues."""
    deduction = sum(
        _SEVERITY_DEDUCTION.get(_severity_of(iss), 0)
        for iss in issues
        if iss.status == IssueStatus.OPEN
           or (isinstance(iss.status, str) and iss.status == IssueStatus.OPEN.value)
    )
    return max(0, 100 - deduction)


def _count_by_severity(issues: List[SeoIssue]) -> Dict[str, int]:
    """Return a dict of severity -> count for OPEN issues."""
    counts: Dict[str, int] = {s.value: 0 for s in Severity}
    for iss in issues:
        if iss.status == IssueStatus.OPEN or (
            isinstance(iss.status, str) and iss.status == IssueStatus.OPEN.value
        ):
            sv = _severity_of(iss)
            counts[sv.value] = counts.get(sv.value, 0) + 1
    return counts


def _load_all_pages_count(tenant: str, crawl_job_id: str) -> int:
    """Return the total number of crawled pages for the job."""
    total, _ = list_pages(tenant, crawl_job_id, limit=1, offset=0)
    return total


def build_report(
    tenant: str,
    crawl_job_id: str,
    site,  # Site dataclass; site_id extracted below
) -> Report:
    """Compute and persist a Report for the completed crawl job.

    Parameters
    ----------
    tenant:
        Tenant identifier.
    crawl_job_id:
        The crawl job to report on.
    site:
        The Site dataclass (site_id extracted from it).

    Returns
    -------
    The persisted Report instance.

    Scoring is fully deterministic — see module docstring for the formula.
    No CWV, traffic, or any other fabricated metrics are included.
    """
    # Extract site_id from the Site object.
    site_id: str = ""
    for attr in ("site_id", "_site_id", "id"):
        site_id = getattr(site, attr, "") or ""
        if site_id:
            break

    # Load all persisted issues for this crawl job.
    all_issues: List[SeoIssue] = [
        iss for _, iss in list_issues(tenant, crawl_job_id=crawl_job_id)
    ]

    # ── Overall score ──────────────────────────────────────────────────────────
    overall_score = _score_from_issues(all_issues)

    # ── Per-category scores ────────────────────────────────────────────────────
    by_category: Dict[str, List[SeoIssue]] = defaultdict(list)
    for iss in all_issues:
        by_category[iss.category or "uncategorised"].append(iss)

    category_scores: Dict[str, int] = {
        cat: _score_from_issues(cat_issues)
        for cat, cat_issues in by_category.items()
    }

    # ── Issue counts by severity ───────────────────────────────────────────────
    issue_counts = _count_by_severity(all_issues)
    issue_counts["total"] = sum(
        1 for iss in all_issues
        if iss.status == IssueStatus.OPEN
        or (isinstance(iss.status, str) and iss.status == IssueStatus.OPEN.value)
    )

    # ── Page count (informational, never fabricated) ──────────────────────────
    total_pages = _load_all_pages_count(tenant, crawl_job_id)

    # ── Build and persist the Report row ─────────────────────────────────────
    report = Report(
        tenant_id=tenant,
        site_id=site_id,
        crawl_job_id=crawl_job_id,
        score=overall_score,
        category_scores=category_scores,
        issue_counts=issue_counts,
        export_metadata={
            "total_pages_analysed": total_pages,
            "formula_version": "1.0",
            "scoring": (
                "score = max(0, 100 - sum(deductions)); "
                "CRITICAL=12, HIGH=6, MEDIUM=3, LOW=1, INFO=0"
            ),
        },
    )

    repo = get_report_repository()
    try:
        _rpt_id, saved = repo.create(report)
        return saved
    except Exception as exc:
        logger.error("build_report: failed to persist report: %s", exc)
        return report
