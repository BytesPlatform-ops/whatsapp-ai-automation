"""Pixie backend — FastAPI entry point.

Step 2 exposes the generation pipe: POST /v1/generate takes a plain-language
`Request` and returns the produced `Site` plus a `usage` envelope (latency, cost,
per-step events) so cost-per-request is visible from the very first call.
"""

from __future__ import annotations

import os

from fastapi import FastAPI
from pydantic import BaseModel, Field

from activity.router import router as activity_router
from approvals.router import router as approvals_router
from channels.api import router as channels_router
from entitlements.router import router as entitlements_router
from feed.router import router as feed_router
from orchestrator import Orchestrator
from receptionist.api import router as receptionist_router
from receptionist.campaigns.api import router as campaigns_router
from receptionist.onboarding.api import router as onboarding_router
from content_creator.router import router as content_creator_router
from schemas import Request, Site, UsageEvent
from seo.router import router as seo_router

app = FastAPI(title="Pixie Backend", version="0.2.0")
app.include_router(receptionist_router)
app.include_router(onboarding_router)
app.include_router(campaigns_router)
app.include_router(seo_router)
app.include_router(content_creator_router)
app.include_router(channels_router)  # /api/channels — agent/channel readiness for the dashboard
app.include_router(feed_router)  # /api/feed — Pixie Lab proactive recommendation feed
app.include_router(entitlements_router)  # /api/entitlements — agent trial/purchase gating
app.include_router(approvals_router)  # /api/approvals — risky-action approval gate
app.include_router(activity_router)  # /api/activity — tenant activity log


class UsageSummary(BaseModel):
    latency_ms: int
    cost_usd: float
    events: list[UsageEvent]


class GenerateResponse(BaseModel):
    """Response envelope — the agent reply, the Site, and what it cost to make it."""

    reply: str = Field(default="", description="One short friendly line from the agent.")
    site: Site
    usage: UsageSummary = Field(..., description="Latency + cost + per-step usage events.")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "model_mode": os.getenv("PIXIE_MODEL_MODE", "fake")}


@app.post("/v1/generate", response_model=GenerateResponse)
async def generate(request: Request) -> GenerateResponse:
    """Build (or, later, edit) a site from a plain-language message."""
    outcome = await Orchestrator().handle(request)
    return GenerateResponse(
        reply=outcome.reply,
        site=outcome.site,
        usage=UsageSummary(
            latency_ms=outcome.latency_ms,
            cost_usd=outcome.cost_usd,
            events=outcome.recorder.events,
        ),
    )
