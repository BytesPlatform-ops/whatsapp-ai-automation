"""KVList — a small per-tenant list store backed by the pixie_kv collection.

Same durability model as meta/store.py and meta/brand_brain.py: an in-process
snapshot cache (so data survives across requests even in hermetic memory mode)
backed by persistence.load/save (durable in file/supabase mode). One JSONB blob
per collection name, keyed by tenant → list of record dicts.

Used for the Idea Curator and Content Calendar — low-volume, per-workspace lists
that don't warrant their own Postgres tables (no schema change).
"""

from __future__ import annotations

from typing import Optional

import persistence


class KVList:
    def __init__(self, name: str) -> None:
        self._name = name
        self._cache: Optional[dict] = None

    def _snap(self) -> dict:
        if self._cache is None:
            self._cache = persistence.load(self._name, {}) or {}
        return self._cache

    def _persist(self) -> None:
        persistence.save(self._name, self._snap())

    def list(self, tenant_id: str) -> list[dict]:
        return list(self._snap().get(tenant_id, []))

    def get(self, tenant_id: str, item_id: str) -> Optional[dict]:
        for it in self._snap().get(tenant_id, []):
            if it.get("id") == item_id:
                return it
        return None

    def add(self, tenant_id: str, item: dict) -> dict:
        items = self._snap().setdefault(tenant_id, [])
        items.insert(0, item)
        self._persist()
        return item

    def add_many(self, tenant_id: str, new_items: list[dict]) -> list[dict]:
        items = self._snap().setdefault(tenant_id, [])
        items[:0] = new_items  # newest first
        self._persist()
        return new_items

    def replace(self, tenant_id: str, items: list[dict]) -> list[dict]:
        self._snap()[tenant_id] = list(items)
        self._persist()
        return items

    def update(self, tenant_id: str, item_id: str, patch: dict) -> Optional[dict]:
        for it in self._snap().get(tenant_id, []):
            if it.get("id") == item_id:
                it.update(patch)
                self._persist()
                return it
        return None

    def delete(self, tenant_id: str, item_id: str) -> bool:
        items = self._snap().get(tenant_id, [])
        kept = [it for it in items if it.get("id") != item_id]
        if len(kept) == len(items):
            return False
        self._snap()[tenant_id] = kept
        self._persist()
        return True

    def clear(self, tenant_id: str) -> None:
        self._snap().pop(tenant_id, None)
        self._persist()

    # Test helper — drop the in-process cache so it reloads from persistence.
    def _reset_cache(self) -> None:
        self._cache = None
