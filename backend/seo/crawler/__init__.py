"""Pixie SEO crawler package.

Public API:
    normalize_url(base, href) -> str | None
    same_domain(a, b) -> bool
    RobotsHandler(base_url, fetch=safe_fetch)
    SitemapDiscovery(base_url, fetch=safe_fetch)
    LinkDiscovery(base_url, site)
    run_crawl(job, site, *, fetch=safe_fetch, store=None) -> dict
    enqueue_crawl(site_id, tenant, requested_limit, crawl_type) -> (job_id, CrawlJob)
    poll_once(worker_id) -> bool
    cancel_job(tenant, job_id) -> bool
    retry_job(tenant, job_id) -> bool
"""

from seo.crawler.normalize import normalize_url, same_domain
from seo.crawler.robots import RobotsHandler
from seo.crawler.sitemap import SitemapDiscovery
from seo.crawler.discovery import LinkDiscovery
from seo.crawler.crawler import run_crawl
from seo.crawler.worker import enqueue_crawl, poll_once, cancel_job, retry_job

__all__ = [
    "normalize_url",
    "same_domain",
    "RobotsHandler",
    "SitemapDiscovery",
    "LinkDiscovery",
    "run_crawl",
    "enqueue_crawl",
    "poll_once",
    "cancel_job",
    "retry_job",
]
