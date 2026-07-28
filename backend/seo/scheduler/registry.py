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
  - rank              : seo.rank.scheduler  (claim_due_jobs / run_claimed_job)
  - gsc_sync          : seo.google.sync     (run_gsc_sync, job iteration)
  - ga4_sync          : seo.google.sync     (run_ga4_sync, job iteration)
  - alert_gen         : seo.intelligence.alerts.generate_alerts
  - crawl_recovery    : seo.crawler.worker.poll_once
  - fix_verify        : seo.fix_verify.verify_fix (pending verifications)
  - backlink_sync     : seo.backlinks (if present)
  - gbp_sync          : seo.local.gbp (if present)
  - citation_checks   : seo.local.citations (if present)
  - outreach_followups: seo.outreach.followups (if present)
  - link_verification : seo.backlinks.verification (if present)
  - scheduled_reports : seo.reports (if present)

alert_gen (Supabase-safe approach)
------------------------------------
Instead of scanning all sites in memory, alert_gen uses the ``seo_alert_schedule``
table (one scheduling row per site). ``due_alert_gen()`` queries that table for
rows whose ``next_run <= now`` — a single indexed PostgREST query.  The registry
wrapper falls back to the in-memory site-scan ONLY in memory/file mode (tests).
After running generate_alerts, the schedule row is advanced by SEO_ALERTS_INTERVAL_S
(default 3600).

crawl_recovery (Supabase-safe approach)
-----------------------------------------
``due_crawl_recovery()`` queries seo_crawl_jobs directly for QUEUED/RUNNING rows
with absent or expired locks — a single indexed PostgREST query.  The registry
wrapper groups by tenant_id and calls poll_once() per unique tenant.  No full
Python scan.

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
from datetime import datetime, timedelta, timezone
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


# ── Helpers ───────────────────────────────────────────────────────────────────

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="microseconds")


def _alerts_interval_s() -> int:
    try:
        return int(os.getenv("SEO_ALERTS_INTERVAL_S", "3600"))
    except (ValueError, TypeError):
        return 3600


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
    """GSC sync jobs — Supabase-safe via due_gsc_sync(); memory fallback."""
    try:
        from seo.google.sync import run_gsc_sync
        from seo.search_stores import SyncJobStatus, get_gsc_sync_job_repository
        from seo.scheduler.queries import due_gsc_sync

        def _gsc_due() -> List[Tuple[str, Any]]:
            # Supabase mode: use indexed due_gsc_sync query
            from seo.scheduler.queries import _backend
            if _backend() == "supabase":
                rows = due_gsc_sync()
                results = []
                for row in rows:
                    data = row.get("data") or {}
                    results.append((row["id"], {
                        "tenant_id": row.get("tenant_id", ""),
                        "connection_id": data.get("connection_id", ""),
                        "property_id": data.get("property_id", ""),
                        "site_id": data.get("site_id", ""),
                    }))
                return results
            # Memory/file mode: scan repo rows directly
            repo = get_gsc_sync_job_repository()
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
                _log.warning("gsc_due: scan error: %s", exc)
            return results

        def _gsc_run(job_id: str, job: Any) -> Dict[str, Any]:
            if isinstance(job, dict):
                return run_gsc_sync(
                    job.get("tenant_id", ""),
                    job.get("connection_id", ""),
                    job.get("property_id", ""),
                    site_id=job.get("site_id", ""),
                )
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
    """GA4 sync jobs — Supabase-safe via due_ga4_sync(); memory fallback."""
    try:
        from seo.google.sync import run_ga4_sync
        from seo.search_stores import SyncJobStatus, get_ga4_sync_job_repository
        from seo.scheduler.queries import due_ga4_sync

        def _ga4_due() -> List[Tuple[str, Any]]:
            from seo.scheduler.queries import _backend
            if _backend() == "supabase":
                rows = due_ga4_sync()
                results = []
                for row in rows:
                    data = row.get("data") or {}
                    results.append((row["id"], {
                        "tenant_id": row.get("tenant_id", ""),
                        "connection_id": data.get("connection_id", ""),
                        "property_id": data.get("property_id", ""),
                        "site_id": data.get("site_id", ""),
                    }))
                return results
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
            if isinstance(job, dict):
                return run_ga4_sync(
                    job.get("tenant_id", ""),
                    job.get("connection_id", ""),
                    job.get("property_id", ""),
                    site_id=job.get("site_id", ""),
                )
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
    """Alert generation — Supabase-safe via seo_alert_schedule table.

    In Supabase mode: queries ``seo_alert_schedule`` for rows whose ``next_run``
    is <= now (one row per site, indexed scan).  After running generate_alerts,
    the schedule row is advanced by SEO_ALERTS_INTERVAL_S.  This eliminates the
    full site-table scan that the previous implementation performed.

    In memory/file mode (tests): falls back to scanning the site repo in memory
    (bounded by batch_size, same as before). Memory repos are small (<1000 rows)
    so the bounded scan is acceptable.
    """
    try:
        from seo.intelligence.alerts import generate_alerts
        from seo.stores import get_site_repository
        from seo.scheduler.queries import due_alert_gen, _backend, complete_job

        def _alert_due() -> List[Tuple[str, Any]]:
            """Return one synthetic 'job' per site that is due for alert generation."""
            if _backend() == "supabase":
                # Supabase-safe: query seo_alert_schedule (indexed on next_run)
                rows = due_alert_gen()
                results = []
                for row in rows:
                    data = row.get("data") or {}
                    site_id = data.get("site_id") or row.get("id", "")
                    tenant_id = row.get("tenant_id", "")
                    results.append((row["id"], {
                        "tenant_id": tenant_id,
                        "site_id": site_id,
                        "schedule_row_id": row["id"],
                        "data": data,
                    }))
                return results

            # Memory/file mode: bounded scan of site repo (tests)
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
                        results.append((site_id, {
                            "tenant_id": tenant_id,
                            "site_id": site_id,
                            "data": data,
                        }))
            except Exception as exc:
                _log.warning("alert_due: scan error: %s", exc)
            return results

        def _alert_run(job_id: str, job: Any) -> Dict[str, Any]:
            tenant_id = job.get("tenant_id", "") if isinstance(job, dict) else getattr(job, "tenant_id", "")
            site_id = job.get("site_id", job_id) if isinstance(job, dict) else getattr(job, "site_id", job_id)
            schedule_row_id = (job.get("schedule_row_id", "") if isinstance(job, dict) else "")

            created = generate_alerts(tenant_id, site_id)

            # Advance schedule row next_run (Supabase-safe)
            if schedule_row_id and _backend() == "supabase":
                interval_s = _alerts_interval_s()
                try:
                    complete_job(
                        "seo_alert_schedule",
                        schedule_row_id,
                        "scheduler",
                        tenant_id=tenant_id,
                        new_status="pending",
                        next_run_offset_s=interval_s,
                    )
                except Exception as exc:
                    _log.debug("alert_gen: could not advance schedule row %s: %s", schedule_row_id, exc)

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
    """Crawl recovery — Supabase-safe via due_crawl_recovery().

    In Supabase mode: queries seo_crawl_jobs for QUEUED/RUNNING rows with
    absent/expired locks — a single indexed PostgREST query. Groups by tenant_id
    and calls poll_once() per tenant.  No full Python scan.

    In memory/file mode (tests): same indexed query through the memory repo
    (due_crawl_recovery uses the standard due_jobs memory path, bounded).
    """
    try:
        from seo.crawler.worker import poll_once
        from seo.stores import CrawlStatus
        from seo.scheduler.queries import due_crawl_recovery

        def _crawl_due() -> List[Tuple[str, Any]]:
            """Return one synthetic job per tenant that has due crawl jobs."""
            rows = due_crawl_recovery()
            # Group by tenant_id to avoid calling poll_once multiple times per tenant
            tenants: Dict[str, Any] = {}
            for row in rows:
                tenant_id = row.get("tenant_id", "")
                if tenant_id and tenant_id not in tenants:
                    tenants[tenant_id] = {"tenant_id": tenant_id}
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
    """Fix-verification retries — Supabase-safe via due_fix_verify()."""
    try:
        from seo.fix_verify import verify_fix, list_fix_verifications
        from seo.search_stores import VerifyStatus
        from seo.scheduler.queries import due_fix_verify

        def _fixver_due() -> List[Tuple[str, Any]]:
            """Return one job per PENDING fix verification across all tenants."""
            results: List[Tuple[str, Any]] = []
            try:
                # Use Supabase-safe query path
                rows = due_fix_verify()
                for row in rows:
                    data = row.get("data") or {}
                    tenant_id = row.get("tenant_id", "")
                    fix_id = row.get("id", "")
                    results.append((fix_id, {"tenant_id": tenant_id, "fix_id": fix_id}))
            except Exception as exc:
                _log.warning("fixver_due: scan error: %s", exc)

            # Memory fallback when rows is empty and memory repo exists
            if not results:
                try:
                    from seo.search_stores import get_fix_verification_repository
                    repo = get_fix_verification_repository()
                    raw_rows = getattr(repo._repo, "_rows", None)
                    if raw_rows is not None:
                        for row in list(raw_rows):
                            data = row.get("data") or {}
                            status = data.get("result") or data.get("status") or ""
                            if status == VerifyStatus.PENDING.value:
                                tenant_id = row.get("tenant_id", "")
                                fix_id = row.get("id", "")
                                results.append((fix_id, {"tenant_id": tenant_id, "fix_id": fix_id}))
                except Exception as exc:
                    _log.warning("fixver_due: memory fallback error: %s", exc)

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


def _register_backlink_sync() -> None:
    """Backlink sync — Supabase-safe via due_backlink_sync()."""
    try:
        from seo.scheduler.queries import due_backlink_sync

        # Optional import — skip if backlinks vertical not installed
        try:
            from seo.backlinks.sync import run_backlink_sync  # type: ignore[import]
        except ImportError:
            _log.debug("registry: backlink_sync: seo.backlinks.sync not found, skipping")
            return

        def _backlink_due() -> List[Tuple[str, Any]]:
            rows = due_backlink_sync()
            results = []
            for row in rows:
                data = row.get("data") or {}
                results.append((row["id"], {
                    "tenant_id": row.get("tenant_id", ""),
                    "project_id": row.get("id", ""),
                    "provider": data.get("provider", ""),
                    "domain": data.get("domain", ""),
                }))
            return results

        def _backlink_run(job_id: str, job: Any) -> Dict[str, Any]:
            if isinstance(job, dict):
                return run_backlink_sync(
                    job.get("tenant_id", ""),
                    job.get("project_id", job_id),
                )
            return run_backlink_sync(getattr(job, "tenant_id", ""), job_id)

        register_job_source(
            "backlink_sync",
            due_fn=_backlink_due,
            run_fn=_backlink_run,
            enabled_env="SEO_BACKLINK_SYNC_ENABLED",
        )
    except Exception as exc:
        _log.warning("registry: skipping backlink_sync source: %s", exc)


def _register_gbp_sync() -> None:
    """GBP sync — Supabase-safe via due_gbp_sync()."""
    try:
        from seo.scheduler.queries import due_gbp_sync

        try:
            from seo.local.gbp import run_gbp_sync  # type: ignore[import]
        except ImportError:
            _log.debug("registry: gbp_sync: seo.local.gbp not found, skipping")
            return

        def _gbp_due() -> List[Tuple[str, Any]]:
            rows = due_gbp_sync()
            results = []
            for row in rows:
                data = row.get("data") or {}
                results.append((row["id"], {
                    "tenant_id": row.get("tenant_id", ""),
                    "location_id": data.get("location_id", ""),
                }))
            return results

        def _gbp_run(job_id: str, job: Any) -> Dict[str, Any]:
            if isinstance(job, dict):
                return run_gbp_sync(job.get("tenant_id", ""), job.get("location_id", ""))
            return run_gbp_sync(getattr(job, "tenant_id", ""), job_id)

        register_job_source(
            "gbp_sync",
            due_fn=_gbp_due,
            run_fn=_gbp_run,
            enabled_env="SEO_GBP_SYNC_ENABLED",
        )
    except Exception as exc:
        _log.warning("registry: skipping gbp_sync source: %s", exc)


def _register_citation_checks() -> None:
    """Citation checks — Supabase-safe via due_citation_checks()."""
    try:
        from seo.scheduler.queries import due_citation_checks

        try:
            from seo.local.citations import run_citation_check  # type: ignore[import]
        except ImportError:
            _log.debug("registry: citation_checks: seo.local.citations not found, skipping")
            return

        def _citation_due() -> List[Tuple[str, Any]]:
            rows = due_citation_checks()
            results = []
            for row in rows:
                data = row.get("data") or {}
                results.append((row["id"], {
                    "tenant_id": row.get("tenant_id", ""),
                    "location_id": data.get("location_id", ""),
                }))
            return results

        def _citation_run(job_id: str, job: Any) -> Dict[str, Any]:
            if isinstance(job, dict):
                return run_citation_check(job.get("tenant_id", ""), job_id)
            return run_citation_check(getattr(job, "tenant_id", ""), job_id)

        register_job_source(
            "citation_checks",
            due_fn=_citation_due,
            run_fn=_citation_run,
            enabled_env="SEO_CITATION_CHECKS_ENABLED",
        )
    except Exception as exc:
        _log.warning("registry: skipping citation_checks source: %s", exc)


def _register_outreach_followups() -> None:
    """Outreach follow-ups — Supabase-safe via due_outreach_followups()."""
    try:
        from seo.scheduler.queries import due_outreach_followups

        try:
            from seo.outreach.followups import run_due_followups  # type: ignore[import]
        except ImportError:
            _log.debug("registry: outreach_followups: seo.outreach.followups not found, skipping")
            return

        def _followup_due() -> List[Tuple[str, Any]]:
            rows = due_outreach_followups()
            results = []
            for row in rows:
                data = row.get("data") or {}
                results.append((row["id"], {
                    "tenant_id": row.get("tenant_id", ""),
                    "followup_id": row.get("id", ""),
                    "campaign_id": data.get("campaign_id", ""),
                    "contact_id": data.get("contact_id", ""),
                }))
            return results

        def _followup_run(job_id: str, job: Any) -> Dict[str, Any]:
            if isinstance(job, dict):
                tenant_id = job.get("tenant_id", "")
                return run_due_followups(tenant_id, followup_id=job.get("followup_id", job_id))
            return run_due_followups(getattr(job, "tenant_id", ""), followup_id=job_id)

        register_job_source(
            "outreach_followups",
            due_fn=_followup_due,
            run_fn=_followup_run,
            enabled_env="SEO_OUTREACH_FOLLOWUPS_ENABLED",
        )
    except Exception as exc:
        _log.warning("registry: skipping outreach_followups source: %s", exc)


def _register_link_verification() -> None:
    """Link placement verification — Supabase-safe via due_link_verification()."""
    try:
        from seo.scheduler.queries import due_link_verification

        try:
            from seo.backlinks.verification import run_link_verification  # type: ignore[import]
        except ImportError:
            _log.debug("registry: link_verification: seo.backlinks.verification not found, skipping")
            return

        def _linkver_due() -> List[Tuple[str, Any]]:
            rows = due_link_verification()
            results = []
            for row in rows:
                data = row.get("data") or {}
                results.append((row["id"], {
                    "tenant_id": row.get("tenant_id", ""),
                    "placement_id": row.get("id", ""),
                    "target_url": data.get("target_url", ""),
                }))
            return results

        def _linkver_run(job_id: str, job: Any) -> Dict[str, Any]:
            if isinstance(job, dict):
                return run_link_verification(job.get("tenant_id", ""), job_id)
            return run_link_verification(getattr(job, "tenant_id", ""), job_id)

        register_job_source(
            "link_verification",
            due_fn=_linkver_due,
            run_fn=_linkver_run,
            enabled_env="SEO_LINK_VERIFICATION_ENABLED",
        )
    except Exception as exc:
        _log.warning("registry: skipping link_verification source: %s", exc)


def _register_scheduled_reports() -> None:
    """Scheduled report generation — Supabase-safe via due_scheduled_reports()."""
    try:
        from seo.scheduler.queries import due_scheduled_reports

        try:
            from seo.reports.scheduler import run_scheduled_report  # type: ignore[import]
        except ImportError:
            _log.debug("registry: scheduled_reports: seo.reports.scheduler not found, skipping")
            return

        def _reports_due() -> List[Tuple[str, Any]]:
            rows = due_scheduled_reports()
            results = []
            for row in rows:
                data = row.get("data") or {}
                results.append((row["id"], {
                    "tenant_id": row.get("tenant_id", ""),
                    "schedule_id": row.get("id", ""),
                    "site_id": data.get("site_id", ""),
                    "report_type": data.get("report_type", ""),
                }))
            return results

        def _reports_run(job_id: str, job: Any) -> Dict[str, Any]:
            if isinstance(job, dict):
                return run_scheduled_report(job.get("tenant_id", ""), job_id)
            return run_scheduled_report(getattr(job, "tenant_id", ""), job_id)

        register_job_source(
            "scheduled_reports",
            due_fn=_reports_due,
            run_fn=_reports_run,
            enabled_env="SEO_SCHEDULED_REPORTS_ENABLED",
        )
    except Exception as exc:
        _log.warning("registry: skipping scheduled_reports source: %s", exc)


def _register_all_builtins() -> None:
    """Register all built-in job sources. Called once at module import."""
    _register_rank()
    _register_gsc_sync()
    _register_ga4_sync()
    _register_alert_gen()
    _register_crawl_recovery()
    _register_fix_verify()
    _register_backlink_sync()
    _register_gbp_sync()
    _register_citation_checks()
    _register_outreach_followups()
    _register_link_verification()
    _register_scheduled_reports()


# Auto-register on import (idempotent guard via registry dict key check)
_register_all_builtins()
