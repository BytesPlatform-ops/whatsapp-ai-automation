"""Receptionist worker runtime — daemon thread + synchronous test interface.

Design
------
- ONE daemon thread per process (module-level singleton guard).
- Loop every AI_RECEPTIONIST_WORKER_INTERVAL_SECONDS (default 15s).
- Batch: AI_RECEPTIONIST_WORKER_BATCH_SIZE (default 20) due jobs per tick.
- Concurrency: AI_RECEPTIONIST_WORKER_MAX_CONCURRENCY (default 4) threads.
- Lock TTL: AI_RECEPTIONIST_WORKER_LOCK_TTL_SECONDS (default 60s).
- Gate: only starts when AI_RECEPTIONIST_WORKER_ENABLED is truthy.
- Never starts under pytest (PYTEST_CURRENT_TEST is set automatically by pytest).

Multi-instance safety
---------------------
The durable claim in jobs_store.claim() is the correctness fence. A Python
threading.Lock is NOT relied on for cross-instance exclusion — only the claim
re-read guarantees it. A threading.Lock is used inside this process only to
prevent double-starts (module singleton).

run_due_once(now)
-----------------
Synchronous batch run for tests. Processes up to batch_size due jobs without
starting a background thread. Always safe to call from tests.

Graceful shutdown
-----------------
stop() sets _stop_event; the daemon thread exits on next sleep() check.
"""

from __future__ import annotations

import logging
import os
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set

_log = logging.getLogger("pixie.receptionist.worker.runtime")

# ── Env helpers ────────────────────────────────────────────────────────────────

def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except (ValueError, TypeError):
        return default


def _worker_enabled() -> bool:
    """AI_RECEPTIONIST_WORKER_ENABLED must be truthy and we must NOT be under pytest."""
    if os.getenv("PYTEST_CURRENT_TEST"):
        return False
    val = os.getenv("AI_RECEPTIONIST_WORKER_ENABLED", "").strip().lower()
    return val in ("1", "true", "yes", "on")


# ── Module-level singleton guard ──────────────────────────────────────────────

_INSTANCE_LOCK = threading.Lock()
_ACTIVE_INSTANCE: Optional["Worker"] = None


# ── Worker ────────────────────────────────────────────────────────────────────

class Worker:
    """Receptionist durable job worker.

    Parameters
    ----------
    instance_id:   Unique worker ID. Auto-generated if omitted.
    interval_s:    Loop sleep interval (seconds). Default from env or 15.
    batch_size:    Max due jobs per tick. Default from env or 20.
    max_workers:   ThreadPool concurrency. Default from env or 4.
    lock_ttl_s:    Per-job lock TTL (seconds). Default from env or 60.
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
        self.instance_id: str = instance_id or f"rw-{uuid.uuid4().hex[:10]}"
        self.interval_s: int = interval_s if interval_s is not None else _env_int(
            "AI_RECEPTIONIST_WORKER_INTERVAL_SECONDS", 15)
        self.batch_size: int = batch_size if batch_size is not None else _env_int(
            "AI_RECEPTIONIST_WORKER_BATCH_SIZE", 20)
        self.max_workers: int = max_workers if max_workers is not None else _env_int(
            "AI_RECEPTIONIST_WORKER_MAX_CONCURRENCY", 4)
        self.lock_ttl_s: int = lock_ttl_s if lock_ttl_s is not None else _env_int(
            "AI_RECEPTIONIST_WORKER_LOCK_TTL_SECONDS", 60)

        self._stop_event = threading.Event()
        self._thread: Optional[threading.Thread] = None

        # Observability counters (protected by _stats_lock)
        self._stats_lock = threading.Lock()
        self._stats: Dict[str, int] = {
            "claimed": 0,
            "completed": 0,
            "failed": 0,
            "retried": 0,
        }
        self._running: Set[str] = set()
        self._last_tick_at: Optional[str] = None
        self._consecutive_errors: int = 0

    # ── Lifecycle ──────────────────────────────────────────────────────────────

    def start(self) -> bool:
        """Start the worker daemon thread if enabled. Returns True when started."""
        global _ACTIVE_INSTANCE

        if not _worker_enabled():
            _log.info("receptionist worker: disabled (AI_RECEPTIONIST_WORKER_ENABLED not set or pytest)")
            return False

        # Fail fast on a misconfigured production deploy (durable required but memory).
        from receptionist.service.durability import check_durability
        check_durability()

        with _INSTANCE_LOCK:
            if _ACTIVE_INSTANCE is not None and _ACTIVE_INSTANCE is not self:
                _log.warning(
                    "receptionist worker: instance %s already active — not starting %s",
                    _ACTIVE_INSTANCE.instance_id, self.instance_id,
                )
                return False
            if self._thread is not None and self._thread.is_alive():
                _log.warning("receptionist worker: thread already alive for %s", self.instance_id)
                return False

            self._stop_event.clear()
            self._thread = threading.Thread(
                target=self._run_loop,
                name=f"receptionist-worker-{self.instance_id}",
                daemon=True,
            )
            self._thread.start()
            _ACTIVE_INSTANCE = self

        _log.info(
            "receptionist worker started (instance=%s interval=%ds batch=%d workers=%d lock_ttl=%ds)",
            self.instance_id, self.interval_s, self.batch_size, self.max_workers, self.lock_ttl_s,
        )
        return True

    def stop(self, timeout: float = 10.0) -> None:
        """Signal the worker to stop and wait for thread to join."""
        global _ACTIVE_INSTANCE
        _log.info("receptionist worker: stopping %s", self.instance_id)
        self._stop_event.set()
        if self._thread is not None:
            self._thread.join(timeout=timeout)
        with _INSTANCE_LOCK:
            if _ACTIVE_INSTANCE is self:
                _ACTIVE_INSTANCE = None

    def is_running(self) -> bool:
        return self._thread is not None and self._thread.is_alive()

    # ── Main loop ──────────────────────────────────────────────────────────────

    def _run_loop(self) -> None:
        _log.info("receptionist worker loop: starting (instance=%s)", self.instance_id)
        while not self._stop_event.is_set():
            try:
                self.run_due_once()
                self._consecutive_errors = 0
                self._last_tick_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
            except Exception as exc:
                self._consecutive_errors += 1
                _log.error(
                    "receptionist worker: tick error (consecutive=%d): %s",
                    self._consecutive_errors, exc,
                )

            self._stop_event.wait(self.interval_s)

        _log.info("receptionist worker loop: stopped (instance=%s)", self.instance_id)

    # ── Core batch run ─────────────────────────────────────────────────────────

    def run_due_once(self, now: Optional[datetime] = None) -> Dict[str, Any]:
        """Process one batch of due jobs synchronously. Safe to call from tests.

        Returns a summary dict with processed job ids and their outcomes.
        No background thread is started or required.
        """
        from . import jobs_store
        from .handlers import get_handler

        now_dt = now or datetime.now(timezone.utc)
        due = jobs_store.due_jobs(now=now_dt, limit=self.batch_size)

        if not due:
            return {"worker": self.instance_id, "processed": [], "count": 0}

        processed: List[Dict[str, Any]] = []

        with ThreadPoolExecutor(max_workers=self.max_workers) as pool:
            futures = {}
            for job_id, job in due:
                tenant_id = job.get("tenant_id", "")
                claimed = jobs_store.claim(
                    job_id=job_id,
                    tenant_id=tenant_id,
                    owner=self.instance_id,
                    ttl=self.lock_ttl_s,
                )
                if not claimed:
                    continue  # another worker owns it

                self._increment("claimed")
                with self._stats_lock:
                    self._running.add(job_id)

                fut = pool.submit(self._execute, job_id, job)
                futures[fut] = (job_id, tenant_id)

            for fut in as_completed(futures):
                job_id, tenant_id = futures[fut]
                with self._stats_lock:
                    self._running.discard(job_id)
                try:
                    result = fut.result()
                    processed.append({"job_id": job_id, "result": result})
                except Exception as exc:
                    _log.error("receptionist worker: unhandled exception in job %s: %s", job_id, exc)
                    self._increment("failed")
                    processed.append({"job_id": job_id, "result": {"status": "error", "error": str(exc)}})

        return {
            "worker": self.instance_id,
            "processed": processed,
            "count": len(processed),
        }

    def _execute(self, job_id: str, job: dict) -> Dict[str, Any]:
        """Execute one job: call the handler, then complete/retry/fail the job record."""
        from . import jobs_store
        from .handlers import get_handler

        tenant_id = job.get("tenant_id", "")
        job_type = job.get("job_type", "")

        # Idempotency: already completed → no-op
        if job.get("status") == jobs_store.STATUS_COMPLETED:
            jobs_store.complete(job_id, tenant_id, self.instance_id)
            return {"status": "already_completed", "idempotent": True}

        # Mark running (heartbeat sets status=running)
        jobs_store.heartbeat(job_id, tenant_id, self.instance_id, ttl=self.lock_ttl_s)

        handler = get_handler(job_type)
        if handler is None:
            jobs_store.fail(job_id, tenant_id, self.instance_id, error=f"unknown job_type={job_type}")
            self._increment("failed")
            return {"status": "failed", "reason": "no_handler"}

        try:
            result = handler(job)
        except Exception as exc:
            error_str = str(exc)
            _log.warning("receptionist worker: handler %s raised for job %s: %s", job_type, job_id, exc)
            did_retry = jobs_store.retry(job_id, tenant_id, self.instance_id, error=error_str)
            if did_retry:
                self._increment("retried")
                return {"status": "retry", "error": error_str}
            else:
                self._increment("failed")
                return {"status": "failed", "error": error_str}

        handler_status = result.get("status", "completed") if isinstance(result, dict) else "completed"

        if handler_status == "failed":
            # Handler decided this is a terminal failure
            error = result.get("reason", "") if isinstance(result, dict) else ""
            did_retry = jobs_store.retry(job_id, tenant_id, self.instance_id, error=error)
            if did_retry:
                self._increment("retried")
                return {"status": "retry", **result}
            else:
                self._increment("failed")
                return {"status": "failed", **result}

        # Success path
        jobs_store.complete(job_id, tenant_id, self.instance_id, result=result)
        self._increment("completed")
        return result

    # ── Observability ──────────────────────────────────────────────────────────

    def _increment(self, key: str, by: int = 1) -> None:
        with self._stats_lock:
            self._stats[key] = self._stats.get(key, 0) + by

    def health(self) -> Dict[str, Any]:
        """Return a health dict. No secrets. Safe to serialize."""
        from . import jobs_store

        with self._stats_lock:
            stats = dict(self._stats)
            running = list(self._running)

        return {
            "enabled": _worker_enabled(),
            "instance_id": self.instance_id,
            "running_thread": self.is_running(),
            "last_tick_at": self._last_tick_at,
            "interval_s": self.interval_s,
            "batch_size": self.batch_size,
            "max_workers": self.max_workers,
            "lock_ttl_s": self.lock_ttl_s,
            "jobs_running": running,
            "jobs_running_count": len(running),
            "consecutive_errors": self._consecutive_errors,
            **stats,
            "store": jobs_store.health(),
        }


# ── Module-level convenience ───────────────────────────────────────────────────

_default_worker: Optional[Worker] = None


def get_or_create_worker() -> Worker:
    global _default_worker
    if _default_worker is None:
        _default_worker = Worker()
    return _default_worker


def get_active_worker_stats() -> dict:
    """Health snapshot for the operator API. Uses the active instance if one is
    running, else the module-level default (reports enabled=False when disabled)."""
    inst = _ACTIVE_INSTANCE or _default_worker or get_or_create_worker()
    try:
        return inst.health()
    except Exception as exc:  # pragma: no cover
        return {"enabled": _worker_enabled(), "error": str(exc)[:120]}


def start_worker() -> bool:
    """Start the module-level default worker. Returns True when started."""
    return get_or_create_worker().start()


def stop_worker() -> None:
    """Stop the module-level default worker."""
    global _default_worker
    if _default_worker is not None:
        _default_worker.stop()
        _default_worker = None
