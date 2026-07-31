"""Marketing Brain HTTP surface — the unified intelligence for the Command Center.

  POST /api/meta/marketing/analyze                 → run local analysis, refresh recs + brand view
  GET  /api/meta/marketing/brain                    → the enriched brand view
  GET  /api/meta/marketing/recommendations          → stored recommendations
  POST /api/meta/marketing/recommendations/{id}/approve
  POST /api/meta/marketing/recommendations/{id}/skip
  GET  /api/meta/marketing/state                     → last analysis state

Analysis is LOCAL-FIRST — no external model call — so it always returns fast and
never depends on an LLM being reachable. Read-only over Meta; creates/publishes
nothing. Ideas + calendar generation stay at their existing endpoints
(/api/meta/ideas, /api/meta/calendar), which the Command Center also uses.
"""

from __future__ import annotations

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from . import business_profile
from . import marketing_brain as brain

router = APIRouter(prefix="/api/meta/marketing", tags=["meta-marketing-brain"])


class TenantBody(BaseModel):
    tenant_id: str


@router.post("/analyze")
async def analyze(body: TenantBody) -> dict:
    return await brain.analyze(body.tenant_id)


# ── Business profile / onboarding ─────────────────────────────────────────────

@router.get("/profile")
def get_profile(tenant_id: str = Query(...)) -> dict:
    return business_profile.get_profile(tenant_id)


class ProfileBody(BaseModel):
    tenant_id: str
    answers: dict = Field(default_factory=dict)


@router.post("/profile")
def save_profile(body: ProfileBody) -> dict:
    return business_profile.update_profile(body.tenant_id, body.answers)


@router.get("/brain")
def get_brain(tenant_id: str = Query(...)) -> dict:
    return brain.get_brain(tenant_id)


@router.get("/recommendations")
def recommendations(tenant_id: str = Query(...)) -> dict:
    return brain.get_recommendations(tenant_id)


@router.post("/recommendations/{rec_id}/approve")
def approve_rec(rec_id: str, body: TenantBody) -> dict:
    return brain.set_recommendation_status(body.tenant_id, rec_id, "approved")


@router.post("/recommendations/{rec_id}/skip")
def skip_rec(rec_id: str, body: TenantBody) -> dict:
    return brain.set_recommendation_status(body.tenant_id, rec_id, "skipped")


@router.get("/state")
def analysis_state(tenant_id: str = Query(...)) -> dict:
    return brain.get_analysis_state(tenant_id)
