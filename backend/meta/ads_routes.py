"""Meta Ads Marketing API HTTP surface (read + paused-create).

  GET  /api/meta/ad-accounts?tenant_id=
  GET  /api/meta/campaigns?tenant_id=&ad_account_id=act_...
  GET  /api/meta/insights?tenant_id=&ad_account_id=act_...&range=last_30d
  POST /api/meta/campaigns                         (creates a PAUSED campaign only)

All routes use the tenant's server-side token via meta.ads (the token is never
exposed here). Errors are structured: a body with `error` + `needs_reconnect` so
the dashboard can render reconnect / missing-permission / empty states. Kept in a
NEW router file (not routes.py) so it can be added without touching the existing
Meta data router.
"""

from __future__ import annotations

from fastapi import APIRouter, Query
from pydantic import BaseModel

from . import ads
from . import ads_agent

router = APIRouter(prefix="/api/meta", tags=["meta-ads"])


@router.get("/ad-accounts")
def ad_accounts(tenant_id: str = Query(...)) -> dict:
    return ads.list_ad_accounts(tenant_id)


@router.get("/campaigns")
def campaigns(tenant_id: str = Query(...), ad_account_id: str = Query(default="")) -> dict:
    return ads.list_campaigns(tenant_id, ad_account_id)


@router.get("/insights")
def insights(tenant_id: str = Query(...), ad_account_id: str = Query(default=""),
             range: str = Query(default="last_30d")) -> dict:
    return ads.ad_insights(tenant_id, ad_account_id, range)


class CreateCampaignBody(BaseModel):
    tenant_id: str
    ad_account_id: str = ""
    name: str
    objective: str = "OUTCOME_TRAFFIC"
    # NOTE: there is deliberately no `status` field — creation is always PAUSED.


@router.post("/campaigns")
def create_campaign(body: CreateCampaignBody) -> dict:
    return ads.create_campaign(body.tenant_id, body.ad_account_id, body.name, body.objective)


class AnalyzeAdsBody(BaseModel):
    tenant_id: str
    ad_account_id: str = ""
    range: str = "last_30d"


@router.post("/ads/analyze")
async def analyze_ads(body: AnalyzeAdsBody) -> dict:
    """Read-only Ads Assistant: signals + AI suggestions. Creates/changes NOTHING."""
    return await ads_agent.analyze_ads(body.tenant_id, body.ad_account_id, body.range)
