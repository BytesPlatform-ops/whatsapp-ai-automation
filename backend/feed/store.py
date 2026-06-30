"""In-memory feed state — per-tenant business signals + card status overrides.

Mirrors the channels/store.py seam: a process-wide singleton, swappable for an
isolated instance in tests. Persistence (Supabase/Prisma FeedCard shapes) lands
later; the API contract stays identical.
"""

from __future__ import annotations

from typing import Optional

from .schemas import BusinessSignals


class InMemoryFeedStore:
    def __init__(self) -> None:
        self._signals: dict[str, BusinessSignals] = {}
        # tenant -> {card_id: status}  (skipped | approved | completed | dismissed)
        self._status: dict[str, dict[str, str]] = {}

    def get_signals(self, tenant_id: str) -> BusinessSignals:
        return self._signals.get(tenant_id) or BusinessSignals()

    def set_signals(self, tenant_id: str, signals: BusinessSignals) -> BusinessSignals:
        self._signals[tenant_id] = signals
        return signals

    def get_statuses(self, tenant_id: str) -> dict[str, str]:
        return self._status.get(tenant_id, {})

    def set_status(self, tenant_id: str, card_id: str, status: str) -> None:
        self._status.setdefault(tenant_id, {})[card_id] = status


_store: Optional[InMemoryFeedStore] = None


def get_feed_store() -> InMemoryFeedStore:
    global _store
    if _store is None:
        _store = InMemoryFeedStore()
    return _store
