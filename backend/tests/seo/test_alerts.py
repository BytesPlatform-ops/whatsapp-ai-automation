"""Tests for seo.intelligence.alerts.

Covers:
  - Alert generation from stored rank snapshots, GSC, crawl jobs, issues
  - Deduplication of open alerts
  - mark_read / dismiss lifecycle
  - Cross-tenant isolation
  - SEO_ALERTS_ENABLED=0 skips generation
"""

import os
import pytest

from seo.intelligence.alerts import (
    dismiss_alert,
    generate_alerts,
    get_alert,
    list_alerts,
    mark_read,
)
from seo.schemas import Severity
from seo.search_stores import (
    AlertStatus,
    GscQueryRow,
    Keyword,
    RankSnapshot,
    TrackingStatus,
    get_alert_repository,
    get_gsc_query_row_repository,
    get_keyword_repository,
    get_rank_snapshot_repository,
    reset_repositories,
)
from seo.stores import (
    CrawlJob,
    CrawlStatus,
    CrawlType,
    SeoIssue,
    IssueStatus,
    get_crawl_job_repository,
    get_issue_repository,
    reset_repositories as reset_stores,
)

TENANT  = "test_tenant_alerts"
OTHER   = "other_tenant_alerts"
SITE    = "site_alert_001"
PROJECT = "proj_alert_001"


@pytest.fixture(autouse=True)
def clean():
    reset_repositories()
    reset_stores()
    os.environ.pop("SEO_ALERTS_ENABLED", None)
    yield
    reset_repositories()
    reset_stores()
    os.environ.pop("SEO_ALERTS_ENABLED", None)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _seed_keyword(name, volume=1000):
    repo = get_keyword_repository()
    kw = Keyword(
        tenant_id=TENANT, project_id=PROJECT, keyword=name,
        search_volume=volume, tracking_status=TrackingStatus.TRACKED,
    )
    kid, _ = repo.create(kw)
    return kid


def _seed_snap(kid, keyword, *, pos, comp_pos=None, date="2026-01-15", prev_pos=None):
    repo = get_rank_snapshot_repository()
    snap = RankSnapshot(
        tenant_id=TENANT, project_id=PROJECT,
        keyword_id=kid, keyword=keyword,
        date=date, position=pos, previous_position=prev_pos,
        competitor_positions=comp_pos or {},
        ranking_url="https://ex.com/" + keyword.replace(" ", "-"),
    )
    sid, saved = repo.create(snap)
    return sid, saved


def _seed_gsc_row(query, page, impressions, ctr, date="2026-01-10"):
    repo = get_gsc_query_row_repository()
    row = GscQueryRow(
        tenant_id=TENANT, property_id="prop1", site_id=SITE,
        date=date, query=query, page=page,
        clicks=int(impressions * ctr), impressions=impressions, ctr=ctr, position=5.0,
    )
    return repo.create(row)


# ── Ranking drop ──────────────────────────────────────────────────────────────

def test_ranking_drop_alert_generated():
    kid = _seed_keyword("seo tool", 3000)
    repo = get_rank_snapshot_repository()
    # First snapshot: position 4
    repo.create(RankSnapshot(
        tenant_id=TENANT, project_id=PROJECT, keyword_id=kid, keyword="seo tool",
        date="2026-01-01", position=4, ranking_url="https://ex.com/seo-tool",
    ))
    # Second snapshot: position 12 (drop of 8)
    repo.create(RankSnapshot(
        tenant_id=TENANT, project_id=PROJECT, keyword_id=kid, keyword="seo tool",
        date="2026-01-15", position=12, ranking_url="https://ex.com/seo-tool",
    ))

    alerts = generate_alerts(TENANT, SITE, PROJECT)
    drops = [a for _, a in alerts if a.alert_type == "ranking_drop"]
    assert len(drops) >= 1
    assert drops[0].severity == Severity.HIGH
    assert drops[0].evidence["drop"] == 8


def test_no_ranking_drop_alert_for_small_drop():
    kid = _seed_keyword("small drop kw")
    repo = get_rank_snapshot_repository()
    repo.create(RankSnapshot(
        tenant_id=TENANT, project_id=PROJECT, keyword_id=kid, keyword="small drop kw",
        date="2026-01-01", position=5, ranking_url="https://ex.com/s",
    ))
    repo.create(RankSnapshot(
        tenant_id=TENANT, project_id=PROJECT, keyword_id=kid, keyword="small drop kw",
        date="2026-01-10", position=7, ranking_url="https://ex.com/s",  # drop=2, below threshold
    ))

    alerts = generate_alerts(TENANT, SITE, PROJECT)
    drops = [a for _, a in alerts if a.alert_type == "ranking_drop"]
    assert len(drops) == 0


# ── New / lost top-10 ─────────────────────────────────────────────────────────

def test_new_top_10_alert_generated():
    kid = _seed_keyword("rising kw")
    repo = get_rank_snapshot_repository()
    repo.create(RankSnapshot(
        tenant_id=TENANT, project_id=PROJECT, keyword_id=kid, keyword="rising kw",
        date="2026-01-01", position=15, ranking_url="https://ex.com/r",
    ))
    repo.create(RankSnapshot(
        tenant_id=TENANT, project_id=PROJECT, keyword_id=kid, keyword="rising kw",
        date="2026-01-15", position=8, ranking_url="https://ex.com/r",
    ))

    alerts = generate_alerts(TENANT, SITE, PROJECT)
    new_top = [a for _, a in alerts if a.alert_type == "new_top_10"]
    assert len(new_top) >= 1
    assert new_top[0].severity == Severity.LOW


def test_lost_top_10_alert_generated():
    kid = _seed_keyword("falling kw")
    repo = get_rank_snapshot_repository()
    repo.create(RankSnapshot(
        tenant_id=TENANT, project_id=PROJECT, keyword_id=kid, keyword="falling kw",
        date="2026-01-01", position=6, ranking_url="https://ex.com/f",
    ))
    repo.create(RankSnapshot(
        tenant_id=TENANT, project_id=PROJECT, keyword_id=kid, keyword="falling kw",
        date="2026-01-15", position=15, ranking_url="https://ex.com/f",
    ))

    alerts = generate_alerts(TENANT, SITE, PROJECT)
    lost = [a for _, a in alerts if a.alert_type == "lost_top_10"]
    assert len(lost) >= 1
    assert lost[0].severity == Severity.HIGH


# ── Competitor overtook ───────────────────────────────────────────────────────

def test_competitor_overtook_alert_generated():
    kid = _seed_keyword("contested kw")
    repo = get_rank_snapshot_repository()
    # We were at 5; competitor was at 8 (worse)
    repo.create(RankSnapshot(
        tenant_id=TENANT, project_id=PROJECT, keyword_id=kid, keyword="contested kw",
        date="2026-01-01", position=5,
        competitor_positions={"rival.com": 8},
    ))
    # Now competitor is at 3 (better than our 5)
    repo.create(RankSnapshot(
        tenant_id=TENANT, project_id=PROJECT, keyword_id=kid, keyword="contested kw",
        date="2026-01-15", position=5,
        competitor_positions={"rival.com": 3},
    ))

    alerts = generate_alerts(TENANT, SITE, PROJECT)
    overtook = [a for _, a in alerts if a.alert_type == "competitor_overtook"]
    assert len(overtook) >= 1
    assert overtook[0].severity == Severity.MEDIUM
    assert "rival.com" in overtook[0].evidence["competitor"]


# ── CTR decline ───────────────────────────────────────────────────────────────

def test_ctr_decline_alert_generated():
    repo = get_gsc_query_row_repository()
    page = "https://ex.com/decline"
    # Old rows with good CTR
    for date in ["2026-01-01", "2026-01-02", "2026-01-03"]:
        repo.create(GscQueryRow(
            tenant_id=TENANT, property_id="p1", site_id=SITE,
            date=date, query="test", page=page,
            clicks=10, impressions=100, ctr=0.10, position=4.0,
        ))
    # New rows with poor CTR
    for date in ["2026-01-10", "2026-01-11", "2026-01-12"]:
        repo.create(GscQueryRow(
            tenant_id=TENANT, property_id="p1", site_id=SITE,
            date=date, query="test", page=page,
            clicks=3, impressions=100, ctr=0.03, position=4.0,
        ))

    alerts = generate_alerts(TENANT, SITE, PROJECT)
    declines = [a for _, a in alerts if a.alert_type == "ctr_decline"]
    assert len(declines) >= 1
    ev = declines[0].evidence
    assert ev["old_avg_ctr"] > ev["new_avg_ctr"]
    assert ev["total_impressions"] >= 200


# ── Crawl failure ─────────────────────────────────────────────────────────────

def test_crawl_failure_alert_generated():
    repo = get_crawl_job_repository()
    job = CrawlJob(
        tenant_id=TENANT, site_id=SITE,
        status=CrawlStatus.FAILED, crawl_type=CrawlType.SITE,
        error_category="timeout",
    )
    jid, _ = repo.create(job)

    alerts = generate_alerts(TENANT, SITE, PROJECT)
    fails = [a for _, a in alerts if a.alert_type == "crawl_failure"]
    assert len(fails) >= 1
    assert fails[0].severity == Severity.HIGH
    assert fails[0].evidence["job_id"] == jid


def test_running_crawl_does_not_trigger_alert():
    repo = get_crawl_job_repository()
    job = CrawlJob(
        tenant_id=TENANT, site_id=SITE,
        status=CrawlStatus.RUNNING, crawl_type=CrawlType.SITE,
    )
    repo.create(job)

    alerts = generate_alerts(TENANT, SITE, PROJECT)
    fails = [a for _, a in alerts if a.alert_type == "crawl_failure"]
    assert len(fails) == 0


# ── Critical issue alert ──────────────────────────────────────────────────────

def test_critical_issue_alert_generated():
    issue_repo = get_issue_repository()
    issue = SeoIssue(
        tenant_id=TENANT, site_id=SITE, crawl_job_id="job1",
        page_id="page_001", rule_key="missing_title",
        category="on_page",
        severity=Severity.CRITICAL,
        status=IssueStatus.OPEN,
        recommendation="Add a title tag.",
    )
    issue_repo.create(issue)

    alerts = generate_alerts(TENANT, SITE, PROJECT)
    crit = [a for _, a in alerts if a.alert_type == "new_critical_issue"]
    assert len(crit) >= 1
    assert crit[0].severity == Severity.CRITICAL
    assert crit[0].evidence["rule_key"] == "missing_title"


def test_resolved_issue_does_not_trigger_alert():
    issue_repo = get_issue_repository()
    issue = SeoIssue(
        tenant_id=TENANT, site_id=SITE, crawl_job_id="job2",
        page_id="page_002", rule_key="dup_title",
        category="on_page",
        severity=Severity.CRITICAL,
        status=IssueStatus.RESOLVED,
        recommendation="Already fixed.",
    )
    issue_repo.create(issue)

    alerts = generate_alerts(TENANT, SITE, PROJECT)
    crit = [a for _, a in alerts if a.alert_type == "new_critical_issue"]
    assert len(crit) == 0


# ── Deduplication ─────────────────────────────────────────────────────────────

def test_deduplication_prevents_duplicate_unread_alerts():
    kid = _seed_keyword("dedup drop kw")
    repo = get_rank_snapshot_repository()
    repo.create(RankSnapshot(
        tenant_id=TENANT, project_id=PROJECT, keyword_id=kid, keyword="dedup drop kw",
        date="2026-01-01", position=3, ranking_url="https://ex.com/d",
    ))
    repo.create(RankSnapshot(
        tenant_id=TENANT, project_id=PROJECT, keyword_id=kid, keyword="dedup drop kw",
        date="2026-01-10", position=10, ranking_url="https://ex.com/d",
    ))

    first_run = generate_alerts(TENANT, SITE, PROJECT)
    second_run = generate_alerts(TENANT, SITE, PROJECT)

    first_drops = [a for _, a in first_run if a.alert_type == "ranking_drop"]
    second_drops = [a for _, a in second_run if a.alert_type == "ranking_drop"]
    assert len(first_drops) >= 1
    assert len(second_drops) == 0  # deduplicated


# ── Lifecycle ─────────────────────────────────────────────────────────────────

def test_mark_read():
    kid = _seed_keyword("read kw")
    repo = get_rank_snapshot_repository()
    repo.create(RankSnapshot(
        tenant_id=TENANT, project_id=PROJECT, keyword_id=kid, keyword="read kw",
        date="2026-01-01", position=4, ranking_url="https://ex.com/r",
    ))
    repo.create(RankSnapshot(
        tenant_id=TENANT, project_id=PROJECT, keyword_id=kid, keyword="read kw",
        date="2026-01-15", position=12, ranking_url="https://ex.com/r",
    ))
    alerts = generate_alerts(TENANT, SITE, PROJECT)
    assert len(alerts) >= 1
    aid, _ = alerts[0]

    result = mark_read(TENANT, aid)
    assert result is not None
    _, updated = result
    assert updated.status == AlertStatus.READ
    assert updated.read_at != ""


def test_dismiss_alert():
    kid = _seed_keyword("dismiss kw")
    repo = get_rank_snapshot_repository()
    repo.create(RankSnapshot(
        tenant_id=TENANT, project_id=PROJECT, keyword_id=kid, keyword="dismiss kw",
        date="2026-01-01", position=3, ranking_url="https://ex.com/dkw",
    ))
    repo.create(RankSnapshot(
        tenant_id=TENANT, project_id=PROJECT, keyword_id=kid, keyword="dismiss kw",
        date="2026-01-15", position=15, ranking_url="https://ex.com/dkw",
    ))
    alerts = generate_alerts(TENANT, SITE, PROJECT)
    aid, _ = alerts[0]

    result = dismiss_alert(TENANT, aid)
    assert result is not None
    _, updated = result
    assert updated.status == AlertStatus.DISMISSED


# ── Filtering ─────────────────────────────────────────────────────────────────

def test_list_alerts_filter_by_severity():
    # Inject a HIGH alert directly
    repo = get_alert_repository()
    from seo.search_stores import SeoAlert
    repo.create(SeoAlert(
        tenant_id=TENANT, site_id=SITE, project_id=PROJECT,
        alert_type="ranking_drop", severity=Severity.HIGH,
        title="Drop", message="Drop detected", evidence={},
        data_source="rank_snapshots", status=AlertStatus.UNREAD,
    ))
    repo.create(SeoAlert(
        tenant_id=TENANT, site_id=SITE, project_id=PROJECT,
        alert_type="new_top_10", severity=Severity.LOW,
        title="New top 10", message="Entered top 10", evidence={},
        data_source="rank_snapshots", status=AlertStatus.UNREAD,
    ))

    high = list_alerts(TENANT, severity=Severity.HIGH)
    low = list_alerts(TENANT, severity=Severity.LOW)
    assert all(a.severity == Severity.HIGH for _, a in high)
    assert all(a.severity == Severity.LOW for _, a in low)


def test_list_alerts_filter_by_status():
    repo = get_alert_repository()
    from seo.search_stores import SeoAlert, _now
    aid_r, a_r = repo.create(SeoAlert(
        tenant_id=TENANT, site_id=SITE, project_id=PROJECT,
        alert_type="ranking_drop", severity=Severity.HIGH,
        title="Drop", message="", evidence={}, data_source="rank_snapshots",
        status=AlertStatus.UNREAD,
    ))
    mark_read(TENANT, aid_r)

    unread = list_alerts(TENANT, status=AlertStatus.UNREAD)
    read   = list_alerts(TENANT, status=AlertStatus.READ)
    assert all(a.status == AlertStatus.UNREAD for _, a in unread)
    assert all(a.status == AlertStatus.READ for _, a in read)


# ── SEO_ALERTS_ENABLED=0 ──────────────────────────────────────────────────────

def test_alerts_disabled_env_var_skips_generation():
    os.environ["SEO_ALERTS_ENABLED"] = "0"

    kid = _seed_keyword("disabled kw")
    repo = get_rank_snapshot_repository()
    repo.create(RankSnapshot(
        tenant_id=TENANT, project_id=PROJECT, keyword_id=kid, keyword="disabled kw",
        date="2026-01-01", position=2, ranking_url="https://ex.com/dis",
    ))
    repo.create(RankSnapshot(
        tenant_id=TENANT, project_id=PROJECT, keyword_id=kid, keyword="disabled kw",
        date="2026-01-15", position=14, ranking_url="https://ex.com/dis",
    ))

    alerts = generate_alerts(TENANT, SITE, PROJECT)
    assert len(alerts) == 0


# ── Cross-tenant isolation ────────────────────────────────────────────────────

def test_cross_tenant_isolation():
    kid = _seed_keyword("iso kw")
    repo = get_rank_snapshot_repository()
    repo.create(RankSnapshot(
        tenant_id=TENANT, project_id=PROJECT, keyword_id=kid, keyword="iso kw",
        date="2026-01-01", position=3, ranking_url="https://ex.com/i",
    ))
    repo.create(RankSnapshot(
        tenant_id=TENANT, project_id=PROJECT, keyword_id=kid, keyword="iso kw",
        date="2026-01-10", position=12, ranking_url="https://ex.com/i",
    ))
    generate_alerts(TENANT, SITE, PROJECT)

    other_alerts = list_alerts(OTHER)
    assert len(other_alerts) == 0


def test_get_alert_cross_tenant_returns_none():
    repo = get_alert_repository()
    from seo.search_stores import SeoAlert
    aid, _ = repo.create(SeoAlert(
        tenant_id=TENANT, site_id=SITE, project_id=PROJECT,
        alert_type="ranking_drop", severity=Severity.HIGH,
        title="Drop", message="", evidence={}, data_source="rank_snapshots",
        status=AlertStatus.UNREAD,
    ))

    result = get_alert(OTHER, aid)
    assert result is None
