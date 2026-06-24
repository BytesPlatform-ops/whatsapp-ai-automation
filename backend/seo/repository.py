"""Tenant-scoped persistence seam for SEO reports and tracked keywords.

Ships an in-memory implementation so the API is functional today and tenant
isolation + idempotency are actually exercised. A durable implementation
(backed by the Prisma SEO models / Supabase Postgres — see /prisma/schema.prisma)
plugs in behind the same method surface in a later wave WITHOUT touching the
router. Stdlib only; no secrets stored here.
"""

from __future__ import annotations

import hashlib
from typing import Any, Dict, List, Optional


def _stable_id(*parts: str) -> str:
    """Deterministic short id so the same idempotent request maps to one report."""
    raw = "|".join(p for p in parts if p)
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]


class InMemorySeoRepository:
    """Non-durable, process-local store. Tenant-scoped on every read/write."""

    def __init__(self) -> None:
        self._reports: Dict[str, Dict[str, Any]] = {}   # report_id -> report
        self._idem: Dict[str, str] = {}                 # "tenant|key" -> report_id
        self._keywords: Dict[str, Dict[str, Any]] = {}  # kw_id -> record
        self._counter = 0

    def save_report(
        self,
        tenant_id: str,
        report: Dict[str, Any],
        idempotency_key: Optional[str] = None,
    ) -> Dict[str, Any]:
        if idempotency_key:
            idem = "%s|%s" % (tenant_id, idempotency_key)
            existing = self._idem.get(idem)
            if existing and existing in self._reports:
                return self._reports[existing]  # idempotent replay
            report_id = _stable_id(tenant_id, idempotency_key)
            self._idem[idem] = report_id
        else:
            self._counter += 1
            report_id = _stable_id(tenant_id, "seq", str(self._counter))
        stored = dict(report)
        stored["report_id"] = report_id
        stored["tenant_id"] = tenant_id
        self._reports[report_id] = stored
        return stored

    def get_report(self, tenant_id: str, report_id: str) -> Optional[Dict[str, Any]]:
        report = self._reports.get(report_id)
        # Not found OR belongs to another tenant -> indistinguishable "not found".
        if report is None or report.get("tenant_id") != tenant_id:
            return None
        return report

    def add_tracked_keywords(
        self, tenant_id: str, url: str, keywords: List[str]
    ) -> List[Dict[str, Any]]:
        out: List[Dict[str, Any]] = []
        for kw in keywords:
            kw = (kw or "").strip()
            if not kw:
                continue
            kw_id = _stable_id(tenant_id, url, kw.lower())
            record = {"id": kw_id, "tenant_id": tenant_id, "keyword": kw, "url": url}
            self._keywords[kw_id] = record
            out.append(record)
        return out


_repo: Optional[InMemorySeoRepository] = None


def get_repository() -> InMemorySeoRepository:
    global _repo
    if _repo is None:
        _repo = InMemorySeoRepository()
    return _repo
