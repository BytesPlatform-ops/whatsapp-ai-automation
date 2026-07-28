"""Supabase-safe due-job queries + memory/file fallback for the SEO scheduler.

Design
------
- ``due_jobs(table, ...)`` — paginated, status+time filtered, bounded scan.
  In Supabase mode: PostgREST GET with column-filter params + limit + order.
  In memory/file mode: scan up to ``limit * 10`` raw rows, apply filters.
  NEVER loads all rows unbounded.

- ``claim_job(table, row_id, worker_id, lock_ttl)`` — atomic compare-and-set
  via read-then-write with lock_owner + lock_expires_at.  Supabase REST has no
  SELECT FOR UPDATE; we replicate skip-locked semantics by reading first and
  checking whether the lock is free/expired before writing.  In the rare race
  a second worker sets the same lock; a re-read after write confirms ownership.

Index hints
-----------
For Supabase deployments, add the following expression indexes on each job table
so PostgREST filtering on ``data->>'status'`` and ``data->>'next_run'`` stays fast:

    CREATE INDEX ON <table> ((data->>'status'));
    CREATE INDEX ON <table> ((data->>'next_run'));
    CREATE INDEX ON <table> ((data->>'lock_expires_at'));

Tables expected: seo_rank_jobs, seo_gsc_sync_jobs, seo_analytics_sync_jobs,
                 seo_fix_verification, seo_alerts (read-only for alert gen).
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

_log = logging.getLogger("pixie.seo.scheduler.queries")


# ── Backend detection (mirrors persistence.py) ──────────────────────────────

def _backend() -> str:
    raw = os.getenv("PIXIE_PERSIST", "").strip().lower()
    if raw in ("1", "true", "yes", "on", "file"):
        return "file"
    if raw == "supabase":
        return "supabase"
    return "memory"


def _sb_url() -> str:
    return os.getenv("SUPABASE_URL", "").rstrip("/")


def _sb_key() -> str:
    return os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")


def _sb_rest(table: str) -> str:
    return f"{_sb_url()}/rest/v1/{table}"


def _sb_headers(extra: Optional[dict] = None) -> dict:
    h = {
        "apikey": _sb_key(),
        "Authorization": f"Bearer {_sb_key()}",
        "Content-Type": "application/json",
    }
    if extra:
        h.update(extra)
    return h


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="microseconds")


def _parse_dt(iso: str) -> Optional[datetime]:
    if not iso:
        return None
    try:
        dt = datetime.fromisoformat(iso)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except (ValueError, TypeError):
        return None


# ── due_jobs ─────────────────────────────────────────────────────────────────

def due_jobs(
    table: str,
    *,
    now: Optional[str] = None,
    status_in: List[str],
    next_run_before: Optional[str] = None,
    lock_expired_before: Optional[str] = None,
    provider: Optional[str] = None,
    limit: int = 25,
    order: str = "next_run",
    _memory_repo=None,
) -> List[Dict[str, Any]]:
    """Return up to ``limit`` job rows that are due to run.

    Parameters
    ----------
    table:              Supabase table name (e.g. ``"seo_rank_jobs"``).
    now:                Current time ISO string (injected for determinism).
    status_in:          Rows whose ``data->>'status'`` is in this list.
    next_run_before:    Only rows whose ``next_run`` / ``scheduled_for`` is at
                        or before this ISO timestamp (defaults to ``now``).
    lock_expired_before: Only rows whose lock is absent or expired before this
                        ISO timestamp (defaults to ``now``).
    provider:           Optional filter on ``data->>'provider'``.
    limit:              Maximum rows returned.
    order:              Field name to order ascending (``next_run`` default).
    _memory_repo:       Injected persistence._MemoryRepo for tests (skip DB).

    Returns
    -------
    List of raw row dicts (plain dict with ``id``, ``tenant_id``, ``data`` etc.).
    """
    now_str = now or _now_iso()
    cutoff = next_run_before or now_str
    lock_cutoff = lock_expired_before or now_str

    b = _backend()

    if _memory_repo is not None or b != "supabase":
        return _due_jobs_memory(
            table=table,
            now_str=now_str,
            cutoff=cutoff,
            lock_cutoff=lock_cutoff,
            status_in=status_in,
            provider=provider,
            limit=limit,
            order=order,
            _memory_repo=_memory_repo,
        )

    return _due_jobs_supabase(
        table=table,
        cutoff=cutoff,
        lock_cutoff=lock_cutoff,
        status_in=status_in,
        provider=provider,
        limit=limit,
        order=order,
    )


def _due_jobs_memory(
    *,
    table: str,
    now_str: str,
    cutoff: str,
    lock_cutoff: str,
    status_in: List[str],
    provider: Optional[str],
    limit: int,
    order: str,
    _memory_repo=None,
) -> List[Dict[str, Any]]:
    """Memory/file backend scan — bounded at limit*10 rows."""
    # Resolve the in-process repo if not injected.
    if _memory_repo is None:
        try:
            import persistence
            _memory_repo = persistence.table(table)
        except Exception as exc:
            _log.warning("due_jobs: cannot open memory table %s: %s", table, exc)
            return []

    # Grab raw rows (bounded cap to avoid OOM on large in-memory sets).
    try:
        raw_rows = getattr(_memory_repo, "_rows", None)
        if raw_rows is None:
            # _SupabaseRepo or unknown — skip
            return []
        scan = list(raw_rows)[: limit * 10]  # bounded scan
    except Exception as exc:
        _log.warning("due_jobs: error scanning %s rows: %s", table, exc)
        return []

    cutoff_dt = _parse_dt(cutoff)
    lock_cutoff_dt = _parse_dt(lock_cutoff)
    results: List[Dict[str, Any]] = []

    for row in scan:
        if len(results) >= limit:
            break

        data = row.get("data") or {}
        if isinstance(data, str):
            try:
                import json
                data = json.loads(data)
            except Exception:
                data = {}

        # Status filter
        row_status = data.get("status") or row.get("status", "")
        if row_status not in status_in:
            continue

        # next_run / scheduled_for filter
        nxt = data.get("next_run") or data.get("scheduled_for") or ""
        if nxt and cutoff_dt:
            nxt_dt = _parse_dt(nxt)
            if nxt_dt and nxt_dt > cutoff_dt:
                continue

        # Lock-expiry filter: only include rows where lock is absent OR expired
        lock_exp = data.get("lock_expires_at") or row.get("lock_expires_at", "")
        if lock_exp and lock_cutoff_dt:
            lock_dt = _parse_dt(lock_exp)
            if lock_dt and lock_dt > lock_cutoff_dt:
                # Lock is still valid — skip (another worker owns it)
                continue

        # Provider filter
        if provider is not None:
            row_provider = data.get("provider") or row.get("provider", "")
            if row_provider != provider:
                continue

        results.append(dict(row))

    # Sort ascending by the order field (best-effort)
    def _sort_key(r):
        d = r.get("data") or {}
        if isinstance(d, str):
            try:
                import json
                d = json.loads(d)
            except Exception:
                d = {}
        val = d.get(order) or r.get(order) or r.get("created_at", "")
        return val or ""

    results.sort(key=_sort_key)
    return results[:limit]


def _due_jobs_supabase(
    *,
    table: str,
    cutoff: str,
    lock_cutoff: str,
    status_in: List[str],
    provider: Optional[str],
    limit: int,
    order: str,
) -> List[Dict[str, Any]]:
    """Supabase PostgREST query for due jobs.

    PostgREST syntax for JSONB field filters:
      data->>'status'=in.(queued,running)    →  "data->>status": "in.(queued,running)"
      data->>'next_run'=lte.{cutoff}         →  "data->>next_run": f"lte.{cutoff}"

    Requires expression indexes on the target table — see module docstring.
    """
    import httpx

    url = _sb_rest(table)

    # Build status filter as PostgREST `in` operator
    status_csv = ",".join(status_in)
    params: Dict[str, Any] = {
        "data->>status": f"in.({status_csv})",
        "limit": str(limit),
        "order": f"data->>{ order }.asc.nullsfirst",
    }

    # next_run cutoff
    params[f"data->>{order}"] = f"lte.{cutoff}"

    if provider is not None:
        params["data->>provider"] = f"eq.{provider}"

    try:
        with httpx.Client(timeout=15) as http:
            r = http.get(url, headers=_sb_headers(), params=params)
            if r.status_code == 200:
                rows = r.json()
                # Post-filter: lock_expires_at must be absent or past.
                lock_cutoff_dt = _parse_dt(lock_cutoff)
                filtered = []
                for row in rows:
                    d = row.get("data") or {}
                    lock_exp = d.get("lock_expires_at") or ""
                    if lock_exp and lock_cutoff_dt:
                        lock_dt = _parse_dt(lock_exp)
                        if lock_dt and lock_dt > lock_cutoff_dt:
                            continue
                    filtered.append(row)
                return filtered[:limit]
            else:
                _log.warning(
                    "due_jobs supabase: %s returned %d: %s",
                    table, r.status_code, r.text[:200],
                )
    except Exception as exc:
        _log.warning("due_jobs supabase error for %s: %s", table, exc)

    return []


# ── claim_job ─────────────────────────────────────────────────────────────────

def claim_job(
    table: str,
    row_id: str,
    worker_id: str,
    lock_ttl: int,
    tenant_id: str = "",
    *,
    _memory_repo=None,
) -> bool:
    """Attempt to atomically claim a job by setting lock_owner + lock_expires_at.

    Returns True when the caller successfully owns the lock; False otherwise.

    Safety
    ------
    1. Read the current row.
    2. If lock_owner is set and not expired → skip (another worker owns it).
    3. Write lock_owner=worker_id, lock_expires_at=now+lock_ttl.
    4. Re-read to confirm our lock_owner is reflected (best-effort in memory).
    """
    now_dt = datetime.now(timezone.utc)
    lock_expiry = (now_dt + timedelta(seconds=lock_ttl)).isoformat(timespec="microseconds")

    b = _backend()

    if _memory_repo is not None or b != "supabase":
        return _claim_job_memory(
            table=table,
            row_id=row_id,
            tenant_id=tenant_id,
            worker_id=worker_id,
            lock_expiry=lock_expiry,
            now_dt=now_dt,
            _memory_repo=_memory_repo,
        )

    return _claim_job_supabase(
        table=table,
        row_id=row_id,
        tenant_id=tenant_id,
        worker_id=worker_id,
        lock_expiry=lock_expiry,
        now_dt=now_dt,
    )


def _claim_job_memory(
    *,
    table: str,
    row_id: str,
    tenant_id: str,
    worker_id: str,
    lock_expiry: str,
    now_dt: datetime,
    _memory_repo=None,
) -> bool:
    if _memory_repo is None:
        try:
            import persistence
            _memory_repo = persistence.table(table)
        except Exception as exc:
            _log.warning("claim_job: cannot open memory table %s: %s", table, exc)
            return False

    # Read
    raw = _memory_repo.get(tenant_id, row_id) if tenant_id else _find_by_id(_memory_repo, row_id)
    if not raw:
        _log.warning("claim_job: row %s not found in %s", row_id, table)
        return False

    data = raw.get("data") or {}
    if isinstance(data, str):
        try:
            import json
            data = json.loads(data)
        except Exception:
            data = {}

    # Check existing lock
    current_lock_owner = data.get("lock_owner") or raw.get("lock_owner", "")
    current_lock_expiry = data.get("lock_expires_at") or raw.get("lock_expires_at", "")

    if current_lock_owner:
        if current_lock_expiry:
            exp_dt = _parse_dt(current_lock_expiry)
            if exp_dt and exp_dt > now_dt:
                # Lock is valid — another worker owns it
                _log.debug("claim_job: %s is locked by %s until %s", row_id, current_lock_owner, current_lock_expiry)
                return False
        else:
            # Lock owner set but no expiry — treat as locked
            return False

    # Claim: update the data dict and write back
    updated_data = dict(data)
    updated_data["lock_owner"] = worker_id
    updated_data["lock_expires_at"] = lock_expiry
    updated_row = dict(raw)
    updated_row["data"] = updated_data

    try:
        _memory_repo.upsert(updated_row)
    except Exception as exc:
        _log.warning("claim_job: upsert failed for %s: %s", row_id, exc)
        return False

    # Confirm (re-read)
    confirmed = _memory_repo.get(tenant_id, row_id) if tenant_id else _find_by_id(_memory_repo, row_id)
    if not confirmed:
        return False
    conf_data = confirmed.get("data") or {}
    if isinstance(conf_data, str):
        try:
            import json
            conf_data = json.loads(conf_data)
        except Exception:
            conf_data = {}
    return conf_data.get("lock_owner") == worker_id


def _find_by_id(repo, row_id: str) -> Optional[Dict[str, Any]]:
    """Scan repo._rows by id when no tenant_id is available."""
    try:
        for row in getattr(repo, "_rows", []):
            if row.get("id") == row_id:
                return row
    except Exception:
        pass
    return None


def _claim_job_supabase(
    *,
    table: str,
    row_id: str,
    tenant_id: str,
    worker_id: str,
    lock_expiry: str,
    now_dt: datetime,
) -> bool:
    import httpx

    url = _sb_rest(table)
    params: Dict[str, str] = {"id": f"eq.{row_id}"}
    if tenant_id:
        params["tenant_id"] = f"eq.{tenant_id}"

    try:
        with httpx.Client(timeout=15) as http:
            # Read current row
            r = http.get(url, headers=_sb_headers(), params={**params, "limit": "1"})
            if r.status_code != 200 or not r.json():
                _log.warning("claim_job supabase: row %s not found", row_id)
                return False

            row = r.json()[0]
            data = row.get("data") or {}
            current_owner = data.get("lock_owner", "")
            current_expiry = data.get("lock_expires_at", "")

            if current_owner:
                exp_dt = _parse_dt(current_expiry)
                if exp_dt and exp_dt > now_dt:
                    return False

            # Write lock claim via PATCH
            new_data = dict(data)
            new_data["lock_owner"] = worker_id
            new_data["lock_expires_at"] = lock_expiry

            pw = http.patch(
                url,
                headers=_sb_headers({"Prefer": "return=representation"}),
                params=params,
                json={"data": new_data},
            )
            if pw.status_code >= 300:
                _log.warning("claim_job supabase: patch failed %d: %s", pw.status_code, pw.text[:200])
                return False

            # Re-read to confirm
            cr = http.get(url, headers=_sb_headers(), params={**params, "limit": "1"})
            if cr.status_code == 200 and cr.json():
                conf_data = cr.json()[0].get("data") or {}
                return conf_data.get("lock_owner") == worker_id

    except Exception as exc:
        _log.warning("claim_job supabase error for %s/%s: %s", table, row_id, exc)

    return False
