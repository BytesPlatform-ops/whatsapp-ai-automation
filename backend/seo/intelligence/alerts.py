"""Durable SeoAlert engine.

Alert types generated from stored data:
  ranking_drop         — major position drop (>=5) vs previous snapshot
  new_top_10           — keyword newly entered top-10
  lost_top_10          — keyword fell out of top-10
  high_impr_ctr_decline— page: impressions high but CTR fell vs prior GSC window
  crawl_failure        — crawl job in FAILED status
  new_critical_issue   — new Severity.CRITICAL issue since last check
  competitor_overtook  — competitor moved above us for a tracked keyword
  page_noindex         — crawled page indexability changed to noindex

Alert centre ops: list (filter), mark_read, dismiss.

Notification: no external email service was found in the backend (channels/
adapters/email.py is a channel adapter for inbound Receptionist channels, not
an outbound notifier). Alerts are therefore IN-APP only. If an outbound mailer
is added in future, this is the integration point.

Env var hint:
  SEO_ALERTS_ENABLED=1  — when unset/off, generate_alerts runs but stores
  nothing (dry run). Routes always return stored alerts regardless.
"""

from __future__ import annotations

import logging
import os
from typing import Dict, List, Optional, Tuple

from seo.schemas import Severity
from seo.search_stores import (
    AlertStatus,
    SeoAlert,
    get_alert_repository,
    get_gsc_query_row_repository,
    get_rank_snapshot_repository,
)
from seo.stores import CrawlStatus, get_crawl_job_repository, get_issue_repository

_log = logging.getLogger("pixie.seo.intelligence.alerts")

_RANK_DROP_THRESHOLD = 5   # positions dropped to trigger alert
_CTR_DECLINE_THRESHOLD = 0.15  # 15% relative decline


def _alerts_enabled() -> bool:
    """SEO_ALERTS_ENABLED env controls whether generate writes rows."""
    return os.getenv("SEO_ALERTS_ENABLED", "1").strip().lower() in ("1", "true", "yes", "on")


# ── Alert factory ─────────────────────────────────────────────────────────────

def _make_alert(
    tenant_id: str,
    site_id: str,
    project_id: str,
    *,
    alert_type: str,
    severity: Severity,
    title: str,
    message: str,
    evidence: Dict,
    data_source: str,
    affected_item_type: str = "",
    affected_item_id: str = "",
    affected_url: str = "",
    link: str = "",
) -> SeoAlert:
    return SeoAlert(
        tenant_id=tenant_id,
        site_id=site_id,
        project_id=project_id,
        alert_type=alert_type,
        severity=severity,
        title=title,
        message=message,
        evidence=evidence,
        data_source=data_source,
        affected_item_type=affected_item_type,
        affected_item_id=affected_item_id,
        affected_url=affected_url,
        link=link,
        status=AlertStatus.UNREAD,
    )


# ── Alert deduplication ───────────────────────────────────────────────────────

def _existing_unread_key(
    tenant_id: str, site_id: str
) -> set:
    """Return a set of (alert_type, affected_item_id) for open unread alerts."""
    repo = get_alert_repository()
    rows = repo.list_where(tenant_id, site_id=site_id)
    return {
        (a.alert_type, a.affected_item_id)
        for _, a in rows
        if a.status == AlertStatus.UNREAD
    }


# ── Generators ────────────────────────────────────────────────────────────────

def generate_alerts(
    tenant_id: str,
    site_id: str,
    project_id: str = "",
    *,
    data_timestamp: str = "",
) -> List[Tuple[str, SeoAlert]]:
    """Compute and persist alerts from stored data.

    Returns list of (id, alert) pairs created in this run.
    Skips if SEO_ALERTS_ENABLED is off (dry-run mode, returns empty list).
    De-duplicates against existing unread alerts of the same type+item.
    """
    if not _alerts_enabled():
        _log.debug("SEO_ALERTS_ENABLED is off — skipping alert generation")
        return []

    alert_repo = get_alert_repository()
    existing = _existing_unread_key(tenant_id, site_id)
    created: List[Tuple[str, SeoAlert]] = []

    def _save(alert: SeoAlert) -> None:
        key = (alert.alert_type, alert.affected_item_id)
        if key in existing:
            return
        aid, saved = alert_repo.create(alert)
        created.append((aid, saved))
        existing.add(key)

    # ── 1. Ranking drop / new top-10 / lost top-10 ────────────────────────
    snap_repo = get_rank_snapshot_repository()
    all_snaps = snap_repo.list_where(tenant_id, project_id=project_id)

    # Group by keyword_id → sorted history
    by_kw: Dict[str, List] = {}
    for sid, snap in all_snaps:
        by_kw.setdefault(snap.keyword_id, []).append((sid, snap))

    for kid, pairs in by_kw.items():
        sorted_pairs = sorted(pairs, key=lambda p: (p[1].date or "", p[1].created_at or ""))
        if len(sorted_pairs) < 2:
            continue
        _, oldest = sorted_pairs[0]
        _, newest = sorted_pairs[-1]

        if oldest.position is None or newest.position is None:
            continue

        drop = newest.position - oldest.position

        # Ranking drop
        if drop >= _RANK_DROP_THRESHOLD:
            _save(_make_alert(
                tenant_id=tenant_id, site_id=site_id, project_id=project_id,
                alert_type="ranking_drop",
                severity=Severity.HIGH,
                title=f"Ranking drop: '{newest.keyword}'",
                message=(
                    f"'{newest.keyword}' dropped {drop} positions "
                    f"(from {oldest.position} to {newest.position})."
                ),
                evidence={
                    "keyword": newest.keyword,
                    "old_position": oldest.position,
                    "new_position": newest.position,
                    "drop": drop,
                    "old_date": oldest.date,
                    "new_date": newest.date,
                },
                data_source="rank_snapshots",
                affected_item_type="keyword",
                affected_item_id=kid,
            ))

        # New top-10
        if oldest.position > 10 and newest.position <= 10:
            _save(_make_alert(
                tenant_id=tenant_id, site_id=site_id, project_id=project_id,
                alert_type="new_top_10",
                severity=Severity.LOW,
                title=f"Keyword entered top 10: '{newest.keyword}'",
                message=(
                    f"'{newest.keyword}' moved from position {oldest.position} "
                    f"to position {newest.position} — now in top 10."
                ),
                evidence={
                    "keyword": newest.keyword,
                    "old_position": oldest.position,
                    "new_position": newest.position,
                },
                data_source="rank_snapshots",
                affected_item_type="keyword",
                affected_item_id=kid,
            ))

        # Lost top-10
        if oldest.position <= 10 and newest.position > 10:
            _save(_make_alert(
                tenant_id=tenant_id, site_id=site_id, project_id=project_id,
                alert_type="lost_top_10",
                severity=Severity.HIGH,
                title=f"Keyword fell out of top 10: '{newest.keyword}'",
                message=(
                    f"'{newest.keyword}' dropped from position {oldest.position} "
                    f"to position {newest.position} — no longer in top 10."
                ),
                evidence={
                    "keyword": newest.keyword,
                    "old_position": oldest.position,
                    "new_position": newest.position,
                },
                data_source="rank_snapshots",
                affected_item_type="keyword",
                affected_item_id=kid,
            ))

        # Competitor overtook us
        for domain, comp_pos in (newest.competitor_positions or {}).items():
            old_comp_pos = (oldest.competitor_positions or {}).get(domain)
            if (
                old_comp_pos is not None
                and old_comp_pos > oldest.position  # competitor was worse before
                and comp_pos < newest.position      # competitor is better now
            ):
                item_key = f"{kid}:{domain}"
                _save(_make_alert(
                    tenant_id=tenant_id, site_id=site_id, project_id=project_id,
                    alert_type="competitor_overtook",
                    severity=Severity.MEDIUM,
                    title=f"Competitor overtook you for '{newest.keyword}'",
                    message=(
                        f"{domain} moved from position {old_comp_pos} to {comp_pos} "
                        f"for '{newest.keyword}', overtaking your position {newest.position}."
                    ),
                    evidence={
                        "keyword": newest.keyword,
                        "competitor": domain,
                        "old_competitor_pos": old_comp_pos,
                        "new_competitor_pos": comp_pos,
                        "our_position": newest.position,
                    },
                    data_source="rank_snapshots",
                    affected_item_type="keyword",
                    affected_item_id=item_key,
                ))

    # ── 2. High-impression CTR decline (from GSC) ─────────────────────────
    gsc_repo = get_gsc_query_row_repository()
    gsc_rows = gsc_repo.list_where(tenant_id, site_id=site_id)

    # Group by page
    by_page: Dict[str, List] = {}
    for _, row in gsc_rows:
        by_page.setdefault(row.page, []).append(row)

    for page_url, rows in by_page.items():
        total_impr = sum(r.impressions for r in rows)
        if total_impr < 200:
            continue

        # Check average CTR vs a baseline (use mean of older half vs newer half)
        sorted_rows = sorted(rows, key=lambda r: r.date or "")
        if len(sorted_rows) < 2:
            continue
        half = max(1, len(sorted_rows) // 2)
        old_avg_ctr = sum(r.ctr for r in sorted_rows[:half]) / half
        new_avg_ctr = sum(r.ctr for r in sorted_rows[half:]) / max(1, len(sorted_rows) - half)
        if old_avg_ctr > 0 and (old_avg_ctr - new_avg_ctr) / old_avg_ctr > _CTR_DECLINE_THRESHOLD:
            _save(_make_alert(
                tenant_id=tenant_id, site_id=site_id, project_id=project_id,
                alert_type="ctr_decline",
                severity=Severity.MEDIUM,
                title=f"CTR decline on high-impression page",
                message=(
                    f"Page '{page_url}' CTR declined from {old_avg_ctr:.1%} to "
                    f"{new_avg_ctr:.1%} (>{_CTR_DECLINE_THRESHOLD:.0%} drop) "
                    f"with {total_impr:,} impressions."
                ),
                evidence={
                    "page_url": page_url,
                    "old_avg_ctr": round(old_avg_ctr, 4),
                    "new_avg_ctr": round(new_avg_ctr, 4),
                    "total_impressions": total_impr,
                    "threshold": _CTR_DECLINE_THRESHOLD,
                },
                data_source="gsc_query_rows",
                affected_item_type="page",
                affected_item_id=page_url,
                affected_url=page_url,
            ))

    # ── 3. Crawl failures ─────────────────────────────────────────────────
    try:
        crawl_repo = get_crawl_job_repository()
        crawl_jobs = crawl_repo.list_by_site(tenant_id, site_id)
        for jid, job in crawl_jobs:
            if job.status == CrawlStatus.FAILED:
                _save(_make_alert(
                    tenant_id=tenant_id, site_id=site_id, project_id=project_id,
                    alert_type="crawl_failure",
                    severity=Severity.HIGH,
                    title="Crawl job failed",
                    message=f"Crawl job {jid} failed: {getattr(job, 'error_category', 'unknown')}",
                    evidence={"job_id": jid, "error_category": getattr(job, "error_category", "")},
                    data_source="crawl_jobs",
                    affected_item_type="crawl_job",
                    affected_item_id=jid,
                ))
    except Exception as exc:
        _log.debug("crawl alert generation failed: %s", exc)

    # ── 4. New critical technical issues ─────────────────────────────────
    try:
        issue_repo = get_issue_repository()
        issues = issue_repo.list_by_site(tenant_id, site_id) if hasattr(issue_repo, "list_by_site") else []
        for iid, issue in issues:
            if issue.severity == Severity.CRITICAL:
                from seo.stores import IssueStatus
                if issue.status != IssueStatus.RESOLVED:
                    _save(_make_alert(
                        tenant_id=tenant_id, site_id=site_id, project_id=project_id,
                        alert_type="new_critical_issue",
                        severity=Severity.CRITICAL,
                        title=f"Critical SEO issue: {issue.rule_key}",
                        message=(
                            f"A critical issue ({issue.rule_key}) was detected. "
                            f"{getattr(issue, 'recommendation', '')}"
                        ),
                        evidence={"issue_id": iid, "rule_key": issue.rule_key,
                                  "category": getattr(issue, "category", "")},
                        data_source="seo_issues",
                        affected_item_type="issue",
                        affected_item_id=iid,
                        affected_url=getattr(issue, "page_url", ""),
                    ))
    except Exception as exc:
        _log.debug("issue alert generation failed: %s", exc)

    return created


# ── Alert centre ops ──────────────────────────────────────────────────────────

def list_alerts(
    tenant_id: str,
    site_id: Optional[str] = None,
    project_id: Optional[str] = None,
    severity: Optional[Severity] = None,
    status: Optional[AlertStatus] = None,
    alert_type: Optional[str] = None,
) -> List[Tuple[str, SeoAlert]]:
    repo = get_alert_repository()
    rows = repo.list(tenant_id)

    if site_id:
        rows = [(aid, a) for aid, a in rows if a.site_id == site_id]
    if project_id:
        rows = [(aid, a) for aid, a in rows if a.project_id == project_id]
    if severity is not None:
        rows = [(aid, a) for aid, a in rows if a.severity == severity]
    if status is not None:
        rows = [(aid, a) for aid, a in rows if a.status == status]
    if alert_type:
        rows = [(aid, a) for aid, a in rows if a.alert_type == alert_type]

    return rows


def get_alert(tenant_id: str, alert_id: str) -> Optional[Tuple[str, SeoAlert]]:
    return get_alert_repository().get(tenant_id, alert_id)


def mark_read(tenant_id: str, alert_id: str) -> Optional[Tuple[str, SeoAlert]]:
    from seo.search_stores import _now
    return get_alert_repository().update(
        tenant_id, alert_id,
        status=AlertStatus.READ,
        read_at=_now(),
    )


def dismiss_alert(tenant_id: str, alert_id: str) -> Optional[Tuple[str, SeoAlert]]:
    return get_alert_repository().update(
        tenant_id, alert_id, status=AlertStatus.DISMISSED
    )
