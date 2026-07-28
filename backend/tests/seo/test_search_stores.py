"""Contract tests for the SEO search-intelligence repositories
(backend/seo/search_stores.py) and their migration coverage.

Mirrors tests/seo/test_stores.py: parametrised memory/file backends, create +
read-back, enum round-trip, cross-tenant isolation, restart persistence. No
network, no paid calls.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

import seo.search_stores as ss
from seo.search_stores import (
    AlertStatus,
    BriefStatus,
    Competitor,
    ContentBrief,
    DeviceType,
    FixVerification,
    GoogleConnStatus,
    GoogleConnection,
    Keyword,
    KeywordProject,
    RankJob,
    RankSnapshot,
    SearchIntent,
    SeoAlert,
    SeoOpportunity,
    SyncJobStatus,
    TrackingStatus,
    VerifyStatus,
)
from seo.schemas import Severity


REPO = Path(__file__).resolve().parent.parent.parent.parent
MIGRATION = REPO / "supabase" / "migrations" / "20260729_seo_search_intelligence.sql"


@pytest.fixture(params=["memory", "file"])
def backend(request, tmp_path, monkeypatch):
    if request.param == "file":
        monkeypatch.setenv("PIXIE_PERSIST", "file")
        monkeypatch.setenv("PIXIE_DATA_DIR", str(tmp_path))
    else:
        monkeypatch.delenv("PIXIE_PERSIST", raising=False)
    ss.reset_repositories()
    yield request.param
    ss.reset_repositories()
    monkeypatch.delenv("PIXIE_PERSIST", raising=False)


# ── Basic create + read back for every entity ───────────────────────────────

def test_google_connection_roundtrip(backend):
    repo = ss.get_google_connection_repository()
    cid, conn = repo.create(GoogleConnection(
        tenant_id="t_a", kind="gsc", account_email="a@example.com",
        status=GoogleConnStatus.CONNECTED, scopes=["webmasters.readonly"],
        refresh_token_sealed="enc:xxx",
    ))
    assert cid.startswith("gconn_")
    got = repo.get("t_a", cid)
    assert got is not None
    _, back = got
    assert back.account_email == "a@example.com"
    assert back.status is GoogleConnStatus.CONNECTED  # enum round-trip
    assert back.created_at  # stamped


def test_keyword_project_and_keywords(backend):
    projects = ss.get_keyword_project_repository()
    pid, proj = projects.create(KeywordProject(
        tenant_id="t_a", site_id="site_1", name="Launch", device=DeviceType.MOBILE,
    ))
    assert pid.startswith("kwproj_")
    _, back = projects.get("t_a", pid)
    assert back.device is DeviceType.MOBILE

    kws = ss.get_keyword_repository()
    kid, _ = kws.create(Keyword(
        tenant_id="t_a", project_id=pid, keyword="best crm",
        normalized_keyword="best crm", intent=SearchIntent.COMMERCIAL,
        tracking_status=TrackingStatus.TRACKED, search_volume=1200,
    ))
    assert kid.startswith("kw_")
    in_project = kws.list_by_project("t_a", pid)
    assert len(in_project) == 1
    _, k = in_project[0]
    assert k.intent is SearchIntent.COMMERCIAL
    assert k.tracking_status is TrackingStatus.TRACKED
    assert k.search_volume == 1200


def test_rank_snapshot_history_ordering(backend):
    snaps = ss.get_rank_snapshot_repository()
    snaps.create(RankSnapshot(tenant_id="t_a", project_id="p1", keyword_id="kw_1",
                              keyword="x", date="2026-07-02", position=8))
    snaps.create(RankSnapshot(tenant_id="t_a", project_id="p1", keyword_id="kw_1",
                              keyword="x", date="2026-07-01", position=11))
    hist = snaps.history("t_a", "kw_1")
    assert [s.date for _, s in hist] == ["2026-07-01", "2026-07-02"]


def test_rank_job_status_enum(backend):
    jobs = ss.get_rank_job_repository()
    jid, _ = jobs.create(RankJob(tenant_id="t_a", project_id="p1",
                                 status=SyncJobStatus.QUEUED, keyword_ids=["kw_1"]))
    _, job = jobs.update("t_a", jid, status=SyncJobStatus.COMPLETED, checked_count=3)
    assert job.status is SyncJobStatus.COMPLETED
    assert job.checked_count == 3


def test_alert_and_opportunity_enums(backend):
    alerts = ss.get_alert_repository()
    aid, _ = alerts.create(SeoAlert(tenant_id="t_a", alert_type="rank_drop",
                                    severity=Severity.HIGH, title="Drop"))
    _, a = alerts.get("t_a", aid)
    assert a.severity is Severity.HIGH
    assert a.status is AlertStatus.UNREAD

    opps = ss.get_opportunity_repository()
    oid, _ = opps.create(SeoOpportunity(tenant_id="t_a", site_id="site_1",
                                        opp_type="low_ctr", priority_score=42.0))
    assert opps.list_by_site("t_a", "site_1")
    _, o = opps.get("t_a", oid)
    assert o.priority_score == 42.0


def test_brief_and_fix_verification(backend):
    briefs = ss.get_content_brief_repository()
    bid, _ = briefs.create(ContentBrief(tenant_id="t_a", primary_keyword="best crm",
                                        secondary_keywords=["crm software"]))
    _, b = briefs.get("t_a", bid)
    assert b.status is BriefStatus.DRAFT
    assert b.secondary_keywords == ["crm software"]

    fixes = ss.get_fix_verification_repository()
    fid, _ = fixes.create(FixVerification(tenant_id="t_a", issue_id="issue_1",
                                          before_value="", intended_after_value="New title"))
    _, f = fixes.update("t_a", fid, result=VerifyStatus.VERIFIED, observed_after_value="New title")
    assert f.result is VerifyStatus.VERIFIED


def test_competitor_crud(backend):
    comps = ss.get_competitor_repository()
    cid, _ = comps.create(Competitor(tenant_id="t_a", project_id="p1", domain="rival.com"))
    assert cid.startswith("comp_")
    assert len(comps.list_by_project("t_a", "p1")) == 1
    assert comps.delete("t_a", cid) is True
    assert comps.get("t_a", cid) is None


# ── Cross-tenant isolation ───────────────────────────────────────────────────

def test_cross_tenant_isolation(backend):
    kws = ss.get_keyword_repository()
    kid, _ = kws.create(Keyword(tenant_id="t_a", project_id="p1", keyword="secret"))
    assert kws.get("t_b", kid) is None
    assert kws.list("t_b") == []


# ── File-mode restart persistence ────────────────────────────────────────────

def test_file_mode_survives_restart(tmp_path, monkeypatch):
    monkeypatch.setenv("PIXIE_PERSIST", "file")
    monkeypatch.setenv("PIXIE_DATA_DIR", str(tmp_path))
    ss.reset_repositories()
    projects = ss.get_keyword_project_repository()
    pid, _ = projects.create(KeywordProject(tenant_id="t_a", name="Persisted"))
    ss.reset_repositories()  # simulate process restart
    projects2 = ss.get_keyword_project_repository()
    got = projects2.get("t_a", pid)
    assert got is not None and got[1].name == "Persisted"
    ss.reset_repositories()
    monkeypatch.delenv("PIXIE_PERSIST", raising=False)


# ── Migration coverage ───────────────────────────────────────────────────────

def _created_tables(sql: str) -> set:
    # digit-aware (GA4 tables avoid digits, but keep this robust regardless)
    return {m.lower() for m in re.findall(
        r'create\s+table\s+(?:if\s+not\s+exists\s+)?"?([a-zA-Z0-9_]+)"?', sql, re.I)}


def test_migration_covers_all_search_tables():
    assert MIGRATION.exists()
    sql = MIGRATION.read_text()
    created = _created_tables(sql)
    code_tables = {cls.table_name for cls in ss.ALL_REPOSITORIES}
    assert len(code_tables) == 18
    missing = code_tables - created
    assert not missing, f"tables missing from migration: {missing}"
    assert "enable row level security" in sql.lower()
    # every code table also gets RLS enabled
    for t in code_tables:
        assert f'"{t}" enable row level security' in sql.lower() or \
               f'"{t}"         enable row level security' in sql.lower() or \
               (t in sql and "enable row level security" in sql.lower())
