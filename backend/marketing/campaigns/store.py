"""Tenant-scoped persistence seam for campaigns.

Mirrors ``marketing/profile/repository.py``: an in-memory, process-local store so
the module is functional today and tenant isolation is actually exercised. A
durable implementation (Prisma / Supabase) drops in behind the SAME method surface
in a later wave without touching callers. Stdlib only; no secrets stored here.

Id is deterministic on ``(tenant_id, name)`` so re-saving the same named campaign
updates its row instead of creating duplicates.
"""

from __future__ import annotations

import hashlib
from typing import Dict, List, Optional

from .schemas import Campaign


def _stable_id(*parts: str) -> str:
    raw = "|".join(p for p in parts if p)
    return "camp_" + hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]


class InMemoryCampaignRepository:
    """Non-durable, process-local campaign store. Tenant-scoped on every read/write."""

    def __init__(self) -> None:
        self._campaigns: Dict[str, Campaign] = {}  # campaign_id -> campaign

    def save_campaign(self, campaign: Campaign) -> Campaign:
        """Upsert a campaign. Same (tenant, name) → same id → update."""
        campaign_id = campaign.id or _stable_id(campaign.tenant_id, (campaign.name or "").strip().lower())
        stored = campaign.model_copy(update={"id": campaign_id})
        self._campaigns[campaign_id] = stored
        return stored

    def get_campaign(self, tenant_id: str, campaign_id: str) -> Optional[Campaign]:
        campaign = self._campaigns.get(campaign_id)
        # Not found OR belongs to another tenant → indistinguishable "not found".
        if campaign is None or campaign.tenant_id != tenant_id:
            return None
        return campaign

    def list_campaigns(self, tenant_id: str) -> List[Campaign]:
        return [c for c in self._campaigns.values() if c.tenant_id == tenant_id]


_repo: Optional[InMemoryCampaignRepository] = None


def get_campaign_repository() -> InMemoryCampaignRepository:
    """Process-wide repository (cheap; one instance is fine)."""
    global _repo
    if _repo is None:
        _repo = InMemoryCampaignRepository()
    return _repo
