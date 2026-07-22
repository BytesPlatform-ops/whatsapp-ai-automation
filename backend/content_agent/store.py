"""Durable, tenant-scoped repositories for the Content Agent — documents + versions
(+ a light generation-job audit). Backed by the shared ``persistence`` seam, so
records are in-memory for tests (``PIXIE_PERSIST`` unset) and durable + multi-instance
for ``file``/``supabase``. Same envelope convention as content/content_creator.
"""

from __future__ import annotations

import secrets
from datetime import datetime, timezone
from typing import List, Optional, Tuple

import persistence

from .enums import ContentStatus
from .schemas import ContentDocument, ContentUsage, ContentVersion, GenerationJob


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _id(prefix: str) -> str:
    return prefix + secrets.token_hex(8)


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

    def _rows(self, tenant_id: str) -> List[dict]:
        return self._repo.list_by_tenant(tenant_id)


class DocumentRepository(_Repo):
    table_name = "ca_documents"
    model = ContentDocument

    def create(self, doc: ContentDocument) -> Tuple[str, ContentDocument]:
        doc_id = _id("cadoc_")
        doc = doc.model_copy(update={"created_at": now_iso(), "updated_at": now_iso()})
        self._save(doc_id, doc.tenant_id, doc)
        return doc_id, doc

    def get(self, tenant_id: str, doc_id: str) -> Optional[Tuple[str, ContentDocument]]:
        m = self._build(self._repo.get(tenant_id, doc_id))
        return (doc_id, m) if m else None

    def update(self, tenant_id: str, doc_id: str, **fields) -> Optional[Tuple[str, ContentDocument]]:
        found = self.get(tenant_id, doc_id)
        if found is None:
            return None
        _, doc = found
        merged = {k: v for k, v in fields.items() if v is not None}
        merged["updated_at"] = now_iso()
        updated = doc.model_copy(update=merged)
        self._save(doc_id, tenant_id, updated)
        return doc_id, updated

    def delete(self, tenant_id: str, doc_id: str) -> bool:
        return self._repo.delete(tenant_id, doc_id)

    def list(self, tenant_id: str) -> List[Tuple[str, ContentDocument]]:
        return [(r["id"], self._build(r)) for r in self._rows(tenant_id)]


class VersionRepository(_Repo):
    table_name = "ca_versions"
    model = ContentVersion

    def create(self, version: ContentVersion) -> Tuple[str, ContentVersion]:
        vid = _id("cav_")
        version = version.model_copy(update={"created_at": now_iso()})
        self._save(vid, version.tenant_id, version)
        return vid, version

    def get(self, tenant_id: str, vid: str) -> Optional[Tuple[str, ContentVersion]]:
        m = self._build(self._repo.get(tenant_id, vid))
        return (vid, m) if m else None

    def list_by_document(self, tenant_id: str, doc_id: str) -> List[Tuple[str, ContentVersion]]:
        rows = [(r["id"], self._build(r)) for r in self._rows(tenant_id)]
        rows = [(i, m) for (i, m) in rows if m and m.document_id == doc_id]
        rows.sort(key=lambda x: x[1].version_number)
        return rows

    def next_number(self, tenant_id: str, doc_id: str) -> int:
        existing = self.list_by_document(tenant_id, doc_id)
        return (existing[-1][1].version_number + 1) if existing else 1


class JobRepository(_Repo):
    table_name = "ca_jobs"
    model = GenerationJob

    def create(self, job: GenerationJob) -> Tuple[str, GenerationJob]:
        jid = _id("cajob_")
        job = job.model_copy(update={"started_at": now_iso()})
        self._save(jid, job.tenant_id, job)
        return jid, job

    def complete(self, tenant_id: str, jid: str, **fields) -> None:
        found = self._repo.get(tenant_id, jid)
        if not found:
            return
        job = self.model(**found["data"]).model_copy(update={**fields, "completed_at": now_iso()})
        self._save(jid, tenant_id, job)


class UsageRepository(_Repo):
    table_name = "ca_usage"
    model = ContentUsage

    def create(self, usage: ContentUsage) -> Tuple[str, ContentUsage]:
        uid = _id("cause_")
        usage = usage.model_copy(update={"created_at": now_iso()})
        self._save(uid, usage.tenant_id, usage)
        return uid, usage

    def list(self, tenant_id: str) -> List[Tuple[str, ContentUsage]]:
        rows = [(r["id"], self._build(r)) for r in self._rows(tenant_id)]
        rows = [(i, m) for (i, m) in rows if m]
        rows.sort(key=lambda x: x[1].created_at, reverse=True)
        return rows


# ── singletons + reset ───────────────────────────────────────────────────────
_REPOS: dict = {}


def _repo(key: str, cls):
    if key not in _REPOS:
        _REPOS[key] = cls()
    return _REPOS[key]


def reset_repositories() -> None:
    _REPOS.clear()


def get_document_repository() -> DocumentRepository:
    return _repo("doc", DocumentRepository)


def get_version_repository() -> VersionRepository:
    return _repo("ver", VersionRepository)


def get_job_repository() -> JobRepository:
    return _repo("job", JobRepository)


def get_usage_repository() -> UsageRepository:
    return _repo("usage", UsageRepository)


# ── query helpers (search / filter / sort / paginate) ────────────────────────
def query_documents(
    tenant_id: str,
    *,
    query: str = "",
    content_type: str = "",
    status: str = "",
    tags: Optional[List[str]] = None,
    include_archived: bool = False,
    sort: str = "updated",
    page: int = 1,
    page_size: int = 20,
) -> dict:
    docs = get_document_repository().list(tenant_id)  # list of (id, ContentDocument)

    q = query.strip().lower()
    tagset = set(t.lower() for t in (tags or []))

    def matches(d: ContentDocument) -> bool:
        if not include_archived and d.status == ContentStatus.ARCHIVED:
            return False
        if status and d.status.value != status:
            return False
        if content_type and d.content_type.value != content_type:
            return False
        if tagset and not tagset.issubset({t.lower() for t in d.tags}):
            return False
        if q and q not in (d.title or "").lower() and q not in " ".join(d.tags).lower():
            return False
        return True

    filtered = [(i, d) for (i, d) in docs if d and matches(d)]
    key = (lambda pair: pair[1].updated_at) if sort != "created" else (lambda pair: pair[1].created_at)
    filtered.sort(key=key, reverse=True)

    total = len(filtered)
    page = max(1, page)
    start = (page - 1) * page_size
    page_items = filtered[start:start + page_size]
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "documents": [{"id": i, "document": d.model_dump()} for (i, d) in page_items],
    }
