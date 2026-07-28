"""Durable, tenant-scoped usage counters for the SEO scheduler.

Replaces in-process dicts (_daily_counters, _sent_keys) in seo/outreach/sending.py
and adds per-tenant, per-metric counters for:
  - outreach send limits        (counter_key="outreach_sends")
  - provider request limits     (counter_key="provider_requests:{provider}")
  - manual/local rank refreshes (counter_key="rank_refreshes")
  - report generation           (counter_key="report_generations")
  - scheduled-job quotas        (counter_key="scheduled_jobs:{source}")

Design
------
- Each counter is a row in ``seo_usage_counters`` with the envelope:
    { id, tenant_id, data: { counter_key, period, count, idempotency_keys[] } }
- ``period`` is a UTC day string (YYYY-MM-DD) — rolls over at UTC midnight.
- Atomic increment: protected by a single module-level RLock. The RLock allows
  the same thread to re-enter (re-entrant) so nested calls don't deadlock.
  In multi-process (Supabase) mode the persistence layer provides cross-process
  durability; in memory mode the RLock is the correctness fence.
- A duplicate retry with the same idempotency_key does NOT increment twice.
- Plan-limit aware: checks seo.metering_search.check_seo_limit (if available)
  before allowing increment.
- Multi-instance + restart safe: backed by persistence.table("seo_usage_counters")
  so the count is shared across instances.
- Timezone policy: UTC day (datetime.now(timezone.utc).strftime("%Y-%m-%d")).

The _AutoRepo pattern from seo/search_stores.py is mirrored here for the
seo_usage_counters table.

Public API
----------
increment(tenant_id, counter_key, *, idempotency_key="", amount=1) -> IncrementResult
get_count(tenant_id, counter_key) -> int
reset_period(tenant_id, counter_key) -> None  (for tests only)
check_limit(tenant_id, counter_key, limit) -> bool   (True = under limit)
"""

from __future__ import annotations

import logging
import threading
from datetime import datetime, timezone
from typing import Any, Dict, List, NamedTuple, Optional

_log = logging.getLogger("pixie.seo.scheduler.counters")

# ── Period helpers ────────────────────────────────────────────────────────────

def _today_utc() -> str:
    """Return the current UTC day as YYYY-MM-DD."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _counter_row_id(tenant_id: str, counter_key: str, period: str) -> str:
    """Deterministic row ID: stable across instances for the same counter+period."""
    import hashlib
    raw = f"{tenant_id}|{counter_key}|{period}"
    return "ctr_" + hashlib.sha256(raw.encode()).hexdigest()[:32]


# ── Result type ───────────────────────────────────────────────────────────────

class IncrementResult(NamedTuple):
    incremented: bool       # False if idempotency_key already seen or limit exceeded
    new_count: int
    period: str
    reason: str             # "ok", "duplicate", "limit_exceeded", "error", "zero_amount"


# ── Counter table repo ────────────────────────────────────────────────────────

# Module-level RLock for memory-mode CAS safety (re-entrant so nested calls don't deadlock).
_MEM_LOCK = threading.RLock()

# In-memory fallback for test/memory mode (keyed by row_id).
# In Supabase mode the persistence layer is used instead.
_MEM_STORE: Dict[str, Dict[str, Any]] = {}


def _get_repo():
    """Return the persistence repo for seo_usage_counters (no lock held)."""
    try:
        import persistence
        return persistence.table("seo_usage_counters")
    except Exception:
        return None


def _read_row_nolock(tenant_id: str, counter_key: str, period: str) -> Optional[Dict[str, Any]]:
    """Read a counter row by deterministic ID. MUST be called without holding _MEM_LOCK."""
    row_id = _counter_row_id(tenant_id, counter_key, period)
    repo = _get_repo()
    if repo is not None:
        try:
            row = repo.get(tenant_id, row_id)
            if row:
                return row
        except Exception as exc:
            _log.debug("counters: repo.get failed: %s", exc)
    # Fallback to in-memory store (use RLock since it's re-entrant)
    with _MEM_LOCK:
        return _MEM_STORE.get(row_id)


def _write_row_nolock(row: Dict[str, Any]) -> bool:
    """Write (upsert) a counter row. MUST be called without holding _MEM_LOCK."""
    repo = _get_repo()
    if repo is not None:
        try:
            repo.upsert(row)
            # Also update in-memory store as fast-path cache
            with _MEM_LOCK:
                _MEM_STORE[row["id"]] = row
            return True
        except Exception as exc:
            _log.debug("counters: repo.upsert failed: %s", exc)
    # Fallback to in-memory store
    with _MEM_LOCK:
        _MEM_STORE[row["id"]] = row
    return True


def _make_row(tenant_id: str, counter_key: str, period: str) -> Dict[str, Any]:
    """Create a fresh counter row (no lock needed — pure construction)."""
    row_id = _counter_row_id(tenant_id, counter_key, period)
    now_iso = datetime.now(timezone.utc).isoformat(timespec="microseconds")
    return {
        "id": row_id,
        "tenant_id": tenant_id,
        "created_at": now_iso,
        "updated_at": now_iso,
        "data": {
            "counter_key": counter_key,
            "period": period,
            "count": 0,
            "idempotency_keys": [],
        },
    }


# ── Plan limit check ─────────────────────────────────────────────────────────

def _check_plan_limit(tenant_id: str, counter_key: str, current_count: int) -> bool:
    """Check whether current_count is within the plan limit for this counter.

    Returns True (under limit) or False (at/over limit).
    Falls back to True when metering is unavailable (fail open).
    """
    try:
        from seo.metering_search import check_seo_limit  # type: ignore[import]
        return check_seo_limit(tenant_id, counter_key, current_count)
    except ImportError:
        # metering_search.check_seo_limit is optional
        return True
    except Exception as exc:
        _log.debug("counters: plan limit check failed (fail open): %s", exc)
        return True


# ── Public API ────────────────────────────────────────────────────────────────

def increment(
    tenant_id: str,
    counter_key: str,
    *,
    idempotency_key: str = "",
    amount: int = 1,
    period: Optional[str] = None,
    check_plan_limit: bool = True,
    limit: Optional[int] = None,
) -> IncrementResult:
    """Atomically increment a counter for (tenant_id, counter_key, period).

    Parameters
    ----------
    tenant_id:         Workspace/tenant identifier.
    counter_key:       Metric name (e.g. "outreach_sends", "rank_refreshes").
    idempotency_key:   When provided, the increment is a no-op if this key was
                       already recorded (idempotent retry support).
    amount:            How much to increment by (default 1).
    period:            UTC day string override (default: today in UTC).
    check_plan_limit:  When True, checks the plan limit before incrementing.
    limit:             Optional explicit limit override (skips plan lookup).

    Returns
    -------
    IncrementResult with: incremented, new_count, period, reason.
    """
    if amount <= 0:
        return IncrementResult(incremented=False, new_count=0, period=period or _today_utc(), reason="zero_amount")

    day = period or _today_utc()

    # Read outside lock to avoid holding lock during I/O
    row = _read_row_nolock(tenant_id, counter_key, day)
    if row is None:
        row = _make_row(tenant_id, counter_key, day)

    # Now take the lock for the check-then-write CAS
    with _MEM_LOCK:
        # Re-read inside lock to catch concurrent updates
        row_id = _counter_row_id(tenant_id, counter_key, day)
        fresh = _MEM_STORE.get(row_id)
        if fresh is not None:
            row = fresh

        data = dict(row.get("data") or {})
        # Ensure correct period (stale rows from yesterday get new state)
        if data.get("period") != day:
            data = {
                "counter_key": counter_key,
                "period": day,
                "count": 0,
                "idempotency_keys": [],
            }

        current_count = int(data.get("count", 0))
        idempotency_keys: List[str] = list(data.get("idempotency_keys") or [])

        # Idempotency check
        if idempotency_key and idempotency_key in idempotency_keys:
            return IncrementResult(
                incremented=False,
                new_count=current_count,
                period=day,
                reason="duplicate",
            )

        # Plan limit check (called outside any I/O but inside CAS lock)
        if check_plan_limit:
            effective_limit = limit
            if effective_limit is None:
                if not _check_plan_limit(tenant_id, counter_key, current_count + amount):
                    return IncrementResult(
                        incremented=False,
                        new_count=current_count,
                        period=day,
                        reason="limit_exceeded",
                    )
            else:
                if current_count + amount > effective_limit:
                    return IncrementResult(
                        incremented=False,
                        new_count=current_count,
                        period=day,
                        reason="limit_exceeded",
                    )

        # Increment
        new_count = current_count + amount
        data["count"] = new_count
        data["period"] = day
        if idempotency_key:
            # Bounded: keep last 1000 keys to avoid unbounded growth
            idempotency_keys.append(idempotency_key)
            if len(idempotency_keys) > 1000:
                idempotency_keys = idempotency_keys[-1000:]
            data["idempotency_keys"] = idempotency_keys

        now_iso = datetime.now(timezone.utc).isoformat(timespec="microseconds")
        updated_row = dict(row)
        updated_row["data"] = data
        updated_row["updated_at"] = now_iso
        updated_row.setdefault("id", row_id)

        # Write to in-memory store immediately (fast path)
        _MEM_STORE[row_id] = updated_row

    # Write to persistence outside lock to avoid holding during I/O
    try:
        repo = _get_repo()
        if repo is not None:
            repo.upsert(updated_row)
    except Exception as exc:
        _log.debug("counters: persistence write failed (count still in memory): %s", exc)

    return IncrementResult(incremented=True, new_count=new_count, period=day, reason="ok")


def get_count(
    tenant_id: str,
    counter_key: str,
    *,
    period: Optional[str] = None,
) -> int:
    """Return the current count for (tenant_id, counter_key) for today (or the given period)."""
    day = period or _today_utc()
    # Fast path: in-memory store
    row_id = _counter_row_id(tenant_id, counter_key, day)
    with _MEM_LOCK:
        row = _MEM_STORE.get(row_id)
    if row:
        data = row.get("data") or {}
        if data.get("period") == day:
            return int(data.get("count", 0))
    # Slow path: persistence
    row = _read_row_nolock(tenant_id, counter_key, day)
    if not row:
        return 0
    data = row.get("data") or {}
    if data.get("period") != day:
        return 0
    return int(data.get("count", 0))


def check_limit(
    tenant_id: str,
    counter_key: str,
    limit: int,
    *,
    period: Optional[str] = None,
) -> bool:
    """Return True if the current count is strictly below the limit."""
    return get_count(tenant_id, counter_key, period=period) < limit


def reset_period(
    tenant_id: str,
    counter_key: str,
    *,
    period: Optional[str] = None,
) -> None:
    """Reset the counter for a period. Intended for tests only."""
    day = period or _today_utc()
    row_id = _counter_row_id(tenant_id, counter_key, day)
    with _MEM_LOCK:
        _MEM_STORE.pop(row_id, None)
    repo = _get_repo()
    if repo is not None:
        try:
            repo.delete(tenant_id, row_id)
        except Exception:
            pass


def reset_all_for_tenant(tenant_id: str) -> None:
    """Remove all counter rows for a tenant. Tests only."""
    with _MEM_LOCK:
        to_delete = [k for k in list(_MEM_STORE.keys()) if _MEM_STORE[k].get("tenant_id") == tenant_id]
        for k in to_delete:
            del _MEM_STORE[k]
    repo = _get_repo()
    if repo is not None:
        try:
            rows = repo.list_by_tenant(tenant_id)
            for r in rows:
                try:
                    repo.delete(tenant_id, r["id"])
                except Exception:
                    pass
        except Exception:
            pass
