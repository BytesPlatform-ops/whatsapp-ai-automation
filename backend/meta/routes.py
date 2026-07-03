"""Meta Marketing Agent + analytics HTTP surface.

  POST /api/agents/marketing/meta/analyze                 analyze connected assets (AI)
  POST /api/agents/marketing/meta/prepare-post            draft a post/reel → approval
  POST /api/agents/marketing/meta/comments/prepare-reply  draft a comment reply → approval
  GET  /api/meta/analytics/summary                        organic + ads summary
  GET  /api/meta/ads/insights                             read-only ads summary
  GET  /api/meta/webhooks                                 webhook verification challenge
  POST /api/meta/webhooks                                 log inbound events (no auto-reply)
"""

from __future__ import annotations

import os

from fastapi import APIRouter, Query, Request
from fastapi.responses import PlainTextResponse

from activity.router import log_activity

from . import insights
from . import marketing_agent as agent
from .schemas import AnalyzeBody, PreparePostBody, PrepareReplyBody

agent_router = APIRouter(prefix="/api/agents/marketing/meta", tags=["marketing-agent"])
meta_data_router = APIRouter(prefix="/api/meta", tags=["meta"])


@agent_router.post("/analyze")
async def analyze(body: AnalyzeBody) -> dict:
    return await agent.analyze(body)


@agent_router.post("/prepare-post")
async def prepare_post(body: PreparePostBody) -> dict:
    return await agent.prepare_post(body)


@agent_router.post("/comments/prepare-reply")
async def prepare_reply(body: PrepareReplyBody) -> dict:
    return await agent.prepare_comment_reply(body)


@meta_data_router.get("/analytics/summary")
def analytics_summary(tenant_id: str = Query(...), asset_id: str = Query(default=""),
                      range: str = Query(default="last_30_days")) -> dict:
    return insights.analytics_summary(tenant_id, asset_id, range)


@meta_data_router.get("/ads/insights")
def ads_insights(tenant_id: str = Query(...), ad_account_id: str = Query(default=""),
                 range: str = Query(default="last_30_days")) -> dict:
    return insights.ads_insights(tenant_id, ad_account_id, range)


@meta_data_router.get("/webhooks")
def webhook_verify(request: Request):
    """Meta webhook verification handshake."""
    params = request.query_params
    if (params.get("hub.mode") == "subscribe"
            and params.get("hub.verify_token") == os.getenv("META_WEBHOOK_VERIFY_TOKEN", "")
            and os.getenv("META_WEBHOOK_VERIFY_TOKEN")):
        return PlainTextResponse(params.get("hub.challenge", ""))
    return PlainTextResponse("verification failed", status_code=403)


@meta_data_router.post("/webhooks")
async def webhook_receive(request: Request) -> dict:
    """Log inbound Meta events as internal signals. MVP: no auto-reply."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    obj = body.get("object", "unknown")
    log_activity("system", "meta_webhook", title=f"Meta webhook: {obj}", agent="marketing-agent")
    return {"ok": True, "received": obj}
