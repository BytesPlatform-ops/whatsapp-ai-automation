"""Tenant-scoped persistence seam for content items.

Mirrors ``marketing/profile/repository.py``: in-memory, process-local, tenant-scoped
on every read/write. A durable implementation drops in behind the SAME method
surface later without touching callers. Stdlib only; no secrets stored here.

Id is deterministic on ``(tenant_id, campaign_id, content_type, hook, version)`` so
re-saving the same logical item updates its row instead of duplicating.
"""

from __future__ import annotations

import hashlib
from typing import Dict, List, Optional

from .schemas import ContentItem


def _stable_id(*parts: str) -> str:
    raw = "|".join(p for p in parts if p)
    return "cont_" + hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]


class InMemoryContentRepository:
    """Non-durable, process-local content store. Tenant-scoped on every read/write."""

    def __init__(self) -> None:
        self._items: Dict[str, ContentItem] = {}  # content_id -> item

    def save_content(self, item: ContentItem) -> ContentItem:
        """Upsert a content item. Same logical key → same id → update."""
        content_id = item.id or _stable_id(
            item.tenant_id,
            item.campaign_id or "",
            str(item.content_type),
            (item.hook or "")[:80],
            (item.main_copy or "")[:80],
            str(item.version),
        )
        stored = item.model_copy(update={"id": content_id})
        self._items[content_id] = stored
        return stored

    def get_content(self, tenant_id: str, content_id: str) -> Optional[ContentItem]:
        item = self._items.get(content_id)
        # Not found OR belongs to another tenant → indistinguishable "not found".
        if item is None or item.tenant_id != tenant_id:
            return None
        return item

    def list_content(self, tenant_id: str, campaign_id: Optional[str] = None) -> List[ContentItem]:
        items = [c for c in self._items.values() if c.tenant_id == tenant_id]
        if campaign_id is not None:
            items = [c for c in items if c.campaign_id == campaign_id]
        return items


_repo: Optional[InMemoryContentRepository] = None


def get_content_repository() -> InMemoryContentRepository:
    """Process-wide repository (cheap; one instance is fine)."""
    global _repo
    if _repo is None:
        _repo = InMemoryContentRepository()
    return _repo
