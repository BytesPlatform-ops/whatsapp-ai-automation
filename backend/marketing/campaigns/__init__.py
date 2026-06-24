"""Campaign planner — turn a profile + a goal into a fully-assembled campaign.

The Brain reasons (one model call); this module deterministically assembles the
posting schedule, required assets, KPI targets and compliance notes. High-risk
industries start ``needs_review`` with a human-review note.
"""

from __future__ import annotations

from .planner import plan_campaign
from .schemas import (
    Campaign,
    CampaignPlanRequest,
    CampaignStatus,
    CampaignType,
)
from .store import (
    InMemoryCampaignRepository,
    get_campaign_repository,
)

__all__ = [
    "plan_campaign",
    "Campaign",
    "CampaignPlanRequest",
    "CampaignStatus",
    "CampaignType",
    "InMemoryCampaignRepository",
    "get_campaign_repository",
]
