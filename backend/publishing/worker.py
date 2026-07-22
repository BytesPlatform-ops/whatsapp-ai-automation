"""Publishing worker — durable, lock-coordinated job execution.

``run_due_once`` selects due jobs, acquires a per-job lock (so multiple worker
instances never double-publish), rechecks state, records an attempt, calls the
adapter, persists platform ids, and applies the bounded retry policy. It is the
unit of work; ``start_worker`` runs it on an interval in a daemon thread when
``PUBLISH_WORKER_ENABLED`` is set. The browser is never the source of truth.

Dry-run jobs run the full path but the adapter never calls a platform.
"""

from __future__ import annotations

import logging
import threading
from typing import Callable, List, Optional

from content_agent.errors import ErrorCategory, redact

from . import config, connections, retry
from .adapters import get_adapter
from .enums import PublishMode, PublishStatus
from .schemas import PublishAttempt, PublishJob
from .store import get_attempt_repository, get_job_repository, now_iso

_log = logging.getLogger("pixie.publishing")

TokenResolver = Callable[[str, str], Optional[str]]
MediaResolver = Callable[[str, List[str]], List[str]]


def _default_media_resolver(tenant_id: str, asset_ids: List[str]) -> List[str]:
    """Resolve tenant-owned media assets to backend-readable public URLs. Best
    effort — returns only URLs for assets that belong to the tenant and exist."""
    urls: List[str] = []
    if not asset_ids:
        return urls
    try:
        from content import service as content_service
        for aid in asset_ids:
            try:
                asset = content_service.get_asset(tenant_id, aid)  # tenant-scoped lookup
            except Exception:
                asset = None
            url = getattr(asset, "public_url", "") if asset else ""
            if url:
                urls.append(url)
    except Exception:
        pass
    return urls


def run_due_once(
    worker_id: str = "worker-1",
    *,
    transport=None,
    token_resolver: Optional[TokenResolver] = None,
    media_resolver: Optional[MediaResolver] = None,
) -> dict:
    """Process all currently-due jobs once. Returns a summary (no secrets)."""
    jobs = get_job_repository().due_jobs(lock_timeout_s=config.lock_timeout_seconds())
    processed = []
    for jid, job in jobs:
        locked = get_job_repository().acquire_lock(job.tenant_id, jid, worker_id,
                                                   lock_timeout_s=config.lock_timeout_seconds())
        if locked is None:
            continue  # another worker claimed it
        result = _execute(jid, locked, worker_id, transport, token_resolver, media_resolver)
        processed.append({"job_id": jid, "result": result})
    return {"worker": worker_id, "processed": processed, "count": len(processed)}


def _execute(jid, job: PublishJob, worker_id, transport, token_resolver, media_resolver) -> str:
    tenant = job.tenant_id
    jobrepo = get_job_repository()
    attrepo = get_attempt_repository()

    # Idempotency: a job that already has a platform post id must never re-post.
    if job.platform_post_id:
        jobrepo.release_lock(tenant, jid, status=PublishStatus.PUBLISHED)
        return "already_published"

    attempt_number = job.attempt_count + 1
    aid, _ = attrepo.create(PublishAttempt(tenant_id=tenant, job_id=jid, attempt_number=attempt_number,
                                           simulated=(job.mode is PublishMode.DRY_RUN)))

    token = None
    if job.mode is PublishMode.LIVE:
        token = (token_resolver or connections.token_for)(tenant, job.connection_id)
    media_urls = (media_resolver or _default_media_resolver)(tenant, list(job.snapshot.media_asset_ids))

    adapter = get_adapter(job.platform, job.mode, transport=transport)
    job_dict = job.model_dump()
    job_dict["_media_urls"] = media_urls

    outcome = adapter.publish(job_dict, token=token)

    if outcome.ok:
        attrepo.complete(tenant, aid, result="published", platform_post_id=outcome.platform_post_id,
                         platform_request_id=outcome.platform_request_id, response_meta=outcome.response_meta,
                         simulated=(job.mode is PublishMode.DRY_RUN))
        jobrepo.release_lock(tenant, jid, status=PublishStatus.PUBLISHED, attempt_count=attempt_number,
                             platform_post_id=outcome.platform_post_id, platform_permalink=outcome.permalink,
                             completed_at=now_iso(), error_category="", error_correlation_id="")
        return "published"

    # Failure path — record the attempt with a SAFE category (no raw payload).
    _log.warning("publish attempt failed job=%s attempt=%d category=%s cid=%s detail=%s",
                 jid, attempt_number, outcome.error_category, outcome.error_correlation_id,
                 redact(str(outcome.response_meta)))
    attrepo.complete(tenant, aid, result="failed", error_category=outcome.error_category,
                     error_correlation_id=outcome.error_correlation_id, retryable=outcome.retryable,
                     response_meta=outcome.response_meta, platform_request_id=outcome.platform_request_id)

    if outcome.reconnection_required:
        jobrepo.release_lock(tenant, jid, status=PublishStatus.RECONNECTION_REQUIRED, attempt_count=attempt_number,
                             error_category=outcome.error_category, error_correlation_id=outcome.error_correlation_id,
                             completed_at=now_iso())
        return "reconnection_required"

    if retry.should_retry(attempt_number, job.max_attempts, outcome.retryable):
        retry_after = int(outcome.response_meta.get("retry_after", 0) or 0)
        nxt = retry.next_retry_iso(attempt_number + 1, config.retry_base_seconds(), jid, retry_after=retry_after)
        jobrepo.release_lock(tenant, jid, status=PublishStatus.RETRY_WAIT, attempt_count=attempt_number,
                             next_retry_utc=nxt, error_category=outcome.error_category,
                             error_correlation_id=outcome.error_correlation_id)
        return "retry_wait"

    # Bounded retries exhausted / non-retryable → terminal failure.
    jobrepo.release_lock(tenant, jid, status=PublishStatus.FAILED, attempt_count=attempt_number,
                         error_category=outcome.error_category, error_correlation_id=outcome.error_correlation_id,
                         completed_at=now_iso())
    return "failed"


# ── Background runner (opt-in) ──────────────────────────────────────────────────
_stop = threading.Event()
_thread: Optional[threading.Thread] = None


def start_worker() -> bool:
    """Start the polling worker in a daemon thread when enabled. No-op otherwise."""
    global _thread
    if not config.worker_enabled():
        return False
    if _thread and _thread.is_alive():
        return True
    _stop.clear()

    def _loop():
        interval = max(5, config.poll_interval_seconds())
        while not _stop.wait(interval):
            try:
                run_due_once("worker-bg")
            except Exception:  # a worker tick must never crash the process
                _log.exception("publishing worker tick failed")

    _thread = threading.Thread(target=_loop, name="pixie-publish-worker", daemon=True)
    _thread.start()
    _log.info("[publishing] background worker started (interval=%ss)", config.poll_interval_seconds())
    return True


def stop_worker() -> None:
    _stop.set()
