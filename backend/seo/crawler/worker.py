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


def poll_once(
    worker_id: str,
    tenant_id: str,
    *,
    fetch: Callable = safe_fetch,
    store=None,
    min_delay_s: float = 0.5,
    max_retries: int = 2,
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
