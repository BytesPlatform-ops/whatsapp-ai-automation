"""SEO Scheduler admin/internal routes.

Prefix:  /api/agents/seo/scheduler
Tags:    seo-scheduler
Auth:    INTERNAL only — X-Pixie-Internal-Secret header required (same check
         as the global app middleware, but re-checked here for defence-in-depth
         on the admin endpoints).

Endpoints
---------
GET  /health              — scheduler health dict (no secrets/tokens/raw data)
POST /tick                — execute one scheduler tick synchronously
POST /jobs/{job_id}/retry — mark a job for retry (resets lock + status to queued)
POST /pause               — pause a job type (sets an env-flag equivalent in memory)
POST /resume              — resume a paused job type
"""

from __future__ import annotations

import logging
import os
from typing import Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

_log = logging.getLogger("pixie.seo.scheduler.routes")

router = APIRouter(
    prefix="/api/agents/seo/scheduler",
    tags=["seo-scheduler"],
)


# ── Internal secret guard ─────────────────────────────────────────────────────

def _require_internal(x_pixie_internal_secret: Optional[str] = Header(default=None)) -> None:
    """Dependency: rejects requests that don't carry the internal secret.

    Mirrors the app-level middleware check but enforces it regardless of whether
    PIXIE_REQUIRE_INTERNAL_SECRET is set — scheduler admin routes are always
    internal-only.  When PIXIE_INTERNAL_API_SECRET is not configured (dev/test)
    the check is a no-op so local dev is not blocked.
    """
    secret = os.getenv("PIXIE_INTERNAL_API_SECRET", "").strip()
    if not secret:
        # Dev/test mode: no secret configured, allow through.
        return
    if x_pixie_internal_secret != secret:
        raise HTTPException(status_code=401, detail="unauthorized: missing/invalid internal secret")


# ── Shared helper: get active scheduler ──────────────────────────────────────

def _get_scheduler():
    """Return the active SeoScheduler instance, or raise 503 if unavailable."""
    try:
        from seo.scheduler.runtime import _get_active_instance
        inst = _get_active_instance()
        if inst is None:
            raise HTTPException(status_code=503, detail="scheduler not running")
        return inst
    except ImportError as exc:
        raise HTTPException(status_code=503, detail=f"scheduler module unavailable: {exc}") from exc


# ── In-memory pause registry ─────────────────────────────────────────────────
# Stores job-type names that are paused for this process lifetime.
_PAUSED: set = set()


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/health")
def scheduler_health(
    _: None = None,
    x_pixie_internal_secret: Optional[str] = Header(default=None),
) -> dict:
    """Return scheduler health dict.

    Safe: no secrets, no tokens, no raw provider data.
    Returns 200 with ``{"enabled": false}`` when the scheduler is disabled
    (e.g. in dev mode without SEO_SCHEDULER_ENABLED) rather than 503 — callers
    can check the ``enabled`` field.
    """
    _require_internal(x_pixie_internal_secret)

    try:
        from seo.scheduler.runtime import _get_active_instance, _scheduler_enabled

        # Encryption health check (always included, no key exposed)
        try:
            from seo.google.crypto import encryption_status
            enc = encryption_status()
        except Exception:
            enc = {"active": None, "mode": "unknown", "required": False}

        inst = _get_active_instance()
        if inst is None:
            return {
                "enabled": _scheduler_enabled(),
                "instance_id": None,
                "running_thread": False,
                "last_heartbeat": None,
                "last_successful_loop": None,
                "claimed": 0,
                "completed": 0,
                "failed": 0,
                "retried": 0,
                "running": [],
                "quota_errors": 0,
                "stale_lock_recoveries": 0,
                "paused_sources": sorted(_PAUSED),
                "encryption": enc,
            }

        health = inst.health()
        health["paused_sources"] = sorted(_PAUSED)
        return health

    except Exception as exc:
        _log.error("scheduler_health: error: %s", exc)
        raise HTTPException(status_code=500, detail=f"health check failed: {exc}") from exc


@router.post("/tick")
def scheduler_tick(
    x_pixie_internal_secret: Optional[str] = Header(default=None),
) -> dict:
    """Execute one scheduler tick synchronously.

    Useful for manual triggering or debugging. Returns a delta dict showing
    how many jobs were claimed/completed/failed in this tick.
    """
    _require_internal(x_pixie_internal_secret)
    inst = _get_scheduler()
    try:
        return inst.tick_once()
    except Exception as exc:
        _log.error("scheduler_tick: error: %s", exc)
        raise HTTPException(status_code=500, detail=f"tick failed: {exc}") from exc


class RetryBody(BaseModel):
    tenant_id: Optional[str] = None
    source: Optional[str] = None  # hint for which repo to look in


@router.post("/jobs/{job_id}/retry")
def scheduler_retry_job(
    job_id: str,
    body: RetryBody = RetryBody(),
    x_pixie_internal_secret: Optional[str] = Header(default=None),
) -> dict:
    """Mark a job for retry by clearing its lock and resetting status to queued.

    This is a best-effort helper — it tries to reset the job in the most likely
    repository based on the ``source`` hint in the body.  In production use the
    per-vertical retry endpoints (e.g. ``/api/agents/seo/rank/…/retry``) for
    stronger guarantees.
    """
    _require_internal(x_pixie_internal_secret)

    source = (body.source or "").strip().lower()
    tenant_id = (body.tenant_id or "").strip()

    _source_to_table = {
        "rank": "seo_rank_jobs",
        "gsc_sync": "seo_gsc_sync_jobs",
        "ga4_sync": "seo_analytics_sync_jobs",
        "fix_verify": "seo_fix_verification",
    }

    table = _source_to_table.get(source)
    if not table:
        # Try rank scheduler's built-in retry logic
        try:
            from seo.search_stores import get_rank_job_repository, SyncJobStatus
            repo = get_rank_job_repository()
            job = repo.get(tenant_id, job_id) if tenant_id else None
            if job:
                _, j = job
                repo.update(
                    j.tenant_id, job_id,
                    status=SyncJobStatus.QUEUED,
                    lock_owner="",
                    lock_expires_at="",
                    error="",
                )
                return {"ok": True, "job_id": job_id, "status": "queued"}
        except Exception as exc:
            _log.warning("retry_job: rank retry failed: %s", exc)
        return {"ok": False, "job_id": job_id, "reason": "unknown source or job not found"}

    # Generic retry via persistence layer
    try:
        import persistence
        repo = persistence.table(table)
        row = repo.get(tenant_id, job_id) if tenant_id else None
        if row is None:
            # Scan without tenant
            for r in getattr(repo, "_rows", []):
                if r.get("id") == job_id:
                    row = r
                    tenant_id = r.get("tenant_id", "")
                    break

        if not row:
            raise HTTPException(status_code=404, detail=f"job {job_id!r} not found")

        data = dict(row.get("data") or {})
        data["status"] = "queued"
        data["lock_owner"] = ""
        data["lock_expires_at"] = ""
        data["error"] = ""
        updated = dict(row)
        updated["data"] = data
        repo.upsert(updated)
        return {"ok": True, "job_id": job_id, "status": "queued"}

    except HTTPException:
        raise
    except Exception as exc:
        _log.error("retry_job: error for %s: %s", job_id, exc)
        raise HTTPException(status_code=500, detail=f"retry failed: {exc}") from exc


class PauseBody(BaseModel):
    job_type: str  # name of the registered job source


@router.post("/pause")
def scheduler_pause(
    body: PauseBody,
    x_pixie_internal_secret: Optional[str] = Header(default=None),
) -> dict:
    """Pause a job type for this process lifetime.

    Paused sources are skipped by the scheduler loop.  The pause is in-memory
    only and resets on process restart.
    """
    _require_internal(x_pixie_internal_secret)
    job_type = body.job_type.strip()
    if not job_type:
        raise HTTPException(status_code=400, detail="job_type is required")

    _PAUSED.add(job_type)

    # Also update the registry so the scheduler loop picks it up immediately
    try:
        from seo.scheduler.registry import _REGISTRY
        if job_type in _REGISTRY:
            _REGISTRY[job_type].enabled_env = "__PAUSED__"
            os.environ["__PAUSED__"] = ""  # falsy env var
    except Exception as exc:
        _log.warning("scheduler_pause: registry update failed: %s", exc)

    _log.info("scheduler_pause: paused job type %r", job_type)
    return {"ok": True, "paused": job_type, "all_paused": sorted(_PAUSED)}


@router.post("/resume")
def scheduler_resume(
    body: PauseBody,
    x_pixie_internal_secret: Optional[str] = Header(default=None),
) -> dict:
    """Resume a previously-paused job type."""
    _require_internal(x_pixie_internal_secret)
    job_type = body.job_type.strip()
    if not job_type:
        raise HTTPException(status_code=400, detail="job_type is required")

    _PAUSED.discard(job_type)

    # Restore original enabled_env in the registry
    try:
        from seo.scheduler.registry import _REGISTRY, _JobSource
        _DEFAULT_ENVS = {
            "rank": "SEO_RANK_SCHEDULER_ENABLED",
            "gsc_sync": "SEO_GSC_SCHEDULER_ENABLED",
            "ga4_sync": "SEO_GA4_SCHEDULER_ENABLED",
            "alert_gen": "SEO_ALERTS_ENABLED",
            "crawl_recovery": "SEO_CRAWL_RECOVERY_ENABLED",
            "fix_verify": "SEO_FIX_VERIFY_ENABLED",
        }
        if job_type in _REGISTRY and job_type in _DEFAULT_ENVS:
            _REGISTRY[job_type].enabled_env = _DEFAULT_ENVS[job_type]
    except Exception as exc:
        _log.warning("scheduler_resume: registry update failed: %s", exc)

    _log.info("scheduler_resume: resumed job type %r", job_type)
    return {"ok": True, "resumed": job_type, "all_paused": sorted(_PAUSED)}
