"""Tenant-scoped persistence seam for rank snapshots.

Ships an in-memory implementation so the rank-tracking job is functional today
and tenant isolation is actually exercised. Maps 1:1 to the durable Prisma
``SeoKeywordSnapshot`` model (tenant-scoped — see /prisma/schema.prisma); a
later wave swaps a Postgres-backed store in behind the same method surface
WITHOUT touching the job function. Stdlib only; no secrets stored here.
"""

from __future__ import annotations

from typing import Dict, List, Tuple

from seo.jobs.models import RankSnapshot


class RankSnapshotStore:
    """Store contract (ABC). All operations are tenant-scoped."""

    def add(self, snapshot: RankSnapshot) -> RankSnapshot:  # pragma: no cover - abstract
        raise NotImplementedError

    def history(self, tenant_id: str, keyword: str, url: str) -> List[RankSnapshot]:  # pragma: no cover - abstract
        raise NotImplementedError


class InMemoryRankStore(RankSnapshotStore):
    """Non-durable, process-local snapshot store.

    Keyed by ``(tenant_id, keyword, url)`` so reads/writes for one tenant can
    never leak into another. Each ``add`` assigns a monotonic ``captured_seq``
    (process-wide) so ordering is deterministic without wall-clock time.
    Insertion order is preserved by appending to per-key lists.
    """

    def __init__(self) -> None:
        self._by_key: Dict[Tuple[str, str, str], List[RankSnapshot]] = {}
        self._seq = 0

    def _key(self, tenant_id: str, keyword: str, url: str) -> Tuple[str, str, str]:
        return (tenant_id, keyword, url)

    def add(self, snapshot: RankSnapshot) -> RankSnapshot:
        self._seq += 1
        snapshot.captured_seq = self._seq
        key = self._key(snapshot.tenant_id, snapshot.keyword, snapshot.url)
        self._by_key.setdefault(key, []).append(snapshot)
        return snapshot

    def history(self, tenant_id: str, keyword: str, url: str) -> List[RankSnapshot]:
        key = self._key(tenant_id, keyword, url)
        # Return a copy in insertion order; tenant-scoped by construction.
        return list(self._by_key.get(key, []))


_STORE_SINGLETON: InMemoryRankStore = InMemoryRankStore()


def get_rank_store() -> InMemoryRankStore:
    """Process-singleton in-memory store (swap for durable store later)."""
    return _STORE_SINGLETON
