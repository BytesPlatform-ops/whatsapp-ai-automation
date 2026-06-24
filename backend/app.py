"""Pixie backend — FastAPI entry point.

Step 2 exposes the generation pipe: POST /v1/generate takes a plain-language
`Request` and returns the produced `Site` plus a `usage` envelope (latency, cost,
per-step events) so cost-per-request is visible from the very first call.
"""

from __future__ import annotations

import os

from fastapi import FastAPI
from pydantic import BaseModel, Field

from orchestrator import Orchestrator
from receptionist.api import router as receptionist_router
from receptionist.campaigns.api import router as campaigns_router
from receptionist.onboarding.api import router as onboarding_router
from schemas import Request, Site, UsageEvent

app = FastAPI(title="Pixie Backend", version="0.2.0")
app.include_router(receptionist_router)
app.include_router(onboarding_router)
app.include_router(campaigns_router)


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
