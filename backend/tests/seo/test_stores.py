"""SEO store repository contract tests.

Coverage:
  - memory mode: create + read back for each entity
  - file mode: restart isolation (rows survive a store reset with PIXIE_PERSIST=file)
  - cross-tenant isolation: tenant B cannot read tenant A rows
  - enum restoration: status/severity come back as the enum, not a bare string
  - ordering + pagination: limit/offset on CrawledPage list

No network, no paid calls. conftest.py seeds PIXIE_PERSIST=memory; tests that
exercise file mode monkeypatch per-case and reset to memory afterward.
"""

from __future__ import annotations

import pytest

import persistence
import seo.stores as stores
from seo.stores import (
    CrawlJob,
    CrawlStatus,
    CrawlType,
    CrawledPage,
    ConnectionStatus,
    IssueStatus,
    Report,
    RobotsPolicy,
    SeoIssue,
    Site,
)
from seo.schemas import Severity


# ── fixture: parametrised memory / file backend ──────────────────────────────

@pytest.fixture(params=["memory", "file"])
def backend(request, tmp_path, monkeypatch):
    if request.param == "file":
        monkeypatch.setenv("PIXIE_PERSIST", "file")
        monkeypatch.setenv("PIXIE_DATA_DIR", str(tmp_path))
    else:
        monkeypatch.delenv("PIXIE_PERSIST", raising=False)
    stores.reset_repositories()
    yield request.param
    stores.reset_repositories()
    # always leave env in memory mode so subsequent tests stay hermetic
    monkeypatch.delenv("PIXIE_PERSIST", raising=False)


# ── helpers ───────────────────────────────────────────────────────────────────

def _site(tenant="t_a", domain="example.com", **kw) -> Site:
    return Site(tenant_id=tenant, domain=domain, **kw)


def _job(tenant="t_a", site_id="site_x", **kw) -> CrawlJob:
    return CrawlJob(tenant_id=tenant, site_id=site_id, **kw)


def _page(tenant="t_a", site_id="site_x", crawl_job_id="crawl_x", url="https://example.com/", **kw) -> CrawledPage:
    return CrawledPage(tenant_id=tenant, site_id=site_id, crawl_job_id=crawl_job_id, url=url, **kw)


def _issue(tenant="t_a", site_id="site_x", crawl_job_id="crawl_x", page_id="page_x",
           rule_key="missing_title", category="meta", **kw) -> SeoIssue:
    return SeoIssue(
        tenant_id=tenant, site_id=site_id, crawl_job_id=crawl_job_id,
        page_id=page_id, rule_key=rule_key, category=category, **kw,
    )


def _report(tenant="t_a", site_id="site_x", crawl_job_id="crawl_x", **kw) -> Report:
    return Report(tenant_id=tenant, site_id=site_id, crawl_job_id=crawl_job_id, **kw)


# ═══════════════════════════════════════════════════════════════════════════════
# 1. Basic create + read back (memory and file)
# ═══════════════════════════════════════════════════════════════════════════════

class TestSiteCreateReadBack:
    def test_create_and_get(self, backend):
        repo = stores.get_site_repository()
        sid, site = repo.create(_site(domain="pixie.io"))
        assert sid.startswith("site_")
        result = repo.get("t_a", sid)
        assert result is not None
        rid, got = result
        assert rid == sid
        assert got.domain == "pixie.io"
        assert got.tenant_id == "t_a"

    def test_defaults_populated(self, backend):
        repo = stores.get_site_repository()
        sid, site = repo.create(_site())
        _, got = repo.get("t_a", sid)
        assert got.connection_status == ConnectionStatus.PENDING
        assert got.robots_policy == RobotsPolicy.RESPECT
        assert got.crawl_limit == 500

    def test_update(self, backend):
        repo = stores.get_site_repository()
        sid, _ = repo.create(_site())
        repo.update("t_a", sid, display_name="My Site", crawl_limit=200)
        _, got = repo.get("t_a", sid)
        assert got.display_name == "My Site"
        assert got.crawl_limit == 200

    def test_list(self, backend):
        repo = stores.get_site_repository()
        repo.create(_site(domain="a.com"))
        repo.create(_site(domain="b.com"))
        listed = repo.list("t_a")
        domains = {s.domain for _, s in listed}
        assert domains == {"a.com", "b.com"}

    def test_delete(self, backend):
        repo = stores.get_site_repository()
        sid, _ = repo.create(_site())
        assert repo.delete("t_a", sid) is True
        assert repo.get("t_a", sid) is None


class TestCrawlJobCreateReadBack:
    def test_create_and_get(self, backend):
        repo = stores.get_crawl_job_repository()
        jid, job = repo.create(_job(site_id="site_1"))
        assert jid.startswith("crawl_")
        _, got = repo.get("t_a", jid)
        assert got.site_id == "site_1"
        assert got.status == CrawlStatus.QUEUED

    def test_update_status(self, backend):
        repo = stores.get_crawl_job_repository()
        jid, _ = repo.create(_job())
        repo.update("t_a", jid, status=CrawlStatus.RUNNING, crawled_count=10)
        _, got = repo.get("t_a", jid)
        assert got.status == CrawlStatus.RUNNING
        assert got.crawled_count == 10


class TestCrawledPageCreateReadBack:
    def test_create_and_get(self, backend):
        repo = stores.get_crawled_page_repository()
        pid, page = repo.create(_page(url="https://x.com/about", title="About", status_code=200))
        assert pid.startswith("page_")
        _, got = repo.get("t_a", pid)
        assert got.url == "https://x.com/about"
        assert got.title == "About"
        assert got.status_code == 200


class TestSeoIssueCreateReadBack:
    def test_create_and_get(self, backend):
        repo = stores.get_issue_repository()
        iid, issue = repo.create(_issue(rule_key="dup_title", severity=Severity.HIGH))
        assert iid.startswith("issue_")
        _, got = repo.get("t_a", iid)
        assert got.rule_key == "dup_title"

    def test_update_status(self, backend):
        repo = stores.get_issue_repository()
        iid, _ = repo.create(_issue())
        repo.update("t_a", iid, status=IssueStatus.RESOLVED)
        _, got = repo.get("t_a", iid)
        assert got.status == IssueStatus.RESOLVED


class TestReportCreateReadBack:
    def test_create_and_get(self, backend):
        repo = stores.get_report_repository()
        rid, report = repo.create(_report(score=82, category_scores={"meta": 90}))
        assert rid.startswith("rpt_")
        _, got = repo.get("t_a", rid)
        assert got.score == 82
        assert got.category_scores == {"meta": 90}

    def test_created_at_set(self, backend):
        repo = stores.get_report_repository()
        rid, _ = repo.create(_report(score=70))
        _, got = repo.get("t_a", rid)
        assert got.created_at != ""


# ═══════════════════════════════════════════════════════════════════════════════
# 2. File-mode restart: rows survive reset_repositories() + fresh persistence.table
# ═══════════════════════════════════════════════════════════════════════════════

def test_file_mode_site_survives_restart(tmp_path, monkeypatch):
    monkeypatch.setenv("PIXIE_PERSIST", "file")
    monkeypatch.setenv("PIXIE_DATA_DIR", str(tmp_path))
    stores.reset_repositories()

    repo = stores.get_site_repository()
    sid, _ = repo.create(_site(domain="durable.io"))

    # simulate restart: clear in-memory singletons, let table() re-read file
    stores.reset_repositories()

    repo2 = stores.get_site_repository()
    result = repo2.get("t_a", sid)
    assert result is not None, "Site row must survive a restart in file mode"
    _, got = result
    assert got.domain == "durable.io"

    monkeypatch.delenv("PIXIE_PERSIST", raising=False)
    stores.reset_repositories()


def test_file_mode_crawl_job_survives_restart(tmp_path, monkeypatch):
    monkeypatch.setenv("PIXIE_PERSIST", "file")
    monkeypatch.setenv("PIXIE_DATA_DIR", str(tmp_path))
    stores.reset_repositories()

    repo = stores.get_crawl_job_repository()
    jid, _ = repo.create(_job(site_id="site_dur", status=CrawlStatus.RUNNING))
    stores.reset_repositories()

    _, got = stores.get_crawl_job_repository().get("t_a", jid)
    assert got.site_id == "site_dur"

    monkeypatch.delenv("PIXIE_PERSIST", raising=False)
    stores.reset_repositories()


def test_file_mode_crawled_page_survives_restart(tmp_path, monkeypatch):
    monkeypatch.setenv("PIXIE_PERSIST", "file")
    monkeypatch.setenv("PIXIE_DATA_DIR", str(tmp_path))
    stores.reset_repositories()

    repo = stores.get_crawled_page_repository()
    pid, _ = repo.create(_page(url="https://dur.io/", title="Durable Page"))
    stores.reset_repositories()

    _, got = stores.get_crawled_page_repository().get("t_a", pid)
    assert got.title == "Durable Page"

    monkeypatch.delenv("PIXIE_PERSIST", raising=False)
    stores.reset_repositories()


def test_file_mode_issue_survives_restart(tmp_path, monkeypatch):
    monkeypatch.setenv("PIXIE_PERSIST", "file")
    monkeypatch.setenv("PIXIE_DATA_DIR", str(tmp_path))
    stores.reset_repositories()

    repo = stores.get_issue_repository()
    iid, _ = repo.create(_issue(rule_key="no_h1", severity=Severity.CRITICAL))
    stores.reset_repositories()

    _, got = stores.get_issue_repository().get("t_a", iid)
    assert got.rule_key == "no_h1"

    monkeypatch.delenv("PIXIE_PERSIST", raising=False)
    stores.reset_repositories()


def test_file_mode_report_survives_restart(tmp_path, monkeypatch):
    monkeypatch.setenv("PIXIE_PERSIST", "file")
    monkeypatch.setenv("PIXIE_DATA_DIR", str(tmp_path))
    stores.reset_repositories()

    repo = stores.get_report_repository()
    rid, _ = repo.create(_report(score=55))
    stores.reset_repositories()

    _, got = stores.get_report_repository().get("t_a", rid)
    assert got.score == 55

    monkeypatch.delenv("PIXIE_PERSIST", raising=False)
    stores.reset_repositories()


# ═══════════════════════════════════════════════════════════════════════════════
# 3. Cross-tenant isolation
# ═══════════════════════════════════════════════════════════════════════════════

class TestCrossTenantIsolation:
    def test_site_tenant_isolation(self, backend):
        repo = stores.get_site_repository()
        sid, _ = repo.create(_site(tenant="tenant_a", domain="a.io"))
        # tenant_b cannot see tenant_a's site
        assert repo.get("tenant_b", sid) is None
        assert repo.list("tenant_b") == []

    def test_crawl_job_tenant_isolation(self, backend):
        repo = stores.get_crawl_job_repository()
        jid, _ = repo.create(_job(tenant="tenant_a"))
        assert repo.get("tenant_b", jid) is None

    def test_crawled_page_tenant_isolation(self, backend):
        repo = stores.get_crawled_page_repository()
        pid, _ = repo.create(_page(tenant="tenant_a"))
        assert repo.get("tenant_b", pid) is None

    def test_issue_tenant_isolation(self, backend):
        repo = stores.get_issue_repository()
        iid, _ = repo.create(_issue(tenant="tenant_a"))
        assert repo.get("tenant_b", iid) is None

    def test_report_tenant_isolation(self, backend):
        repo = stores.get_report_repository()
        rid, _ = repo.create(_report(tenant="tenant_a", site_id="s1"))
        assert repo.get("tenant_b", rid) is None
        assert repo.latest_report("tenant_b", "s1") is None


# ═══════════════════════════════════════════════════════════════════════════════
# 4. Enum restoration — status/severity come back as enum, not bare string
# ═══════════════════════════════════════════════════════════════════════════════

class TestEnumRestoration:
    def test_crawl_job_status_enum(self, backend):
        repo = stores.get_crawl_job_repository()
        jid, _ = repo.create(_job(status=CrawlStatus.COMPLETED))
        _, got = repo.get("t_a", jid)
        assert got.status is CrawlStatus.COMPLETED
        assert isinstance(got.status, CrawlStatus)

    def test_crawl_type_enum(self, backend):
        repo = stores.get_crawl_job_repository()
        jid, _ = repo.create(_job(crawl_type=CrawlType.SINGLE))
        _, got = repo.get("t_a", jid)
        assert got.crawl_type is CrawlType.SINGLE

    def test_issue_severity_enum(self, backend):
        repo = stores.get_issue_repository()
        iid, _ = repo.create(_issue(severity=Severity.CRITICAL))
        _, got = repo.get("t_a", iid)
        assert got.severity is Severity.CRITICAL
        assert isinstance(got.severity, Severity)

    def test_issue_status_enum(self, backend):
        repo = stores.get_issue_repository()
        iid, _ = repo.create(_issue(status=IssueStatus.IGNORED))
        _, got = repo.get("t_a", iid)
        assert got.status is IssueStatus.IGNORED

    def test_site_connection_status_enum(self, backend):
        repo = stores.get_site_repository()
        sid, _ = repo.create(_site(connection_status=ConnectionStatus.CONNECTED))
        _, got = repo.get("t_a", sid)
        assert got.connection_status is ConnectionStatus.CONNECTED

    def test_site_robots_policy_enum(self, backend):
        repo = stores.get_site_repository()
        sid, _ = repo.create(_site(robots_policy=RobotsPolicy.IGNORE))
        _, got = repo.get("t_a", sid)
        assert got.robots_policy is RobotsPolicy.IGNORE


# ═══════════════════════════════════════════════════════════════════════════════
# 5. Ordering + pagination (limit/offset on CrawledPage)
# ═══════════════════════════════════════════════════════════════════════════════

class TestPaginationAndOrdering:
    def test_crawled_page_pagination(self, backend):
        repo = stores.get_crawled_page_repository()
        job_id = "crawl_pag_test"
        urls = [f"https://example.com/page{i}" for i in range(10)]
        ids = []
        for url in urls:
            pid, _ = repo.create(_page(url=url, crawl_job_id=job_id))
            ids.append(pid)

        total, first_page = repo.list_by_crawl_job("t_a", job_id, limit=4, offset=0)
        assert total == 10
        assert len(first_page) == 4

        _, second_page = repo.list_by_crawl_job("t_a", job_id, limit=4, offset=4)
        assert len(second_page) == 4

        _, last_page = repo.list_by_crawl_job("t_a", job_id, limit=4, offset=8)
        assert len(last_page) == 2

        # no overlap between pages
        first_ids  = {pid for pid, _ in first_page}
        second_ids = {pid for pid, _ in second_page}
        assert first_ids.isdisjoint(second_ids)

    def test_list_pages_convenience(self, backend):
        repo = stores.get_crawled_page_repository()
        job_id = "crawl_conv_test"
        for i in range(5):
            repo.create(_page(url=f"https://example.com/{i}", crawl_job_id=job_id))

        total, pages = stores.list_pages("t_a", job_id, limit=3, offset=0)
        assert total == 5
        assert len(pages) == 3

    def test_latest_report_ordering(self, backend):
        repo = stores.get_report_repository()
        # create two reports; latest_report should return the most recent
        r1id, _ = repo.create(_report(score=50, site_id="site_ord"))
        r2id, _ = repo.create(_report(score=75, site_id="site_ord"))
        _, latest = stores.latest_report("t_a", "site_ord")
        # the second one has a later created_at
        assert latest.score == 75


# ═══════════════════════════════════════════════════════════════════════════════
# 6. Issue filter helpers
# ═══════════════════════════════════════════════════════════════════════════════

class TestIssueFilters:
    def test_filter_by_severity(self, backend):
        repo = stores.get_issue_repository()
        site = "site_filt"
        repo.create(_issue(site_id=site, rule_key="r1", severity=Severity.CRITICAL))
        repo.create(_issue(site_id=site, rule_key="r2", severity=Severity.LOW))
        repo.create(_issue(site_id=site, rule_key="r3", severity=Severity.HIGH))

        critical = repo.list_by_site("t_a", site, severity=Severity.CRITICAL)
        assert len(critical) == 1
        assert critical[0][1].severity is Severity.CRITICAL

    def test_filter_by_status(self, backend):
        repo = stores.get_issue_repository()
        site = "site_fstat"
        iid, _ = repo.create(_issue(site_id=site, rule_key="r1", status=IssueStatus.OPEN))
        repo.create(_issue(site_id=site, rule_key="r2", status=IssueStatus.RESOLVED))

        open_issues = repo.list_by_site("t_a", site, status=IssueStatus.OPEN)
        assert len(open_issues) == 1
        assert open_issues[0][1].status is IssueStatus.OPEN

    def test_list_issues_by_crawl_job(self, backend):
        repo = stores.get_issue_repository()
        jid = "crawl_filter"
        repo.create(_issue(crawl_job_id=jid, rule_key="r1", severity=Severity.HIGH))
        repo.create(_issue(crawl_job_id=jid, rule_key="r2", severity=Severity.MEDIUM))
        repo.create(_issue(crawl_job_id="other_job", rule_key="r3"))

        by_job = repo.list_by_crawl_job("t_a", jid)
        assert len(by_job) == 2
        rule_keys = {iss.rule_key for _, iss in by_job}
        assert rule_keys == {"r1", "r2"}

    def test_convenience_list_issues(self, backend):
        repo = stores.get_issue_repository()
        site = "site_conv"
        repo.create(_issue(site_id=site, rule_key="c1", severity=Severity.CRITICAL))
        repo.create(_issue(site_id=site, rule_key="c2", severity=Severity.INFO))

        issues = stores.list_issues("t_a", site_id=site, severity=Severity.CRITICAL)
        assert len(issues) == 1


# ═══════════════════════════════════════════════════════════════════════════════
# 7. Convenience helpers
# ═══════════════════════════════════════════════════════════════════════════════

class TestConvenienceHelpers:
    def test_create_crawl_job_helper(self, backend):
        jid, job = stores.create_crawl_job(
            "t_a", "site_h1", crawl_type=CrawlType.SINGLE, requested_limit=10
        )
        assert jid.startswith("crawl_")
        assert job.crawl_type is CrawlType.SINGLE
        assert job.requested_limit == 10
        assert job.queued_at != ""

    def test_update_crawl_job_helper(self, backend):
        jid, _ = stores.create_crawl_job("t_a", "site_h2")
        stores.update_crawl_job("t_a", jid, status=CrawlStatus.COMPLETED, crawled_count=42)
        _, got = stores.get_crawl_job_repository().get("t_a", jid)
        assert got.status is CrawlStatus.COMPLETED
        assert got.crawled_count == 42

    def test_list_sites_helper(self, backend):
        stores.get_site_repository().create(_site(domain="h1.io"))
        sites = stores.list_sites("t_a")
        assert len(sites) == 1

    def test_get_site_helper(self, backend):
        repo = stores.get_site_repository()
        sid, _ = repo.create(_site(domain="h2.io"))
        result = stores.get_site("t_a", sid)
        assert result is not None
        assert result[1].domain == "h2.io"

    def test_latest_report_helper(self, backend):
        stores.get_report_repository().create(_report(score=60, site_id="site_lr"))
        stores.get_report_repository().create(_report(score=80, site_id="site_lr"))
        pair = stores.latest_report("t_a", "site_lr")
        assert pair is not None
        assert pair[1].score == 80
