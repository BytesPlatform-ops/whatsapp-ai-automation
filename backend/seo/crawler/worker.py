"""Worker: ties the queue to the crawl engine.

Public API (called by the route layer or a scheduler):
    enqueue_crawl(site_id, tenant_id, requested_limit, crawl_type) -> (job_id, CrawlJob)
        Create a QUEUED job.  (Re-exported from queue.py for convenience.)

    poll_once(worker_id, tenant_id, *, fetch=safe_fetch) -> bool
        Claim one job and run it to completion (or failure), then run the
        post-crawl analysis pipeline (link graph → cross-page checks → report).
        Returns True if a job was processed, False if nothing was available.
        Does NOT start a background thread — call this from a scheduler loop.

    cancel_job(tenant_id, job_id) -> bool
        Cancel a queued or running job.

    retry_job(tenant_id, job_id) -> bool
        Reset a failed/cancelled job to QUEUED.

Crash / stale-lock recovery:
    A job in ``running`` state whose ``lock_expires_at`` is in the past is
    automatically re-claimed by the next ``poll_once`` call.  The worker
    refreshes the lock before the analysis pass so a long analysis run does
    not look stale to external observers.

Thread safety:
    poll_once uses an optimistic lock confirmed by re-reading the job.  Two
    concurrent callers for the same tenant cannot both claim the same job
    because the second re-read will show a different lock_owner.
"""

from __future__ import annotations

import logging
import traceback
from datetime import datetime, timedelta, timezone
from typing import Callable, Optional, Tuple

from seo.url_guard import safe_fetch
from seo.stores import CrawlJob, CrawlStatus, CrawlType, Site, update_crawl_job
from seo.crawler.queue import (
    enqueue_crawl,
    claim_next_job_for_tenant,
    release_job,
    cancel_job,
    retry_job,
    DEFAULT_LOCK_DURATION_S,
)
from seo.crawler.crawler import run_crawl

logger = logging.getLogger(__name__)

# How long to extend the lock before the analysis pass (seconds).
# Must be >= the longest expected analysis run.
_ANALYSIS_LOCK_EXTENSION_S: int = 300  # 5 minutes


def _extend_lock(tenant_id: str, job_id: str, worker_id: str) -> None:
    """Refresh the lock expiry before a long analysis pass."""
    new_expiry = (
        datetime.now(timezone.utc) + timedelta(seconds=_ANALYSIS_LOCK_EXTENSION_S)
    ).isoformat(timespec="microseconds")
    try:
        update_crawl_job(tenant_id, job_id, lock_expires_at=new_expiry, lock_owner=worker_id)
    except Exception as exc:
        # Non-fatal: log and proceed — the analysis is more important than the lock refresh.
        logger.warning("worker: could not refresh lock for job %s: %s", job_id, exc)


def _run_analysis(tenant_id: str, job_id: str, site, site_id: str) -> None:
    """Run the post-crawl analysis pipeline for a successfully crawled job.

    Steps
    -----
    1. ``aggregate_internal_links``  — build inbound-link counts + orphan list.
    2. ``run_cross_page_checks``     — deterministic cross-page SEO issue detection.
    3. ``build_report``              — score + category breakdown + persist Report row.

    The site object is patched with ``_site_id`` so the analysis helpers can
    extract the persistence ID without changing the Site dataclass signature.
    """
    from seo.analysis import aggregate_internal_links, run_cross_page_checks, build_report

    # Attach the site_id so analysis helpers can read it from site._site_id.
    site._site_id = site_id  # type: ignore[attr-defined]

    logger.info("worker: starting analysis for job %s (site=%s)", job_id, site_id)

    # Step 1: internal-link graph aggregation (also writes internal_links_in to pages).
    link_summary = aggregate_internal_links(tenant_id, job_id)
    logger.info(
        "worker: link graph done — pages=%d orphans=%d",
        link_summary.get("total_pages", 0),
        len(link_summary.get("orphan_candidates", [])),
    )

    # Step 2: cross-page checks (reads site config for sitemap_urls).
    sitemap_urls = list(getattr(site, "sitemap_urls", []) or [])
    issues = run_cross_page_checks(
        tenant_id,
        job_id,
        site,
        sitemap_urls=sitemap_urls if sitemap_urls else None,
        robots_blocked=None,
    )
    logger.info("worker: cross-page checks done — issues=%d", len(issues))

    # Step 3: build and persist the Report.
    report = build_report(tenant_id, job_id, site)
    logger.info(
        "worker: report built — score=%d total_issues=%d",
        report.score,
        report.issue_counts.get("total", 0),
    )


def _run_pagespeed_for_crawl(
    tenant_id: str,
    job_id: str,
    site,
    *,
    provider=None,
) -> int:
    """Run PSI for the homepage + representative crawled pages, store results in
    CrawledPage.extra["pagespeed"], return the number of real PSI requests made.

    Safe: never raises. Returns 0 on any failure.
    """
    from seo.technical.pagespeed import run_pagespeed_for_job, MAX_PSI_PAGES, VALID_STRATEGIES  # type: ignore
    from seo.stores import get_crawled_page_repository  # type: ignore

    try:
        page_repo = get_crawled_page_repository()
        _total, all_pairs = page_repo.list_by_crawl_job(tenant_id, job_id, limit=MAX_PSI_PAGES + 10)
    except Exception as exc:
        logger.warning("worker: pagespeed: could not list pages for job %s: %s", job_id, exc)
        return 0

    if not all_pairs:
        return 0

    # Pick homepage first, then additional pages (up to MAX_PSI_PAGES total).
    homepage_url = (
        site.canonical_base_url
        if hasattr(site, "canonical_base_url") and site.canonical_base_url
        else None
    )
    urls_ordered = []
    if homepage_url:
        urls_ordered.append(homepage_url)
    for _pid, page in all_pairs:
        if page.url not in urls_ordered:
            urls_ordered.append(page.url)
        if len(urls_ordered) >= MAX_PSI_PAGES:
            break

    try:
        results, real_request_count = run_pagespeed_for_job(
            urls_ordered,
            strategies=tuple(VALID_STRATEGIES),
            max_pages=MAX_PSI_PAGES,
            provider=provider,
        )
    except Exception as exc:
        logger.warning("worker: pagespeed: run_pagespeed_for_job failed for job %s: %s", job_id, exc)
        return 0

    # Store results in the corresponding CrawledPage.extra["pagespeed"].
    # CrawledPageRepository has no update() — we use the internal _save() pattern
    # via a direct dataclass mutation and re-save.
    try:
        for pid, page in all_pairs:
            if page.url in results:
                extra = dict(page.extra or {})
                extra["pagespeed"] = results[page.url]
                page.extra = extra
                page_repo._save(pid, tenant_id, page)
    except Exception as exc:
        logger.warning("worker: pagespeed: storing results failed for job %s: %s", job_id, exc)

    return real_request_count


def poll_once(
    worker_id: str,
    tenant_id: str,
    *,
    fetch: Callable = safe_fetch,
    store=None,
    min_delay_s: float = 0.5,
    max_retries: int = 2,
    include_pagespeed: bool = False,
    pagespeed_provider=None,
) -> bool:
    """Claim and process one pending job for *tenant_id*.

    Parameters
    ----------
    worker_id:
        Unique string identifying this worker (e.g. ``"worker-1"`` or a UUID).
    tenant_id:
        The tenant whose job queue to drain.
    fetch:
        Injectable fetch callable (for testing).
    store:
        Injectable store (for testing).
    min_delay_s:
        Minimum inter-request delay forwarded to ``run_crawl``.
    max_retries:
        Transient-error retry count forwarded to ``run_crawl``.

    Returns
    -------
    True  — a job was claimed and processed (success or failure).
    False — no job was available; queue is idle.
    """
    claimed = claim_next_job_for_tenant(tenant_id, worker_id)
    if claimed is None:
        return False

    job_id, claimed_tenant_id, job, site = claimed
    # Capture the site_id from the job before mutating anything.
    site_id = job.site_id

    logger.info(
        "worker: %s processing job %s (site=%s tenant=%s limit=%d)",
        worker_id, job_id, site_id, claimed_tenant_id, job.requested_limit,
    )

    try:
        summary = run_crawl(
            job,
            site,
            job_id=job_id,
            fetch=fetch,
            store=store,
            min_delay_s=min_delay_s,
            max_retries=max_retries,
        )
        if summary.get("cancelled"):
            logger.info("worker: job %s was cancelled mid-crawl", job_id)
            # Job status was already set to CANCELLED by cancel_job; just release lock.
            release_job(
                claimed_tenant_id,
                job_id,
                status=CrawlStatus.CANCELLED,
            )
        else:
            logger.info(
                "worker: job %s crawl done — crawled=%d failed=%d discovered=%d; "
                "starting analysis",
                job_id,
                summary.get("crawled_count", 0),
                summary.get("failed_count", 0),
                summary.get("discovered_count", 0),
            )

            # Refresh the lock before the (potentially long) analysis pass so
            # the job does not look stale to external observers or the sweeper.
            _extend_lock(claimed_tenant_id, job_id, worker_id)

            # Post-crawl analysis pipeline.  A failure here marks the job
            # FAILED rather than crashing the worker process.
            try:
                _run_analysis(claimed_tenant_id, job_id, site, site_id)
            except Exception:
                tb = traceback.format_exc()
                logger.error(
                    "worker: analysis for job %s failed:\n%s", job_id, tb
                )
                release_job(
                    claimed_tenant_id,
                    job_id,
                    status=CrawlStatus.FAILED,
                    error_category="analysis_error",
                )
                return True

            # ── PageSpeed pass (optional) ─────────────────────────────────
            psi_real_requests = 0
            is_mock_crawl = (fetch is not safe_fetch)  # non-default fetch = injected/fake
            if include_pagespeed:
                try:
                    psi_real_requests = _run_pagespeed_for_crawl(
                        claimed_tenant_id,
                        job_id,
                        site,
                        provider=pagespeed_provider,
                    )
                except Exception:
                    pass  # PSI is best-effort; never block job completion

            # ── Metering ─────────────────────────────────────────────────
            try:
                from seo.metering import (  # type: ignore
                    record_crawl_pages,
                    record_pagespeed_requests,
                    record_report_generated,
                )
                record_crawl_pages(
                    claimed_tenant_id,
                    crawled_count=summary.get("crawled_count", 0),
                    job_id=job_id,
                    is_mock=is_mock_crawl,
                )
                if include_pagespeed and psi_real_requests > 0:
                    record_pagespeed_requests(
                        claimed_tenant_id,
                        real_request_count=psi_real_requests,
                        job_id=job_id,
                        is_mock=False,
                    )
                record_report_generated(
                    claimed_tenant_id,
                    job_id=job_id,
                    is_mock=is_mock_crawl,
                )
            except Exception as meter_exc:
                logger.warning("worker: metering failed for job %s: %s", job_id, meter_exc)

            release_job(
                claimed_tenant_id,
                job_id,
                status=CrawlStatus.COMPLETED,
            )
            logger.info("worker: job %s fully completed (crawl + analysis)", job_id)

    except Exception:
        tb = traceback.format_exc()
        logger.error("worker: job %s failed with unhandled exception:\n%s", job_id, tb)
        # Categorize the error broadly
        error_category = "unhandled_exception"
        try:
            release_job(
                claimed_tenant_id,
                job_id,
                status=CrawlStatus.FAILED,
                error_category=error_category,
            )
        except Exception:
            pass  # best-effort: don't mask the original exception
        return True  # we did process a job (it failed, but we tried)

    return True


# Re-export for convenience so callers only need to import from worker
__all__ = [
    "enqueue_crawl",
    "poll_once",
    "cancel_job",
    "retry_job",
]
