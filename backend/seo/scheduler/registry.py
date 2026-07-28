"""Job-source registry for the SEO scheduler.

Usage
-----
from seo.scheduler.registry import register_job_source, get_registry

# Register a custom source (optional enabled_env guard):
register_job_source(
    name="my_source",
    due_fn=my_due_fn,     # () -> List[Tuple[str, Any]]  (job_id, job_obj)
    run_fn=my_run_fn,     # (job_id, job_obj) -> dict
    enabled_env="MY_SOURCE_ENABLED",
)

Built-in registrations
----------------------
The module auto-registers the EXISTING production jobs on first import:
  - rank         : seo.rank.scheduler  (claim_due_jobs / run_claimed_job)
  - gsc_sync     : seo.google.sync     (run_gsc_sync, job iteration)
  - ga4_sync     : seo.google.sync     (run_ga4_sync, job iteration)
  - alert_gen    : seo.intelligence.alerts.generate_alerts
  - crawl_recovery: seo.crawler.worker.poll_once
  - fix_verify   : seo.fix_verify.verify_fix (pending verifications)

Each registration is guarded by its own enabled_env check; unknown/absent
verticals are simply not registered.  Registrations that fail to import their
module are skipped with a warning (avoids breaking the scheduler when an
optional vertical is not installed).

Thread safety
-------------
The registry dict is written only at startup (single-threaded) and read from
the scheduler loop. No locking needed after startup completes.
"""

from __future__ import annotations

import logging
import os
from typing import Any, Callable, Dict, List, Optional, Tuple

_log = logging.getLogger("pixie.seo.scheduler.registry")

# ── Registry storage ──────────────────────────────────────────────────────────

_REGISTRY: Dict[str, "_JobSource"] = {}


class _JobSource:
    """Describes a single registered job source."""

    def __init__(
        self,
        name: str,
        due_fn: Callable[[], List[Tuple[str, Any]]],
        run_fn: Callable[[str, Any], Dict[str, Any]],
        enabled_env: Optional[str] = None,
    ) -> None:
        self.name = name
        self.due_fn = due_fn
        self.run_fn = run_fn
        self.enabled_env = enabled_env

    def is_enabled(self) -> bool:
        if self.enabled_env is None:
            return True
        val = os.getenv(self.enabled_env, "").strip().lower()
        return val in ("1", "true", "yes", "on")

    def __repr__(self) -> str:
        return f"<JobSource name={self.name!r} enabled_env={self.enabled_env!r}>"


# ── Public API ────────────────────────────────────────────────────────────────

def register_job_source(
    name: str,
    due_fn: Callable[[], List[Tuple[str, Any]]],
    run_fn: Callable[[str, Any], Dict[str, Any]],
    *,
    enabled_env: Optional[str] = None,
) -> None:
    """Register a named job source.

    Parameters
    ----------
    name:        Unique name for this source (used in health dicts + logs).
    due_fn:      Callable with no args → List of ``(job_id, job_obj)`` that are
                 ready to claim + run.
    run_fn:      Callable ``(job_id, job_obj) -> result_dict``.  Must handle its
                 own exceptions and return a dict with at least ``{"status": ...}``.
    enabled_env: Optional env var name. When set, the source is only active
                 when that var is truthy. Allows per-vertical kill-switch.
    """
    if name in _REGISTRY:
        _log.warning("register_job_source: overwriting existing source %r", name)
    _REGISTRY[name] = _JobSource(name=name, due_fn=due_fn, run_fn=run_fn, enabled_env=enabled_env)
    _log.debug("register_job_source: registered %r (enabled_env=%r)", name, enabled_env)


def get_registry() -> Dict[str, "_JobSource"]:
    """Return a snapshot of the current registry."""
    return dict(_REGISTRY)


def get_enabled_sources() -> List["_JobSource"]:
    """Return only the sources whose enabled_env check passes."""
    return [s for s in _REGISTRY.values() if s.is_enabled()]


# ── Built-in registrations ────────────────────────────────────────────────────

def _register_rank() -> None:
    """Rank-job scheduler (seo.rank.scheduler)."""
    try:
        from seo.rank.scheduler import claim_due_jobs, run_claimed_job

        def _rank_due() -> List[Tuple[str, Any]]:
            return claim_due_jobs()

        def _rank_run(job_id: str, job: Any) -> Dict[str, Any]:
            return run_claimed_job(job_id, job)

        register_job_source(
            "rank",
            due_fn=_rank_due,
            run_fn=_rank_run,
            enabled_env="SEO_RANK_SCHEDULER_ENABLED",
        )
    except ImportError as exc:
        _log.warning("registry: skipping rank source — import failed: %s", exc)


def _register_gsc_sync() -> None:
    """GSC sync jobs — iterates QUEUED/RUNNING GscSyncJob rows."""
    try:
        from seo.google.sync import run_gsc_sync
        from seo.search_stores import SyncJobStatus, get_gsc_sync_job_repository

        def _gsc_due() -> List[Tuple[str, Any]]:
            repo = get_gsc_sync_job_repository()
            results: List[Tuple[str, Any]] = []
            # Collect across all stored rows (memory/file mode)
            try:
                raw_rows = getattr(repo._repo, "_rows", None)
                if raw_rows is None:
                    return results
                for row in list(raw_rows):
                    built = repo._build(row)
                    if not built:
                        continue
                    job_id, job = built
                    if job.status in (SyncJobStatus.QUEUED, SyncJobStatus.RUNNING):
                        results.append((row["id"], job))
            except Exception as exc:
                _log.warning("gsc_due: scan error: %s", exc)
            return results

        def _gsc_run(job_id: str, job: Any) -> Dict[str, Any]:
            return run_gsc_sync(
                job.tenant_id,
                job.connection_id,
                job.property_id,
                site_id=getattr(job, "site_id", ""),
            )

        register_job_source(
            "gsc_sync",
            due_fn=_gsc_due,
            run_fn=_gsc_run,
            enabled_env="SEO_GSC_SCHEDULER_ENABLED",
        )
    except ImportError as exc:
        _log.warning("registry: skipping gsc_sync source — import failed: %s", exc)


def _register_ga4_sync() -> None:
    """GA4 sync jobs — iterates QUEUED/RUNNING Ga4SyncJob rows."""
    try:
        from seo.google.sync import run_ga4_sync
        from seo.search_stores import SyncJobStatus, get_ga4_sync_job_repository

        def _ga4_due() -> List[Tuple[str, Any]]:
            repo = get_ga4_sync_job_repository()
            results: List[Tuple[str, Any]] = []
            try:
                raw_rows = getattr(repo._repo, "_rows", None)
                if raw_rows is None:
                    return results
                for row in list(raw_rows):
                    built = repo._build(row)
                    if not built:
                        continue
                    job_id, job = built
                    if job.status in (SyncJobStatus.QUEUED, SyncJobStatus.RUNNING):
                        results.append((row["id"], job))
            except Exception as exc:
                _log.warning("ga4_due: scan error: %s", exc)
            return results

        def _ga4_run(job_id: str, job: Any) -> Dict[str, Any]:
            return run_ga4_sync(
                job.tenant_id,
                job.connection_id,
                job.property_id,
                site_id=getattr(job, "site_id", ""),
            )

        register_job_source(
            "ga4_sync",
            due_fn=_ga4_due,
            run_fn=_ga4_run,
            enabled_env="SEO_GA4_SCHEDULER_ENABLED",
        )
    except ImportError as exc:
        _log.warning("registry: skipping ga4_sync source — import failed: %s", exc)


def _register_alert_gen() -> None:
    """Alert generation — runs generate_alerts for each site with pending data."""
    try:
        from seo.intelligence.alerts import generate_alerts
        from seo.stores import get_site_repository

        def _alert_due() -> List[Tuple[str, Any]]:
            """Return one synthetic 'job' per site: (site_id, site_obj)."""
            results: List[Tuple[str, Any]] = []
            try:
                repo = get_site_repository()
                raw_rows = getattr(repo._repo, "_rows", None)
                if raw_rows is None:
                    return results
                seen: set = set()
                for row in list(raw_rows):
                    data = row.get("data") or {}
                    tenant_id = row.get("tenant_id", "")
                    site_id = row.get("id", "")
                    key = (tenant_id, site_id)
                    if key not in seen:
                        seen.add(key)
                        results.append((site_id, {"tenant_id": tenant_id, "site_id": site_id, "data": data}))
            except Exception as exc:
                _log.warning("alert_due: scan error: %s", exc)
            return results

        def _alert_run(job_id: str, job: Any) -> Dict[str, Any]:
            tenant_id = job.get("tenant_id", "") if isinstance(job, dict) else getattr(job, "tenant_id", "")
            site_id = job.get("site_id", job_id) if isinstance(job, dict) else getattr(job, "site_id", job_id)
            created = generate_alerts(tenant_id, site_id)
            return {"status": "completed", "alerts_created": len(created), "site_id": site_id}

        register_job_source(
            "alert_gen",
            due_fn=_alert_due,
            run_fn=_alert_run,
            enabled_env="SEO_ALERTS_ENABLED",
        )
    except ImportError as exc:
        _log.warning("registry: skipping alert_gen source — import failed: %s", exc)


def _register_crawl_recovery() -> None:
    """Crawl recovery — calls poll_once for each tenant with stale crawl jobs."""
    try:
        from seo.crawler.worker import poll_once
        from seo.stores import get_crawl_job_repository, CrawlStatus

        def _crawl_due() -> List[Tuple[str, Any]]:
            """Return one synthetic job per tenant that has queued/running crawl jobs."""
            repo = get_crawl_job_repository()
            tenants: Dict[str, Any] = {}
            try:
                raw_rows = getattr(repo._repo, "_rows", None)
                if raw_rows is None:
                    return []
                for row in list(raw_rows):
                    data = row.get("data") or {}
                    status = data.get("status") or row.get("status", "")
                    tenant_id = row.get("tenant_id", "")
                    if status in (CrawlStatus.QUEUED.value, CrawlStatus.RUNNING.value) and tenant_id:
                        tenants[tenant_id] = {"tenant_id": tenant_id}
            except Exception as exc:
                _log.warning("crawl_due: scan error: %s", exc)
            return list(tenants.items())

        def _crawl_run(job_id: str, job: Any) -> Dict[str, Any]:
            tenant_id = job.get("tenant_id", job_id) if isinstance(job, dict) else job_id
            processed = poll_once(worker_id=f"scheduler-{job_id[:8]}", tenant_id=tenant_id)
            return {"status": "completed", "processed": processed, "tenant_id": tenant_id}

        register_job_source(
            "crawl_recovery",
            due_fn=_crawl_due,
            run_fn=_crawl_run,
            enabled_env="SEO_CRAWL_RECOVERY_ENABLED",
        )
    except ImportError as exc:
        _log.warning("registry: skipping crawl_recovery source — import failed: %s", exc)


def _register_fix_verify() -> None:
    """Fix-verification retries — runs verify_fix for each PENDING record."""
    try:
        from seo.fix_verify import verify_fix, list_fix_verifications
        from seo.search_stores import VerifyStatus

        def _fixver_due() -> List[Tuple[str, Any]]:
            """Return one job per PENDING fix verification across all tenants."""
            results: List[Tuple[str, Any]] = []
            try:
                from seo.search_stores import get_fix_verification_repository
                repo = get_fix_verification_repository()
                raw_rows = getattr(repo._repo, "_rows", None)
                if raw_rows is None:
                    return results
                for row in list(raw_rows):
                    data = row.get("data") or {}
                    status = data.get("result") or data.get("status") or ""
                    if status == VerifyStatus.PENDING.value:
                        tenant_id = row.get("tenant_id", "")
                        fix_id = row.get("id", "")
                        results.append((fix_id, {"tenant_id": tenant_id, "fix_id": fix_id}))
            except Exception as exc:
                _log.warning("fixver_due: scan error: %s", exc)
            return results

        def _fixver_run(job_id: str, job: Any) -> Dict[str, Any]:
            tenant_id = job.get("tenant_id", "") if isinstance(job, dict) else getattr(job, "tenant_id", "")
            fix_id = job.get("fix_id", job_id) if isinstance(job, dict) else job_id
            result = verify_fix(tenant_id, fix_id)
            status = "not_found"
            if result:
                _, fv = result
                status = getattr(fv, "result", "unknown")
                if hasattr(status, "value"):
                    status = status.value
            return {"status": "completed", "verify_result": status, "fix_id": fix_id}

        register_job_source(
            "fix_verify",
            due_fn=_fixver_due,
            run_fn=_fixver_run,
            enabled_env="SEO_FIX_VERIFY_ENABLED",
        )
    except ImportError as exc:
        _log.warning("registry: skipping fix_verify source — import failed: %s", exc)


def _register_all_builtins() -> None:
    """Register all built-in job sources. Called once at module import."""
    _register_rank()
    _register_gsc_sync()
    _register_ga4_sync()
    _register_alert_gen()
    _register_crawl_recovery()
    _register_fix_verify()


# Auto-register on import (idempotent guard via registry dict key check)
_register_all_builtins()
