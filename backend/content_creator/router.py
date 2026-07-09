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
from . import config
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
    canonical_provider_mode,
)
from .integrations.scheduler import schedule_posts
from .integrations.trends import gather_trends
from .providers import credentials as provider_credentials
from .providers.base import (
    ProviderError,
    ProviderNotConfigured,
    build_real_provider,
    get_higgsfield_provider,
    get_storage_provider,
)
from .providers.prompt_builder import build_higgsfield_prompt, render_prompt_text
from .quality.retry_ladder import run_quality_with_retries
from .schemas import (
    CreatorProfile,
    Idea,
    InfluencerIdentity,
    Learning,
    Metric,
    PixieUsage,
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
    get_usage_repository,
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
    # Provide EITHER raw image bytes to host now (image_base64), OR a reference
    # that is already usable (a public image URL, or an opaque ref for mock). At
    # least one is required. Mirrors the base64-JSON convention of /api/content/assets.
    reference_ref: str = ""
    image_base64: str = ""
    content_type: str = "image/png"
    filename: str = "influencer-reference"
    host: str = "supabase"  # where to host image_base64: "supabase" (default) | "higgsfield"


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
    user_id: str = ""
    mode: ProviderMode = ProviderMode.PIXIE_MANAGED
    connection_type: str = "mock"
    model_id: str = ""
    # Client-own-account (BYOK) credentials. Accepted ONLY inbound; never echoed
    # back. Either a combined "key:secret" in api_key, or api_key + api_secret.
    api_key: str = ""
    api_secret: str = ""


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
    duration_seconds: int = 15


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
def _decode_image(image_base64: str) -> bytes:
    import base64
    import binascii

    try:
        raw = base64.b64decode(image_base64.split(",")[-1], validate=False)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(status_code=422, detail="Invalid base64 image data: %s" % exc)
    if not raw:
        raise HTTPException(status_code=422, detail="Empty image upload.")
    return raw


def _host_image_on_supabase(tenant_id: str, image_base64: str, content_type: str, filename: str):
    """Host via the shared content-asset service (Supabase Storage). Returns
    ``(public_url, asset_id)``."""
    import storage as backend_storage
    from content import service as content_service

    try:
        asset = content_service.create_asset_from_base64(
            tenant_id,
            filename=filename,
            content_type=content_type,
            data_base64=image_base64,
            uploaded_by="content_creator",
            metadata={"purpose": "influencer_reference"},
        )
    except backend_storage.StorageNotConfigured as exc:
        raise HTTPException(status_code=400, detail={"status": "storage_not_configured", "message": str(exc)})
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except backend_storage.StorageError as exc:
        raise HTTPException(status_code=502, detail={"status": "storage_error", "message": str(exc)})
    return asset.public_url, asset.id


def _host_image_on_higgsfield(tenant_id: str, image_base64: str, content_type: str) -> str:
    """Host on Higgsfield's own CDN via the SDK's presigned upload. Requires a
    connected real provider for this tenant's mode — never fabricates a URL."""
    res = _resolve_provider(tenant_id)
    if not config.real_mode() or res["provider"] is None or not res["ready"]:
        raise HTTPException(
            status_code=400,
            detail={
                "status": "provider_not_configured",
                "message": "Hosting on Higgsfield requires a connected provider for this tenant.",
            },
        )
    raw = _decode_image(image_base64)
    try:
        return res["provider"].upload_reference_image(raw, content_type)
    except ProviderNotConfigured as exc:
        raise HTTPException(status_code=400, detail={"status": "provider_not_configured", "message": str(exc)})
    except ProviderError as exc:
        raise HTTPException(status_code=502, detail={"status": "provider_error", "message": str(exc), "retryable": True})


@router.post("/influencer/upload-reference")
def upload_reference(body: ReferenceBody) -> dict:
    """Lock a reference-image identity.

    When ``image_base64`` is supplied we HOST the image and store its public URL
    as the reference — so real image-to-video generation has a fetchable
    ``image_url``. ``host`` selects where: ``supabase`` (default, via the shared
    content-asset service) or ``higgsfield`` (the provider's own CDN). A pre-hosted
    URL (or an opaque ref for mock) may be passed via ``reference_ref`` instead.
    """
    reference_ref = (body.reference_ref or "").strip()
    reference_hosted = False
    reference_asset_id = ""

    if body.image_base64:
        host = (body.host or "supabase").strip().lower()
        if host == "higgsfield":
            reference_ref = _host_image_on_higgsfield(
                body.tenant_id, body.image_base64, body.content_type or "image/png"
            )
        elif host in ("", "supabase"):
            reference_ref, reference_asset_id = _host_image_on_supabase(
                body.tenant_id, body.image_base64,
                body.content_type or "image/png", body.filename or "influencer-reference",
            )
        else:
            raise HTTPException(status_code=422, detail="host must be 'supabase' or 'higgsfield'.")
        reference_hosted = True

    if not reference_ref:
        raise HTTPException(
            status_code=422,
            detail="Provide image_base64 to host an image, or a reference_ref (public URL / ref).",
        )

    identity = InfluencerIdentity(
        tenant_id=body.tenant_id,
        source=IdentitySource.REFERENCE_IMAGE,
        reference_ref=reference_ref,
        reference_hosted=reference_hosted,
        reference_asset_id=reference_asset_id,
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
def _combine_credential(api_key: str, api_secret: str) -> str:
    """Combine inbound key/secret into the SDK's ``key:secret`` form. Accepts a
    key that already carries the ``key:secret`` shape."""
    api_key = (api_key or "").strip()
    api_secret = (api_secret or "").strip()
    if not api_key:
        return ""
    if api_secret:
        return api_key + ":" + api_secret
    return api_key  # may already be "key:secret"


def _tenant_mode(tenant_id: str) -> str:
    """The tenant's chosen canonical provider mode (from its saved connection,
    connected or not), else the configured default."""
    conn = get_provider_repository().get_latest(tenant_id)
    if conn:
        return canonical_provider_mode(conn[1].mode)
    return config.default_provider_mode()


def _not_configured_msg(mode: str) -> str:
    if mode == "client_own_account":
        return "Connect your own Higgsfield API key (client_own_account) before generating video."
    if mode == "pixie_managed":
        return "Pixie-managed Higgsfield credentials are not configured (HIGGSFIELD_API_KEY/SECRET + HIGGSFIELD_VIDEO_MODEL)."
    return "Connect Higgsfield or enable Pixie-managed mode before generating video."


def _resolve_provider(tenant_id: str) -> dict:
    """Resolve which provider/credentials a tenant's mode implies.

    Returns ``{mode, provider, credential, model, ready, error}``. The crucial rule:
    missing global env creds block ONLY ``pixie_managed`` — a ``client_own_account``
    tenant with its own connected key still works, and ``prompt_export`` always works.
    Never falls back to a mock in real mode.
    """
    mode = _tenant_mode(tenant_id)
    conn = get_provider_repository().get_latest(tenant_id)

    if not config.real_mode():
        return {"mode": mode, "provider": get_higgsfield_provider(tenant_id),
                "credential": "", "model": "", "ready": True, "error": None}

    if mode == "prompt_export":
        return {"mode": mode, "provider": None, "credential": "", "model": "",
                "ready": True, "error": None}

    if mode == "client_own_account":
        credential = provider_credentials.get_tenant_credential(tenant_id)
        model = (conn[1].model_id if conn else "") or config.higgsfield_video_model()
    else:  # pixie_managed
        credential = config.higgsfield_credential()
        model = config.higgsfield_video_model()

    if not credential or not model:
        return {"mode": mode, "provider": None, "credential": credential, "model": model,
                "ready": False,
                "error": {"status": "provider_not_configured", "message": _not_configured_msg(mode)}}

    return {"mode": mode, "provider": build_real_provider(credential, model),
            "credential": credential, "model": model, "ready": True, "error": None}


@router.post("/provider/connect")
def connect_provider(body: ProviderBody) -> dict:
    """Connect the video provider in one of three modes.

    * ``client_own_account`` (BYOK) — validate the client key/secret with a no-spend
      auth call, store it encrypted-if-available server-side, bill their account.
    * ``pixie_managed`` — use the global env credentials; Pixie bills the client.
    * ``prompt_export`` — no API; Pixie emits a prompt to paste into Higgsfield.

    The API key/secret are NEVER returned or logged. Missing env creds only block
    ``pixie_managed``.
    """
    mode = canonical_provider_mode(body.mode)
    est = estimate_cost(provider_mode=body.mode, model="standard", duration_seconds=15)
    common = dict(
        tenant_id=body.tenant_id,
        user_id=body.user_id,
        mode=body.mode,
        provider=config.provider_name(),
        estimated_credits=est["estimated_credits"],
        estimated_provider_cost=est["estimated_provider_cost"],
        pixie_markup=est["pixie_markup"],
        final_price=est["final_user_price"],
    )

    def _save(**kw) -> dict:
        conn = ProviderConnection(**common, **kw)
        cid, stored = get_provider_repository().save(conn)
        return {"id": cid, "provider": stored.model_dump()}

    # Mock mode keeps the original connected price-display behavior.
    if not config.real_mode():
        return _save(
            connection_type=body.connection_type or "mock",
            connected=True, configured=True, status="mock",
            capabilities={"video_generation": True, "job_status": True, "result_download": True},
        )

    # --- Prompt export: no credentials, no real generation --------------- #
    if mode == "prompt_export":
        out = _save(
            connection_type="prompt_export", connected=False, configured=True,
            status="prompt_export",
            capabilities={"video_generation": False, "job_status": False, "result_download": False},
        )
        out["status"] = "configured"
        out["mode"] = mode
        out["message"] = "Prompt export mode enabled. No real video generation will happen."
        return out

    # --- Client own account (BYOK) -------------------------------------- #
    if mode == "client_own_account":
        credential = _combine_credential(body.api_key, body.api_secret)
        if not credential:
            raise HTTPException(
                status_code=422,
                detail={"status": "missing_credentials",
                        "message": "client_own_account requires api_key (and api_secret unless combined)."},
            )
        model = body.model_id or config.higgsfield_video_model()
        test = build_real_provider(credential, model).test_connection()
        connected = bool(test.get("connected"))
        if connected:
            provider_credentials.set_credential(body.tenant_id, credential)  # store only a VALID key
        out = _save(
            connection_type="api_key", connected=connected, configured=connected,
            status=test.get("status", ""), model_id=body.model_id,
            account_ref=provider_credentials.masked_hint(credential),
            capabilities=test.get("capabilities", {}),
        )
        if test.get("message"):
            out["message"] = test["message"]
        return out

    # --- Pixie managed (global env credentials) ------------------------- #
    credential = config.higgsfield_credential()
    model = config.higgsfield_video_model()
    if not credential:
        out = _save(
            connection_type="pixie_env", connected=False, configured=False,
            status="provider_not_configured",
            capabilities={"video_generation": False, "job_status": False, "result_download": False},
        )
        out["status"] = "provider_not_configured"
        out["mode"] = mode
        out["message"] = "Pixie-managed Higgsfield credentials are not configured."
        return out

    test = build_real_provider(credential, model).test_connection()
    out = _save(
        connection_type="pixie_env", connected=bool(test.get("connected")),
        configured=bool(credential and model), status=test.get("status", ""),
        model_id=model, account_ref="pixie-managed",
        capabilities=test.get("capabilities", {}),
    )
    if test.get("message"):
        out["message"] = test["message"]
    return out


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
    prov = get_provider_repository().get_latest(body.tenant_id)
    mode = canonical_provider_mode(prov[1].mode) if prov else config.default_provider_mode()
    est = estimate_cost(
        provider_mode=(prov[1].mode if prov else ProviderMode.PIXIE_MANAGED),
        model="standard",
        duration_seconds=body.duration_seconds,
        retry_budget=body.retry_budget,
    )
    base = {
        "tenant_id": body.tenant_id,
        "provider": config.provider_name(),
        "provider_mode": mode,
        "cost_estimate": est,
        "requires_approval": True,
    }

    if not config.real_mode():
        return {**base, "estimate_type": "mock_estimated"}

    # Prompt export → no provider spend.
    if mode == "prompt_export":
        return {**base, "estimate_type": "none", "requires_approval": False,
                "message": "Prompt export mode — no provider generation cost."}

    res = _resolve_provider(body.tenant_id)
    if not res["ready"]:
        return {**base, "status": "provider_not_configured",
                "estimate_type": "unavailable",
                "message": res["error"]["message"] if res.get("error") else _not_configured_msg(mode)}

    # Higgsfield exposes no pre-generation cost endpoint → our own deterministic figure.
    # client_own → client pays their own credits (no Pixie markup); pixie_managed → markup applies.
    return {**base, "estimate_type": "pixie_estimated"}


@router.post("/production/approve")
def production_approve(body: DecisionBody) -> dict:
    get_approval_repository().record(
        body.tenant_id, ApprovalGate.PRODUCTION, "production", ApprovalStatus.APPROVED, note=body.note
    )
    return {"tenant_id": body.tenant_id, "gate": "production", "status": "approved"}


# --------------------------------------------------------------------------- #
# Stage 9 — Video generation (Gate 3 enforced — NO spend before this)
# --------------------------------------------------------------------------- #
def _http_url(value: str) -> str:
    """Return ``value`` only when it's already a fetchable http(s) URL, else ''."""
    v = (value or "").strip()
    return v if v[:7] == "http://" or v[:8] == "https://" else ""


def _image_url_for_identity(identity: dict) -> str:
    """The locked influencer as an ``image_url`` for image-to-video — only when the
    stored reference is a real public URL. Mock/generated character refs (not URLs)
    fall through to text-to-video (no fabricated image)."""
    return _http_url(identity.get("reference_ref", ""))


# Map a provider status string to a persisted VideoStatus.
_VIDEO_STATUS_MAP = {
    "mock": VideoStatus.MOCK,
    "ready": VideoStatus.READY,
    "completed": VideoStatus.READY,
    "generating": VideoStatus.GENERATING,
    "queued": VideoStatus.GENERATING,
    "running": VideoStatus.GENERATING,
    "failed": VideoStatus.FAILED,
    "pending": VideoStatus.PENDING,
}


def _record_pixie_usage(tenant_id: str, user_id: str, video_ref: str, job_id: str, script_id: str) -> None:
    """Create a billable-usage record for pixie_managed generation. If no wallet
    system is wired, it's stored as pending_billable and marked clearly."""
    prov = get_provider_repository().get_active(tenant_id)
    est = estimate_cost(
        provider_mode=ProviderMode.PIXIE_MANAGED, model="standard", duration_seconds=15,
    )
    get_usage_repository().save(PixieUsage(
        tenant_id=tenant_id,
        user_id=user_id or (prov[1].user_id if prov else ""),
        provider=config.provider_name(),
        provider_mode="pixie_managed",
        video_ref=video_ref,
        provider_job_id=job_id,
        estimated_credits=est["estimated_credits"],
        estimated_cost=est["estimated_provider_cost"],
        client_price=est["final_user_price"],
        markup=est["pixie_markup"],
        status="submitted",
        note="pending_billable — wallet/charge integration not wired yet" if not config.dry_run_posting() else "submitted",
    ))


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
    identity = identity_found[1].model_dump()
    prompt = build_higgsfield_prompt(
        identity=identity,
        script=script_found[1].model_dump(),
        profile=_profile_dict(body.tenant_id),
        duration_seconds=int(body.duration_seconds or 15),
    )

    res = _resolve_provider(body.tenant_id)
    mode = res["mode"]

    # --- Prompt export: return the prompt, NO video job, NO fake video ---- #
    if config.real_mode() and mode == "prompt_export":
        return {
            "status": "prompt_export_ready",
            "provider": config.provider_name(),
            "provider_mode": mode,
            "prompt": render_prompt_text(prompt),
            "message": "Copy this prompt into Higgsfield. No video was generated.",
        }

    # --- Real mode must have a usable provider BEFORE any spend ----------- #
    if config.real_mode() and not res["ready"]:
        raise HTTPException(status_code=400, detail=res["error"])

    provider = res["provider"]
    try:
        job = provider.submit_job(
            prompt,
            duration_seconds=int(body.duration_seconds or 15),
            aspect_ratio="9:16",
            image_url=_image_url_for_identity(identity),
        )
    except ProviderNotConfigured as exc:
        raise HTTPException(status_code=400, detail={"status": "provider_not_configured", "message": str(exc)})
    except ProviderError as exc:
        raise HTTPException(status_code=502, detail={"status": "provider_error", "message": str(exc), "retryable": True})

    status_str = str(job.get("status", "generating")).lower()
    video = Video(
        tenant_id=body.tenant_id,
        script_ref=body.script_id,
        status=_VIDEO_STATUS_MAP.get(status_str, VideoStatus.GENERATING),
        provider=job.get("provider", ""),
        provider_mode=mode if config.real_mode() else "",
        provider_job_id=job.get("provider_job_id", ""),
        asset_ref=job.get("asset_ref", ""),
        preview_ref=job.get("preview_ref", ""),
        identity_ref=job.get("identity_ref", "") or identity.get("reference_ref", ""),
        aspect_ratio=job.get("aspect_ratio", "9:16") or "9:16",
        duration_seconds=int(job.get("duration_seconds", 15) or 15),
        model=job.get("model", ""),
    )
    vid, stored = get_video_repository().save(video)

    # pixie_managed: record billable usage (Pixie fronts the credits).
    if config.real_mode() and mode == "pixie_managed":
        _record_pixie_usage(body.tenant_id, body.tenant_id, vid, job.get("provider_job_id", ""), body.script_id)

    return {"id": vid, "video": stored.model_dump()}


# --------------------------------------------------------------------------- #
# Stage 9b — Poll a real async generation job (download + re-host on completion)
# --------------------------------------------------------------------------- #
_TERMINAL_VIDEO = {VideoStatus.READY, VideoStatus.FAILED, VideoStatus.MOCK}


@router.get("/videos/{video_id}/status")
def videos_status(video_id: str, tenant_id: str = Query(..., min_length=1)) -> dict:
    """Poll a generation job. Idempotent: once terminal (ready/failed/mock) the
    stored record is returned unchanged. On the provider reporting completion we
    download the media and re-host it in Supabase (a durable URL), never trusting
    the provider's temporary URL."""
    found = get_video_repository().get(tenant_id, video_id)
    if found is None:
        raise HTTPException(status_code=404, detail="video not found for tenant")
    video = found[1]

    # Already terminal, or a mock/sync video with no provider job → return as-is.
    if video.status in _TERMINAL_VIDEO or not video.provider_job_id:
        return {"video_id": video_id, "video": video.model_dump()}

    res = _resolve_provider(tenant_id)
    provider = res["provider"]
    if provider is None or not res["ready"]:
        raise HTTPException(status_code=400, detail=res.get("error") or {
            "status": "provider_not_configured", "message": _not_configured_msg(res["mode"])})
    try:
        st = provider.get_job_status(video.provider_job_id)
    except ProviderNotConfigured as exc:
        raise HTTPException(status_code=400, detail={"status": "provider_not_configured", "message": str(exc)})
    except ProviderError as exc:
        raise HTTPException(status_code=502, detail={"status": "provider_error", "message": str(exc), "retryable": True})

    state = str(st.get("status", "running")).lower()

    if state in ("queued", "running", "generating", "pending"):
        _, updated = get_video_repository().update(
            tenant_id, video_id,
            status=VideoStatus.GENERATING,
            progress=float(st.get("progress", 0.0) or 0.0),
        )
        return {"video_id": video_id, "video": updated.model_dump()}

    if state in ("failed",):
        _, updated = get_video_repository().update(
            tenant_id, video_id,
            status=VideoStatus.FAILED,
            error=str(st.get("error", "") or "generation failed")[:300],
            progress=0.0,
        )
        return {"video_id": video_id, "video": updated.model_dump()}

    # Completed → download + re-host.
    try:
        result = provider.download_result(video.provider_job_id)
    except ProviderError as exc:
        raise HTTPException(status_code=502, detail={"status": "provider_error", "message": str(exc), "retryable": True})

    source_url = result.get("source_url", "") or st.get("result_url", "")
    content = result.get("content")
    storage_url = ""
    if content:
        try:
            saved = get_storage_provider().store_bytes(
                tenant_id,
                "video_%s.mp4" % video_id,
                content,
                result.get("content_type", "video/mp4"),
            )
            storage_url = saved.get("storage_url", "")
        except Exception as exc:  # storage misconfig — surface, don't fake a URL
            _, updated = get_video_repository().update(
                tenant_id, video_id,
                status=VideoStatus.FAILED,
                result_url=source_url,
                error=("generated but storage failed: " + str(exc))[:300],
                progress=1.0,
            )
            return {"video_id": video_id, "video": updated.model_dump()}

    _, updated = get_video_repository().update(
        tenant_id, video_id,
        status=VideoStatus.READY,
        result_url=source_url,
        storage_url=storage_url,
        asset_ref=result.get("asset_ref", "") or video.asset_ref,
        preview_ref=storage_url or source_url,
        progress=1.0,
        error="",
    )
    if video.provider_mode == "pixie_managed":
        get_usage_repository().update(tenant_id, video_id, status="completed")
    return {"video_id": video_id, "video": updated.model_dump()}


# --------------------------------------------------------------------------- #
# Stage 10 — Quality check (deterministic + retry ladder)
# --------------------------------------------------------------------------- #
def _real_quality_check(tenant_id: str, video_id: str, video) -> dict:
    """Assess an ALREADY-generated real video from its stored metadata/asset — NO
    provider call, NO regeneration (that would re-spend). Blocks until the async
    job is terminal."""
    if video.status == VideoStatus.FAILED:
        raise HTTPException(
            status_code=409,
            detail={"status": "provider_failed", "message": video.error or "generation failed"},
        )
    if video.status != VideoStatus.READY:
        raise HTTPException(
            status_code=409,
            detail={
                "status": "video_not_ready",
                "message": "Poll GET /videos/%s/status until the video is ready." % video_id,
            },
        )
    flags = []
    if not (video.storage_url or video.result_url):
        flags.append("no_result_media")
    if not video.storage_url:
        flags.append("not_rehosted")  # only a temporary provider URL survived
    if video.aspect_ratio != "9:16":
        flags.append("aspect_ratio_9_16")
    if not video.identity_ref:
        flags.append("identity_present")
    if int(video.duration_seconds or 0) <= 0:
        flags.append("duration_present")
    status = QualityStatus.PASS if not flags else QualityStatus.NEEDS_RETRY
    qc = QualityCheck(
        tenant_id=tenant_id,
        video_ref=video_id,
        status=status,
        deterministic_flags=flags,
        retry_count=0,
    )
    get_quality_repository().save(qc)
    return {
        "video_id": video_id,
        "quality": qc.model_dump(),
        "retry": {"attempts": 0, "status": status.value, "manual_review": bool(flags)},
    }


@router.post("/videos/{video_id}/quality-check")
def videos_quality_check(video_id: str, body: DecisionBody) -> dict:
    found = get_video_repository().get(body.tenant_id, video_id)
    if found is None:
        raise HTTPException(status_code=404, detail="video not found for tenant")
    video = found[1]
    # Real videos are assessed from their stored asset (no re-spend). Mock videos
    # keep the offline retry-ladder path (deterministic, $0).
    if config.real_mode():
        return _real_quality_check(body.tenant_id, video_id, video)
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
    # Live posting handoff: Content Creator does not own the publisher — it hands
    # off to the Meta connector. That live path isn't wired/App-Review-approved in
    # this build, so when dry-run is disabled we say so honestly rather than fake a
    # published status. (Default is dry-run → the path below.)
    if not config.dry_run_posting():
        return {
            "tenant_id": body.tenant_id,
            "status": "missing_publishing_connection",
            "message": (
                "Live posting requires a connected, publish-approved Meta account. "
                "Connect Meta (and complete App Review) before disabling CONTENT_CREATOR_DRY_RUN."
            ),
            "posts": [],
        }
    # Prefer the durable re-hosted URL Meta could actually fetch, else the asset ref.
    media_ref = video.storage_url or video.result_url or video.asset_ref
    results = schedule_posts(body.tenant_id, media_ref, body.platforms, body.scheduled_time)
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


@router.get("/usage")
def usage_get(tenant_id: str = Query(..., min_length=1)) -> dict:
    """Billable-usage records (pixie_managed). Never contains secrets."""
    rows = get_usage_repository().list(tenant_id)
    return {"tenant_id": tenant_id, "usage": [u.model_dump() for (_i, u) in rows]}


# --------------------------------------------------------------------------- #
# Provider test / disconnect
# --------------------------------------------------------------------------- #
class ProviderTestBody(_Body):
    pass


@router.post("/provider/test")
def provider_test(body: ProviderTestBody) -> dict:
    """Re-run the no-spend connection test for the tenant's current mode."""
    res = _resolve_provider(body.tenant_id)
    if res["mode"] == "prompt_export":
        return {"tenant_id": body.tenant_id, "mode": res["mode"], "connected": False,
                "status": "prompt_export", "message": "Prompt export mode — no provider connection."}
    if not config.real_mode():
        return {"tenant_id": body.tenant_id, "mode": res["mode"], "connected": True, "status": "mock"}
    if not res["ready"] or res["provider"] is None:
        return {"tenant_id": body.tenant_id, "mode": res["mode"], "connected": False,
                **(res.get("error") or {"status": "provider_not_configured"})}
    test = res["provider"].test_connection()
    test.update({"tenant_id": body.tenant_id, "mode": res["mode"]})
    return test


@router.post("/provider/disconnect")
def provider_disconnect(body: ProviderTestBody) -> dict:
    """Forget a tenant's stored (client-own) credential. Env creds are untouched."""
    provider_credentials.clear_credential(body.tenant_id)
    return {"tenant_id": body.tenant_id, "status": "disconnected"}


# --------------------------------------------------------------------------- #
# Status
# --------------------------------------------------------------------------- #
@router.get("/status")
def status(tenant_id: str = Query(default="")) -> dict:
    """Pipeline + provider + billing status. Pass ``tenant_id`` to reflect that
    tenant's chosen mode; without it, shows the configured default view."""
    banner = status_banner()
    banner["mock"] = config.mock_mode()
    banner["dry_run"] = config.dry_run_posting()
    banner["approval_gates"] = {gate.value: True for gate in ApprovalGate}

    mode = _tenant_mode(tenant_id) if tenant_id else config.default_provider_mode()

    if not config.real_mode():
        provider = config.provider_status()
        provider["mode"] = mode
    elif mode == "prompt_export":
        provider = {"name": config.provider_name(), "mode": mode,
                    "configured": True, "connected": False,
                    "capabilities": {"video_generation": False, "job_status": False, "result_download": False}}
    else:
        res = _resolve_provider(tenant_id) if tenant_id else {"ready": config.provider_status().get("configured"), "provider": None}
        configured = bool(res.get("ready"))
        provider = {
            "name": config.provider_name(),
            "mode": mode,
            "configured": configured,
            "connected": configured,
            "capabilities": {"video_generation": configured, "job_status": configured, "result_download": configured},
        }
        if not configured:
            provider["status"] = "provider_not_configured"
            provider["message"] = _not_configured_msg(mode)

    banner["provider"] = provider
    banner["billing"] = config.billing_block(mode)
    return banner
