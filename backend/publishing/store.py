"""Durable, tenant-scoped repositories for the publishing engine.

Backed by the shared ``persistence`` seam (memory for tests, file/supabase for
durable). Jobs + attempts use the same envelope convention as ``content_agent``.

Worker-facing operations (``due_jobs``, ``acquire_lock``) read across tenants —
the worker is a trusted global process, not a user request. Every USER-facing
read/write is tenant-scoped, so a client can never reach another workspace's jobs.
"""

from __future__ import annotations

import secrets
from datetime import datetime, timezone
from typing import List, Optional, Tuple

import persistence

from .enums import DUE_STATUSES, PublishStatus
from .schemas import PublishAttempt, PublishJob


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _id(prefix: str) -> str:
    return prefix + secrets.token_hex(8)


def _older_than(iso: str, seconds: int) -> bool:
    """True when timestamp ``iso`` is more than ``seconds`` in the past."""
    if not iso:
        return True
    try:
        dt = datetime.fromisoformat(iso)
    except ValueError:
        return True
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - dt).total_seconds() > seconds


class _Repo:
    table_name = ""
    model = None

    def __init__(self) -> None:
        self._repo = persistence.table(self.table_name)

    def _save(self, row_id: str, tenant_id: str, model) -> None:
        existing = self._repo.get(tenant_id, row_id)
        created = existing.get("created_at") if existing else None
        self._repo.upsert(persistence.envelope(row_id, tenant_id, model.model_dump(mode="json"), created))

    def _build(self, row: Optional[dict]):
        return self.model(**row["data"]) if row else None

    def _all_rows(self) -> List[dict]:
        """Every row across tenants — worker/global use only. Works on memory/file
        (in-process rows) and supabase (REST list)."""
        rows = getattr(self._repo, "_rows", None)
        if rows is not None:
            return list(rows)
        # Supabase: list the whole table via the service-role REST endpoint.
        try:
            import httpx  # local import; only in supabase mode
            with httpx.Client(timeout=20) as http:
                r = http.get(persistence._sb_rest(self.table_name), headers=persistence._sb_headers(),
                             params={"order": "created_at.asc"})
                return r.json() if r.status_code == 200 else []
        except Exception:
            return []


class JobRepository(_Repo):
    table_name = "pub_jobs"
    model = PublishJob

    def create(self, job: PublishJob) -> Tuple[str, PublishJob]:
        job_id = _id("pubjob_")
        job = job.model_copy(update={"created_at": now_iso(), "updated_at": now_iso()})
        self._save(job_id, job.tenant_id, job)
        return job_id, job

    def get(self, tenant_id: str, job_id: str) -> Optional[Tuple[str, PublishJob]]:
        m = self._build(self._repo.get(tenant_id, job_id))
        return (job_id, m) if m else None

    def update(self, tenant_id: str, job_id: str, **fields) -> Optional[Tuple[str, PublishJob]]:
        found = self.get(tenant_id, job_id)
        if found is None:
            return None
        _, job = found
        fields["updated_at"] = now_iso()
        updated = job.model_copy(update=fields)
        self._save(job_id, tenant_id, updated)
        return job_id, updated

    def delete(self, tenant_id: str, job_id: str) -> bool:
        return self._repo.delete(tenant_id, job_id)

    def list(self, tenant_id: str) -> List[Tuple[str, PublishJob]]:
        return [(r["id"], self._build(r)) for r in self._repo.list_by_tenant(tenant_id)]

    def find_by_fingerprint(self, tenant_id: str, fingerprint: str) -> Optional[Tuple[str, PublishJob]]:
        for jid, job in self.list(tenant_id):
            if job and job.fingerprint == fingerprint and job.status not in (PublishStatus.CANCELLED,):
                return jid, job
        return None

    # ── worker-facing (global) ────────────────────────────────────────────────
    def due_jobs(self, *, now: str = "", lock_timeout_s: int = 300, limit: int = 50) -> List[Tuple[str, PublishJob]]:
        """Jobs ready to run: DUE status, due time passed, and unlocked (or lock
        stale). Cross-tenant — worker only."""
        now = now or now_iso()
        out: List[Tuple[str, PublishJob]] = []
        for row in self._all_rows():
            job = self._build(row)
            if not job or job.status not in DUE_STATUSES:
                continue
            due_time = job.next_retry_utc if job.status == PublishStatus.RETRY_WAIT else job.scheduled_utc
            if due_time and due_time > now:
                continue  # not yet due
            if job.locked_at and not _older_than(job.locked_at, lock_timeout_s):
                continue  # actively locked by another worker
            out.append((row["id"], job))
            if len(out) >= limit:
                break
        return out

    def acquire_lock(self, tenant_id: str, job_id: str, worker_id: str, *, lock_timeout_s: int = 300) -> Optional[PublishJob]:
        """Try to claim a job. Returns the locked job on success, else None (already
        locked and fresh). Re-reads current state to avoid a stale decision."""
        found = self.get(tenant_id, job_id)
        if found is None:
            return None
        _, job = found
        if job.status in (PublishStatus.PUBLISHED, PublishStatus.CANCELLED):
            return None
        if job.locked_at and not _older_than(job.locked_at, lock_timeout_s):
            return None
        _, locked = self.update(tenant_id, job_id, locked_at=now_iso(), locked_by=worker_id,
                                status=PublishStatus.PUBLISHING, started_at=now_iso())
        return locked

    def release_lock(self, tenant_id: str, job_id: str, **fields) -> Optional[Tuple[str, PublishJob]]:
        return self.update(tenant_id, job_id, locked_at="", locked_by="", **fields)


class AttemptRepository(_Repo):
    table_name = "pub_attempts"
    model = PublishAttempt

    def create(self, attempt: PublishAttempt) -> Tuple[str, PublishAttempt]:
        aid = _id("pubatt_")
        attempt = attempt.model_copy(update={"started_at": attempt.started_at or now_iso()})
        self._save(aid, attempt.tenant_id, attempt)
        return aid, attempt

    def complete(self, tenant_id: str, aid: str, **fields) -> None:
        found = self._repo.get(tenant_id, aid)
        if not found:
            return
        att = self.model(**found["data"]).model_copy(update={**fields, "completed_at": now_iso()})
        self._save(aid, tenant_id, att)

    def list_by_job(self, tenant_id: str, job_id: str) -> List[Tuple[str, PublishAttempt]]:
        rows = [(r["id"], self._build(r)) for r in self._repo.list_by_tenant(tenant_id)]
        rows = [(i, m) for (i, m) in rows if m and m.job_id == job_id]
        rows.sort(key=lambda x: x[1].attempt_number)
        return rows


# ── singletons + reset ─────────────────────────────────────────────────────────
_REPOS: dict = {}


def _repo(key: str, cls):
    if key not in _REPOS:
        _REPOS[key] = cls()
    return _REPOS[key]


def reset_repositories() -> None:
    _REPOS.clear()


def get_job_repository() -> JobRepository:
    return _repo("job", JobRepository)


def get_attempt_repository() -> AttemptRepository:
    return _repo("attempt", AttemptRepository)


# ── query helper (filter / sort) ───────────────────────────────────────────────
def query_jobs(
    tenant_id: str,
    *,
    status: str = "",
    platform: str = "",
    source_product: str = "",
    influencer_video_id: str = "",
    document_id: str = "",
    sort: str = "created",
) -> List[Tuple[str, PublishJob]]:
    jobs = get_job_repository().list(tenant_id)

    def keep(j: PublishJob) -> bool:
        if status and j.status.value != status:
            return False
        if platform and j.platform.value != platform:
            return False
        if source_product and j.source_product.value != source_product:
            return False
        if influencer_video_id and j.snapshot.influencer_video_id != influencer_video_id:
            return False
        if document_id and j.snapshot.document_id != document_id:
            return False
        return True

    filtered = [(i, j) for (i, j) in jobs if j and keep(j)]
    key = (lambda p: p[1].scheduled_utc) if sort == "scheduled" else (lambda p: p[1].created_at)
    filtered.sort(key=key, reverse=True)
    return filtered
