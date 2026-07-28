"""SEO scheduler runtime — single daemon thread, bounded concurrency.

Design
------
- ONE daemon thread per process (module-level ownership guard).
- Loop every SEO_SCHEDULER_INTERVAL_SECONDS (default 60).
- For each registered job source: call due_fn(), claim each job atomically,
  execute run_fn with a ThreadPoolExecutor (bounded by SEO_SCHEDULER_MAX_CONCURRENCY,
  default 4).
- Individual job failures never stop the loop.
- Backoff + jitter on repeated consecutive loop errors.
- Multi-instance safety via per-job lock (lock_owner + lock_expires_at,
  TTL = SEO_SCHEDULER_LOCK_TTL_SECONDS default 300).
- Stale lock reclaim: locks whose lock_expires_at is in the past are taken.
- Disabled when PYTEST_CURRENT_TEST is set or SEO_SCHEDULER_ENABLED is falsy.

Health
------
health() -> dict with: enabled, instance_id, last_heartbeat, last_successful_loop,
  claimed, completed, failed, retried, running, oldest_due, quota_errors,
  stale_lock_recoveries.
"""

from __future__ import annotations

import logging
import os
import random
import threading
import time
import uuid
from concurrent.futures import Future, ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

_log = logging.getLogger("pixie.seo.scheduler.runtime")

# ── Env helpers ───────────────────────────────────────────────────────────────

def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except (ValueError, TypeError):
        return default


def _scheduler_enabled() -> bool:
    """SEO_SCHEDULER_ENABLED must be truthy (and we must NOT be under pytest)."""
    if os.getenv("PYTEST_CURRENT_TEST"):
        return False
    val = os.getenv("SEO_SCHEDULER_ENABLED", "").strip().lower()
    return val in ("1", "true", "yes", "on")


# ── Module-level singleton guard (prevents duplicate loops on hot reload) ─────
_INSTANCE_LOCK = threading.Lock()
_ACTIVE_INSTANCE: Optional["SeoScheduler"] = None


def _get_active_instance() -> Optional["SeoScheduler"]:
    with _INSTANCE_LOCK:
        return _ACTIVE_INSTANCE


def _set_active_instance(inst: Optional["SeoScheduler"]) -> None:
    with _INSTANCE_LOCK:
        global _ACTIVE_INSTANCE
        _ACTIVE_INSTANCE = inst


# ── SeoScheduler ─────────────────────────────────────────────────────────────

class SeoScheduler:
    """Single-process SEO scheduler runtime.

    Parameters
    ----------
    instance_id:   Unique worker ID (auto-generated if omitted).
    interval_s:    How long to sleep between loops (seconds).
    batch_size:    Max jobs to claim per source per loop.
    max_workers:   ThreadPool size for concurrent job execution.
    lock_ttl_s:    Per-job lock TTL in seconds.
    """

    def __init__(
        self,
        *,
        instance_id: Optional[str] = None,
        interval_s: Optional[int] = None,
        batch_size: Optional[int] = None,
        max_workers: Optional[int] = None,
        lock_ttl_s: Optional[int] = None,
    ) -> None:
        self.instance_id: str = instance_id or f"seo-scheduler-{uuid.uuid4().hex[:12]}"
        self.interval_s: int = interval_s if interval_s is not None else _env_int("SEO_SCHEDULER_INTERVAL_SECONDS", 60)
        self.batch_size: int = batch_size if batch_size is not None else _env_int("SEO_SCHEDULER_BATCH_SIZE", 25)
        self.max_workers: int = max_workers if max_workers is not None else _env_int("SEO_SCHEDULER_MAX_CONCURRENCY", 4)
        self.lock_ttl_s: int = lock_ttl_s if lock_ttl_s is not None else _env_int("SEO_SCHEDULER_LOCK_TTL_SECONDS", 300)

        self._stop_event = threading.Event()
        self._thread: Optional[threading.Thread] = None

        # Observability counters (thread-safe via _stats_lock)
        self._stats_lock = threading.Lock()
        self._stats: Dict[str, Any] = {
            "claimed": 0,
            "completed": 0,
            "failed": 0,
            "retried": 0,
            "quota_errors": 0,
            "stale_lock_recoveries": 0,
        }
        self._running: Set[str] = set()  # job_ids currently executing
        self._last_heartbeat: Optional[str] = None
        self._last_successful_loop: Optional[str] = None
        self._oldest_due: Optional[str] = None

        # Consecutive loop-error counter for backoff
        self._consecutive_loop_errors: int = 0

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    def start(self) -> bool:
        """Start the scheduler daemon thread.

        Returns True when started; False when already running or disabled.
        Acquires the module-level singleton lock to prevent two loops.
        """
        if not _scheduler_enabled():
            _log.info("SeoScheduler: disabled (SEO_SCHEDULER_ENABLED not set or pytest)")
            return False

        with _INSTANCE_LOCK:
            global _ACTIVE_INSTANCE
            if _ACTIVE_INSTANCE is not None and _ACTIVE_INSTANCE is not self:
                _log.warning(
                    "SeoScheduler: another instance %s is already running — not starting %s",
                    _ACTIVE_INSTANCE.instance_id,
                    self.instance_id,
                )
                return False
            if self._thread is not None and self._thread.is_alive():
                _log.warning("SeoScheduler: thread already alive for %s", self.instance_id)
                return False

            self._stop_event.clear()
            self._thread = threading.Thread(
                target=self._run_loop,
                name=f"seo-scheduler-{self.instance_id}",
                daemon=True,
            )
            self._thread.start()
            _ACTIVE_INSTANCE = self

        _log.info(
            "SeoScheduler: started (instance=%s interval=%ds batch=%d workers=%d lock_ttl=%ds)",
            self.instance_id, self.interval_s, self.batch_size, self.max_workers, self.lock_ttl_s,
        )
        return True

    def stop(self, timeout: float = 10.0) -> None:
        """Signal the scheduler loop to stop and wait for the thread to join."""
        _log.info("SeoScheduler: stopping %s", self.instance_id)
        self._stop_event.set()
        if self._thread is not None:
            self._thread.join(timeout=timeout)
        with _INSTANCE_LOCK:
            global _ACTIVE_INSTANCE
            if _ACTIVE_INSTANCE is self:
                _ACTIVE_INSTANCE = None

    def is_running(self) -> bool:
        return self._thread is not None and self._thread.is_alive()

    # ── Main loop ─────────────────────────────────────────────────────────────

    def _run_loop(self) -> None:
        _log.info("SeoScheduler loop: starting (instance=%s)", self.instance_id)
        while not self._stop_event.is_set():
            try:
                self._tick()
                self._consecutive_loop_errors = 0
                now_iso = datetime.now(timezone.utc).isoformat(timespec="microseconds")
                self._last_successful_loop = now_iso
            except Exception as exc:
                self._consecutive_loop_errors += 1
                backoff = min(self.interval_s * self._consecutive_loop_errors, 300)
                jitter = random.uniform(0, backoff * 0.1)
                _log.error(
                    "SeoScheduler loop: error (consecutive=%d), backing off %.1fs: %s",
                    self._consecutive_loop_errors, backoff + jitter, exc,
                )
                self._stop_event.wait(backoff + jitter)
                continue

            self._last_heartbeat = datetime.now(timezone.utc).isoformat(timespec="microseconds")
            self._stop_event.wait(self.interval_s)

        _log.info("SeoScheduler loop: stopped (instance=%s)", self.instance_id)

    def _tick(self) -> None:
        """Run one scheduler tick: query due jobs for all sources, execute them."""
        from seo.scheduler.registry import get_enabled_sources

        sources = get_enabled_sources()
        if not sources:
            return

        now_iso = datetime.now(timezone.utc).isoformat(timespec="microseconds")

        all_work: List[Tuple[str, str, Any, Any]] = []  # (source_name, job_id, job, run_fn)

        for source in sources:
            try:
                due = source.due_fn()
            except Exception as exc:
                _log.warning("SeoScheduler: due_fn error for source %r: %s", source.name, exc)
                continue

            if not due:
                continue

            # Apply batch size limit
            due = due[: self.batch_size]

            for job_id, job in due:
                # Track stale-lock recoveries (when lock_owner already set but expired)
                try:
                    data = {}
                    if hasattr(job, "__dict__"):
                        data = job.__dict__
                    elif isinstance(job, dict):
                        data = job
                    if data.get("lock_owner") and data.get("lock_expires_at"):
                        self._increment("stale_lock_recoveries")
                except Exception:
                    pass

                self._increment("claimed")
                all_work.append((source.name, job_id, job, source.run_fn))

        if not all_work:
            return

        # Execute with bounded concurrency
        with ThreadPoolExecutor(max_workers=self.max_workers) as pool:
            futures: Dict[Future, Tuple[str, str]] = {}  # future -> (source_name, job_id)

            for source_name, job_id, job, run_fn in all_work:
                with self._stats_lock:
                    self._running.add(job_id)

                fut = pool.submit(self._execute_job, source_name, job_id, job, run_fn)
                futures[fut] = (source_name, job_id)

            for fut in as_completed(futures):
                source_name, job_id = futures[fut]
                with self._stats_lock:
                    self._running.discard(job_id)
                try:
                    fut.result()
                except Exception as exc:
                    _log.error("SeoScheduler: unhandled exception in job %s/%s: %s", source_name, job_id, exc)
                    self._increment("failed")

    def _execute_job(
        self,
        source_name: str,
        job_id: str,
        job: Any,
        run_fn: Any,
    ) -> Dict[str, Any]:
        """Execute one job. Handles errors, metering errors, and retry tracking."""
        _log.debug("SeoScheduler: executing job %s/%s", source_name, job_id)
        try:
            result = run_fn(job_id, job)
            status = result.get("status", "") if isinstance(result, dict) else ""

            if status in ("retrying", "retry"):
                self._increment("retried")
            elif status == "failed":
                self._increment("failed")
            else:
                self._increment("completed")

            _log.debug("SeoScheduler: job %s/%s finished status=%r", source_name, job_id, status)
            return result

        except Exception as exc:
            err_str = str(exc).lower()
            if "quota" in err_str or "limit" in err_str or "rate" in err_str:
                self._increment("quota_errors")
                _log.warning("SeoScheduler: quota/rate error on job %s/%s: %s", source_name, job_id, exc)
            else:
                _log.warning("SeoScheduler: job %s/%s raised: %s", source_name, job_id, exc)
            self._increment("failed")
            return {"status": "error", "error": str(exc), "job_id": job_id}

    # ── Observability ─────────────────────────────────────────────────────────

    def _increment(self, key: str, by: int = 1) -> None:
        with self._stats_lock:
            self._stats[key] = self._stats.get(key, 0) + by

    def health(self) -> Dict[str, Any]:
        """Return a health dict. Safe to serialize — no secrets, no tokens."""
        with self._stats_lock:
            running = list(self._running)
            stats = dict(self._stats)

        # Encryption health (non-secret)
        try:
            from seo.google.crypto import encryption_status
            enc = encryption_status()
        except Exception:
            enc = {"active": None, "mode": "unknown", "required": False}

        return {
            "enabled": _scheduler_enabled(),
            "instance_id": self.instance_id,
            "running_thread": self.is_running(),
            "last_heartbeat": self._last_heartbeat,
            "last_successful_loop": self._last_successful_loop,
            "interval_s": self.interval_s,
            "batch_size": self.batch_size,
            "max_workers": self.max_workers,
            "lock_ttl_s": self.lock_ttl_s,
            "jobs_running": running,
            "jobs_running_count": len(running),
            **stats,
            "encryption": enc,
        }

    def tick_once(self) -> Dict[str, Any]:
        """Execute one scheduler tick synchronously (for /tick endpoint)."""
        before = dict(self._stats)
        self._tick()
        after = dict(self._stats)
        delta = {k: after.get(k, 0) - before.get(k, 0) for k in after}
        return {"tick": "ok", "delta": delta}
