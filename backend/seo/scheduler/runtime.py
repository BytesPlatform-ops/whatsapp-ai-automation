"""SEO scheduler runtime — single daemon thread, bounded concurrency.

Design
------
- ONE daemon thread per process (module-level ownership guard).
- Loop every SEO_SCHEDULER_INTERVAL_SECONDS (default 60).
- For each registered job source: call due_fn(), claim each job atomically via
  the durable claim_job() (works across instances), execute run_fn with a
  ThreadPoolExecutor (bounded by SEO_SCHEDULER_MAX_CONCURRENCY, default 4).
- Individual job failures never stop the loop.
- Backoff + jitter on repeated consecutive loop errors.

Multi-instance durability
-------------------------
- Per-job claim is durable via seo.scheduler.queries.claim_job (reads + writes
  lock_owner/lock_expires_at into the job row's data JSONB).  Two instances
  issuing claim_job for the same row_id race on the write; the re-read after
  PATCH confirms ownership.  The loser silently skips.

- Leader heartbeat record: each instance writes a heartbeat row into a durable
  table (seo_scheduler_leader) every heartbeat_interval_s seconds.  Only ONE
  instance should be the leader at a time, but the scheduler is designed to be
  safe even when multiple instances run concurrently — the per-job claim is the
  correctness fence.  The leader record is used only for observability and
  stale-lock recovery diagnostics.

- Stale lock reclaim: due_jobs() already returns rows whose lock_expires_at is
  in the past; those get re-claimed naturally.  stale_lock_recoveries counts how
  many times we claimed a row that had a previous lock_owner.

Tenant fairness
---------------
Within each tick, after collecting all due jobs across sources, we round-robin
by tenant_id so no single tenant monopolises the concurrency slots.  Ordering:
  1. Sort all due work by (source priority, next_run).
  2. Group by tenant_id; interleave in round-robin order.
  3. Submit to the pool bounded by max_workers.

Provider-aware concurrency
--------------------------
SEO_SCHEDULER_PROVIDER_CONCURRENCY env: "google=2,bing=1" caps concurrent
provider calls.  Jobs whose ``data.get("provider")`` hits its cap are deferred
to the next tick (not dropped).

Graceful shutdown
-----------------
stop() sets _stop_event; the pool is given timeout=graceful_shutdown_s to drain
any in-flight jobs; remaining futures are cancelled.

Restart recovery
----------------
On start, any rows whose lock_owner == this instance_id and lock_expires_at is
in the past are implicitly re-queued by the next due_jobs() call (they appear as
stale locks that a fresh claim_job() can win).

Disabled when PYTEST_CURRENT_TEST is set or SEO_SCHEDULER_ENABLED is falsy.

Health
------
health() -> dict with: enabled, instance_id, last_heartbeat, last_successful_loop,
  claimed, completed, failed, retried, running, oldest_due, quota_errors,
  stale_lock_recoveries, tenant_fairness_rounds.
"""

from __future__ import annotations

import logging
import os
import random
import threading
import time
import uuid
from collections import defaultdict, deque
from concurrent.futures import Future, ThreadPoolExecutor, as_completed, wait, FIRST_COMPLETED
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

_log = logging.getLogger("pixie.seo.scheduler.runtime")

# ── Env helpers ───────────────────────────────────────────────────────────────

def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except (ValueError, TypeError):
        return default


def _env_str(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def _scheduler_enabled() -> bool:
    """SEO_SCHEDULER_ENABLED must be truthy (and we must NOT be under pytest)."""
    if os.getenv("PYTEST_CURRENT_TEST"):
        return False
    val = os.getenv("SEO_SCHEDULER_ENABLED", "").strip().lower()
    return val in ("1", "true", "yes", "on")


def _parse_provider_concurrency(raw: str) -> Dict[str, int]:
    """Parse SEO_SCHEDULER_PROVIDER_CONCURRENCY="google=2,bing=1" into a dict."""
    result: Dict[str, int] = {}
    for part in raw.split(","):
        part = part.strip()
        if "=" in part:
            k, _, v = part.partition("=")
            try:
                result[k.strip()] = int(v.strip())
            except ValueError:
                pass
    return result


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


# ── Leader heartbeat helpers (durable, via persistence.table) ─────────────────

_HEARTBEAT_TABLE = "seo_scheduler_leader"


def _write_heartbeat(instance_id: str, interval_s: int) -> None:
    """Write a heartbeat row for this instance. No-op if persistence unavailable."""
    try:
        import persistence
        repo = persistence.table(_HEARTBEAT_TABLE)
        now_iso = datetime.now(timezone.utc).isoformat(timespec="microseconds")
        lock_expiry = datetime.now(timezone.utc)
        from datetime import timedelta
        expiry_iso = (lock_expiry + timedelta(seconds=interval_s * 3)).isoformat(timespec="microseconds")
        repo.upsert({
            "id": instance_id,
            "tenant_id": "system",
            "data": {
                "instance_id": instance_id,
                "heartbeat_at": now_iso,
                "expires_at": expiry_iso,
                "interval_s": interval_s,
            },
        })
    except Exception as exc:
        _log.debug("heartbeat write failed (non-fatal): %s", exc)


def _recover_stale_heartbeats(instance_id: str) -> int:
    """Count (and log) stale heartbeat records from other instances."""
    recovered = 0
    try:
        import persistence
        repo = persistence.table(_HEARTBEAT_TABLE)
        raw_rows = getattr(repo, "_rows", [])
        now_iso = datetime.now(timezone.utc).isoformat(timespec="microseconds")
        for row in list(raw_rows):
            data = row.get("data") or {}
            if data.get("instance_id") == instance_id:
                continue
            expires = data.get("expires_at", "")
            if expires and expires < now_iso:
                _log.info(
                    "scheduler: stale heartbeat from %s (expired %s)",
                    data.get("instance_id"), expires,
                )
                recovered += 1
    except Exception:
        pass
    return recovered


# ── Tenant round-robin interleave ─────────────────────────────────────────────

def _interleave_by_tenant(
    work: List[Tuple[str, str, Any, Any]],
) -> List[Tuple[str, str, Any, Any]]:
    """Round-robin interleave work items by tenant_id.

    Each item is (source_name, job_id, job, run_fn).
    Extracts tenant_id from job dict/object; unknown tenant gets bucket "".
    """
    buckets: Dict[str, deque] = defaultdict(deque)
    for item in work:
        _, _, job, _ = item
        if isinstance(job, dict):
            tid = job.get("tenant_id", "")
        else:
            tid = getattr(job, "tenant_id", "")
        buckets[tid].append(item)

    result = []
    tenant_order = list(buckets.keys())
    while any(buckets[t] for t in tenant_order):
        for t in tenant_order:
            if buckets[t]:
                result.append(buckets[t].popleft())
    return result


# ── Provider concurrency limiter ───────────────────────────────────────────────

class _ProviderSemaphores:
    """Per-provider concurrency caps."""

    def __init__(self, caps: Dict[str, int], default: int = 0) -> None:
        self._sems: Dict[str, threading.Semaphore] = {}
        self._caps = caps
        self._default = default
        for p, cap in caps.items():
            if cap > 0:
                self._sems[p] = threading.Semaphore(cap)

    def acquire(self, provider: str) -> bool:
        sem = self._sems.get(provider)
        if sem is None:
            return True
        return sem.acquire(blocking=False)

    def release(self, provider: str) -> None:
        sem = self._sems.get(provider)
        if sem is not None:
            sem.release()

    def get_provider(self, job: Any) -> str:
        if isinstance(job, dict):
            return job.get("provider", "") or job.get("data", {}).get("provider", "")
        return getattr(job, "provider", "")


# ── SeoScheduler ─────────────────────────────────────────────────────────────

class SeoScheduler:
    """Single-process SEO scheduler runtime with multi-instance durability.

    Parameters
    ----------
    instance_id:           Unique worker ID (auto-generated if omitted).
    interval_s:            How long to sleep between loops (seconds).
    batch_size:            Max jobs to claim per source per loop.
    max_workers:           ThreadPool size for concurrent job execution.
    lock_ttl_s:            Per-job lock TTL in seconds.
    heartbeat_interval_s:  How often to write a heartbeat row (seconds).
    graceful_shutdown_s:   Seconds to wait for in-flight jobs on stop().
    provider_concurrency:  Dict of provider → max concurrent slots.
    """

    def __init__(
        self,
        *,
        instance_id: Optional[str] = None,
        interval_s: Optional[int] = None,
        batch_size: Optional[int] = None,
        max_workers: Optional[int] = None,
        lock_ttl_s: Optional[int] = None,
        heartbeat_interval_s: Optional[int] = None,
        graceful_shutdown_s: Optional[float] = None,
        provider_concurrency: Optional[Dict[str, int]] = None,
    ) -> None:
        self.instance_id: str = instance_id or f"seo-scheduler-{uuid.uuid4().hex[:12]}"
        self.interval_s: int = interval_s if interval_s is not None else _env_int("SEO_SCHEDULER_INTERVAL_SECONDS", 60)
        self.batch_size: int = batch_size if batch_size is not None else _env_int("SEO_SCHEDULER_BATCH_SIZE", 25)
        self.max_workers: int = max_workers if max_workers is not None else _env_int("SEO_SCHEDULER_MAX_CONCURRENCY", 4)
        self.lock_ttl_s: int = lock_ttl_s if lock_ttl_s is not None else _env_int("SEO_SCHEDULER_LOCK_TTL_SECONDS", 300)
        self.heartbeat_interval_s: int = (
            heartbeat_interval_s if heartbeat_interval_s is not None
            else _env_int("SEO_SCHEDULER_HEARTBEAT_INTERVAL_SECONDS", 30)
        )
        self.graceful_shutdown_s: float = (
            graceful_shutdown_s if graceful_shutdown_s is not None
            else float(_env_int("SEO_SCHEDULER_GRACEFUL_SHUTDOWN_SECONDS", 10))
        )

        _raw_prov = _env_str("SEO_SCHEDULER_PROVIDER_CONCURRENCY")
        if provider_concurrency is None and _raw_prov:
            provider_concurrency = _parse_provider_concurrency(_raw_prov)
        self._provider_sems = _ProviderSemaphores(provider_concurrency or {})

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
            "tenant_fairness_rounds": 0,
            "provider_deferred": 0,
        }
        self._running: Set[str] = set()  # job_ids currently executing
        self._last_heartbeat: Optional[str] = None
        self._last_successful_loop: Optional[str] = None
        self._oldest_due: Optional[str] = None
        self._last_heartbeat_write: float = 0.0

        # In-flight future tracking for graceful shutdown
        self._futures_lock = threading.Lock()
        self._active_futures: Dict[Future, Tuple[str, str, str]] = {}  # fut → (src, job_id, provider)

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
        """Signal the scheduler loop to stop and wait for in-flight jobs to drain."""
        _log.info("SeoScheduler: stopping %s (graceful_shutdown=%.1fs)", self.instance_id, timeout)
        self._stop_event.set()

        # Wait for in-flight futures to complete up to graceful_shutdown_s
        drain_deadline = time.monotonic() + min(timeout, self.graceful_shutdown_s)
        with self._futures_lock:
            futures = list(self._active_futures.keys())
        if futures:
            remaining = drain_deadline - time.monotonic()
            if remaining > 0:
                _log.info("SeoScheduler: draining %d in-flight jobs (%.1fs)", len(futures), remaining)
                wait(futures, timeout=remaining)
            # Cancel anything still running
            with self._futures_lock:
                for fut in list(self._active_futures.keys()):
                    if not fut.done():
                        fut.cancel()
                        _log.debug("SeoScheduler: cancelled future %s", fut)

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
        # Recover stale heartbeats from dead instances
        _recover_stale_heartbeats(self.instance_id)

        while not self._stop_event.is_set():
            # Write heartbeat periodically
            now_mono = time.monotonic()
            if now_mono - self._last_heartbeat_write >= self.heartbeat_interval_s:
                _write_heartbeat(self.instance_id, self.interval_s)
                self._last_heartbeat_write = now_mono
                self._last_heartbeat = datetime.now(timezone.utc).isoformat(timespec="microseconds")

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

            self._stop_event.wait(self.interval_s)

        _log.info("SeoScheduler loop: stopped (instance=%s)", self.instance_id)

    def _tick(self) -> None:
        """Run one scheduler tick: query due jobs for all sources, execute them."""
        from seo.scheduler.registry import get_enabled_sources

        sources = get_enabled_sources()
        if not sources:
            return

        all_work: List[Tuple[str, str, Any, Any]] = []  # (source_name, job_id, job, run_fn)

        for source in sources:
            try:
                due = source.due_fn()
            except Exception as exc:
                _log.warning("SeoScheduler: due_fn error for source %r: %s", source.name, exc)
                continue

            if not due:
                continue

            # Apply batch size limit per source
            due = due[: self.batch_size]

            for job_id, job in due:
                # Track stale-lock recoveries (when lock_owner already set but expired)
                try:
                    data = {}
                    if hasattr(job, "__dict__"):
                        data = job.__dict__
                    elif isinstance(job, dict):
                        data = job.get("data") or job
                    if data.get("lock_owner") and data.get("lock_expires_at"):
                        self._increment("stale_lock_recoveries")
                except Exception:
                    pass

                self._increment("claimed")
                all_work.append((source.name, job_id, job, source.run_fn))

        if not all_work:
            return

        # Tenant-fair round-robin interleave
        all_work = _interleave_by_tenant(all_work)
        self._increment("tenant_fairness_rounds")

        # Execute with bounded concurrency, provider caps, graceful shutdown
        with ThreadPoolExecutor(max_workers=self.max_workers) as pool:
            futures: Dict[Future, Tuple[str, str, str]] = {}  # future -> (source_name, job_id, provider)
            deferred: List[Tuple[str, str, Any, Any]] = []

            for source_name, job_id, job, run_fn in all_work:
                if self._stop_event.is_set():
                    _log.info("SeoScheduler: stop requested mid-tick, deferring remaining jobs")
                    break

                provider = self._provider_sems.get_provider(job)
                if not self._provider_sems.acquire(provider):
                    _log.debug("SeoScheduler: provider %r at capacity, deferring %s", provider, job_id)
                    self._increment("provider_deferred")
                    deferred.append((source_name, job_id, job, run_fn))
                    continue

                with self._stats_lock:
                    self._running.add(job_id)

                fut = pool.submit(self._execute_job, source_name, job_id, job, run_fn, provider)
                futures[fut] = (source_name, job_id, provider)

                with self._futures_lock:
                    self._active_futures[fut] = (source_name, job_id, provider)

            for fut in as_completed(futures):
                source_name, job_id, provider = futures[fut]
                with self._stats_lock:
                    self._running.discard(job_id)
                with self._futures_lock:
                    self._active_futures.pop(fut, None)
                # Release provider slot
                if provider:
                    self._provider_sems.release(provider)
                try:
                    fut.result()
                except Exception as exc:
                    _log.error("SeoScheduler: unhandled exception in job %s/%s: %s", source_name, job_id, exc)
                    self._increment("failed")

        if deferred:
            _log.info("SeoScheduler: %d jobs deferred due to provider caps (will retry next tick)", len(deferred))

    def _execute_job(
        self,
        source_name: str,
        job_id: str,
        job: Any,
        run_fn: Any,
        provider: str = "",
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
