"""Startup / shutdown helpers for the SEO scheduler.

Usage in app.py
---------------
# In the @app.on_event("startup") handler:
from seo.scheduler.startup import start_scheduler
start_scheduler()

# In the @app.on_event("shutdown") handler:
from seo.scheduler.shutdown import stop_scheduler
stop_scheduler()

Guards
------
- Skipped under pytest (PYTEST_CURRENT_TEST is set by pytest itself).
- Skipped when SEO_SCHEDULER_ENABLED is not truthy.
- Module-level singleton prevents duplicate threads on hot reload (uvicorn
  --reload fires startup again without a fresh process; the _ACTIVE_INSTANCE
  guard in runtime.py blocks a second thread from starting).
"""

from __future__ import annotations

import logging
import os

_log = logging.getLogger("pixie.seo.scheduler.startup")

# Module-level reference to the live scheduler instance so stop_scheduler()
# can find it without re-importing from runtime (avoids circular imports at
# shutdown time when the event loop may already be partially torn down).
_scheduler_instance = None


def start_scheduler() -> None:
    """Create and start the SeoScheduler daemon thread.

    Mirrors the ``_start_seo_sweeper`` pattern in app.py:
      - Returns immediately if under pytest.
      - Returns immediately if SEO_SCHEDULER_ENABLED is not truthy.
      - Logs clearly on skip/start; never raises (startup must not block).
    """
    global _scheduler_instance

    # Guard 1: never run under pytest
    if os.getenv("PYTEST_CURRENT_TEST"):
        _log.debug("start_scheduler: skipped (pytest)")
        return

    # Guard 2: must be explicitly enabled
    enabled = os.getenv("SEO_SCHEDULER_ENABLED", "").strip().lower()
    if enabled not in ("1", "true", "yes", "on"):
        _log.info("start_scheduler: SEO_SCHEDULER_ENABLED not set — scheduler disabled")
        return

    try:
        from seo.scheduler.runtime import SeoScheduler, _get_active_instance

        # Singleton guard: if a prior hot-reload left an active instance, skip.
        existing = _get_active_instance()
        if existing is not None:
            _log.info(
                "start_scheduler: existing instance %s already running — skip",
                existing.instance_id,
            )
            _scheduler_instance = existing
            return

        sched = SeoScheduler()
        started = sched.start()
        if started:
            _scheduler_instance = sched
            _log.info("start_scheduler: SEO scheduler started (instance=%s)", sched.instance_id)
        else:
            _log.warning("start_scheduler: SeoScheduler.start() returned False")

    except Exception as exc:
        # Never crash startup — log and continue.
        _log.error("start_scheduler: failed to start scheduler: %s", exc, exc_info=True)


def stop_scheduler() -> None:
    """Stop the scheduler daemon thread on app shutdown.

    Safe to call even if the scheduler was never started (no-op).
    """
    global _scheduler_instance

    if _scheduler_instance is None:
        # Also check the module-level singleton in case start_scheduler was
        # not called through this module.
        try:
            from seo.scheduler.runtime import _get_active_instance
            _scheduler_instance = _get_active_instance()
        except Exception:
            pass

    if _scheduler_instance is None:
        _log.debug("stop_scheduler: no active scheduler instance")
        return

    try:
        _log.info("stop_scheduler: stopping %s", _scheduler_instance.instance_id)
        _scheduler_instance.stop(timeout=15.0)
        _scheduler_instance = None
        _log.info("stop_scheduler: scheduler stopped")
    except Exception as exc:
        _log.error("stop_scheduler: error during shutdown: %s", exc, exc_info=True)
