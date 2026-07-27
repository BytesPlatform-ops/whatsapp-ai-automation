"""Worker: ties the queue to the crawl engine.

Public API (called by the route layer or a scheduler):
    enqueue_crawl(site_id, tenant_id, requested_limit, crawl_type) -> (job_id, CrawlJob)
        Create a QUEUED job.  (Re-exported from queue.py for convenience.)

    poll_once(worker_id, tenant_id, *, fetch=safe_fetch) -> bool
        Claim one job and run it to completion (or failure).
        Returns True if a job was processed, False if nothing was available.
        Does NOT start a background thread — call this from a scheduler loop.

    cancel_job(tenant_id, job_id) -> bool
        Cancel a queued or running job.

    retry_job(tenant_id, job_id) -> bool
        Reset a failed/cancelled job to QUEUED.

Crash / stale-lock recovery:
    A job in ``running`` state whose ``lock_expires_at`` is in the past is
    automatically re-claimed by the next ``poll_once`` call.  The worker
    refreshes the lock every ``LOCK_REFRESH_EVERY`` pages (not implemented
    here — the crawler calls update_job for progress, which effectively acts
    as a heartbeat if the route layer periodically checks the timestamp).
    For the current single-process deployment this is sufficient.

Thread safety:
    poll_once uses an optimistic lock confirmed by re-reading the job.  Two
    concurrent callers for the same tenant cannot both claim the same job
    because the second re-read will show a different lock_owner.
"""

from __future__ import annotations

import logging
import traceback
from typing import Callable, Optional, Tuple

from seo.url_guard import safe_fetch
from seo.stores import CrawlJob, CrawlStatus, CrawlType, Site
from seo.crawler.queue import (
    enqueue_crawl,
    claim_next_job_for_tenant,
    release_job,
    cancel_job,
    retry_job,
)
from seo.crawler.crawler import run_crawl

logger = logging.getLogger(__name__)


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

    logger.info(
        "worker: %s processing job %s (site=%s tenant=%s limit=%d)",
        worker_id, job_id, job.site_id, claimed_tenant_id, job.requested_limit,
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
            # Job status was already set to CANCELLED by cancel_job; just release lock
            release_job(
                claimed_tenant_id,
                job_id,
                status=CrawlStatus.CANCELLED,
            )
        else:
            release_job(
                claimed_tenant_id,
                job_id,
                status=CrawlStatus.COMPLETED,
            )
            logger.info(
                "worker: job %s completed — crawled=%d failed=%d discovered=%d",
                job_id,
                summary.get("crawled_count", 0),
                summary.get("failed_count", 0),
                summary.get("discovered_count", 0),
            )

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
