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
from .analytics.learning_loop import LearningLoop
from .analytics.metrics import sync_metrics
from .enums import (
    ApprovalGate,
    ApprovalStatus,
    IdentitySource,
    PlatformType,
    PostStatus,
    ProviderMode,
    QualityStatus,
    VideoStatus,
)
from .integrations.scheduler import schedule_posts
from .integrations.trends import gather_trends
from .providers.base import get_higgsfield_provider
from .providers.prompt_builder import build_higgsfield_prompt
from .quality.retry_ladder import run_quality_with_retries
from .schemas import (
    CreatorProfile,
    Idea,
    InfluencerIdentity,
    Learning,
    Metric,
    Post,
    ProviderConnection,
    QualityCheck,
    Script,
    Video,
)
from .store import (
    _stable_id,
    get_approval_repository,
    get_idea_repository,
    get_identity_repository,
    get_learning_repository,
    get_metric_repository,
    get_post_repository,
    get_profile_repository,
    get_provider_repository,
    get_quality_repository,
    get_script_repository,
    get_video_repository,
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


class CostEstimateBody(_Body):
    script_id: str = ""
    duration_seconds: int = 15
    retry_budget: int = 2


class VideoGenerateBody(_Body):
    script_id: str = Field(..., min_length=1)


class ScheduleBody(_Body):
    video_id: str = Field(..., min_length=1)
    platforms: List[str] = Field(default_factory=lambda: ["meta", "instagram"])
    scheduled_time: str = ""


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


def _gate_approved(tenant_id: str, gate: ApprovalGate) -> bool:
    return any(
        r.status == ApprovalStatus.APPROVED
        for r in get_approval_repository().list(tenant_id, gate)
    )


def _gate_409(gate: ApprovalGate, detail: str) -> HTTPException:
    return HTTPException(
        status_code=409,
        detail={"error": "gate_blocked", "gate": gate.value, "detail": detail},
    )


# --------------------------------------------------------------------------- #
# Stage 8 — Cost estimate  /  Gate 3 production approval
# --------------------------------------------------------------------------- #
@router.post("/cost-estimate")
def cost_estimate(body: CostEstimateBody) -> dict:
    prov = get_provider_repository().get_active(body.tenant_id)
    mode = prov[1].mode if prov else ProviderMode.PIXIE_ACCOUNT
    est = estimate_cost(
        provider_mode=mode,
        model="standard",
        duration_seconds=body.duration_seconds,
        retry_budget=body.retry_budget,
    )
    return {"tenant_id": body.tenant_id, "cost_estimate": est}


@router.post("/production/approve")
def production_approve(body: DecisionBody) -> dict:
    get_approval_repository().record(
        body.tenant_id, ApprovalGate.PRODUCTION, "production", ApprovalStatus.APPROVED, note=body.note
    )
    return {"tenant_id": body.tenant_id, "gate": "production", "status": "approved"}


# --------------------------------------------------------------------------- #
# Stage 9 — Video generation (Gate 3 enforced — NO spend before this)
# --------------------------------------------------------------------------- #
@router.post("/videos/generate")
def videos_generate(body: VideoGenerateBody) -> dict:
    if not _gate_approved(body.tenant_id, ApprovalGate.PRODUCTION):
        raise _gate_409(
            ApprovalGate.PRODUCTION,
            "Production approval (Gate 3) required before video generation — no spend before this.",
        )
    script_found = get_script_repository().get(body.tenant_id, body.script_id)
    if script_found is None:
        raise HTTPException(status_code=404, detail="script not found for tenant")
    identity_found = get_identity_repository().get_active(body.tenant_id)
    if identity_found is None:
        raise HTTPException(status_code=409, detail={"error": "no_identity", "detail": "Lock an influencer identity first."})
    prompt = build_higgsfield_prompt(
        identity=identity_found[1].model_dump(),
        script=script_found[1].model_dump(),
        profile=_profile_dict(body.tenant_id),
    )
    raw = get_higgsfield_provider().generate(prompt)
    video = Video(
        tenant_id=body.tenant_id,
        script_ref=body.script_id,
        status=VideoStatus.MOCK,
        asset_ref=raw.get("asset_ref", ""),
        preview_ref=raw.get("preview_ref", ""),
        aspect_ratio=raw.get("aspect_ratio", "9:16"),
        duration_seconds=int(raw.get("duration_seconds", 15) or 15),
        model=raw.get("model", ""),
    )
    vid, stored = get_video_repository().save(video)
    return {"id": vid, "video": stored.model_dump()}


# --------------------------------------------------------------------------- #
# Stage 10 — Quality check (deterministic + retry ladder)
# --------------------------------------------------------------------------- #
@router.post("/videos/{video_id}/quality-check")
def videos_quality_check(video_id: str, body: DecisionBody) -> dict:
    found = get_video_repository().get(body.tenant_id, video_id)
    if found is None:
        raise HTTPException(status_code=404, detail="video not found for tenant")
    video = found[1]
    script_found = get_script_repository().get(body.tenant_id, video.script_ref)
    identity_found = get_identity_repository().get_active(body.tenant_id)
    prompt = build_higgsfield_prompt(
        identity=identity_found[1].model_dump() if identity_found else {},
        script=script_found[1].model_dump() if script_found else {},
        profile=_profile_dict(body.tenant_id),
    )
    state = {"approvals": {"production": "approved" if _gate_approved(body.tenant_id, ApprovalGate.PRODUCTION) else "pending"}}
    result = run_quality_with_retries(
        prompt, get_higgsfield_provider().generate, state=state, max_retries=2
    )
    q = result["quality"]
    valid = {s.value for s in QualityStatus}
    qc = QualityCheck(
        tenant_id=body.tenant_id,
        video_ref=video_id,
        status=QualityStatus(q["status"]) if q.get("status") in valid else QualityStatus.PASS,
        deterministic_flags=q.get("deterministic_flags", []),
        retry_count=int(result.get("attempts", 0) or 0),
    )
    get_quality_repository().save(qc)
    return {
        "video_id": video_id,
        "quality": qc.model_dump(),
        "retry": {"attempts": result.get("attempts"), "status": result.get("status"), "manual_review": result.get("manual_review")},
    }


# --------------------------------------------------------------------------- #
# Stage 11 — Gate 4 publish approval
# --------------------------------------------------------------------------- #
@router.post("/videos/{video_id}/publish-approve")
def videos_publish_approve(video_id: str, body: DecisionBody) -> dict:
    get_approval_repository().record(
        body.tenant_id, ApprovalGate.PUBLISH, video_id, ApprovalStatus.APPROVED, note=body.note
    )
    return {"video_id": video_id, "gate": "publish", "status": "approved"}


# --------------------------------------------------------------------------- #
# Stage 12 — Posting (Gate 4 enforced; dry-run only)
# --------------------------------------------------------------------------- #
@router.post("/posts/schedule")
def posts_schedule(body: ScheduleBody) -> dict:
    if not _gate_approved(body.tenant_id, ApprovalGate.PUBLISH):
        raise _gate_409(ApprovalGate.PUBLISH, "Publish approval (Gate 4) required before posting.")
    found = get_video_repository().get(body.tenant_id, body.video_id)
    if found is None:
        raise HTTPException(status_code=404, detail="video not found for tenant")
    video = found[1]
    results = schedule_posts(body.tenant_id, video.asset_ref, body.platforms, body.scheduled_time)
    repo = get_post_repository()
    valid = {p.value for p in PlatformType}
    saved = []
    for r in results:
        plat = r.get("platform", "meta")
        post = Post(
            tenant_id=body.tenant_id,
            video_ref=body.video_id,
            platform=PlatformType(plat) if plat in valid else PlatformType.META,
            status=PostStatus.DRY_RUN,
            scheduled_time=body.scheduled_time,
            dry_run=bool(r.get("dry_run", True)),
            external_ref=r.get("external_ref", ""),
        )
        pid, stored = repo.save(post)
        saved.append({"id": pid, "post": stored.model_dump(), "would_post": r.get("would_post", False)})
    return {"tenant_id": body.tenant_id, "posts": saved}


@router.get("/posts")
def posts_list(tenant_id: str = Query(..., min_length=1)) -> dict:
    rows = get_post_repository().list(tenant_id)
    return {"tenant_id": tenant_id, "posts": [{"id": i, "post": m.model_dump()} for (i, m) in rows]}


# --------------------------------------------------------------------------- #
# Stage 13 — Analytics + learning loop
# --------------------------------------------------------------------------- #
_METRIC_FIELDS = (
    "views", "likes", "comments", "shares", "saves",
    "watch_time", "completion_rate", "clicks", "follows", "leads",
)


@router.post("/analytics/sync")
def analytics_sync(body: DecisionBody) -> dict:
    posts = get_post_repository().list(body.tenant_id)
    post_refs = [(m.external_ref or pid) for (pid, m) in posts]
    metrics = sync_metrics(body.tenant_id, post_refs)
    mrepo = get_metric_repository()
    for met in metrics:
        mrepo.save(Metric(
            tenant_id=body.tenant_id,
            post_ref=met.get("post_ref", ""),
            **{k: met[k] for k in _METRIC_FIELDS if k in met},
        ))
    summary = LearningLoop().summarize(body.tenant_id, metrics)
    get_learning_repository().save(Learning(
        tenant_id=body.tenant_id,
        samples=int(summary.get("samples", len(metrics)) or 0),
        insights=summary.get("insights", []),
        next_focus=summary.get("next_focus", ""),
    ))
    return {"tenant_id": body.tenant_id, "metrics": metrics, "learning": summary}


@router.get("/analytics")
def analytics_get(tenant_id: str = Query(..., min_length=1)) -> dict:
    rows = get_metric_repository().list(tenant_id)
    return {"tenant_id": tenant_id, "metrics": [m.model_dump() for (_i, m) in rows]}


@router.get("/learnings")
def learnings_get(tenant_id: str = Query(..., min_length=1)) -> dict:
    found = get_learning_repository().get_latest(tenant_id)
    if found is None:
        raise HTTPException(status_code=404, detail="no learnings yet for tenant")
    return {"tenant_id": tenant_id, "learning": found[1].model_dump()}


# --------------------------------------------------------------------------- #
# Status
# --------------------------------------------------------------------------- #
@router.get("/status")
def status() -> dict:
    return status_banner()
