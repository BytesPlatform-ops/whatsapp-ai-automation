"""Tenant-scoped persistence seam for marketing business profiles.

Mirrors ``backend/seo/repository.py``: an in-memory, process-local store so the
module is functional today and tenant isolation is actually exercised. A durable
implementation (Prisma ``MarketingProfile`` / Supabase Postgres — see
/prisma/schema.prisma) drops in behind the SAME method surface in a later wave
without touching callers. Stdlib only; no secrets stored here.

Id is deterministic on ``(tenant_id, business_name)`` so re-saving the same
business updates its row instead of creating duplicates.
"""

from __future__ import annotations

import hashlib
from typing import Dict, List, Optional

from ..schemas import MarketingProfile


def _stable_id(*parts: str) -> str:
    raw = "|".join(p for p in parts if p)
    return "mprof_" + hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]


class InMemoryProfileRepository:
    """Non-durable, process-local profile store. Tenant-scoped on every read/write."""

    def __init__(self) -> None:
        self._profiles: Dict[str, MarketingProfile] = {}  # profile_id -> profile

    def save_profile(self, profile: MarketingProfile) -> MarketingProfile:
        """Upsert a profile. Same (tenant, business_name) → same id → update."""
        profile_id = profile.id or _stable_id(profile.tenant_id, profile.business_name.strip().lower())
        stored = profile.model_copy(update={"id": profile_id})
        self._profiles[profile_id] = stored
        return stored

    def get_profile(self, tenant_id: str, profile_id: str) -> Optional[MarketingProfile]:
        profile = self._profiles.get(profile_id)
        # Not found OR belongs to another tenant → indistinguishable "not found".
        if profile is None or profile.tenant_id != tenant_id:
            return None
        return profile

    def list_profiles(self, tenant_id: str) -> List[MarketingProfile]:
        return [p for p in self._profiles.values() if p.tenant_id == tenant_id]


_repo: Optional[InMemoryProfileRepository] = None


def get_profile_repository() -> InMemoryProfileRepository:
    """Process-wide repository (cheap; one instance is fine)."""
    global _repo
    if _repo is None:
        _repo = InMemoryProfileRepository()
    return _repo
