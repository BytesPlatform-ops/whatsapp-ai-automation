"""Offline tests for the SEO durable pipeline endpoints.

Coverage
--------
- Sites CRUD: create → list → get → patch → delete, tenant isolation.
- Crawl lifecycle: start (queued instantly) → poll_once with fake fetcher →
  pages persisted, cross-page issues + report produced → cancel/retry.
- assert_safe_url rejection on POST /crawl/start with internal URL → 400.
- Server-side clamp: browser-supplied requested_limit far above max is clamped.

No network, no paid calls.  Tenant isolation is verified by asserting tenant B
cannot read tenant A resources.

The test drives crawl execution by calling poll_once(..., fetch=<fake>)
directly rather than relying on BackgroundTasks / a real network.
"""

from __future__ import annotations

import os
import sys

# Ensure the backend root is on sys.path when run directly (pytest handles this
# automatically via the conftest.py import path insertion, but belt + suspenders).
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

import pytest
from fastapi.testclient import TestClient

# ── fixtures / helpers ────────────────────────────────────────────────────────

TENANT_A = "tenant_durable_a"
TENANT_B = "tenant_durable_b"

INTERNAL_URLS = [
    "http://localhost/evil",
    "http://127.0.0.1/hack",
    "http://169.254.169.254/metadata",
    "ftp://example.com/file",
]


@pytest.fixture(autouse=True)
def _reset_stores(monkeypatch):
    """Ensure hermetic memory store for every test.

    Also monkeypatches ``seo.url_guard.assert_safe_url`` so the route layer
    doesn't do live DNS resolution for test hostnames.  The only URLs we want
    to actually reject are those using bad schemes or well-known internal
    addresses that ``is_safe_url`` blocks at the string level.
    """
    monkeypatch.setenv("PIXIE_PERSIST", "memory")
    monkeypatch.setenv("PIXIE_INTERNAL_API_SECRET", "")

    # Patch assert_safe_url to skip the DNS resolution step while still
    # enforcing scheme + string-level SSRF checks (is_safe_url).
    from seo.url_guard import UrlRejected, REASON_BAD_SCHEME, REASON_EMBEDDED_CREDENTIALS, REASON_BLOCKED_PORT, REASON_BLOCKED_PRIVATE_IP
    from seo.mode_external.ssrf import is_safe_url
    from urllib.parse import urlsplit

    _ALLOWED_PORTS = frozenset({80, 443})

    def _test_assert_safe_url(url: str) -> None:
        """Lite version of assert_safe_url: scheme + credentials + port + string SSRF.
        Skips DNS so tests are offline.  Internal/private IPs still rejected."""
        if not isinstance(url, str) or not url.strip():
            raise UrlRejected(REASON_BAD_SCHEME)
        parts = urlsplit(url.strip())
        scheme = (parts.scheme or "").lower()
        if scheme not in ("http", "https"):
            raise UrlRejected(REASON_BAD_SCHEME)
        if parts.username is not None or parts.password is not None:
            raise UrlRejected(REASON_EMBEDDED_CREDENTIALS)
        if parts.port is not None and parts.port not in _ALLOWED_PORTS:
            raise UrlRejected(REASON_BLOCKED_PORT)
        ok, _ = is_safe_url(url)
        if not ok:
            raise UrlRejected(REASON_BLOCKED_PRIVATE_IP)
        # Skip DNS resolution (resolve_and_check) — not available offline.

    monkeypatch.setattr("seo.url_guard.assert_safe_url", _test_assert_safe_url)
    # Also patch where agent_routes imported it directly.
    monkeypatch.setattr("seo.agent_routes.assert_safe_url", _test_assert_safe_url)

    import seo.stores as _stores
    _stores.reset_repositories()
    yield
    _stores.reset_repositories()


@pytest.fixture()
def client():
    from app import app
    return TestClient(app)


def _hdr(tenant: str) -> dict:
    """X-Pixie-Tenant header for the given tenant."""
    return {"X-Pixie-Tenant": tenant}


# ── Fake fetcher for crawl tests ──────────────────────────────────────────────

def _make_fake_fetch(pages: dict):
    """Return a fetch callable that serves pages from an in-memory dict.

    ``pages`` maps URL → {"html": str, "status": int}.
    Unknown URLs get a 404 text/plain response.
    """
    def _fetch(url, **kwargs):
        entry = pages.get(url) or pages.get(url.rstrip("/"))
        if entry:
            return {
                "final_url": url,
                "status": entry.get("status", 200),
                "headers": {"content-type": "text/html; charset=utf-8"},
                "text": entry.get("html", ""),
                "content_type": "text/html; charset=utf-8",
            }
        return {
            "final_url": url,
            "status": 404,
            "headers": {"content-type": "text/plain"},
            "text": "Not found",
            "content_type": "text/plain",
        }
    return _fetch


_SIMPLE_HTML = """<!doctype html><html>
<head>
  <title>Home Page</title>
  <meta name="description" content="Welcome to our site.">
</head>
<body>
  <h1>Home</h1>
  <p>Hello world.</p>
  <a href="/about">About</a>
</body>
</html>"""

_ABOUT_HTML = """<!doctype html><html>
<head>
  <title>About Page</title>
  <meta name="description" content="About us.">
</head>
<body>
  <h1>About</h1>
  <p>We build things.</p>
  <a href="/">Home</a>
</body>
</html>"""


# ─────────────────────────────────────────────────────────────────────────────
# 1. Sites CRUD
# ─────────────────────────────────────────────────────────────────────────────

class TestSitesCRUD:

    def test_create_site(self, client):
        resp = client.post(
            "/api/agents/seo/sites",
            json={"domain": "example.com", "display_name": "Example"},
            headers=_hdr(TENANT_A),
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert "site" in data
        assert data["site"]["domain"] == "example.com"
        assert data["site"]["id"].startswith("site_")
        assert data["site"]["crawl_limit"] <= 500  # server-side cap respected

    def test_list_sites(self, client):
        # Create two sites
        client.post("/api/agents/seo/sites", json={"domain": "a.com"}, headers=_hdr(TENANT_A))
        client.post("/api/agents/seo/sites", json={"domain": "b.com"}, headers=_hdr(TENANT_A))
        resp = client.get("/api/agents/seo/sites", headers=_hdr(TENANT_A))
        assert resp.status_code == 200
        assert len(resp.json()["sites"]) == 2

    def test_get_site(self, client):
        r = client.post("/api/agents/seo/sites", json={"domain": "c.com"}, headers=_hdr(TENANT_A))
        site_id = r.json()["site"]["id"]
        resp = client.get(f"/api/agents/seo/sites/{site_id}", headers=_hdr(TENANT_A))
        assert resp.status_code == 200
        assert resp.json()["site"]["id"] == site_id

    def test_get_site_not_found(self, client):
        resp = client.get("/api/agents/seo/sites/site_nonexistent", headers=_hdr(TENANT_A))
        assert resp.status_code == 404

    def test_patch_site(self, client):
        r = client.post("/api/agents/seo/sites", json={"domain": "d.com"}, headers=_hdr(TENANT_A))
        site_id = r.json()["site"]["id"]
        resp = client.patch(
            f"/api/agents/seo/sites/{site_id}",
            json={"crawl_limit": 100, "country": "gb", "crawl_frequency": "daily"},
            headers=_hdr(TENANT_A),
        )
        assert resp.status_code == 200
        updated = resp.json()["site"]
        assert updated["crawl_limit"] == 100
        assert updated["country"] == "gb"
        assert updated["crawl_frequency"] == "daily"

    def test_patch_clamps_crawl_limit(self, client):
        r = client.post("/api/agents/seo/sites", json={"domain": "e.com"}, headers=_hdr(TENANT_A))
        site_id = r.json()["site"]["id"]
        resp = client.patch(
            f"/api/agents/seo/sites/{site_id}",
            json={"crawl_limit": 9999},
            headers=_hdr(TENANT_A),
        )
        assert resp.status_code == 200
        assert resp.json()["site"]["crawl_limit"] <= 500

    def test_delete_site(self, client):
        r = client.post("/api/agents/seo/sites", json={"domain": "f.com"}, headers=_hdr(TENANT_A))
        site_id = r.json()["site"]["id"]
        resp = client.delete(f"/api/agents/seo/sites/{site_id}", headers=_hdr(TENANT_A))
        assert resp.status_code == 200
        # Confirm it's gone
        resp2 = client.get(f"/api/agents/seo/sites/{site_id}", headers=_hdr(TENANT_A))
        assert resp2.status_code == 404

    def test_tenant_isolation(self, client):
        """Tenant B cannot read tenant A's site."""
        r = client.post("/api/agents/seo/sites", json={"domain": "g.com"}, headers=_hdr(TENANT_A))
        site_id = r.json()["site"]["id"]
        # Tenant B trying to read tenant A's site → 404
        resp = client.get(f"/api/agents/seo/sites/{site_id}", headers=_hdr(TENANT_B))
        assert resp.status_code == 404
        # Tenant B list returns nothing
        resp2 = client.get("/api/agents/seo/sites", headers=_hdr(TENANT_B))
        assert resp2.json()["sites"] == []


# ─────────────────────────────────────────────────────────────────────────────
# 2. Crawl lifecycle
# ─────────────────────────────────────────────────────────────────────────────

class TestCrawlLifecycle:

    def _create_site(self, client, domain="crawl-test.example.com", tenant=TENANT_A, crawl_limit=10):
        r = client.post(
            "/api/agents/seo/sites",
            json={
                "domain": domain,
                "canonical_base_url": f"https://{domain}",
                "crawl_limit": crawl_limit,
            },
            headers=_hdr(tenant),
        )
        assert r.status_code == 200, r.text
        return r.json()["site"]["id"]

    def test_start_crawl_returns_job_immediately(self, client, monkeypatch):
        """POST /crawl/start must return job_id quickly (job is QUEUED in the store).

        The job is QUEUED at the time the response is built — status in the response
        body comes from the enqueue result, before any BackgroundTask runs.
        We suppress poll_once so the job stays QUEUED for status verification.
        """
        monkeypatch.setattr("seo.agent_routes.poll_once", lambda *a, **kw: None)
        site_id = self._create_site(client)
        resp = client.post(
            "/api/agents/seo/crawl/start",
            json={"site_id": site_id, "crawl_type": "site", "requested_limit": 5},
            headers=_hdr(TENANT_A),
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert "job_id" in data
        assert data["job_id"].startswith("crawl_")
        assert data["status"] == "queued"

    def test_start_crawl_persists_queued_job(self, client, monkeypatch):
        """After POST /crawl/start the job must be readable via GET /crawl/{job_id}."""
        monkeypatch.setattr("seo.agent_routes.poll_once", lambda *a, **kw: None)
        site_id = self._create_site(client)
        r = client.post(
            "/api/agents/seo/crawl/start",
            json={"site_id": site_id},
            headers=_hdr(TENANT_A),
        )
        job_id = r.json()["job_id"]
        resp = client.get(f"/api/agents/seo/crawl/{job_id}", headers=_hdr(TENANT_A))
        assert resp.status_code == 200
        job = resp.json()["job"]
        assert job["id"] == job_id
        # With poll_once suppressed, the job must still be queued.
        assert job["status"] == "queued"

    def test_crawl_full_lifecycle_with_fake_fetch(self, client, monkeypatch):
        """End-to-end: start → poll_once(fake) → pages, issues, report persisted.

        TestClient runs BackgroundTasks synchronously, so we monkeypatch
        ``seo.agent_routes.poll_once`` to a no-op before starting the crawl,
        then drive execution manually via poll_once(..., fetch=fake_fetch).
        """
        from seo.crawler.worker import poll_once

        domain = "lifecycle.example.com"
        site_id = self._create_site(client, domain=domain)

        base = f"https://{domain}"
        pages_map = {
            base + "/": {"html": _SIMPLE_HTML, "status": 200},
            base + "/about": {"html": _ABOUT_HTML, "status": 200},
        }
        fake_fetch = _make_fake_fetch(pages_map)

        # Prevent the BackgroundTask's poll_once from running (it would use
        # safe_fetch and fail on a non-existent domain).
        monkeypatch.setattr("seo.agent_routes.poll_once", lambda *a, **kw: None)

        # Start the crawl via the API (BackgroundTask poll_once is now a no-op).
        r = client.post(
            "/api/agents/seo/crawl/start",
            json={"site_id": site_id, "crawl_type": "site", "requested_limit": 5},
            headers=_hdr(TENANT_A),
        )
        assert r.status_code == 200, r.text
        job_id = r.json()["job_id"]

        # Confirm job is still queued (background worker was suppressed).
        pre = client.get(f"/api/agents/seo/crawl/{job_id}", headers=_hdr(TENANT_A))
        assert pre.json()["job"]["status"] == "queued"

        # Drive execution directly with the fake fetcher.
        processed = poll_once("test-worker", TENANT_A, fetch=fake_fetch, min_delay_s=0)
        assert processed is True

        # Check job is completed.
        job_resp = client.get(f"/api/agents/seo/crawl/{job_id}", headers=_hdr(TENANT_A))
        assert job_resp.status_code == 200
        job_data = job_resp.json()["job"]
        assert job_data["status"] == "completed", (
            f"Expected completed, got {job_data['status']} "
            f"(category={job_data.get('error_category')})"
        )

        # Pages must be persisted.
        pages_resp = client.get(f"/api/agents/seo/pages?crawl_job_id={job_id}", headers=_hdr(TENANT_A))
        assert pages_resp.status_code == 200
        pages_data = pages_resp.json()
        assert pages_data["total"] >= 1, "Expected at least one crawled page"

        # Issues list must be returned (may be empty for simple content).
        issues_resp = client.get(f"/api/agents/seo/issues?crawl_job_id={job_id}", headers=_hdr(TENANT_A))
        assert issues_resp.status_code == 200
        assert "issues" in issues_resp.json()

        # Report must be produced.
        report_resp = client.get(f"/api/agents/seo/report/{job_id}", headers=_hdr(TENANT_A))
        assert report_resp.status_code == 200
        report = report_resp.json()["report"]
        assert report is not None
        assert "score" in report
        assert 0 <= report["score"] <= 100

    def test_crawls_list_filtered_by_site(self, client, monkeypatch):
        """GET /crawls?site_id= returns only jobs for that site."""
        monkeypatch.setattr("seo.agent_routes.poll_once", lambda *a, **kw: None)
        site_a = self._create_site(client, domain="siteA.example.com")
        site_b = self._create_site(client, domain="siteB.example.com")
        client.post("/api/agents/seo/crawl/start", json={"site_id": site_a}, headers=_hdr(TENANT_A))
        client.post("/api/agents/seo/crawl/start", json={"site_id": site_b}, headers=_hdr(TENANT_A))
        resp = client.get(f"/api/agents/seo/crawls?site_id={site_a}", headers=_hdr(TENANT_A))
        assert resp.status_code == 200
        jobs = resp.json()["jobs"]
        assert all(j["site_id"] == site_a for j in jobs)

    def test_cancel_job(self, client, monkeypatch):
        """POST /crawl/{job_id}/cancel moves the job to cancelled.

        TestClient runs BackgroundTasks synchronously so we monkeypatch poll_once
        to be a no-op during job creation, leaving the job in QUEUED state so
        cancel can actually act on it.
        """
        # Prevent BackgroundTasks from running poll_once on the crawl/start request.
        monkeypatch.setattr("seo.agent_routes.poll_once", lambda *a, **kw: None)

        site_id = self._create_site(client)
        r = client.post("/api/agents/seo/crawl/start", json={"site_id": site_id}, headers=_hdr(TENANT_A))
        assert r.status_code == 200, r.text
        job_id = r.json()["job_id"]

        # Verify job is still queued (poll_once was a no-op).
        job_resp = client.get(f"/api/agents/seo/crawl/{job_id}", headers=_hdr(TENANT_A))
        assert job_resp.json()["job"]["status"] == "queued"

        cancel_resp = client.post(f"/api/agents/seo/crawl/{job_id}/cancel", headers=_hdr(TENANT_A))
        assert cancel_resp.status_code == 200, cancel_resp.text
        assert cancel_resp.json()["cancelled"] == job_id
        # Confirm the job status changed.
        job_resp = client.get(f"/api/agents/seo/crawl/{job_id}", headers=_hdr(TENANT_A))
        assert job_resp.json()["job"]["status"] == "cancelled"

    def test_retry_cancelled_job(self, client, monkeypatch):
        """POST /crawl/{job_id}/retry resets a cancelled job to queued."""
        # Prevent BackgroundTasks from actually executing poll_once.
        monkeypatch.setattr("seo.agent_routes.poll_once", lambda *a, **kw: None)

        site_id = self._create_site(client)
        r = client.post("/api/agents/seo/crawl/start", json={"site_id": site_id}, headers=_hdr(TENANT_A))
        job_id = r.json()["job_id"]
        client.post(f"/api/agents/seo/crawl/{job_id}/cancel", headers=_hdr(TENANT_A))

        retry_resp = client.post(f"/api/agents/seo/crawl/{job_id}/retry", headers=_hdr(TENANT_A))
        assert retry_resp.status_code == 200
        assert retry_resp.json()["retried"] == job_id
        job_resp = client.get(f"/api/agents/seo/crawl/{job_id}", headers=_hdr(TENANT_A))
        assert job_resp.json()["job"]["status"] == "queued"

    def test_cancel_already_terminal_fails(self, client, monkeypatch):
        """Cannot cancel a completed job — the backend returns 400."""
        from seo.crawler.worker import poll_once

        # Let the crawl actually complete via poll_once with a fake fetcher.
        # We block poll_once in the BackgroundTask here and drive it manually.
        monkeypatch.setattr("seo.agent_routes.poll_once", lambda *a, **kw: None)

        site_id = self._create_site(client, domain="terminal.example.com")
        pages_map = {"https://terminal.example.com/": {"html": _SIMPLE_HTML, "status": 200}}
        fake_fetch = _make_fake_fetch(pages_map)

        r = client.post("/api/agents/seo/crawl/start", json={"site_id": site_id}, headers=_hdr(TENANT_A))
        job_id = r.json()["job_id"]

        # Drive the crawl manually so it completes.
        poll_once("test-worker", TENANT_A, fetch=fake_fetch, min_delay_s=0)

        # Try to cancel a completed job → must fail.
        cancel_resp = client.post(f"/api/agents/seo/crawl/{job_id}/cancel", headers=_hdr(TENANT_A))
        assert cancel_resp.status_code == 400


# ─────────────────────────────────────────────────────────────────────────────
# 3. URL safety guard
# ─────────────────────────────────────────────────────────────────────────────

class TestUrlSafetyGuard:

    @pytest.mark.parametrize("bad_url", INTERNAL_URLS)
    def test_internal_url_rejected_on_crawl_start(self, client, monkeypatch, bad_url):
        """POST /crawl/start with an unsafe seed URL must return 400 unsafe_url."""
        monkeypatch.setattr("seo.agent_routes.poll_once", lambda *a, **kw: None)
        # First create a site (domain doesn't matter much here since we override url).
        r = client.post(
            "/api/agents/seo/sites",
            json={"domain": "safe.example.com", "canonical_base_url": "https://safe.example.com"},
            headers=_hdr(TENANT_A),
        )
        site_id = r.json()["site"]["id"]
        resp = client.post(
            "/api/agents/seo/crawl/start",
            json={"site_id": site_id, "url": bad_url},
            headers=_hdr(TENANT_A),
        )
        assert resp.status_code == 400, f"Expected 400 for {bad_url!r}, got {resp.status_code}"
        detail = resp.json().get("detail", {})
        assert detail.get("error") == "unsafe_url", f"Expected unsafe_url error, got {detail}"


# ─────────────────────────────────────────────────────────────────────────────
# 4. Server-side limit clamp
# ─────────────────────────────────────────────────────────────────────────────

class TestServerSideClamp:

    def test_requested_limit_clamped_to_max(self, client, monkeypatch):
        """A browser-supplied requested_limit far above the server max is clamped."""
        monkeypatch.setattr("seo.agent_routes.poll_once", lambda *a, **kw: None)
        r = client.post(
            "/api/agents/seo/sites",
            json={"domain": "clamp.example.com", "crawl_limit": 200},
            headers=_hdr(TENANT_A),
        )
        site_id = r.json()["site"]["id"]
        # Supply a limit WAY above the max (500)
        resp = client.post(
            "/api/agents/seo/crawl/start",
            json={"site_id": site_id, "requested_limit": 100_000},
            headers=_hdr(TENANT_A),
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()
        # Must be clamped to min(100_000, 500, site.crawl_limit=200) = 200
        assert data["requested_limit"] <= 500
        assert data["requested_limit"] <= 200

    def test_requested_limit_also_clamped_to_site_limit(self, client, monkeypatch):
        """The site's crawl_limit is the tighter cap when < CRAWL_LIMIT_MAX."""
        monkeypatch.setattr("seo.agent_routes.poll_once", lambda *a, **kw: None)
        r = client.post(
            "/api/agents/seo/sites",
            json={"domain": "tight.example.com", "crawl_limit": 50},
            headers=_hdr(TENANT_A),
        )
        site_id = r.json()["site"]["id"]
        resp = client.post(
            "/api/agents/seo/crawl/start",
            json={"site_id": site_id, "requested_limit": 400},
            headers=_hdr(TENANT_A),
        )
        assert resp.status_code == 200
        assert resp.json()["requested_limit"] <= 50


# ─────────────────────────────────────────────────────────────────────────────
# 5. Issues — resolve endpoint
# ─────────────────────────────────────────────────────────────────────────────

class TestIssueResolve:

    def test_resolve_issue(self, client, monkeypatch):
        """POST /issues/{issue_id}/resolve marks the issue resolved."""
        from seo.crawler.worker import poll_once

        # Suppress BackgroundTask's poll_once; we'll call it manually with fake fetch.
        monkeypatch.setattr("seo.agent_routes.poll_once", lambda *a, **kw: None)

        r = client.post(
            "/api/agents/seo/sites",
            json={"domain": "issues-test.example.com", "canonical_base_url": "https://issues-test.example.com"},
            headers=_hdr(TENANT_A),
        )
        site_id = r.json()["site"]["id"]
        pages_map = {
            "https://issues-test.example.com/": {"html": _SIMPLE_HTML, "status": 200},
            "https://issues-test.example.com/about": {"html": _ABOUT_HTML, "status": 200},
        }
        fake_fetch = _make_fake_fetch(pages_map)
        cr = client.post(
            "/api/agents/seo/crawl/start",
            json={"site_id": site_id, "crawl_type": "site"},
            headers=_hdr(TENANT_A),
        )
        job_id = cr.json()["job_id"]
        poll_once("test-worker-issues", TENANT_A, fetch=fake_fetch, min_delay_s=0)

        issues_resp = client.get(f"/api/agents/seo/issues?crawl_job_id={job_id}", headers=_hdr(TENANT_A))
        issues = issues_resp.json()["issues"]
        if not issues:
            pytest.skip("No issues generated for this crawl — skip resolve test")

        issue_id = issues[0]["id"]
        resolve_resp = client.post(f"/api/agents/seo/issues/{issue_id}/resolve", json={}, headers=_hdr(TENANT_A))
        assert resolve_resp.status_code == 200
        resolved = resolve_resp.json()["issue"]
        assert resolved["status"] == "resolved"
        assert resolved["resolved_at"]

    def test_resolve_nonexistent_issue(self, client):
        resp = client.post(
            "/api/agents/seo/issues/issue_nonexistent/resolve",
            json={},
            headers=_hdr(TENANT_A),
        )
        assert resp.status_code == 404


# ─────────────────────────────────────────────────────────────────────────────
# 6. Reports
# ─────────────────────────────────────────────────────────────────────────────

class TestReports:

    def test_report_404_when_no_crawl(self, client):
        resp = client.get("/api/agents/seo/report/crawl_nonexistent", headers=_hdr(TENANT_A))
        assert resp.status_code == 404

    def test_reports_latest_none_when_no_crawl(self, client):
        r = client.post(
            "/api/agents/seo/sites",
            json={"domain": "noreport.example.com"},
            headers=_hdr(TENANT_A),
        )
        site_id = r.json()["site"]["id"]
        resp = client.get(f"/api/agents/seo/reports?site_id={site_id}", headers=_hdr(TENANT_A))
        assert resp.status_code == 200
        assert resp.json()["report"] is None

    def test_report_produced_after_crawl(self, client, monkeypatch):
        from seo.crawler.worker import poll_once

        monkeypatch.setattr("seo.agent_routes.poll_once", lambda *a, **kw: None)

        r = client.post(
            "/api/agents/seo/sites",
            json={"domain": "report-test.example.com", "canonical_base_url": "https://report-test.example.com"},
            headers=_hdr(TENANT_A),
        )
        site_id = r.json()["site"]["id"]
        pages_map = {"https://report-test.example.com/": {"html": _SIMPLE_HTML, "status": 200}}
        fake_fetch = _make_fake_fetch(pages_map)
        cr = client.post(
            "/api/agents/seo/crawl/start",
            json={"site_id": site_id, "crawl_type": "site"},
            headers=_hdr(TENANT_A),
        )
        job_id = cr.json()["job_id"]
        poll_once("test-worker-report", TENANT_A, fetch=fake_fetch, min_delay_s=0)

        # Report by crawl_job_id
        resp = client.get(f"/api/agents/seo/report/{job_id}", headers=_hdr(TENANT_A))
        assert resp.status_code == 200
        report = resp.json()["report"]
        assert report["crawl_job_id"] == job_id
        assert 0 <= report["score"] <= 100

        # Latest report for site
        resp2 = client.get(f"/api/agents/seo/reports?site_id={site_id}", headers=_hdr(TENANT_A))
        assert resp2.status_code == 200
        latest = resp2.json()["report"]
        assert latest is not None
        assert latest["site_id"] == site_id
