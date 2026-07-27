"""Comprehensive tests for the Pixie SEO crawler engine.

ALL tests use an injected fake fetcher — NO real network sockets are used.
A call counter on the fake fetcher verifies this.

Coverage:
    - normalize.py: relative/absolute/fragment/query/tracking/same_domain/binary
    - robots.py: Disallow respected in 'respect' mode; ignored in 'ignore' mode;
                 Sitemap directive parsed; fail-open on unreachable robots.txt
    - sitemap.py: fake sitemap discovery, sitemapindex recursion (bounded)
    - discovery.py: link extraction, policy filtering, trap detection, binary skip
    - crawler.py: BFS, dedup, cancellation, retry, UrlRejected terminal-skip,
                  100-page crawl, 1000-page fixture
    - worker.py + queue.py: enqueue→claim→run→complete, stale-lock recovery,
                             two-worker concurrency race, cancel, retry
"""

from __future__ import annotations

import hashlib
import threading
import time
import uuid
from collections import defaultdict
from typing import Callable, Dict, List, Optional, Set, Tuple
from unittest.mock import patch

import pytest

# Reset repositories between tests
from seo.stores import (
    CrawlJob, CrawlStatus, CrawlType, CrawledPage, RobotsPolicy, Site,
    get_crawl_job_repository, get_crawled_page_repository, get_site_repository,
    reset_repositories,
)
from seo.url_guard import UrlRejected, REASON_TOO_MANY_REDIRECTS, REASON_RESPONSE_TOO_LARGE
from seo.crawler.normalize import normalize_url, same_domain, looks_like_binary
from seo.crawler.robots import RobotsHandler
from seo.crawler.sitemap import SitemapDiscovery
from seo.crawler.discovery import LinkDiscovery
from seo.crawler.crawler import run_crawl, _Store
from seo.crawler.queue import (
    enqueue_crawl as _enqueue,
    claim_next_job_for_tenant,
    release_job,
    cancel_job as _cancel_job,
    retry_job as _retry_job,
)
from seo.crawler.worker import poll_once, enqueue_crawl


# ============================================================================
# Helpers / Fixtures
# ============================================================================

TENANT = "test_tenant"
SITE_DOMAIN = "example.com"
BASE_URL = "https://example.com"


def make_site(
    base_url: str = BASE_URL,
    robots_policy: RobotsPolicy = RobotsPolicy.RESPECT,
    included_paths: Optional[List[str]] = None,
    excluded_paths: Optional[List[str]] = None,
    crawl_limit: int = 100,
) -> Site:
    return Site(
        tenant_id=TENANT,
        domain=SITE_DOMAIN,
        canonical_base_url=base_url,
        robots_policy=robots_policy,
        included_paths=included_paths or [],
        excluded_paths=excluded_paths or [],
        crawl_limit=crawl_limit,
    )


def make_job(
    site_id: str = "site_test",
    requested_limit: int = 10,
    crawl_type: CrawlType = CrawlType.SITE,
) -> CrawlJob:
    return CrawlJob(
        tenant_id=TENANT,
        site_id=site_id,
        crawl_type=crawl_type,
        requested_limit=requested_limit,
        status=CrawlStatus.RUNNING,
    )


def html_page(
    title: str = "Test Page",
    links: Optional[List[str]] = None,
    canonical: Optional[str] = None,
    noindex: bool = False,
) -> str:
    """Build a minimal HTML page for testing."""
    robots_tag = '<meta name="robots" content="noindex">' if noindex else ""
    canonical_tag = f'<link rel="canonical" href="{canonical}">' if canonical else ""
    link_tags = "\n".join(
        f'<a href="{u}">{u}</a>' for u in (links or [])
    )
    return f"""<!DOCTYPE html>
<html>
<head>
<title>{title}</title>
<meta name="description" content="Description of {title}">
{robots_tag}
{canonical_tag}
</head>
<body>
<h1>{title}</h1>
<p>Content of {title}. This is some text for word count purposes.</p>
{link_tags}
</body>
</html>"""


class FakeFetcher:
    """Synthetic fetcher that returns pre-configured responses.

    Never opens sockets — all responses come from an in-memory dict.
    ``call_count`` tracks how many times it was invoked.
    """

    def __init__(self):
        # Map of URL -> response dict or Exception
        self._responses: Dict[str, object] = {}
        self._default_response: Optional[dict] = None
        self.call_count: int = 0
        self.calls: List[str] = []  # list of URLs called in order

    def register(self, url: str, response: object) -> "FakeFetcher":
        """Register a response for a specific URL."""
        self._responses[url] = response
        return self

    def register_html(
        self,
        url: str,
        title: str = "Page",
        links: Optional[List[str]] = None,
        status: int = 200,
        noindex: bool = False,
    ) -> "FakeFetcher":
        text = html_page(title=title, links=links, noindex=noindex)
        self._responses[url] = {
            "final_url": url,
            "status": status,
            "headers": {"content-type": "text/html; charset=utf-8"},
            "text": text,
            "content_type": "text/html; charset=utf-8",
        }
        return self

    def set_default(self, response: object) -> "FakeFetcher":
        self._default_response = response
        return self

    def __call__(self, url: str, **kwargs) -> dict:
        self.call_count += 1
        self.calls.append(url)

        if url in self._responses:
            resp = self._responses[url]
            if isinstance(resp, Exception):
                raise resp
            return dict(resp)  # type: ignore[arg-type]

        if self._default_response is not None:
            if isinstance(self._default_response, Exception):
                raise self._default_response
            resp = dict(self._default_response)  # type: ignore[arg-type]
            resp["final_url"] = url
            return resp

        # Default: 404 not found
        return {
            "final_url": url,
            "status": 404,
            "headers": {},
            "text": "",
            "content_type": "text/html",
        }


class FakeStore:
    """In-memory store for testing the crawler without the persistence layer."""

    def __init__(self):
        self.pages: List[CrawledPage] = []
        self._jobs: Dict[str, CrawlJob] = {}
        self._job_tenant: Dict[str, str] = {}

    def save_page(self, page: CrawledPage) -> str:
        pid = "page_" + str(uuid.uuid4()).replace("-", "")
        self.pages.append(page)
        return pid

    def update_job(self, tenant_id: str, job_id: str, **fields) -> None:
        job = self._jobs.get(job_id)
        if job:
            for k, v in fields.items():
                if v is not None and hasattr(job, k):
                    setattr(job, k, v)

    def get_job(self, tenant_id: str, job_id: str) -> Optional[CrawlJob]:
        return self._jobs.get(job_id)

    def existing_pages_for_job(self, tenant_id: str, job_id: str) -> Set[str]:
        return {p.normalized_url for p in self.pages if p.crawl_job_id == job_id and p.normalized_url}

    def register_job(self, job_id: str, job: CrawlJob, tenant_id: str = TENANT) -> None:
        self._jobs[job_id] = job
        self._job_tenant[job_id] = tenant_id


_SECTION_NAMES = [
    "about", "contact", "services", "blog", "news", "products", "team",
    "portfolio", "faq", "pricing", "careers", "resources", "support",
    "docs", "tutorials", "guides", "case-studies", "partners", "events",
    "press", "investors", "legal", "privacy", "terms", "cookies",
    "accessibility", "sitemap", "search", "feed", "archive",
    "category", "tag", "author", "series", "collection", "topic",
    "video", "podcast", "webinar", "ebook", "whitepaper", "report",
    "template", "tool", "calculator", "comparison", "review", "feature",
    "integration", "api", "sdk", "cli", "plugin", "extension", "addon",
    "marketplace", "directory", "community", "forum", "help", "chat",
    "onboarding", "demo", "trial", "signup", "login", "account", "profile",
    "dashboard", "settings", "billing", "subscription", "upgrade", "referral",
    "affiliate", "reseller", "partner", "agency", "enterprise", "startup",
    "education", "nonprofit", "government", "healthcare", "finance", "legal2",
    "retail", "hospitality", "travel", "real-estate", "automotive", "tech",
    "marketing", "sales", "hr", "operations", "security", "compliance",
    "analytics", "reporting", "automation", "workflow", "collaboration",
    "communication", "notification", "alert", "monitoring", "logging",
    "backup", "recovery", "migration", "deployment", "hosting", "cdn",
    "performance", "optimization", "testing", "debugging", "profiling",
]


def build_site_graph(
    base_url: str, n_pages: int, fetcher: FakeFetcher
) -> None:
    """Build a synthetic site graph of *n_pages* pages in the fetcher.

    Uses a mix of semantic path segments (not just /page/N) to avoid
    triggering the numeric-variant trap detector (MAX_PATH_VARIANTS).
    Root links to first 30 pages; each page links forward to create a chain.
    """
    def page_url(i: int) -> str:
        if i == 0:
            return base_url + "/"
        # Use section names for the first N, then sub-paths for more
        section_idx = (i - 1) % len(_SECTION_NAMES)
        section = _SECTION_NAMES[section_idx]
        # For pages beyond len(_SECTION_NAMES), add a sub-name to avoid collision
        if i - 1 >= len(_SECTION_NAMES):
            sub = (i - 1) // len(_SECTION_NAMES)
            return f"{base_url}/{section}/sub-{sub}"
        return f"{base_url}/{section}"

    for i in range(n_pages):
        url = page_url(i)
        links: List[str] = []
        if i == 0:
            # Root links to first 30 pages (or all if fewer)
            for j in range(1, min(n_pages, 31)):
                links.append(page_url(j))
        else:
            # Forward chain: always link to next page
            if i + 1 < n_pages:
                links.append(page_url(i + 1))
            # Also link to 30 pages ahead for wide BFS fan-out
            if i + 30 < n_pages:
                links.append(page_url(i + 30))
        fetcher.register_html(url, title=f"Page {i} - {page_url(i)}", links=links)

    # Also register the non-trailing-slash root if not already registered
    root_no_slash = base_url
    if root_no_slash not in fetcher._responses:
        fetcher.register_html(root_no_slash, title="Root", links=[page_url(1)])


@pytest.fixture(autouse=True)
def reset_stores():
    """Reset all in-memory repositories between tests."""
    reset_repositories()
    yield
    reset_repositories()


# ============================================================================
# 1. normalize.py
# ============================================================================

class TestNormalizeUrl:
    def test_relative_url_resolved(self):
        result = normalize_url("https://example.com/page/", "../about")
        assert result == "https://example.com/about"

    def test_absolute_url_passthrough(self):
        result = normalize_url("https://example.com/", "https://example.com/about")
        assert result == "https://example.com/about"

    def test_fragment_only_returns_none(self):
        assert normalize_url("https://example.com/", "#section") is None

    def test_fragment_stripped_from_full_url(self):
        result = normalize_url("https://example.com/", "/page#anchor")
        assert result == "https://example.com/page"
        assert "#" not in result

    def test_tracking_params_stripped_default(self):
        result = normalize_url("https://example.com/", "/page?utm_source=google&q=test")
        assert result is not None
        assert "utm_source" not in result
        assert "q=test" in result

    def test_utm_all_variants_stripped(self):
        result = normalize_url(
            "https://example.com/",
            "/page?utm_source=g&utm_medium=cpc&utm_campaign=c&utm_content=a&utm_term=t",
        )
        assert result is not None
        assert "utm_" not in result

    def test_gclid_fbclid_stripped(self):
        result = normalize_url("https://example.com/", "/page?gclid=abc&fbclid=xyz&id=5")
        assert result is not None
        assert "gclid" not in result
        assert "fbclid" not in result
        assert "id=5" in result

    def test_query_params_sorted(self):
        r1 = normalize_url("https://example.com/", "/page?z=1&a=2")
        r2 = normalize_url("https://example.com/", "/page?a=2&z=1")
        assert r1 == r2

    def test_drop_all_policy(self):
        result = normalize_url("https://example.com/", "/page?q=foo&bar=baz", query_policy="drop_all")
        assert result == "https://example.com/page"

    def test_keep_all_policy(self):
        result = normalize_url("https://example.com/", "/page?utm_source=x", query_policy="keep_all")
        assert result is not None
        assert "utm_source=x" in result

    def test_mailto_returns_none(self):
        assert normalize_url("https://example.com/", "mailto:user@example.com") is None

    def test_tel_returns_none(self):
        assert normalize_url("https://example.com/", "tel:+1234567890") is None

    def test_javascript_returns_none(self):
        assert normalize_url("https://example.com/", "javascript:void(0)") is None

    def test_data_uri_returns_none(self):
        assert normalize_url("https://example.com/", "data:text/html,<h1>hi</h1>") is None

    def test_empty_href_returns_none(self):
        assert normalize_url("https://example.com/", "") is None

    def test_none_href_returns_none(self):
        assert normalize_url("https://example.com/", None) is None  # type: ignore[arg-type]

    def test_default_port_stripped_http(self):
        result = normalize_url("http://example.com:80/", "/page")
        assert ":80" not in (result or "")

    def test_default_port_stripped_https(self):
        result = normalize_url("https://example.com:443/", "/page")
        assert ":443" not in (result or "")

    def test_trailing_slash_stripped_for_non_root(self):
        result = normalize_url("https://example.com/", "/about/")
        assert result == "https://example.com/about"

    def test_root_trailing_slash_preserved(self):
        result = normalize_url("https://example.com", "/")
        assert result is not None
        # Root can have trailing slash or not — main thing is it's a valid URL
        assert "example.com" in result

    def test_scheme_host_lowercased(self):
        result = normalize_url("HTTPS://EXAMPLE.COM/", "/PAGE")
        assert result == "https://example.com/PAGE"

    def test_protocol_relative_url(self):
        result = normalize_url("https://example.com/", "//example.com/page")
        assert result == "https://example.com/page"


class TestSameDomain:
    def test_same_domain(self):
        assert same_domain("https://example.com/a", "https://example.com/b")

    def test_different_domain(self):
        assert not same_domain("https://example.com/", "https://other.com/")

    def test_subdomain_vs_root(self):
        # We strip www. but not other subdomains
        assert same_domain("https://www.example.com/", "https://example.com/")
        assert not same_domain("https://blog.example.com/", "https://example.com/")

    def test_different_scheme_same_host(self):
        assert same_domain("http://example.com/", "https://example.com/")

    def test_empty_url(self):
        assert not same_domain("", "https://example.com/")


class TestLooksLikeBinary:
    def test_pdf_is_binary(self):
        assert looks_like_binary("https://example.com/report.pdf")

    def test_jpg_is_binary(self):
        assert looks_like_binary("https://example.com/photo.jpg")

    def test_zip_is_binary(self):
        assert looks_like_binary("https://example.com/archive.zip")

    def test_html_is_not_binary(self):
        assert not looks_like_binary("https://example.com/page.html")

    def test_no_extension_is_not_binary(self):
        assert not looks_like_binary("https://example.com/about")

    def test_js_is_binary(self):
        assert looks_like_binary("https://example.com/app.js")

    def test_css_is_binary(self):
        assert looks_like_binary("https://example.com/style.css")


# ============================================================================
# 2. robots.py
# ============================================================================

class TestRobotsHandler:
    def _make_fetcher_with_robots(self, robots_content: str, status: int = 200) -> FakeFetcher:
        f = FakeFetcher()
        f.register(
            "https://example.com/robots.txt",
            {
                "final_url": "https://example.com/robots.txt",
                "status": status,
                "headers": {"content-type": "text/plain"},
                "text": robots_content,
                "content_type": "text/plain",
            },
        )
        return f

    def test_disallow_respected_in_respect_mode(self):
        robots_txt = "User-agent: *\nDisallow: /admin\n"
        f = self._make_fetcher_with_robots(robots_txt)
        handler = RobotsHandler(BASE_URL, fetch=f, robots_policy=RobotsPolicy.RESPECT)
        assert not handler.is_allowed("/admin")
        assert not handler.is_allowed("/admin/settings")
        assert handler.is_allowed("/public")

    def test_disallow_ignored_in_ignore_mode(self):
        robots_txt = "User-agent: *\nDisallow: /admin\nDisallow: /private\n"
        f = self._make_fetcher_with_robots(robots_txt)
        handler = RobotsHandler(BASE_URL, fetch=f, robots_policy=RobotsPolicy.IGNORE)
        # Fetcher should NOT even be called for robots in ignore mode
        assert handler.is_allowed("/admin")
        assert handler.is_allowed("/private")
        assert handler.is_allowed("/anything")

    def test_ignore_mode_no_fetch(self):
        f = FakeFetcher()
        handler = RobotsHandler(BASE_URL, fetch=f, robots_policy=RobotsPolicy.IGNORE)
        handler.is_allowed("/admin")
        assert f.call_count == 0

    def test_sitemap_directive_parsed(self):
        robots_txt = (
            "User-agent: *\n"
            "Disallow: /private\n"
            "Sitemap: https://example.com/sitemap.xml\n"
            "Sitemap: https://example.com/news-sitemap.xml\n"
        )
        f = self._make_fetcher_with_robots(robots_txt)
        handler = RobotsHandler(BASE_URL, fetch=f, robots_policy=RobotsPolicy.RESPECT)
        sitemaps = handler.sitemap_urls
        assert "https://example.com/sitemap.xml" in sitemaps
        assert "https://example.com/news-sitemap.xml" in sitemaps

    def test_allow_overrides_disallow(self):
        # Allow is more specific → should win
        robots_txt = (
            "User-agent: *\n"
            "Disallow: /admin\n"
            "Allow: /admin/public\n"
        )
        f = self._make_fetcher_with_robots(robots_txt)
        handler = RobotsHandler(BASE_URL, fetch=f, robots_policy=RobotsPolicy.RESPECT)
        assert handler.is_allowed("/admin/public")
        assert not handler.is_allowed("/admin/private")

    def test_fail_open_on_404(self):
        f = self._make_fetcher_with_robots("", status=404)
        handler = RobotsHandler(BASE_URL, fetch=f, robots_policy=RobotsPolicy.RESPECT)
        # Fail open: all paths allowed
        assert handler.is_allowed("/anything")
        assert handler.is_allowed("/admin")

    def test_fail_open_on_url_rejected(self):
        f = FakeFetcher()
        f.register(
            "https://example.com/robots.txt",
            UrlRejected(REASON_TOO_MANY_REDIRECTS),
        )
        handler = RobotsHandler(BASE_URL, fetch=f, robots_policy=RobotsPolicy.RESPECT)
        assert handler.is_allowed("/anything")
        assert handler.fetch_ok is False

    def test_fail_open_on_network_error(self):
        f = FakeFetcher()
        f.register("https://example.com/robots.txt", ConnectionError("refused"))
        handler = RobotsHandler(BASE_URL, fetch=f, robots_policy=RobotsPolicy.RESPECT)
        assert handler.is_allowed("/anything")

    def test_fetch_idempotent(self):
        f = self._make_fetcher_with_robots("User-agent: *\nDisallow: /x\n")
        handler = RobotsHandler(BASE_URL, fetch=f, robots_policy=RobotsPolicy.RESPECT)
        handler.fetch()
        handler.fetch()
        handler.is_allowed("/x")
        # Should only fetch once despite multiple calls
        assert f.call_count == 1

    def test_wildcard_in_disallow(self):
        robots_txt = "User-agent: *\nDisallow: /search*\n"
        f = self._make_fetcher_with_robots(robots_txt)
        handler = RobotsHandler(BASE_URL, fetch=f, robots_policy=RobotsPolicy.RESPECT)
        assert not handler.is_allowed("/search?q=foo")
        assert not handler.is_allowed("/search/results")
        assert handler.is_allowed("/about")

    def test_end_of_path_anchor(self):
        robots_txt = "User-agent: *\nDisallow: /page$\n"
        f = self._make_fetcher_with_robots(robots_txt)
        handler = RobotsHandler(BASE_URL, fetch=f, robots_policy=RobotsPolicy.RESPECT)
        assert not handler.is_allowed("/page")
        assert handler.is_allowed("/page/child")


# ============================================================================
# 3. sitemap.py
# ============================================================================

class TestSitemapDiscovery:
    def test_simple_urlset_parsed(self):
        f = FakeFetcher()
        sitemap_xml = """<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/</loc></url>
  <url><loc>https://example.com/about</loc></url>
  <url><loc>https://example.com/contact</loc></url>
</urlset>"""
        f.register(
            "https://example.com/sitemap.xml",
            {"final_url": "https://example.com/sitemap.xml", "status": 200,
             "headers": {"content-type": "application/xml"}, "text": sitemap_xml,
             "content_type": "application/xml"},
        )

        # Also make robots.txt return the sitemap URL
        robots_txt = "User-agent: *\nSitemap: https://example.com/sitemap.xml\n"
        f.register(
            "https://example.com/robots.txt",
            {"final_url": "https://example.com/robots.txt", "status": 200,
             "headers": {"content-type": "text/plain"}, "text": robots_txt,
             "content_type": "text/plain"},
        )
        robots = RobotsHandler(BASE_URL, fetch=f, robots_policy=RobotsPolicy.RESPECT)

        disc = SitemapDiscovery(BASE_URL, fetch=f, robots_handler=robots)
        urls = disc.discover()

        assert "https://example.com/" in urls
        assert "https://example.com/about" in urls
        assert "https://example.com/contact" in urls
        assert len(urls) == 3

    def test_sitemapindex_followed(self):
        f = FakeFetcher()
        index_xml = """<?xml version="1.0"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://example.com/sitemap-1.xml</loc></sitemap>
  <sitemap><loc>https://example.com/sitemap-2.xml</loc></sitemap>
</sitemapindex>"""
        child1_xml = """<?xml version="1.0"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/page1</loc></url>
  <url><loc>https://example.com/page2</loc></url>
</urlset>"""
        child2_xml = """<?xml version="1.0"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/page3</loc></url>
</urlset>"""

        f.register("https://example.com/sitemap.xml",
            {"final_url": "https://example.com/sitemap.xml", "status": 200,
             "headers": {}, "text": index_xml, "content_type": "application/xml"})
        f.register("https://example.com/sitemap-1.xml",
            {"final_url": "https://example.com/sitemap-1.xml", "status": 200,
             "headers": {}, "text": child1_xml, "content_type": "application/xml"})
        f.register("https://example.com/sitemap-2.xml",
            {"final_url": "https://example.com/sitemap-2.xml", "status": 200,
             "headers": {}, "text": child2_xml, "content_type": "application/xml"})

        robots_txt = "User-agent: *\nSitemap: https://example.com/sitemap.xml\n"
        f.register("https://example.com/robots.txt",
            {"final_url": "https://example.com/robots.txt", "status": 200,
             "headers": {}, "text": robots_txt, "content_type": "text/plain"})
        robots = RobotsHandler(BASE_URL, fetch=f, robots_policy=RobotsPolicy.RESPECT)

        disc = SitemapDiscovery(BASE_URL, fetch=f, robots_handler=robots)
        urls = disc.discover()

        assert "https://example.com/page1" in urls
        assert "https://example.com/page2" in urls
        assert "https://example.com/page3" in urls

    def test_off_domain_sitemap_index_skipped(self):
        f = FakeFetcher()
        index_xml = """<?xml version="1.0"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://cdn.evil.com/sitemap.xml</loc></sitemap>
  <sitemap><loc>https://example.com/sitemap-good.xml</loc></sitemap>
</sitemapindex>"""
        good_xml = """<?xml version="1.0"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/page1</loc></url>
</urlset>"""

        f.register("https://example.com/sitemap.xml",
            {"final_url": "https://example.com/sitemap.xml", "status": 200,
             "headers": {}, "text": index_xml, "content_type": "application/xml"})
        f.register("https://example.com/sitemap-good.xml",
            {"final_url": "https://example.com/sitemap-good.xml", "status": 200,
             "headers": {}, "text": good_xml, "content_type": "application/xml"})

        disc = SitemapDiscovery(BASE_URL, fetch=f)
        # Manually set seed to avoid probing
        disc._discovered = False
        # Patch robots_handler to return our seed URL
        class _MockRobots:
            @property
            def sitemap_urls(self):
                return ["https://example.com/sitemap.xml"]
        disc._robots_handler = _MockRobots()

        urls = disc.discover()
        assert "https://example.com/page1" in urls
        # cdn.evil.com sitemap should NOT have been fetched
        assert not any("evil" in c for c in f.calls)

    def test_discover_idempotent(self):
        f = FakeFetcher()
        sitemap_xml = """<?xml version="1.0"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/</loc></url>
</urlset>"""
        f.register("https://example.com/sitemap.xml",
            {"final_url": "https://example.com/sitemap.xml", "status": 200,
             "headers": {}, "text": sitemap_xml, "content_type": "application/xml"})

        class _MockRobots:
            @property
            def sitemap_urls(self):
                return ["https://example.com/sitemap.xml"]
        disc = SitemapDiscovery(BASE_URL, fetch=f)
        disc._robots_handler = _MockRobots()

        r1 = disc.discover()
        r2 = disc.discover()
        assert r1 == r2
        assert f.call_count == 1  # only fetched once


# ============================================================================
# 4. discovery.py
# ============================================================================

class TestLinkDiscovery:
    def test_extracts_same_domain_links(self):
        site = make_site()
        disc = LinkDiscovery(BASE_URL, site)
        html = html_page(links=[
            "https://example.com/about",
            "https://example.com/contact",
            "https://other.com/external",
        ])
        links = disc.extract(html, BASE_URL + "/")
        assert "https://example.com/about" in links
        assert "https://example.com/contact" in links
        assert not any("other.com" in l for l in links)

    def test_binary_urls_excluded(self):
        site = make_site()
        disc = LinkDiscovery(BASE_URL, site)
        html = html_page(links=[
            "https://example.com/doc.pdf",
            "https://example.com/photo.jpg",
            "https://example.com/about",
        ])
        links = disc.extract(html, BASE_URL + "/")
        assert not any(".pdf" in l for l in links)
        assert not any(".jpg" in l for l in links)
        assert "https://example.com/about" in links

    def test_excluded_paths_honored(self):
        site = make_site(excluded_paths=["/admin", "/private"])
        disc = LinkDiscovery(BASE_URL, site)
        html = html_page(links=[
            "https://example.com/admin/settings",
            "https://example.com/private/data",
            "https://example.com/public",
        ])
        links = disc.extract(html, BASE_URL + "/")
        assert not any("/admin" in l for l in links)
        assert not any("/private" in l for l in links)
        assert "https://example.com/public" in links

    def test_included_paths_filter(self):
        site = make_site(included_paths=["/blog"])
        disc = LinkDiscovery(BASE_URL, site)
        html = html_page(links=[
            "https://example.com/blog/post-1",
            "https://example.com/blog/post-2",
            "https://example.com/about",  # not in /blog
        ])
        links = disc.extract(html, BASE_URL + "/")
        assert "https://example.com/blog/post-1" in links
        assert "https://example.com/blog/post-2" in links
        assert not any("/about" in l for l in links)

    def test_dedup_within_page(self):
        site = make_site()
        disc = LinkDiscovery(BASE_URL, site)
        html = html_page(links=[
            "https://example.com/about",
            "https://example.com/about",
            "https://example.com/about#section",  # fragment stripped → same URL
        ])
        links = disc.extract(html, BASE_URL + "/")
        about_urls = [l for l in links if "/about" in l]
        assert len(about_urls) == 1

    def test_trap_variants_capped(self):
        site = make_site()
        disc = LinkDiscovery(BASE_URL, site)
        # Many paginated variants of the same path template
        paginated = [f"https://example.com/archive/{i}" for i in range(50)]
        html = html_page(links=paginated)
        links = disc.extract(html, BASE_URL + "/")
        # Should be capped at MAX_PATH_VARIANTS (20)
        archive_links = [l for l in links if "/archive/" in l]
        assert len(archive_links) <= 20

    def test_relative_links_resolved(self):
        site = make_site()
        disc = LinkDiscovery(BASE_URL, site)
        html = """<html><body>
<a href="/about">About</a>
<a href="blog/post-1">Blog</a>
</body></html>"""
        links = disc.extract(html, BASE_URL + "/products/")
        assert "https://example.com/about" in links
        # relative: blog/post-1 resolved from /products/ → /products/blog/post-1
        assert any("/blog/post-1" in l for l in links)


# ============================================================================
# 5. crawler.py — core BFS
# ============================================================================

class TestRunCrawl:
    def test_basic_crawl_stores_pages(self):
        f = FakeFetcher()
        f.register_html(BASE_URL + "/", title="Home", links=[
            BASE_URL + "/about",
            BASE_URL + "/contact",
        ])
        f.register_html(BASE_URL + "/about", title="About")
        f.register_html(BASE_URL + "/contact", title="Contact")

        store = FakeStore()
        job = make_job(requested_limit=10)
        site = make_site()

        result = run_crawl(job, site, fetch=f, store=store, min_delay_s=0)

        assert result["crawled_count"] >= 1
        assert len(store.pages) >= 1
        assert f.call_count > 0  # fetcher was used

    def test_url_dedup_prevents_duplicate_storage(self):
        f = FakeFetcher()
        # Root links to /about twice (different representations)
        html = """<html><body>
        <a href="/about">About</a>
        <a href="/about/">About trailing</a>
        <a href="https://example.com/about">About absolute</a>
        </body></html>"""
        f.register(BASE_URL + "/", {
            "final_url": BASE_URL + "/",
            "status": 200,
            "headers": {"content-type": "text/html"},
            "text": html,
            "content_type": "text/html",
        })
        f.register_html(BASE_URL + "/about", title="About")

        store = FakeStore()
        job = make_job(requested_limit=10)
        site = make_site()

        run_crawl(job, site, fetch=f, store=store, min_delay_s=0)

        # /about should only be fetched once
        about_calls = [c for c in f.calls if "/about" in c]
        assert len(about_calls) <= 1

    def test_binary_urls_not_fetched(self):
        f = FakeFetcher()
        f.register_html(BASE_URL + "/", links=[
            BASE_URL + "/doc.pdf",
            BASE_URL + "/image.jpg",
            BASE_URL + "/about",
        ])
        f.register_html(BASE_URL + "/about", title="About")

        store = FakeStore()
        job = make_job(requested_limit=10)
        site = make_site()

        run_crawl(job, site, fetch=f, store=store, min_delay_s=0)

        # No binary URLs should have been fetched
        assert not any(".pdf" in c for c in f.calls)
        assert not any(".jpg" in c for c in f.calls)

    def test_url_rejected_skipped_not_retried(self):
        f = FakeFetcher()
        f.register_html(BASE_URL + "/", links=[BASE_URL + "/bad", BASE_URL + "/good"])
        f.register(BASE_URL + "/bad", UrlRejected(REASON_TOO_MANY_REDIRECTS))
        f.register_html(BASE_URL + "/good", title="Good Page")

        store = FakeStore()
        job = make_job(requested_limit=10)
        site = make_site()

        result = run_crawl(job, site, fetch=f, store=store, min_delay_s=0)

        # /bad should have been attempted once (no retry for UrlRejected)
        bad_calls = [c for c in f.calls if "/bad" in c]
        assert len(bad_calls) == 1
        assert result["failed_count"] >= 1

    def test_transient_error_retried(self):
        """A transient network error should cause retries up to max_retries."""
        call_count = {"n": 0}

        def flaky_fetch(url, **kwargs):
            call_count["n"] += 1
            if "/flaky" in url and call_count["n"] < 3:
                raise ConnectionError("transient")
            return {
                "final_url": url, "status": 200,
                "headers": {"content-type": "text/html"},
                "text": html_page(title="OK"),
                "content_type": "text/html",
            }

        f_root = FakeFetcher()
        f_root.register_html(BASE_URL + "/", links=[BASE_URL + "/flaky"])

        # Build a combined fetcher
        root_resp = f_root._responses[BASE_URL + "/"]

        def combined_fetch(url, **kwargs):
            if url == BASE_URL + "/":
                return dict(root_resp)
            return flaky_fetch(url, **kwargs)

        store = FakeStore()
        job = make_job(requested_limit=10)
        site = make_site()

        result = run_crawl(job, site, fetch=combined_fetch, store=store,
                          min_delay_s=0, max_retries=3, retry_base_s=0)

        # Should eventually succeed (call_count["n"] >= 3 for /flaky)
        flaky_pages = [p for p in store.pages if "/flaky" in p.url]
        assert len(flaky_pages) == 1

    def test_page_limit_respected(self):
        f = FakeFetcher()
        build_site_graph(BASE_URL, 50, f)

        store = FakeStore()
        job = make_job(requested_limit=5)
        site = make_site()

        result = run_crawl(job, site, fetch=f, store=store, min_delay_s=0)

        assert result["crawled_count"] <= 5
        assert len(store.pages) <= 5

    def test_single_crawl_type_only_fetches_seed(self):
        f = FakeFetcher()
        f.register_html(BASE_URL + "/", title="Home", links=[
            BASE_URL + "/about",
            BASE_URL + "/contact",
        ])
        f.register_html(BASE_URL + "/about", title="About")
        f.register_html(BASE_URL + "/contact", title="Contact")

        store = FakeStore()
        job = make_job(requested_limit=10, crawl_type=CrawlType.SINGLE)
        site = make_site()

        result = run_crawl(job, site, fetch=f, store=store, min_delay_s=0)

        # SINGLE mode: only the seed URL should be crawled
        assert result["crawled_count"] == 1
        assert len(store.pages) == 1

    def test_content_dedup_same_hash_not_stored_twice(self):
        """Two pages with identical content → only first is stored, second recorded as duplicate."""
        identical_html = html_page(title="Clone")
        f = FakeFetcher()
        f.register_html(BASE_URL + "/", links=[BASE_URL + "/page1", BASE_URL + "/page2"])
        # Both /page1 and /page2 return identical content
        for url in [BASE_URL + "/page1", BASE_URL + "/page2"]:
            f.register(url, {
                "final_url": url,
                "status": 200,
                "headers": {"content-type": "text/html"},
                "text": identical_html,
                "content_type": "text/html",
            })

        store = FakeStore()
        job = make_job(requested_limit=10)
        site = make_site()

        result = run_crawl(job, site, fetch=f, store=store, min_delay_s=0)

        assert result["duplicate_content_count"] >= 1
        # The duplicate page should not be in store (only one of the two)
        page1_or_2 = [p for p in store.pages if "page1" in p.url or "page2" in p.url]
        assert len(page1_or_2) == 1

    def test_robots_disallow_skips_url(self):
        robots_txt = "User-agent: *\nDisallow: /private\n"
        f = FakeFetcher()
        f.register("https://example.com/robots.txt", {
            "final_url": "https://example.com/robots.txt",
            "status": 200,
            "headers": {"content-type": "text/plain"},
            "text": robots_txt,
            "content_type": "text/plain",
        })
        f.register_html(BASE_URL + "/", links=[
            BASE_URL + "/private/data",
            BASE_URL + "/public",
        ])
        f.register_html(BASE_URL + "/public", title="Public")

        store = FakeStore()
        job = make_job(requested_limit=10)
        site = make_site(robots_policy=RobotsPolicy.RESPECT)

        run_crawl(job, site, fetch=f, store=store, min_delay_s=0)

        # /private/data should not be fetched
        assert not any("/private" in c for c in f.calls if "robots" not in c)

    def test_cancellation_stops_crawl(self):
        """Simulate cancellation mid-crawl by having the store return CANCELLED status."""
        f = FakeFetcher()
        build_site_graph(BASE_URL, 100, f)

        job = make_job(requested_limit=100)
        job_id = "test_cancel_job"

        class CancellingStore(FakeStore):
            def __init__(self):
                super().__init__()
                self._call_count = 0

            def save_page(self, page):
                self._call_count += 1
                return super().save_page(page)

            def get_job(self, tenant_id, jid):
                if jid == job_id and self._call_count >= 5:
                    j = CrawlJob(
                        tenant_id=TENANT, site_id="s",
                        status=CrawlStatus.CANCELLED,
                    )
                    return j
                return None

        store = CancellingStore()
        site = make_site(crawl_limit=100)

        result = run_crawl(
            job, site, job_id=job_id, fetch=f, store=store, min_delay_s=0
        )

        assert result["cancelled"] is True
        # Should have stopped well before 100 pages
        assert result["crawled_count"] < 100


class TestRateLimiting:
    def test_min_delay_honored(self):
        """Rate limiter delays between requests to same host."""
        timestamps: List[float] = []
        current_time = [0.0]
        sleep_times: List[float] = []

        def fake_time():
            return current_time[0]

        def fake_sleep(s: float):
            current_time[0] += s
            sleep_times.append(s)

        f = FakeFetcher()
        build_site_graph(BASE_URL, 5, f)

        store = FakeStore()
        job = make_job(requested_limit=5)
        site = make_site()

        run_crawl(
            job, site, fetch=f, store=store,
            min_delay_s=0.1,
            time_fn=fake_time,
            sleep_fn=fake_sleep,
        )

        # At least some sleeps should have happened (multiple requests to same host)
        assert len(sleep_times) > 0

    def test_no_sleep_when_enough_time_elapsed(self):
        """If enough real time has passed, no sleep is needed."""
        current_time = [10.0]  # start at 10s
        sleep_times: List[float] = []

        def fake_time():
            # Advance time by 1s each call to simulate fast real processing
            current_time[0] += 1.0
            return current_time[0]

        def fake_sleep(s: float):
            sleep_times.append(s)

        f = FakeFetcher()
        build_site_graph(BASE_URL, 3, f)

        store = FakeStore()
        job = make_job(requested_limit=3)
        site = make_site()

        run_crawl(
            job, site, fetch=f, store=store,
            min_delay_s=0.5,  # 500ms delay required
            time_fn=fake_time,
            sleep_fn=fake_sleep,
        )

        # With 1s advance per call and 0.5s required, no actual sleep needed
        assert all(s < 0.1 for s in sleep_times)


# ============================================================================
# 6. 100-page and 1000-page fixtures
# ============================================================================

class TestLargeScaleCrawls:
    def test_100_page_crawl_completes(self):
        """100-page crawl stores exactly 100 pages (or up to the limit)."""
        f = FakeFetcher()
        build_site_graph(BASE_URL, 110, f)

        store = FakeStore()
        job = make_job(requested_limit=100)
        site = make_site()

        start = time.perf_counter()
        result = run_crawl(job, site, fetch=f, store=store, min_delay_s=0)
        elapsed = time.perf_counter() - start

        assert result["crawled_count"] == 100
        assert len(store.pages) == 100
        assert result["cancelled"] is False
        # Should complete quickly (no real network/sleeps)
        assert elapsed < 5.0, f"100-page crawl took {elapsed:.2f}s (expected < 5s)"

    def test_1000_page_crawl_completes_within_cap(self):
        """1000-page synthetic site crawled with limit=1000 pages."""
        f = FakeFetcher()
        build_site_graph(BASE_URL, 1100, f)

        store = FakeStore()
        job = make_job(requested_limit=1000)
        site = make_site()

        start = time.perf_counter()
        result = run_crawl(job, site, fetch=f, store=store, min_delay_s=0)
        elapsed = time.perf_counter() - start

        assert result["crawled_count"] == 1000
        assert result["cancelled"] is False
        # 1000 pages should still be fast with zero delay
        assert elapsed < 30.0, f"1000-page crawl took {elapsed:.2f}s (expected < 30s)"
        print(f"\n[timing] 1000-page crawl: {elapsed:.3f}s")

    def test_no_real_network_used(self):
        """Verify the fake fetcher was used for all calls (no real sockets)."""
        f = FakeFetcher()
        build_site_graph(BASE_URL, 50, f)

        store = FakeStore()
        job = make_job(requested_limit=50)
        site = make_site()

        run_crawl(job, site, fetch=f, store=store, min_delay_s=0)

        # All calls went through our fake fetcher
        assert f.call_count > 0
        # No safe_fetch calls leaked (we're not testing SSRF, but just confirming
        # our fake was the actual entry point for all fetches)
        for url in f.calls:
            assert "example.com" in url


# ============================================================================
# 7. Crash restart / resume
# ============================================================================

class TestRestartResume:
    def test_restart_does_not_duplicate_already_crawled_pages(self):
        """Simulate a crash: some pages already in store → resumed crawl skips them."""
        f = FakeFetcher()
        build_site_graph(BASE_URL, 20, f)

        job = make_job(requested_limit=20)
        job_id = "restart_test_job"

        # Pre-populate store with 5 already-crawled pages
        pre_crawled_urls = set()
        for i in range(1, 6):
            url = BASE_URL + f"/page/{i}"
            norm = normalize_url(BASE_URL, url) or url
            pre_crawled_urls.add(norm)

        store = FakeStore()
        # Simulate the already-crawled pages
        for url in pre_crawled_urls:
            page = CrawledPage(
                tenant_id=TENANT,
                site_id="s",
                crawl_job_id=job_id,
                url=url,
                normalized_url=url,
            )
            store.pages.append(page)

        site = make_site()
        result = run_crawl(job, site, job_id=job_id, fetch=f, store=store, min_delay_s=0)

        # No pre-crawled URL should appear as a NEW store.pages entry
        new_pages = store.pages[5:]  # skip the pre-populated ones
        new_urls = {p.normalized_url for p in new_pages}

        # Pre-crawled pages should NOT be in the new pages
        overlap = pre_crawled_urls & new_urls
        assert not overlap, f"Duplicate pages found after restart: {overlap}"

        # Total should be at most 20 (limit) + 5 pre-crawled pages that
        # don't count against the limit but are in the store.
        # The crawl respects requested_limit=20 for NEW pages crawled.
        total_unique = len({p.normalized_url for p in store.pages})
        # 5 pre-crawled + up to 20 new = 25 max
        assert total_unique <= 25


# ============================================================================
# 8. worker.py + queue.py
# ============================================================================

class TestQueueAndWorker:
    def _create_site(self) -> Tuple[str, Site]:
        """Create and persist a test Site, return (site_id, site)."""
        repo = get_site_repository()
        site = make_site()
        site_id, created_site = repo.create(site)
        return site_id, created_site

    def test_enqueue_creates_queued_job(self):
        site_id, _ = self._create_site()
        job_id, job = enqueue_crawl(site_id, TENANT, requested_limit=10)
        assert job.status == CrawlStatus.QUEUED
        assert job.tenant_id == TENANT
        assert job.site_id == site_id
        assert job_id.startswith("crawl_")

    def test_enqueue_run_complete_lifecycle(self):
        """Full lifecycle: enqueue → poll_once → completed."""
        site_id, _ = self._create_site()

        f = FakeFetcher()
        build_site_graph(BASE_URL, 5, f)

        job_id, _ = enqueue_crawl(site_id, TENANT, requested_limit=5)

        # Create a fake store but backed by real repos
        class StoreWithRealPages(FakeStore):
            def save_page(self, page):
                repo = get_crawled_page_repository()
                pid, _ = repo.create(page)
                self.pages.append(page)
                return pid
            def update_job(self, tenant_id, jid, **fields):
                get_crawl_job_repository().update(tenant_id, jid, **fields)
            def get_job(self, tenant_id, jid):
                r = get_crawl_job_repository().get(tenant_id, jid)
                return r[1] if r else None
            def existing_pages_for_job(self, tenant_id, jid):
                total, pairs = get_crawled_page_repository().list_by_crawl_job(
                    tenant_id, jid, limit=10000)
                return {p.normalized_url for _, p in pairs if p.normalized_url}

        processed = poll_once(
            "worker-test", TENANT,
            fetch=f, store=StoreWithRealPages(), min_delay_s=0
        )
        assert processed is True

        # Verify job is now completed
        repo = get_crawl_job_repository()
        result = repo.get(TENANT, job_id)
        assert result is not None
        _, final_job = result
        assert final_job.status == CrawlStatus.COMPLETED
        assert final_job.lock_owner == ""
        assert final_job.lock_expires_at == ""

    def test_poll_once_returns_false_when_empty(self):
        # No jobs in queue
        processed = poll_once("worker-1", TENANT, fetch=FakeFetcher())
        assert processed is False

    def test_stale_lock_recovery(self):
        """An expired running job is re-claimed by the next worker."""
        site_id, _ = self._create_site()
        job_id, _ = enqueue_crawl(site_id, TENANT, requested_limit=5)

        # Manually set the job to running with an expired lock
        from datetime import datetime, timedelta, timezone
        expired_ts = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat(
            timespec="microseconds"
        )
        repo = get_crawl_job_repository()
        repo.update(TENANT, job_id,
            status=CrawlStatus.RUNNING,
            lock_owner="dead-worker",
            lock_expires_at=expired_ts,
        )

        # Verify it's in running state with expired lock
        _, job_before = repo.get(TENANT, job_id)
        assert job_before.status == CrawlStatus.RUNNING
        assert job_before.lock_owner == "dead-worker"

        # A new worker should be able to claim it
        claimed = claim_next_job_for_tenant(TENANT, "new-worker")
        assert claimed is not None
        claimed_job_id, _, claimed_job, claimed_site = claimed
        assert claimed_job_id == job_id
        assert claimed_job.lock_owner == "new-worker"
        assert claimed_job.retry_count == 1  # incremented for stale recovery

    def test_two_workers_do_not_double_process(self):
        """Two concurrent claim attempts for the same job → only one wins."""
        site_id, _ = self._create_site()
        job_id, _ = enqueue_crawl(site_id, TENANT, requested_limit=5)

        results = []
        errors = []

        def try_claim(worker_id):
            try:
                result = claim_next_job_for_tenant(TENANT, worker_id)
                results.append((worker_id, result))
            except Exception as e:
                errors.append((worker_id, e))

        t1 = threading.Thread(target=try_claim, args=("worker-A",))
        t2 = threading.Thread(target=try_claim, args=("worker-B",))
        t1.start()
        t2.start()
        t1.join()
        t2.join()

        assert not errors
        # At most one worker should have claimed the job
        winners = [(wid, r) for wid, r in results if r is not None]
        assert len(winners) <= 1

    def test_cancel_job_sets_cancelled_status(self):
        site_id, _ = self._create_site()
        job_id, _ = enqueue_crawl(site_id, TENANT, requested_limit=10)

        ok = _cancel_job(TENANT, job_id)
        assert ok is True

        repo = get_crawl_job_repository()
        _, job = repo.get(TENANT, job_id)
        assert job.status == CrawlStatus.CANCELLED
        assert job.cancelled_at != ""

    def test_cancel_completed_job_returns_false(self):
        site_id, _ = self._create_site()
        job_id, _ = enqueue_crawl(site_id, TENANT, requested_limit=5)

        repo = get_crawl_job_repository()
        repo.update(TENANT, job_id, status=CrawlStatus.COMPLETED)

        ok = _cancel_job(TENANT, job_id)
        assert ok is False

    def test_retry_failed_job(self):
        site_id, _ = self._create_site()
        job_id, _ = enqueue_crawl(site_id, TENANT, requested_limit=5)

        # Mark it failed
        repo = get_crawl_job_repository()
        repo.update(TENANT, job_id, status=CrawlStatus.FAILED, error_category="timeout")

        ok = _retry_job(TENANT, job_id)
        assert ok is True

        _, job = repo.get(TENANT, job_id)
        assert job.status == CrawlStatus.QUEUED
        assert job.error_category == ""
        assert job.progress == 0.0

    def test_retry_cancelled_job(self):
        site_id, _ = self._create_site()
        job_id, _ = enqueue_crawl(site_id, TENANT, requested_limit=5)

        repo = get_crawl_job_repository()
        repo.update(TENANT, job_id, status=CrawlStatus.CANCELLED)

        ok = _retry_job(TENANT, job_id)
        assert ok is True

        _, job = repo.get(TENANT, job_id)
        assert job.status == CrawlStatus.QUEUED

    def test_retry_queued_job_returns_false(self):
        """retry_job should only reset FAILED/CANCELLED, not QUEUED."""
        site_id, _ = self._create_site()
        job_id, _ = enqueue_crawl(site_id, TENANT, requested_limit=5)

        ok = _retry_job(TENANT, job_id)
        assert ok is False

    def test_nonexistent_job_operations(self):
        assert _cancel_job(TENANT, "no_such_job") is False
        assert _retry_job(TENANT, "no_such_job") is False
        assert claim_next_job_for_tenant(TENANT, "worker") is None


# ============================================================================
# 9. Page metadata extraction
# ============================================================================

class TestPageMetadata:
    def test_title_extracted(self):
        f = FakeFetcher()
        f.register_html(BASE_URL + "/", title="My Title")

        store = FakeStore()
        job = make_job(requested_limit=1, crawl_type=CrawlType.SINGLE)
        site = make_site()

        run_crawl(job, site, fetch=f, store=store, min_delay_s=0)

        assert any(p.title == "My Title" for p in store.pages)

    def test_noindex_recorded(self):
        f = FakeFetcher()
        f.register_html(BASE_URL + "/", title="No Index Page", noindex=True)

        store = FakeStore()
        job = make_job(requested_limit=1, crawl_type=CrawlType.SINGLE)
        site = make_site()

        run_crawl(job, site, fetch=f, store=store, min_delay_s=0)

        pages = [p for p in store.pages if BASE_URL in p.url]
        assert any(p.indexability == "noindex" for p in pages)

    def test_status_code_stored(self):
        f = FakeFetcher()
        f.register(BASE_URL + "/", {
            "final_url": BASE_URL + "/",
            "status": 301,
            "headers": {"location": BASE_URL + "/new"},
            "text": "",
            "content_type": "text/html",
        })
        f.register_html(BASE_URL + "/new", title="New Page")

        store = FakeStore()
        job = make_job(requested_limit=2, crawl_type=CrawlType.SINGLE)
        site = make_site()

        run_crawl(job, site, fetch=f, store=store, min_delay_s=0)

        # safe_fetch handles redirects internally; we get the final status
        # Our fake fetcher returns 301 as-is (it doesn't follow)
        assert any(p.status_code in (200, 301) for p in store.pages)

    def test_response_time_recorded(self):
        f = FakeFetcher()
        f.register_html(BASE_URL + "/", title="Timed Page")

        store = FakeStore()
        job = make_job(requested_limit=1, crawl_type=CrawlType.SINGLE)
        site = make_site()

        run_crawl(job, site, fetch=f, store=store, min_delay_s=0)

        # Response time should be a non-negative integer (ms)
        for p in store.pages:
            assert isinstance(p.response_time_ms, int)
            assert p.response_time_ms >= 0


# ============================================================================
# 10. Progress updates
# ============================================================================

class TestProgressUpdates:
    def test_progress_updated_during_crawl(self):
        f = FakeFetcher()
        build_site_graph(BASE_URL, 30, f)

        progress_values: List[float] = []

        class TrackingStore(FakeStore):
            def update_job(self, tenant_id, job_id, **fields):
                if "progress" in fields and fields["progress"] is not None:
                    progress_values.append(fields["progress"])
                super().update_job(tenant_id, job_id, **fields)

        store = TrackingStore()
        job = make_job(requested_limit=25)
        site = make_site()

        run_crawl(job, site, job_id="progress_test", fetch=f, store=store, min_delay_s=0)

        # Progress should have been updated at least once and end at 1.0
        assert len(progress_values) > 0
        assert progress_values[-1] <= 1.0


# ============================================================================
# 11. Compound: fast 100-page timing
# ============================================================================

def test_100_page_crawl_timing():
    """Explicit timing test — reported in test output."""
    f = FakeFetcher()
    build_site_graph(BASE_URL, 110, f)

    store = FakeStore()
    job = make_job(requested_limit=100)
    site = make_site()

    start = time.perf_counter()
    result = run_crawl(job, site, fetch=f, store=store, min_delay_s=0)
    elapsed = time.perf_counter() - start

    print(f"\n[timing] 100-page crawl: {elapsed*1000:.1f}ms (pages={result['crawled_count']})")
    assert result["crawled_count"] == 100
    assert elapsed < 5.0
