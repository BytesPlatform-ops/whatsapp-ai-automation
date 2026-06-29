"""Production HTTP surface for the Content Creator — stages 1-7.

One standalone `APIRouter(prefix="/api/content-creator")`. NOT registered in the
shared app.py (that file is owned by another dev) — the lead adds one
`include_router` line manually. Every endpoint is tenant-scoped. AI runs through
the fallback-safe agents ($0 under PIXIE_MODEL_MODE=fake). Gate enforcement:
script generation requires an APPROVED idea. Nothing here spends or posts.

Persistence is the in-memory store seam (content_creator.store); saves/gets
return (id, model) tuples since the schemas carry no id field.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field

from .agents.idea_agent import generate_ideas
from .agents.scoring_agent import score_idea
from .agents.script_agent import generate_script
from .config import status_banner
from .cost.estimator import estimate_cost
from .enums import ApprovalGate, ApprovalStatus, IdentitySource, ProviderMode
from .integrations.trends import gather_trends
from .schemas import (
    ApprovalRecord,
    CreatorProfile,
    Idea,
    InfluencerIdentity,
    ProviderConnection,
    Script,
)
from .store import (
    _stable_id,
    get_approval_repository,
    get_idea_repository,
    get_identity_repository,
    get_profile_repository,
    get_provider_repository,
    get_script_repository,
)

router = APIRouter(prefix="/api/content-creator", tags=["content_creator"])


# --------------------------------------------------------------------------- #
# Request bodies (tenant_id carried on every write)
# --------------------------------------------------------------------------- #
class _Body(BaseModel):
    model_config = ConfigDict(extra="ignore")
    tenant_id: str = Field(..., min_length=1)


class ProfileBody(_Body):
    business_name: str = ""
    business_type: str = ""
    product_or_service: str = ""
    target_audience: str = ""
    niche: str = ""
    content_goal: str = ""
    brand_tone: str = ""
    language: str = "en"
    selling_points: List[str] = Field(default_factory=list)
    competitors: List[str] = Field(default_factory=list)
    cta_style: str = ""
    compliance_notes: str = ""


class ReferenceBody(_Body):
    reference_ref: str = Field(..., min_length=1)


class CharacteristicsBody(_Body):
    gender: str = ""
    approx_age: str = ""
    look: str = ""
    style: str = ""
    vibe: str = ""
    ethnicity: str = ""
    outfit: str = ""
    personality: str = ""
    voice_feel: str = ""
    content_persona: str = ""


class ProviderBody(_Body):
    mode: ProviderMode = ProviderMode.PIXIE_ACCOUNT
    connection_type: str = "mock"


class IdeasGenerateBody(_Body):
    seeds: List[str] = Field(default_factory=list)


class DecisionBody(_Body):
    note: str = ""


class ScriptGenerateBody(_Body):
    idea_id: str = Field(..., min_length=1)


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def _profile_dict(tenant_id: str) -> Dict[str, Any]:
    found = get_profile_repository().get_active(tenant_id)
    return found[1].model_dump() if found else {}


# --------------------------------------------------------------------------- #
# Stage 1 — Intake / profile
# --------------------------------------------------------------------------- #
@router.post("/profile")
def create_profile(body: ProfileBody) -> dict:
    profile = CreatorProfile(**body.model_dump())
    pid, stored = get_profile_repository().save(profile)
    return {"id": pid, "profile": stored.model_dump()}


@router.get("/profile")
def get_profile(tenant_id: str = Query(..., min_length=1)) -> dict:
    found = get_profile_repository().get_active(tenant_id)
    if not found:
        raise HTTPException(status_code=404, detail="no profile for tenant")
    return {"id": found[0], "profile": found[1].model_dump()}


# --------------------------------------------------------------------------- #
# Stage 2 — Influencer setup → exactly one locked identity
# --------------------------------------------------------------------------- #
@router.post("/influencer/upload-reference")
def upload_reference(body: ReferenceBody) -> dict:
    identity = InfluencerIdentity(
        tenant_id=body.tenant_id,
        source=IdentitySource.REFERENCE_IMAGE,
        reference_ref=body.reference_ref,
        active=True,
        locked=True,
    )
    iid, stored = get_identity_repository().save(identity)
    return {"id": iid, "identity": stored.model_dump()}


@router.post("/influencer/from-characteristics")
def from_characteristics(body: CharacteristicsBody) -> dict:
    chars = body.model_dump()
    chars.pop("tenant_id", None)
    # Deterministic generated-character reference (mock — no image API).
    ref = _stable_id("gen-", body.tenant_id, repr(sorted(chars.items())))
    identity = InfluencerIdentity(
        tenant_id=body.tenant_id,
        source=IdentitySource.GENERATED_CHARACTER,
        reference_ref=ref,
        characteristics=chars,
        active=True,
        locked=True,
    )
    iid, stored = get_identity_repository().save(identity)
    return {"id": iid, "identity": stored.model_dump()}


@router.get("/influencer")
def get_influencer(tenant_id: str = Query(..., min_length=1)) -> dict:
    found = get_identity_repository().get_active(tenant_id)
    if not found:
        raise HTTPException(status_code=404, detail="no active identity for tenant")
    return {"id": found[0], "identity": found[1].model_dump()}


# --------------------------------------------------------------------------- #
# Stage 3 — Provider connection (+ credit/price display for Pixie mode)
# --------------------------------------------------------------------------- #
@router.post("/provider/connect")
def connect_provider(body: ProviderBody) -> dict:
    est = estimate_cost(provider_mode=body.mode, model="standard", duration_seconds=15)
    conn = ProviderConnection(
        tenant_id=body.tenant_id,
        mode=body.mode,
        connection_type=body.connection_type,
        connected=True,
        estimated_credits=est["estimated_credits"],
        estimated_provider_cost=est["estimated_provider_cost"],
        pixie_markup=est["pixie_markup"],
        final_price=est["final_user_price"],
    )
    cid, stored = get_provider_repository().save(conn)
    return {"id": cid, "provider": stored.model_dump()}


@router.get("/provider")
def get_provider(tenant_id: str = Query(..., min_length=1)) -> dict:
    found = get_provider_repository().get_active(tenant_id)
    if not found:
        raise HTTPException(status_code=404, detail="no provider connection for tenant")
    return {"id": found[0], "provider": found[1].model_dump()}


# --------------------------------------------------------------------------- #
# Stage 4 — Idea generation  /  Stage 5 — Gate 1 idea approval
# --------------------------------------------------------------------------- #
@router.post("/ideas/generate")
def ideas_generate(body: IdeasGenerateBody) -> dict:
    profile = _profile_dict(body.tenant_id)
    trends = gather_trends(profile, seeds=body.seeds)
    repo = get_idea_repository()
    history = [i.title for (_id, i) in repo.list(body.tenant_id)]
    raw = generate_ideas(profile, trends=trends, history=history)
    out = []
    for item in raw:
        scored = score_idea(item, profile)
        idea = Idea(
            tenant_id=body.tenant_id,
            title=item.get("title", ""),
            angle=item.get("angle", ""),
            hook=item.get("hook", ""),
            score=int(scored.get("score", item.get("score", 0)) or 0),
            source="agent",
            approval_status=ApprovalStatus.PENDING,
        )
        iid, stored = repo.save(idea)
        out.append({"id": iid, "idea": stored.model_dump(), "reasons": scored.get("reasons", [])})
    out.sort(key=lambda x: x["idea"]["score"], reverse=True)
    return {"tenant_id": body.tenant_id, "ideas": out}


@router.get("/ideas")
def list_ideas(tenant_id: str = Query(..., min_length=1)) -> dict:
    rows = get_idea_repository().list(tenant_id)
    return {"tenant_id": tenant_id, "ideas": [{"id": i, "idea": m.model_dump()} for (i, m) in rows]}


def _decide_idea(idea_id: str, body: DecisionBody, status: ApprovalStatus) -> dict:
    updated = get_idea_repository().set_status(body.tenant_id, idea_id, status)
    if updated is None:
        raise HTTPException(status_code=404, detail="idea not found for tenant")
    get_approval_repository().record(
        body.tenant_id, ApprovalGate.IDEA, idea_id, status, note=body.note
    )
    return {"id": idea_id, "idea": updated.model_dump()}


@router.post("/ideas/{idea_id}/approve")
def approve_idea(idea_id: str, body: DecisionBody) -> dict:
    return _decide_idea(idea_id, body, ApprovalStatus.APPROVED)


@router.post("/ideas/{idea_id}/reject")
def reject_idea(idea_id: str, body: DecisionBody) -> dict:
    return _decide_idea(idea_id, body, ApprovalStatus.REJECTED)


# --------------------------------------------------------------------------- #
# Stage 6 — Script generation  /  Stage 7 — Gate 2 script approval
# --------------------------------------------------------------------------- #
@router.post("/scripts/generate")
def scripts_generate(body: ScriptGenerateBody) -> dict:
    found = get_idea_repository().get(body.tenant_id, body.idea_id)
    if found is None:
        raise HTTPException(status_code=404, detail="idea not found for tenant")
    idea = found[1]
    # GATE 1 enforcement: no script until the idea is APPROVED.
    if idea.approval_status != ApprovalStatus.APPROVED:
        raise HTTPException(
            status_code=409,
            detail={
                "error": "gate_blocked",
                "gate": ApprovalGate.IDEA.value,
                "detail": "Idea must be approved (Gate 1) before script generation.",
            },
        )
    profile = _profile_dict(body.tenant_id)
    drafted = generate_script(idea.model_dump(), profile)
    script = Script(
        tenant_id=body.tenant_id,
        idea_ref=body.idea_id,
        hook=drafted.get("hook", ""),
        body=drafted.get("body", ""),
        cta=drafted.get("cta", ""),
        word_count=int(drafted.get("word_count", 0) or 0),
        approx_seconds=int(drafted.get("approx_seconds", 15) or 15),
        approval_status=ApprovalStatus.PENDING,
    )
    sid, stored = get_script_repository().save(script)
    return {"id": sid, "script": stored.model_dump()}


@router.get("/scripts/{script_id}")
def get_script(script_id: str, tenant_id: str = Query(..., min_length=1)) -> dict:
    found = get_script_repository().get(tenant_id, script_id)
    if found is None:
        raise HTTPException(status_code=404, detail="script not found for tenant")
    return {"id": found[0], "script": found[1].model_dump()}


def _decide_script(script_id: str, body: DecisionBody, status: ApprovalStatus) -> dict:
    updated = get_script_repository().set_status(body.tenant_id, script_id, status)
    if updated is None:
        raise HTTPException(status_code=404, detail="script not found for tenant")
    get_approval_repository().record(
        body.tenant_id, ApprovalGate.SCRIPT, script_id, status, note=body.note
    )
    return {"id": script_id, "script": updated.model_dump()}


@router.post("/scripts/{script_id}/approve")
def approve_script(script_id: str, body: DecisionBody) -> dict:
    return _decide_script(script_id, body, ApprovalStatus.APPROVED)


@router.post("/scripts/{script_id}/reject")
def reject_script(script_id: str, body: DecisionBody) -> dict:
    return _decide_script(script_id, body, ApprovalStatus.REJECTED)


# --------------------------------------------------------------------------- #
# Status
# --------------------------------------------------------------------------- #
@router.get("/status")
def status() -> dict:
    return status_banner()
