"""FastAPI router for the Content Creator demo console — HTTP boundary.

The lead mounts this router at prefix ``/demo`` (so the effective paths are
``/demo/api/content-creator/*``). It holds an in-memory ``_STATES`` dict keyed by
tenant and drives the deterministic core pipeline (``run_stage``) through every
one of the 13 stages plus the 4 owner-approval gates.

Safety: this layer never calls a real provider and never spends. Any attempt to
run a stage whose blocking gate is not APPROVED surfaces the core ``GateError``
as an HTTP **409** — that's the visible proof the gates work (notably: no video
generation before Gate 3 / PRODUCTION).
"""

from __future__ import annotations

import hashlib
from typing import Dict, Optional

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from ..config import status_banner
from ..enums import ApprovalGate, ApprovalStatus, PipelineStage
from ..agents.agent_log import get_agent_log_store
from ..pipeline.gates import GateError, set_approval
from ..pipeline.orchestrator import run_stage
from ..pipeline.stages import PipelineState, progress_view

router = APIRouter()

DEFAULT_TENANT = "demo"

# Module-level in-memory state, keyed by tenant. Demo-only; no persistence.
_STATES: Dict[str, PipelineState] = {}


def _get_state(tenant: str) -> PipelineState:
    """Return (creating if needed) the PipelineState for ``tenant``."""
    state = _STATES.get(tenant)
    if state is None:
        state = PipelineState(tenant_id=tenant)
        _STATES[tenant] = state
    return state


def _envelope(state: PipelineState) -> dict:
    """Standard success body: banner + progress + the current state dict."""
    return {
        "banner": status_banner(),
        "progress": progress_view(),
        "state": state.to_dict(),
    }


def _gate_blocked(exc: GateError) -> JSONResponse:
    """Map a core GateError onto the agreed 409 contract."""
    return JSONResponse(
        status_code=409,
        content={"error": "gate_blocked", "detail": str(exc)},
    )


# ---------------------------------------------------------------------------
# Request bodies (loose by design — this is a mock console, not production).
# ---------------------------------------------------------------------------

class ProfileBody(BaseModel):
    brand: str = ""
    niche: str = ""
    tone: str = "friendly"
    language: str = "en"
    audience: str = ""
    goals: str = ""

    class Config:
        extra = "allow"


class ReferenceBody(BaseModel):
    reference_ref: str = Field(default="ref-image-001")


class CharacteristicsBody(BaseModel):
    gender: str = ""
    age: str = ""
    look: str = ""
    ethnicity: str = ""
    style: str = ""

    class Config:
        extra = "allow"


class ProviderBody(BaseModel):
    mode: str = "pixie_account"
    connection_type: str = "mock"

    class Config:
        extra = "allow"


class IdeaApproveBody(BaseModel):
    idea_index: Optional[int] = None


class ScheduleBody(BaseModel):
    platforms: list = Field(default_factory=lambda: ["meta", "instagram"])
    scheduled_time: str = ""


# ---------------------------------------------------------------------------
# State / lifecycle
# ---------------------------------------------------------------------------

@router.get("/api/content-creator/state")
def get_state(tenant: str = Query(default=DEFAULT_TENANT)) -> dict:
    state = _get_state(tenant)
    return _envelope(state)


@router.post("/api/content-creator/reset")
def reset(tenant: str = Query(default=DEFAULT_TENANT)) -> dict:
    state = PipelineState(tenant_id=tenant)
    _STATES[tenant] = state
    return _envelope(state)


# ---------------------------------------------------------------------------
# Stage 1 — Intake
# ---------------------------------------------------------------------------

@router.post("/api/content-creator/profile")
def set_profile(body: ProfileBody, tenant: str = Query(default=DEFAULT_TENANT)) -> dict:
    state = _get_state(tenant)
    state.profile = body.model_dump()
    run_stage(state, PipelineStage.INTAKE)
    return _envelope(state)


# ---------------------------------------------------------------------------
# Stage 2 — Influencer setup (two paths)
# ---------------------------------------------------------------------------

@router.post("/api/content-creator/influencer/reference")
def influencer_reference(
    body: ReferenceBody, tenant: str = Query(default=DEFAULT_TENANT)
) -> dict:
    state = _get_state(tenant)
    state.identity = {
        "source": "reference_image",
        "reference_ref": body.reference_ref,
        "locked": True,
    }
    run_stage(state, PipelineStage.INFLUENCER_SETUP)
    return _envelope(state)


@router.post("/api/content-creator/influencer/characteristics")
def influencer_characteristics(
    body: CharacteristicsBody, tenant: str = Query(default=DEFAULT_TENANT)
) -> dict:
    state = _get_state(tenant)
    characteristics = body.model_dump()
    digest = hashlib.sha1(
        repr(sorted(characteristics.items())).encode("utf-8")
    ).hexdigest()[:10]
    state.identity = {
        "source": "generated_character",
        "reference_ref": "gen-" + digest,
        "characteristics": characteristics,
        "locked": True,
    }
    run_stage(state, PipelineStage.INFLUENCER_SETUP)
    return _envelope(state)


# ---------------------------------------------------------------------------
# Stage 3 — Provider connection
# ---------------------------------------------------------------------------

@router.post("/api/content-creator/provider")
def set_provider(body: ProviderBody, tenant: str = Query(default=DEFAULT_TENANT)) -> dict:
    state = _get_state(tenant)
    state.provider = body.model_dump()
    run_stage(state, PipelineStage.PROVIDER_CONNECTION)
    return _envelope(state)


# ---------------------------------------------------------------------------
# Stage 4 — Idea generation  /  Stage 5 — Gate 1 idea approval
# ---------------------------------------------------------------------------

@router.post("/api/content-creator/ideas/generate")
def ideas_generate(tenant: str = Query(default=DEFAULT_TENANT)) -> dict:
    state = _get_state(tenant)
    try:
        run_stage(state, PipelineStage.IDEA_GENERATION)
    except GateError as exc:  # ungated, but defensive
        return _gate_blocked(exc)
    return _envelope(state)


@router.post("/api/content-creator/ideas/approve")
def ideas_approve(
    body: Optional[IdeaApproveBody] = None,
    tenant: str = Query(default=DEFAULT_TENANT),
) -> dict:
    state = _get_state(tenant)
    if body is not None and body.idea_index is not None:
        state.profile["selected_idea_index"] = body.idea_index
    set_approval(state, ApprovalGate.IDEA, ApprovalStatus.APPROVED)
    run_stage(state, PipelineStage.IDEA_APPROVAL)
    return _envelope(state)


# ---------------------------------------------------------------------------
# Stage 6 — Script generation  /  Stage 7 — Gate 2 script approval
# ---------------------------------------------------------------------------

@router.post("/api/content-creator/scripts/generate")
def scripts_generate(tenant: str = Query(default=DEFAULT_TENANT)):
    state = _get_state(tenant)
    try:
        run_stage(state, PipelineStage.SCRIPT_GENERATION)
    except GateError as exc:
        return _gate_blocked(exc)
    return _envelope(state)


@router.post("/api/content-creator/scripts/approve")
def scripts_approve(tenant: str = Query(default=DEFAULT_TENANT)) -> dict:
    state = _get_state(tenant)
    set_approval(state, ApprovalGate.SCRIPT, ApprovalStatus.APPROVED)
    run_stage(state, PipelineStage.SCRIPT_APPROVAL)
    return _envelope(state)


# ---------------------------------------------------------------------------
# Stage 8 — Cost estimate (Gate 3 / PRODUCTION guards the next stage)
# ---------------------------------------------------------------------------

@router.post("/api/content-creator/cost-estimate")
def cost_estimate(tenant: str = Query(default=DEFAULT_TENANT)):
    state = _get_state(tenant)
    try:
        run_stage(state, PipelineStage.COST_ESTIMATE)
    except GateError as exc:
        return _gate_blocked(exc)
    return _envelope(state)


@router.post("/api/content-creator/production/approve")
def production_approve(tenant: str = Query(default=DEFAULT_TENANT)) -> dict:
    state = _get_state(tenant)
    set_approval(state, ApprovalGate.PRODUCTION, ApprovalStatus.APPROVED)
    return _envelope(state)


# ---------------------------------------------------------------------------
# Stage 9 — Video generation (BLOCKED until Gate 3 — proves no spend)
# Stage 10 — Quality check
# ---------------------------------------------------------------------------

@router.post("/api/content-creator/videos/generate")
def videos_generate(tenant: str = Query(default=DEFAULT_TENANT)):
    state = _get_state(tenant)
    try:
        run_stage(state, PipelineStage.VIDEO_GENERATION)
    except GateError as exc:
        return _gate_blocked(exc)
    return _envelope(state)


@router.post("/api/content-creator/videos/quality-check")
def videos_quality_check(tenant: str = Query(default=DEFAULT_TENANT)):
    state = _get_state(tenant)
    try:
        run_stage(state, PipelineStage.QUALITY_CHECK)
    except GateError as exc:  # ungated, but defensive
        return _gate_blocked(exc)
    return _envelope(state)


@router.post("/api/content-creator/videos/publish-approve")
def videos_publish_approve(tenant: str = Query(default=DEFAULT_TENANT)) -> dict:
    state = _get_state(tenant)
    set_approval(state, ApprovalGate.PUBLISH, ApprovalStatus.APPROVED)
    run_stage(state, PipelineStage.PUBLISH_APPROVAL)
    return _envelope(state)


# ---------------------------------------------------------------------------
# Stage 12 — Posting (Gate 4 guards)  /  Stage 13 — Analytics
# ---------------------------------------------------------------------------

@router.post("/api/content-creator/posts/schedule")
def posts_schedule(
    body: Optional[ScheduleBody] = None,
    tenant: str = Query(default=DEFAULT_TENANT),
):
    state = _get_state(tenant)
    if body is not None:
        state.profile["schedule"] = {
            "platforms": body.platforms,
            "scheduled_time": body.scheduled_time,
        }
    try:
        run_stage(state, PipelineStage.POSTING)
    except GateError as exc:
        return _gate_blocked(exc)
    return _envelope(state)


@router.post("/api/content-creator/analytics/sync")
def analytics_sync(tenant: str = Query(default=DEFAULT_TENANT)):
    state = _get_state(tenant)
    try:
        run_stage(state, PipelineStage.ANALYTICS)
    except GateError as exc:  # ungated, but defensive
        return _gate_blocked(exc)
    return _envelope(state)


# ---------------------------------------------------------------------------
# Logs
# ---------------------------------------------------------------------------

@router.get("/api/content-creator/logs")
def logs(tenant: str = Query(default=DEFAULT_TENANT)) -> dict:
    return {"tenant": tenant, "logs": get_agent_log_store().list(tenant)}
