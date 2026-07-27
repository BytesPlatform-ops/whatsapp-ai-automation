"""Tests for seo.analysis: link_graph, cross_page, report.

ALL tests are synthetic — no network calls, no paid AI calls.
CrawledPage / SeoIssue rows are created in-memory via the in-memory
persistence layer (PIXIE_PERSIST unset).
"""

from __future__ import annotations

import uuid
from typing import Dict, List, Optional, Set

import pytest

from seo.schemas import Severity
from seo.stores import (
    CrawledPage,
    CrawlJob,
    CrawlStatus,
    CrawlType,
    IssueStatus,
    Report,
    RobotsPolicy,
    Site,
    SeoIssue,
    get_crawled_page_repository,
    get_crawl_job_repository,
    get_issue_repository,
    get_report_repository,
    get_site_repository,
    list_issues,
    list_pages,
    reset_repositories,
)
from seo.analysis.link_graph import aggregate_internal_links
from seo.analysis.cross_page import run_cross_page_checks, RULE_VERSION, DEPTH_THRESHOLD
from seo.analysis.report import build_report, _score_from_issues, _count_by_severity


# ============================================================================
# Helpers
# ============================================================================

TENANT = "t_test"
SITE_DOMAIN = "example.com"
BASE_URL = "https://example.com"


def make_site(domain: str = SITE_DOMAIN) -> tuple:
    """Create and persist a Site; return (site_id, site)."""
    repo = get_site_repository()
    site = Site(
        tenant_id=TENANT,
        domain=domain,
        canonical_base_url=f"https://{domain}",
        robots_policy=RobotsPolicy.RESPECT,
    )
    site_id, saved_site = repo.create(site)
    return site_id, saved_site


def make_crawl_job(site_id: str) -> tuple:
    repo = get_crawl_job_repository()
    job = CrawlJob(
        tenant_id=TENANT,
        site_id=site_id,
        status=CrawlStatus.COMPLETED,
        crawl_type=CrawlType.SITE,
        requested_limit=500,
    )
    job_id, saved_job = repo.create(job)
    return job_id, saved_job


def make_page(
    site_id: str,
    crawl_job_id: str,
    url: str,
    *,
    status_code: int = 200,
    title: str = "",
    meta_description: str = "",
    h1: str = "",
    canonical: str = "",
    indexability: str = "indexable",
    content_hash: str = "",
    internal_links_in: int = 0,
    internal_links_out: int = 0,
    out_links: Optional[List[str]] = None,
    duplicate_of: Optional[str] = None,
) -> tuple:
    """Create and persist a CrawledPage; return (page_id, page)."""
    repo = get_crawled_page_repository()
    extra: Dict = {}
    if out_links is not None:
        extra["out_links"] = out_links
    if duplicate_of is not None:
        extra["duplicate_of"] = duplicate_of
    page = CrawledPage(
        tenant_id=TENANT,
        site_id=site_id,
        crawl_job_id=crawl_job_id,
        url=url,
        normalized_url=url,
        status_code=status_code,
        content_type="text/html",
        canonical=canonical,
        title=title,
        meta_description=meta_description,
        h1=h1,
        content_hash=content_hash,
        indexability=indexability,
        internal_links_in=internal_links_in,
        internal_links_out=internal_links_out,
        extra=extra,
    )
    page_id, saved = repo.create(page)
    return page_id, saved


def _site_obj(site_id: str, site: Site):
    """Attach site_id to site object for the analysis layer."""
    site.site_id = site_id  # type: ignore[attr-defined]
    return site


@pytest.fixture(autouse=True)
def reset_stores():
    reset_repositories()
    yield
    reset_repositories()


# ============================================================================
# 1. Link Graph — inbound counts, orphan detection, depth
# ============================================================================

class TestLinkGraph:
    def _setup(self):
        site_id, site = make_site()
        job_id, _ = make_crawl_job(site_id)
        return site_id, job_id, site

    def test_inbound_counts_correct(self):
        """Pages linked-to accumulate inbound counts."""
        site_id, job_id, _ = self._setup()

        # home -> about, about -> contact
        make_page(site_id, job_id, f"{BASE_URL}/",       title="Home",    out_links=[f"{BASE_URL}/about"])
        make_page(site_id, job_id, f"{BASE_URL}/about",  title="About",   out_links=[f"{BASE_URL}/contact"])
        make_page(site_id, job_id, f"{BASE_URL}/contact", title="Contact", out_links=[])

        result = aggregate_internal_links(TENANT, job_id)

        inbound = result["inbound_map"]
        assert inbound.get(f"{BASE_URL}/about", 0) == 1,    "home links to about"
        assert inbound.get(f"{BASE_URL}/contact", 0) == 1,  "about links to contact"
        assert inbound.get(f"{BASE_URL}/", 0) == 0,         "home has no inbound links"

    def test_multiple_sources_to_same_target(self):
        """Multiple pages linking to the same target accumulate counts."""
        site_id, job_id, _ = self._setup()

        target = f"{BASE_URL}/popular"
        make_page(site_id, job_id, f"{BASE_URL}/",       out_links=[target])
        make_page(site_id, job_id, f"{BASE_URL}/a",      out_links=[target])
        make_page(site_id, job_id, f"{BASE_URL}/b",      out_links=[target])
        make_page(site_id, job_id, target,                out_links=[])

        result = aggregate_internal_links(TENANT, job_id)
        assert result["inbound_map"].get(target, 0) == 3

    def test_orphan_detection_correct(self):
        """Pages with 0 inbound links (except seed) are orphan candidates."""
        site_id, job_id, _ = self._setup()

        make_page(site_id, job_id, f"{BASE_URL}/",      out_links=[f"{BASE_URL}/linked"])
        make_page(site_id, job_id, f"{BASE_URL}/linked", out_links=[])
        make_page(site_id, job_id, f"{BASE_URL}/orphan", out_links=[])

        result = aggregate_internal_links(TENANT, job_id)
        orphans = result["orphan_candidates"]

        assert f"{BASE_URL}/orphan" in orphans
        assert f"{BASE_URL}/linked" not in orphans
        # Seed is never in orphan list
        assert result["seed_url"] not in orphans

    def test_seed_not_in_orphan_list(self):
        """The seed URL is never flagged as an orphan even with 0 inbound links."""
        site_id, job_id, _ = self._setup()

        make_page(site_id, job_id, f"{BASE_URL}/", out_links=[])

        result = aggregate_internal_links(TENANT, job_id)
        assert result["seed_url"] not in result["orphan_candidates"]

    def test_depth_correct_on_linear_chain(self):
        """BFS depth is computed correctly on a linear chain."""
        site_id, job_id, _ = self._setup()

        home   = f"{BASE_URL}/"
        page1  = f"{BASE_URL}/p1"
        page2  = f"{BASE_URL}/p2"
        page3  = f"{BASE_URL}/p3"

        make_page(site_id, job_id, home,  out_links=[page1])
        make_page(site_id, job_id, page1, out_links=[page2])
        make_page(site_id, job_id, page2, out_links=[page3])
        make_page(site_id, job_id, page3, out_links=[])

        result = aggregate_internal_links(TENANT, job_id)
        dm = result["depth_map"]

        assert dm[home]  == 0
        assert dm[page1] == 1
        assert dm[page2] == 2
        assert dm[page3] == 3

    def test_depth_shortest_path(self):
        """BFS finds the shortest path, not the longest."""
        site_id, job_id, _ = self._setup()

        home  = f"{BASE_URL}/"
        mid   = f"{BASE_URL}/mid"
        deep  = f"{BASE_URL}/deep"

        # home -> deep (direct, depth 1) and home -> mid -> deep (depth 2)
        make_page(site_id, job_id, home,  out_links=[deep, mid])
        make_page(site_id, job_id, mid,   out_links=[deep])
        make_page(site_id, job_id, deep,  out_links=[])

        result = aggregate_internal_links(TENANT, job_id)
        assert result["depth_map"][deep] == 1  # shortest path wins

    def test_unreachable_pages_depth_minus_one(self):
        """Pages not reachable from seed get depth -1."""
        site_id, job_id, _ = self._setup()

        # seed links to nothing; isolated page has no inbound
        make_page(site_id, job_id, f"{BASE_URL}/",        out_links=[])
        make_page(site_id, job_id, f"{BASE_URL}/isolated", out_links=[])

        result = aggregate_internal_links(TENANT, job_id)
        assert result["depth_map"].get(f"{BASE_URL}/isolated", -1) == -1

    def test_empty_job_returns_zeros(self):
        result = aggregate_internal_links(TENANT, "nonexistent_job_id")
        assert result["total_pages"] == 0
        assert result["orphan_candidates"] == []


# ============================================================================
# 2. Cross-page checks — individual rules
# ============================================================================

class TestCrossPageBrokenLinks:
    def _setup(self):
        site_id, site = make_site()
        job_id, _ = make_crawl_job(site_id)
        return site_id, job_id, _site_obj(site_id, site)

    def test_broken_link_4xx_target_fires(self):
        site_id, job_id, site_obj = self._setup()

        src_id, _ = make_page(site_id, job_id, f"{BASE_URL}/",
                              out_links=[f"{BASE_URL}/gone"])
        make_page(site_id, job_id, f"{BASE_URL}/gone", status_code=404)

        issues = run_cross_page_checks(TENANT, job_id, site_obj)
        rule_issues = [i for i in issues if i.rule_key == "broken_internal_link"]
        assert len(rule_issues) >= 1
        assert rule_issues[0].severity == Severity.HIGH

    def test_broken_link_uncrawled_target_fires(self):
        site_id, job_id, site_obj = self._setup()

        make_page(site_id, job_id, f"{BASE_URL}/",
                  out_links=[f"{BASE_URL}/missing"])
        # /missing is NOT added to the store

        issues = run_cross_page_checks(TENANT, job_id, site_obj)
        rule_issues = [i for i in issues if i.rule_key == "broken_internal_link"]
        assert len(rule_issues) >= 1
        assert rule_issues[0].severity == Severity.MEDIUM

    def test_no_broken_links_clean_site(self):
        site_id, job_id, site_obj = self._setup()

        make_page(site_id, job_id, f"{BASE_URL}/",     out_links=[f"{BASE_URL}/about"])
        make_page(site_id, job_id, f"{BASE_URL}/about", out_links=[], status_code=200)

        issues = run_cross_page_checks(TENANT, job_id, site_obj)
        bl_issues = [i for i in issues if i.rule_key == "broken_internal_link"]
        assert bl_issues == []


class TestCrossPageRedirectChain:
    def _setup(self):
        site_id, site = make_site()
        job_id, _ = make_crawl_job(site_id)
        return site_id, job_id, _site_obj(site_id, site)

    def test_redirect_3xx_fires(self):
        site_id, job_id, site_obj = self._setup()
        make_page(site_id, job_id, f"{BASE_URL}/old", status_code=301)
        make_page(site_id, job_id, f"{BASE_URL}/new", status_code=200)

        issues = run_cross_page_checks(TENANT, job_id, site_obj)
        redir_issues = [i for i in issues if i.rule_key == "redirect_chain"]
        assert len(redir_issues) >= 1

    def test_no_redirect_on_200(self):
        site_id, job_id, site_obj = self._setup()
        make_page(site_id, job_id, f"{BASE_URL}/page", status_code=200)

        issues = run_cross_page_checks(TENANT, job_id, site_obj)
        redir_issues = [i for i in issues if i.rule_key == "redirect_chain"]
        assert redir_issues == []


class TestCrossPageDuplicates:
    def _setup(self):
        site_id, site = make_site()
        job_id, _ = make_crawl_job(site_id)
        return site_id, job_id, _site_obj(site_id, site)

    # -- titles --

    def test_duplicate_title_fires(self):
        site_id, job_id, site_obj = self._setup()
        title = "Same Title For Both"
        make_page(site_id, job_id, f"{BASE_URL}/a", title=title)
        make_page(site_id, job_id, f"{BASE_URL}/b", title=title)

        issues = run_cross_page_checks(TENANT, job_id, site_obj)
        dup_issues = [i for i in issues if i.rule_key == "duplicate_title"]
        assert len(dup_issues) >= 2  # one per affected page

    def test_unique_titles_no_false_positive(self):
        site_id, job_id, site_obj = self._setup()
        make_page(site_id, job_id, f"{BASE_URL}/a", title="Page A")
        make_page(site_id, job_id, f"{BASE_URL}/b", title="Page B")

        issues = run_cross_page_checks(TENANT, job_id, site_obj)
        dup_issues = [i for i in issues if i.rule_key == "duplicate_title"]
        assert dup_issues == []

    def test_duplicate_title_case_insensitive(self):
        site_id, job_id, site_obj = self._setup()
        make_page(site_id, job_id, f"{BASE_URL}/a", title="Home Page")
        make_page(site_id, job_id, f"{BASE_URL}/b", title="HOME PAGE")

        issues = run_cross_page_checks(TENANT, job_id, site_obj)
        dup_issues = [i for i in issues if i.rule_key == "duplicate_title"]
        assert len(dup_issues) >= 2

    # -- meta descriptions --

    def test_duplicate_meta_description_fires(self):
        site_id, job_id, site_obj = self._setup()
        desc = "We sell the best widgets online at great prices."
        make_page(site_id, job_id, f"{BASE_URL}/a", meta_description=desc)
        make_page(site_id, job_id, f"{BASE_URL}/b", meta_description=desc)

        issues = run_cross_page_checks(TENANT, job_id, site_obj)
        dup_issues = [i for i in issues if i.rule_key == "duplicate_meta_description"]
        assert len(dup_issues) >= 2

    def test_unique_meta_descriptions_no_false_positive(self):
        site_id, job_id, site_obj = self._setup()
        make_page(site_id, job_id, f"{BASE_URL}/a", meta_description="Description A")
        make_page(site_id, job_id, f"{BASE_URL}/b", meta_description="Description B")

        issues = run_cross_page_checks(TENANT, job_id, site_obj)
        dup_issues = [i for i in issues if i.rule_key == "duplicate_meta_description"]
        assert dup_issues == []

    # -- h1s --

    def test_duplicate_h1_fires(self):
        site_id, job_id, site_obj = self._setup()
        h1 = "Welcome to Our Site"
        make_page(site_id, job_id, f"{BASE_URL}/a", h1=h1)
        make_page(site_id, job_id, f"{BASE_URL}/b", h1=h1)

        issues = run_cross_page_checks(TENANT, job_id, site_obj)
        dup_issues = [i for i in issues if i.rule_key == "duplicate_h1"]
        assert len(dup_issues) >= 2

    def test_unique_h1s_no_false_positive(self):
        site_id, job_id, site_obj = self._setup()
        make_page(site_id, job_id, f"{BASE_URL}/a", h1="Page A Heading")
        make_page(site_id, job_id, f"{BASE_URL}/b", h1="Page B Heading")

        issues = run_cross_page_checks(TENANT, job_id, site_obj)
        dup_issues = [i for i in issues if i.rule_key == "duplicate_h1"]
        assert dup_issues == []

    # -- content hash --

    def test_duplicate_content_hash_fires(self):
        site_id, job_id, site_obj = self._setup()
        chash = "abc123samehash"
        make_page(site_id, job_id, f"{BASE_URL}/a", content_hash=chash)
        make_page(site_id, job_id, f"{BASE_URL}/b", content_hash=chash)

        issues = run_cross_page_checks(TENANT, job_id, site_obj)
        dup_issues = [i for i in issues if i.rule_key == "duplicate_content"]
        assert len(dup_issues) >= 2

    def test_duplicate_of_field_fires(self):
        site_id, job_id, site_obj = self._setup()
        make_page(site_id, job_id, f"{BASE_URL}/original")
        make_page(site_id, job_id, f"{BASE_URL}/copy",
                  duplicate_of=f"{BASE_URL}/original")

        issues = run_cross_page_checks(TENANT, job_id, site_obj)
        dup_issues = [i for i in issues if i.rule_key == "duplicate_content"]
        assert len(dup_issues) >= 1

    def test_unique_content_no_false_positive(self):
        site_id, job_id, site_obj = self._setup()
        make_page(site_id, job_id, f"{BASE_URL}/a", content_hash="hash1")
        make_page(site_id, job_id, f"{BASE_URL}/b", content_hash="hash2")

        issues = run_cross_page_checks(TENANT, job_id, site_obj)
        dup_issues = [i for i in issues if i.rule_key == "duplicate_content"]
        assert dup_issues == []


class TestCrossPageCanonical:
    def _setup(self):
        site_id, site = make_site()
        job_id, _ = make_crawl_job(site_id)
        return site_id, job_id, _site_obj(site_id, site)

    def test_missing_canonical_fires_for_indexable_200(self):
        site_id, job_id, site_obj = self._setup()
        make_page(site_id, job_id, f"{BASE_URL}/page",
                  canonical="", status_code=200, indexability="indexable")

        issues = run_cross_page_checks(TENANT, job_id, site_obj)
        mc_issues = [i for i in issues if i.rule_key == "missing_canonical"]
        assert len(mc_issues) >= 1

    def test_missing_canonical_no_fire_for_noindex(self):
        site_id, job_id, site_obj = self._setup()
        make_page(site_id, job_id, f"{BASE_URL}/page",
                  canonical="", status_code=200, indexability="noindex")

        issues = run_cross_page_checks(TENANT, job_id, site_obj)
        mc_issues = [i for i in issues if i.rule_key == "missing_canonical"]
        assert mc_issues == []

    def test_self_canonical_no_false_positive(self):
        site_id, job_id, site_obj = self._setup()
        url = f"{BASE_URL}/page"
        make_page(site_id, job_id, url, canonical=url, status_code=200)

        issues = run_cross_page_checks(TENANT, job_id, site_obj)
        cc_issues = [i for i in issues if i.rule_key == "canonical_conflict"]
        assert cc_issues == []

    def test_canonical_conflict_fires(self):
        site_id, job_id, site_obj = self._setup()
        page_a = f"{BASE_URL}/a"
        page_b = f"{BASE_URL}/b"
        # page_a says its canonical is page_b (cross-canonical)
        make_page(site_id, job_id, page_a, canonical=page_b, status_code=200)
        make_page(site_id, job_id, page_b, canonical=page_b, status_code=200)

        issues = run_cross_page_checks(TENANT, job_id, site_obj)
        cc_issues = [i for i in issues if i.rule_key == "canonical_conflict"]
        assert len(cc_issues) >= 1


class TestCrossPageOrphan:
    def _setup(self):
        site_id, site = make_site()
        job_id, _ = make_crawl_job(site_id)
        return site_id, job_id, _site_obj(site_id, site)

    def test_orphan_page_fires(self):
        site_id, job_id, site_obj = self._setup()
        make_page(site_id, job_id, f"{BASE_URL}/",      out_links=[])
        make_page(site_id, job_id, f"{BASE_URL}/orphan", out_links=[])

        issues = run_cross_page_checks(TENANT, job_id, site_obj)
        orphan_issues = [i for i in issues if i.rule_key == "orphan_page"]
        assert len(orphan_issues) >= 1

    def test_linked_page_not_orphan(self):
        site_id, job_id, site_obj = self._setup()
        make_page(site_id, job_id, f"{BASE_URL}/",     out_links=[f"{BASE_URL}/linked"])
        make_page(site_id, job_id, f"{BASE_URL}/linked", out_links=[])

        issues = run_cross_page_checks(TENANT, job_id, site_obj)
        orphan_issues = [i for i in issues if i.rule_key == "orphan_page"]
        linked_orphans = [
            i for i in orphan_issues
            if "linked" in (i.evidence or {}).get("url", "")
        ]
        assert linked_orphans == []

    def test_noindex_orphan_not_flagged(self):
        """Noindex orphans are not flagged (expected to be excluded from crawl)."""
        site_id, job_id, site_obj = self._setup()
        make_page(site_id, job_id, f"{BASE_URL}/",      out_links=[])
        make_page(site_id, job_id, f"{BASE_URL}/noindex-orphan",
                  indexability="noindex", out_links=[])

        issues = run_cross_page_checks(TENANT, job_id, site_obj)
        orphan_issues = [i for i in issues if i.rule_key == "orphan_page"]
        noindex_orphans = [
            i for i in orphan_issues
            if "noindex-orphan" in (i.evidence or {}).get("url", "")
        ]
        assert noindex_orphans == []


class TestCrossPageSitemap:
    def _setup(self):
        site_id, site = make_site()
        job_id, _ = make_crawl_job(site_id)
        return site_id, job_id, _site_obj(site_id, site)

    def test_sitemap_url_not_crawled_fires(self):
        site_id, job_id, site_obj = self._setup()
        make_page(site_id, job_id, f"{BASE_URL}/")

        sitemap_urls = [f"{BASE_URL}/", f"{BASE_URL}/missing-from-crawl"]
        issues = run_cross_page_checks(TENANT, job_id, site_obj,
                                       sitemap_urls=sitemap_urls)
        sm_issues = [i for i in issues if i.rule_key == "sitemap_url_not_crawled"]
        assert len(sm_issues) >= 1
        evidence_urls = [i.evidence.get("sitemap_url") for i in sm_issues]
        assert f"{BASE_URL}/missing-from-crawl" in evidence_urls

    def test_crawled_url_not_in_sitemap_fires(self):
        site_id, job_id, site_obj = self._setup()
        make_page(site_id, job_id, f"{BASE_URL}/",        status_code=200)
        make_page(site_id, job_id, f"{BASE_URL}/missing", status_code=200)

        sitemap_urls = [f"{BASE_URL}/"]  # /missing not in sitemap
        issues = run_cross_page_checks(TENANT, job_id, site_obj,
                                       sitemap_urls=sitemap_urls)
        not_in_sm = [i for i in issues if i.rule_key == "crawled_url_not_in_sitemap"]
        urls_flagged = [i.evidence.get("url") for i in not_in_sm]
        assert f"{BASE_URL}/missing" in urls_flagged

    def test_no_sitemap_mismatch_when_in_sync(self):
        site_id, job_id, site_obj = self._setup()
        make_page(site_id, job_id, f"{BASE_URL}/",     status_code=200)
        make_page(site_id, job_id, f"{BASE_URL}/about", status_code=200)

        sitemap_urls = [f"{BASE_URL}/", f"{BASE_URL}/about"]
        issues = run_cross_page_checks(TENANT, job_id, site_obj,
                                       sitemap_urls=sitemap_urls)
        sm_mismatch = [i for i in issues
                       if i.rule_key in ("sitemap_url_not_crawled",
                                         "crawled_url_not_in_sitemap")]
        assert sm_mismatch == []

    def test_noindex_in_sitemap_fires(self):
        site_id, job_id, site_obj = self._setup()
        noindex_url = f"{BASE_URL}/noindex-page"
        make_page(site_id, job_id, noindex_url,
                  indexability="noindex", status_code=200)

        sitemap_urls = [f"{BASE_URL}/", noindex_url]
        issues = run_cross_page_checks(TENANT, job_id, site_obj,
                                       sitemap_urls=sitemap_urls)
        ni_issues = [i for i in issues if i.rule_key == "noindex_in_sitemap"]
        assert len(ni_issues) >= 1
        assert ni_issues[0].severity == Severity.HIGH

    def test_no_sitemap_checks_when_none_provided(self):
        site_id, job_id, site_obj = self._setup()
        make_page(site_id, job_id, f"{BASE_URL}/")

        # No sitemap_urls passed → no sitemap-related issues
        issues = run_cross_page_checks(TENANT, job_id, site_obj, sitemap_urls=None)
        sm_issues = [i for i in issues
                     if i.rule_key in ("sitemap_url_not_crawled",
                                       "crawled_url_not_in_sitemap",
                                       "noindex_in_sitemap")]
        assert sm_issues == []


class TestCrossPageRobots:
    def _setup(self):
        site_id, site = make_site()
        job_id, _ = make_crawl_job(site_id)
        return site_id, job_id, _site_obj(site_id, site)

    def test_robots_blocked_crawled_fires(self):
        site_id, job_id, site_obj = self._setup()
        blocked_url = f"{BASE_URL}/admin"
        make_page(site_id, job_id, blocked_url, status_code=200)

        issues = run_cross_page_checks(TENANT, job_id, site_obj,
                                       robots_blocked={blocked_url})
        rb_issues = [i for i in issues if i.rule_key == "robots_blocked_crawled"]
        assert len(rb_issues) >= 1

    def test_no_robots_issue_when_not_blocked(self):
        site_id, job_id, site_obj = self._setup()
        make_page(site_id, job_id, f"{BASE_URL}/public", status_code=200)

        issues = run_cross_page_checks(TENANT, job_id, site_obj,
                                       robots_blocked={f"{BASE_URL}/admin"})
        rb_issues = [i for i in issues if i.rule_key == "robots_blocked_crawled"]
        assert rb_issues == []

    def test_no_robots_checks_when_none_provided(self):
        site_id, job_id, site_obj = self._setup()
        make_page(site_id, job_id, f"{BASE_URL}/admin", status_code=200)

        issues = run_cross_page_checks(TENANT, job_id, site_obj, robots_blocked=None)
        rb_issues = [i for i in issues if i.rule_key == "robots_blocked_crawled"]
        assert rb_issues == []


class TestCrossPageDepth:
    def _setup(self):
        site_id, site = make_site()
        job_id, _ = make_crawl_job(site_id)
        return site_id, job_id, _site_obj(site_id, site)

    def test_excessive_depth_fires(self):
        site_id, job_id, site_obj = self._setup()

        # Build a linear chain: home -> p1 -> ... -> p{N}
        N = DEPTH_THRESHOLD + 2
        pages = [f"{BASE_URL}/"] + [f"{BASE_URL}/p{i}" for i in range(1, N + 1)]
        for i, url in enumerate(pages):
            out = [pages[i + 1]] if i + 1 < len(pages) else []
            make_page(site_id, job_id, url, out_links=out)

        issues = run_cross_page_checks(TENANT, job_id, site_obj)
        depth_issues = [i for i in issues if i.rule_key == "excessive_link_depth"]
        assert len(depth_issues) >= 1

    def test_no_excessive_depth_for_shallow_site(self):
        site_id, job_id, site_obj = self._setup()

        # home -> p1 -> p2 (both within threshold)
        make_page(site_id, job_id, f"{BASE_URL}/",  out_links=[f"{BASE_URL}/p1"])
        make_page(site_id, job_id, f"{BASE_URL}/p1", out_links=[f"{BASE_URL}/p2"])
        make_page(site_id, job_id, f"{BASE_URL}/p2", out_links=[])

        issues = run_cross_page_checks(TENANT, job_id, site_obj)
        depth_issues = [i for i in issues if i.rule_key == "excessive_link_depth"]
        assert depth_issues == []

    def test_rule_version_set(self):
        site_id, job_id, site_obj = self._setup()
        make_page(site_id, job_id, f"{BASE_URL}/", status_code=200,
                  canonical="", indexability="indexable")

        issues = run_cross_page_checks(TENANT, job_id, site_obj)
        for issue in issues:
            assert issue.rule_version == RULE_VERSION


# ============================================================================
# 3. Report Scoring
# ============================================================================

class TestReportScoring:
    def _make_issue(self, severity: Severity) -> SeoIssue:
        return SeoIssue(
            tenant_id=TENANT,
            site_id="s",
            crawl_job_id="j",
            page_id="p",
            rule_key="test_rule",
            category="test",
            severity=severity,
            status=IssueStatus.OPEN,
        )

    def test_perfect_score_no_issues(self):
        assert _score_from_issues([]) == 100

    def test_critical_deducts_12(self):
        issues = [self._make_issue(Severity.CRITICAL)]
        assert _score_from_issues(issues) == 88

    def test_high_deducts_6(self):
        issues = [self._make_issue(Severity.HIGH)]
        assert _score_from_issues(issues) == 94

    def test_medium_deducts_3(self):
        issues = [self._make_issue(Severity.MEDIUM)]
        assert _score_from_issues(issues) == 97

    def test_low_deducts_1(self):
        issues = [self._make_issue(Severity.LOW)]
        assert _score_from_issues(issues) == 99

    def test_info_no_deduction(self):
        issues = [self._make_issue(Severity.INFO)]
        assert _score_from_issues(issues) == 100

    def test_score_floored_at_zero(self):
        """Score cannot go below 0."""
        issues = [self._make_issue(Severity.CRITICAL)] * 20
        assert _score_from_issues(issues) == 0

    def test_monotonic_more_issues_lower_score(self):
        """Adding issues can only decrease or maintain score."""
        scores = []
        for n in range(0, 6):
            issues = [self._make_issue(Severity.HIGH)] * n
            scores.append(_score_from_issues(issues))
        for i in range(len(scores) - 1):
            assert scores[i] >= scores[i + 1], (
                f"Score increased from {scores[i]} to {scores[i+1]} "
                f"when adding an issue (n={i}→{i+1})"
            )

    def test_monotonic_severer_issues_lower_score(self):
        """Replacing an issue with a severer one can only lower score."""
        low_score = _score_from_issues([self._make_issue(Severity.LOW)])
        high_score = _score_from_issues([self._make_issue(Severity.HIGH)])
        assert low_score >= high_score

    def test_count_by_severity_correct(self):
        issues = [
            self._make_issue(Severity.CRITICAL),
            self._make_issue(Severity.HIGH),
            self._make_issue(Severity.HIGH),
            self._make_issue(Severity.MEDIUM),
        ]
        counts = _count_by_severity(issues)
        assert counts["critical"] == 1
        assert counts["high"] == 2
        assert counts["medium"] == 1
        assert counts["low"] == 0

    def test_resolved_issues_not_counted(self):
        issue = self._make_issue(Severity.CRITICAL)
        issue.status = IssueStatus.RESOLVED
        assert _score_from_issues([issue]) == 100  # resolved → no deduction
        counts = _count_by_severity([issue])
        assert counts["critical"] == 0

    def _setup(self):
        site_id, site = make_site()
        job_id, _ = make_crawl_job(site_id)
        return site_id, job_id, _site_obj(site_id, site)

    def test_build_report_deterministic(self):
        site_id, job_id, site_obj = self._setup()

        make_page(site_id, job_id, f"{BASE_URL}/", canonical="", status_code=200)

        issues = run_cross_page_checks(TENANT, job_id, site_obj)
        report1 = build_report(TENANT, job_id, site_obj)

        # Reset repos and replay exactly the same pages + issues.
        reset_repositories()
        site_id2, site2 = make_site()
        job_id2, _ = make_crawl_job(site_id2)
        site2._site_id = site_id2  # type: ignore[attr-defined]
        make_page(site_id2, job_id2, f"{BASE_URL}/", canonical="", status_code=200)
        run_cross_page_checks(TENANT, job_id2, _site_obj(site_id2, site2))
        report2 = build_report(TENANT, job_id2, _site_obj(site_id2, site2))

        assert report1.score == report2.score
        assert report1.issue_counts == report2.issue_counts

    def test_issue_counts_match_persisted_issues(self):
        site_id, job_id, site_obj = self._setup()

        # Create two pages with duplicate titles
        make_page(site_id, job_id, f"{BASE_URL}/a", title="Same")
        make_page(site_id, job_id, f"{BASE_URL}/b", title="Same")

        run_cross_page_checks(TENANT, job_id, site_obj)
        report = build_report(TENANT, job_id, site_obj)

        # Count persisted issues
        persisted = list_issues(TENANT, crawl_job_id=job_id)
        open_count = sum(
            1 for _, iss in persisted
            if iss.status == IssueStatus.OPEN
        )

        assert report.issue_counts.get("total", 0) == open_count

    def test_report_score_bounded(self):
        site_id, job_id, site_obj = self._setup()

        # Many issues with high severity
        for i in range(20):
            make_page(site_id, job_id, f"{BASE_URL}/p{i}",
                      status_code=404, title="Dup", h1="Dup",
                      meta_description="Same desc")

        run_cross_page_checks(TENANT, job_id, site_obj)
        report = build_report(TENANT, job_id, site_obj)

        assert 0 <= report.score <= 100

    def test_no_fabricated_cwv_or_traffic(self):
        """Report must not contain CWV, traffic, or impression data."""
        site_id, job_id, site_obj = self._setup()
        make_page(site_id, job_id, f"{BASE_URL}/")
        run_cross_page_checks(TENANT, job_id, site_obj)
        report = build_report(TENANT, job_id, site_obj)

        report_dict = {
            "score": report.score,
            "category_scores": report.category_scores,
            "issue_counts": report.issue_counts,
            "export_metadata": report.export_metadata,
        }
        report_str = str(report_dict).lower()

        # Fabricated metric keywords that must not appear
        for keyword in ("lcp", "cls", "fcp", "ttfb", "traffic", "impressions",
                        "clicks", "ctr", "position", "core web vitals", "cwv"):
            assert keyword not in report_str, (
                f"Fabricated metric '{keyword}' found in report: {report_dict}"
            )


# ============================================================================
# 4. Smoke test: single-page engine still importable and functional
# ============================================================================

class TestSinglePageEngineSmoke:
    def test_engine_importable(self):
        """The single-page engine must remain importable after our additions."""
        from seo.engine import analyze, Mode
        assert callable(analyze)
        assert Mode.PIXIE is not None

    def test_engine_analyze_returns_result(self):
        """Basic single-page analysis must still work end-to-end."""
        from seo.engine import analyze, Mode, Status

        raw = {
            "url": "https://example.com/",
            "title": "Example Page",
            "meta_description": "A description of the example page.",
            "content": "Some content on this page.",
            "headings": [{"level": 1, "text": "Example Heading"}],
            "images": [],
            "links": [],
            "canonical": "https://example.com/",
            "robots": None,
        }
        result = analyze(raw, mode=Mode.EXTERNAL)
        assert hasattr(result, "score")
        assert hasattr(result, "checks")
        assert result.score.score >= 0
        assert result.score.score <= 100
        assert isinstance(result.checks, list)

    def test_run_cross_page_checks_importable(self):
        """The new cross-page module must be importable from the analysis package."""
        from seo.analysis import run_cross_page_checks, aggregate_internal_links, build_report
        assert callable(run_cross_page_checks)
        assert callable(aggregate_internal_links)
        assert callable(build_report)
