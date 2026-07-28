"""Tests for Site Archive (soft-delete) and ad-hoc audit → save-site.

Coverage
--------
1. archive() hides site from default list (include_archived=False)
2. archived site appears under ?archived=true
3. restore() brings it back to default list
4. Historical crawl/issue/report rows survive archive (verify data isolation)
5. DELETE default → archives (not hard-delete)
6. DELETE ?permanent=true → hard-deletes
7. Cross-tenant archive fails (tenant B cannot archive tenant A's site)
8. POST /sites/{site_id}/archive and /restore routes work
9. Ad-hoc audit → save-site (item 3): saving twice does not duplicate
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

import pytest
from fastapi.testclient import TestClient

TENANT_A = "tenant_archive_a"
TENANT_B = "tenant_archive_b"


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def _reset(monkeypatch):
    monkeypatch.setenv("PIXIE_PERSIST", "memory")
    monkeypatch.setenv("PIXIE_INTERNAL_API_SECRET", "")
    import seo.stores as _st
    import seo.search_stores as _ss
    _st.reset_repositories()
    _ss.reset_repositories()
    yield
    _st.reset_repositories()
    _ss.reset_repositories()


@pytest.fixture()
def client():
    from app import app
    return TestClient(app)


def _hdr(tenant: str) -> dict:
    return {"X-Pixie-Tenant": tenant}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _create_site(client, tenant: str, domain: str = "example.com") -> str:
    resp = client.post(
        "/api/agents/seo/sites",
        json={"domain": domain},
        headers=_hdr(tenant),
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["site"]["id"]


# ══════════════════════════════════════════════════════════════════════════════
# 1. Direct repository archive/restore (unit-level)
# ══════════════════════════════════════════════════════════════════════════════

class TestRepositoryArchiveRestore:
    def test_archive_hides_from_default_list(self):
        from seo.stores import Site, get_site_repository

        repo = get_site_repository()
        sid, _ = repo.create(Site(tenant_id=TENANT_A, domain="hide.io"))

        # Default list: visible
        pairs = repo.list(TENANT_A)
        assert any(i == sid for i, _ in pairs)

        # Archive
        result = repo.archive(TENANT_A, sid)
        assert result is not None
        _, s = result
        assert s.archived is True
        assert s.archived_at != ""

        # Default list: hidden
        pairs = repo.list(TENANT_A)
        assert all(i != sid for i, _ in pairs)

    def test_archive_appears_with_include_archived(self):
        from seo.stores import Site, get_site_repository

        repo = get_site_repository()
        sid, _ = repo.create(Site(tenant_id=TENANT_A, domain="incl.io"))
        repo.archive(TENANT_A, sid)

        pairs = repo.list(TENANT_A, include_archived=True)
        assert any(i == sid for i, _ in pairs)

    def test_restore_brings_back(self):
        from seo.stores import Site, get_site_repository

        repo = get_site_repository()
        sid, _ = repo.create(Site(tenant_id=TENANT_A, domain="restore.io"))
        repo.archive(TENANT_A, sid)

        # Hidden before restore
        assert all(i != sid for i, _ in repo.list(TENANT_A))

        result = repo.restore(TENANT_A, sid)
        assert result is not None
        _, s = result
        assert s.archived is False
        assert s.archived_at == ""

        # Visible after restore
        pairs = repo.list(TENANT_A)
        assert any(i == sid for i, _ in pairs)

    def test_cross_tenant_archive_fails(self):
        """Tenant B cannot archive tenant A's site."""
        from seo.stores import Site, get_site_repository

        repo = get_site_repository()
        sid, _ = repo.create(Site(tenant_id=TENANT_A, domain="cross.io"))

        # Tenant B tries to archive it — should return None (not found)
        result = repo.archive(TENANT_B, sid)
        assert result is None

        # Tenant A's site is unchanged
        got = repo.get(TENANT_A, sid)
        assert got is not None
        _, s = got
        assert s.archived is False

    def test_list_sites_helper_excludes_archived_by_default(self):
        from seo.stores import Site, get_site_repository, list_sites

        repo = get_site_repository()
        sid, _ = repo.create(Site(tenant_id=TENANT_A, domain="default.io"))
        repo.archive(TENANT_A, sid)

        active = list_sites(TENANT_A)
        assert all(i != sid for i, _ in active)

    def test_list_sites_helper_include_archived(self):
        from seo.stores import Site, get_site_repository, list_sites

        repo = get_site_repository()
        sid, _ = repo.create(Site(tenant_id=TENANT_A, domain="both.io"))
        repo.archive(TENANT_A, sid)

        all_sites = list_sites(TENANT_A, include_archived=True)
        assert any(i == sid for i, _ in all_sites)


# ══════════════════════════════════════════════════════════════════════════════
# 2. Historical rows survive archive
# ══════════════════════════════════════════════════════════════════════════════

class TestHistoricalDataSurvivesArchive:
    def test_crawl_issue_report_survive_archive(self):
        """Crawl job, issue, and report rows are preserved when a site is archived."""
        from seo.stores import (
            CrawlJob, Site, SeoIssue, Report,
            get_site_repository,
            get_crawl_job_repository,
            get_issue_repository,
            get_report_repository,
        )
        from seo.schemas import Severity

        site_repo = get_site_repository()
        crawl_repo = get_crawl_job_repository()
        issue_repo = get_issue_repository()
        report_repo = get_report_repository()

        # Create a site
        sid, _ = site_repo.create(Site(tenant_id=TENANT_A, domain="survive.io"))

        # Create a crawl job for the site
        jid, _ = crawl_repo.create(CrawlJob(tenant_id=TENANT_A, site_id=sid))

        # Create an issue for the site
        iid, _ = issue_repo.create(SeoIssue(
            tenant_id=TENANT_A, site_id=sid, crawl_job_id=jid,
            page_id="page_x", rule_key="missing_title", category="meta",
            severity=Severity.HIGH,
        ))

        # Create a report for the site
        rid, _ = report_repo.create(Report(
            tenant_id=TENANT_A, site_id=sid, crawl_job_id=jid, score=77,
        ))

        # Archive the site
        site_repo.archive(TENANT_A, sid)

        # All historical data still accessible
        assert crawl_repo.get(TENANT_A, jid) is not None
        assert issue_repo.get(TENANT_A, iid) is not None
        assert report_repo.get(TENANT_A, rid) is not None

        # list_by_site still returns issues (archive does not purge them)
        site_issues = issue_repo.list_by_site(TENANT_A, sid)
        assert any(i == iid for i, _ in site_issues)


# ══════════════════════════════════════════════════════════════════════════════
# 3. HTTP route tests
# ══════════════════════════════════════════════════════════════════════════════

class TestSiteArchiveRoutes:
    def test_get_sites_excludes_archived_by_default(self, client):
        sid = _create_site(client, TENANT_A, domain="ex1.io")

        # Archive via DELETE (default = soft)
        resp = client.delete(f"/api/agents/seo/sites/{sid}", headers=_hdr(TENANT_A))
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("archived") is True

        # Default GET: site should be absent
        resp = client.get("/api/agents/seo/sites", headers=_hdr(TENANT_A))
        assert resp.status_code == 200
        ids = [s["id"] for s in resp.json()["sites"]]
        assert sid not in ids

    def test_get_sites_archived_filter(self, client):
        sid = _create_site(client, TENANT_A, domain="ex2.io")
        client.delete(f"/api/agents/seo/sites/{sid}", headers=_hdr(TENANT_A))

        resp = client.get(
            "/api/agents/seo/sites",
            params={"archived": "true"},
            headers=_hdr(TENANT_A),
        )
        assert resp.status_code == 200
        ids = [s["id"] for s in resp.json()["sites"]]
        assert sid in ids

    def test_get_sites_include_archived(self, client):
        # Create two sites; archive one
        sid_active = _create_site(client, TENANT_A, domain="active.io")
        sid_arch = _create_site(client, TENANT_A, domain="archived.io")
        client.delete(f"/api/agents/seo/sites/{sid_arch}", headers=_hdr(TENANT_A))

        resp = client.get(
            "/api/agents/seo/sites",
            params={"include_archived": "true"},
            headers=_hdr(TENANT_A),
        )
        assert resp.status_code == 200
        ids = [s["id"] for s in resp.json()["sites"]]
        assert sid_active in ids
        assert sid_arch in ids

    def test_delete_default_soft_archives(self, client):
        sid = _create_site(client, TENANT_A, domain="softdel.io")

        resp = client.delete(f"/api/agents/seo/sites/{sid}", headers=_hdr(TENANT_A))
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("archived") is True
        # site row still exists (archived=True)
        from seo.stores import get_site_repository
        repo = get_site_repository()
        result = repo.get(TENANT_A, sid)
        assert result is not None
        _, s = result
        assert s.archived is True

    def test_delete_permanent_hard_deletes(self, client):
        sid = _create_site(client, TENANT_A, domain="harddel.io")

        resp = client.delete(
            f"/api/agents/seo/sites/{sid}",
            params={"permanent": "true"},
            headers=_hdr(TENANT_A),
        )
        assert resp.status_code == 200
        assert resp.json().get("deleted") == sid

        from seo.stores import get_site_repository
        assert get_site_repository().get(TENANT_A, sid) is None

    def test_delete_not_found(self, client):
        resp = client.delete(
            "/api/agents/seo/sites/site_doesnotexist",
            headers=_hdr(TENANT_A),
        )
        assert resp.status_code == 404

    def test_post_archive_route(self, client):
        sid = _create_site(client, TENANT_A, domain="parch.io")
        resp = client.post(
            f"/api/agents/seo/sites/{sid}/archive",
            headers=_hdr(TENANT_A),
        )
        assert resp.status_code == 200
        assert resp.json()["archived"] is True
        assert resp.json()["site"]["archived"] is True

    def test_post_restore_route(self, client):
        sid = _create_site(client, TENANT_A, domain="prestore.io")
        # Archive first
        client.post(f"/api/agents/seo/sites/{sid}/archive", headers=_hdr(TENANT_A))

        resp = client.post(
            f"/api/agents/seo/sites/{sid}/restore",
            headers=_hdr(TENANT_A),
        )
        assert resp.status_code == 200
        assert resp.json()["archived"] is False
        assert resp.json()["site"]["archived"] is False

        # Should appear in default list again
        resp = client.get("/api/agents/seo/sites", headers=_hdr(TENANT_A))
        ids = [s["id"] for s in resp.json()["sites"]]
        assert sid in ids

    def test_cross_tenant_archive_fails_via_route(self, client):
        """Tenant B cannot archive tenant A's site via the HTTP route."""
        sid = _create_site(client, TENANT_A, domain="xarch.io")

        resp = client.post(
            f"/api/agents/seo/sites/{sid}/archive",
            headers=_hdr(TENANT_B),
        )
        assert resp.status_code == 404

        # Tenant A's site is still active
        from seo.stores import get_site_repository
        _, s = get_site_repository().get(TENANT_A, sid)
        assert s.archived is False


# ══════════════════════════════════════════════════════════════════════════════
# 4. Ad-hoc audit → save-site (item 3)
# ══════════════════════════════════════════════════════════════════════════════

class TestAuditSaveSite:
    def _inject_audit(self, tenant: str, domain: str) -> str:
        """Directly inject a fake audit row into the audit_agent store."""
        import secrets
        import persistence
        from seo import audit_agent as aa

        audit_id = f"audit_{secrets.token_hex(6)}"
        audit_data = {
            "id": audit_id,
            "tenant_id": tenant,
            "website_url": f"https://{domain}",
            "final_url": f"https://{domain}/",
            "platform": "custom",
            "score": 70,
            "created_at": "2026-07-29T00:00:00+00:00",
        }
        aa.repos().audits.upsert(
            persistence.envelope(audit_id, tenant, audit_data, audit_data["created_at"])
        )
        return audit_id

    def test_save_site_creates_new(self, client):
        audit_id = self._inject_audit(TENANT_A, "newsave.io")

        resp = client.post(
            f"/api/agents/seo/audit/{audit_id}/save-site",
            headers=_hdr(TENANT_A),
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["created"] is True
        assert body["site"]["domain"] == "newsave.io"

    def test_save_site_no_duplicate(self, client):
        """Saving the same audit domain twice returns the existing site."""
        audit_id = self._inject_audit(TENANT_A, "nodup.io")

        resp1 = client.post(
            f"/api/agents/seo/audit/{audit_id}/save-site",
            headers=_hdr(TENANT_A),
        )
        assert resp1.status_code == 200
        assert resp1.json()["created"] is True
        site_id_1 = resp1.json()["site"]["id"]

        resp2 = client.post(
            f"/api/agents/seo/audit/{audit_id}/save-site",
            headers=_hdr(TENANT_A),
        )
        assert resp2.status_code == 200
        assert resp2.json()["created"] is False
        assert resp2.json()["site"]["id"] == site_id_1

        # Only one site row should exist for this domain
        from seo.stores import list_sites
        all_sites = list_sites(TENANT_A)
        duped = [s for _, s in all_sites if s.domain == "nodup.io"]
        assert len(duped) == 1

    def test_save_site_returns_existing_if_already_tracked(self, client):
        """If a site for the domain already exists (created manually), return it."""
        # Manually create a site first
        sid_existing = _create_site(client, TENANT_A, domain="preexist.io")

        audit_id = self._inject_audit(TENANT_A, "preexist.io")
        resp = client.post(
            f"/api/agents/seo/audit/{audit_id}/save-site",
            headers=_hdr(TENANT_A),
        )
        assert resp.status_code == 200
        assert resp.json()["created"] is False
        assert resp.json()["site"]["id"] == sid_existing

    def test_save_site_not_found(self, client):
        resp = client.post(
            "/api/agents/seo/audit/audit_nope/save-site",
            headers=_hdr(TENANT_A),
        )
        assert resp.status_code == 404
