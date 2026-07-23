"""Aggregate wizard-state for the Content Creator frontend — one tenant-scoped read.

The pipeline persists resource-per-stage (profile, identity, ideas, scripts,
video, quality, posts, metrics + an append-only approval log). Loading 13
resources over the proxy per page-load would be slow and racy, so this module
reconstructs the whole wizard in ONE pass over the repositories and derives:

* per-stage completion + the current (first incomplete) stage,
* the four gate statuses (from the approval log — same "any APPROVED" rule the
  router enforces with),
* the artifacts the UI needs to pre-fill each step.

Pure aggregation over the existing repos — it does NOT duplicate the orchestrator
and performs no writes. Tenant scoping is inherited from every repo read.
"""

from __future__ import annotations

from typing import Dict, List, Optional

from . import config
from .enums import (
    ApprovalGate,
    ApprovalStatus,
    PipelineStage,
    STAGE_SEQUENCE,
)
from .pipeline.stages import STAGE_META
from .store import (
    get_approval_repository,
    get_identity_repository,
    get_idea_repository,
    get_learning_repository,
    get_metric_repository,
    get_post_repository,
    get_profile_repository,
    get_provider_repository,
    get_quality_repository,
    get_script_repository,
    get_video_repository,
)


def _gate_status(tenant_id: str, gate: ApprovalGate) -> str:
    """Latest-record-wins: the most recent decision for a gate is authoritative, so
    an invalidation reset (a later NEEDS_CHANGES/REJECTED record) un-approves it."""
    records = get_approval_repository().list(tenant_id, gate)
    return records[-1].status.value if records else ApprovalStatus.PENDING.value


def _gate_approved(tenant_id: str, gate: ApprovalGate) -> bool:
    return _gate_status(tenant_id, gate) == ApprovalStatus.APPROVED.value


_PUBLISH_JOB_FIELDS = (
    "source_product", "connection_id", "platform", "account_id", "mode", "status",
    "scheduled_utc", "local_time", "timezone", "attempt_count", "max_attempts",
    "next_retry_utc", "platform_post_id", "platform_permalink", "error_category",
    "error_correlation_id", "created_at", "updated_at",
)


def _publish_job_for_video(tenant_id: str, video_id: str) -> Optional[dict]:
    """Latest AI-Influencer publish job for a video — safe subset for wizard resume.

    Lazy/defensive: the posting stage recovers its durable job (id, destination,
    schedule, status, attempts, permalink) from this after refresh/restart. Never
    returns tokens or the raw snapshot."""
    if not video_id:
        return None
    try:
        from publishing.store import query_jobs
    except Exception:
        return None
    try:
        rows = query_jobs(tenant_id, source_product="ai_influencer", influencer_video_id=video_id)
    except Exception:
        return None
    if not rows:
        return None
    jid, job = rows[0]  # query_jobs sorts newest-first
    data = job.model_dump()
    out = {k: data.get(k) for k in _PUBLISH_JOB_FIELDS}
    out["id"] = jid
    return out


def build_wizard_state(tenant_id: str) -> dict:
    """One-shot, tenant-scoped snapshot the frontend resumes from."""
    profile = get_profile_repository().get_active(tenant_id)
    identity = get_identity_repository().get_active(tenant_id)
    provider = get_provider_repository().get_latest(tenant_id)
    ideas = get_idea_repository().list(tenant_id)
    scripts = get_script_repository().list(tenant_id)
    videos = get_video_repository().list(tenant_id)
    posts = get_post_repository().list(tenant_id)
    metrics = get_metric_repository().list(tenant_id)
    learning = get_learning_repository().get_latest(tenant_id)

    # newest video is the working one (list is insertion/created ordered)
    video = videos[-1] if videos else None
    quality = (
        get_quality_repository().get_by_video(tenant_id, video[0]) if video else None
    )

    # Real durable publish job for the working video (if the Step Posting stage created
    # one via the publishing engine). Kept defensive + lazy so content_creator never
    # hard-depends on the publishing module.
    publish_job = _publish_job_for_video(tenant_id, video[0]) if video else None

    approved_ideas = [i for i in ideas if i[1].approval_status == ApprovalStatus.APPROVED]
    approved_scripts = [s for s in scripts if s[1].approval_status == ApprovalStatus.APPROVED]

    gates = {g.value: _gate_status(tenant_id, g) for g in ApprovalGate}

    # Per-stage completion (the current stage is the first incomplete one).
    done: Dict[str, bool] = {
        PipelineStage.INTAKE.value: profile is not None,
        PipelineStage.INFLUENCER_SETUP.value: identity is not None,
        PipelineStage.PROVIDER_CONNECTION.value: provider is not None,
        PipelineStage.IDEA_GENERATION.value: len(ideas) > 0,
        PipelineStage.IDEA_APPROVAL.value: _gate_approved(tenant_id, ApprovalGate.IDEA),
        PipelineStage.SCRIPT_GENERATION.value: len(scripts) > 0,
        PipelineStage.SCRIPT_APPROVAL.value: _gate_approved(tenant_id, ApprovalGate.SCRIPT),
        PipelineStage.COST_ESTIMATE.value: _gate_approved(tenant_id, ApprovalGate.PRODUCTION),
        PipelineStage.VIDEO_GENERATION.value: video is not None,
        PipelineStage.QUALITY_CHECK.value: quality is not None,
        PipelineStage.PUBLISH_APPROVAL.value: _gate_approved(tenant_id, ApprovalGate.PUBLISH),
        PipelineStage.POSTING.value: len(posts) > 0 or publish_job is not None,
        PipelineStage.ANALYTICS.value: len(metrics) > 0 or learning is not None,
    }

    current = None
    for s in STAGE_SEQUENCE:
        if not done[s.value]:
            current = s.value
            break
    complete = current is None
    if complete:
        current = PipelineStage.ANALYTICS.value

    stages: List[dict] = []
    for s in STAGE_SEQUENCE:
        meta = STAGE_META[s]
        if done[s.value]:
            status = "complete"
        elif s.value == current:
            status = "current"
        else:
            status = "locked"
        stages.append({
            "stage": s.value,
            "n": meta["n"],
            "title": meta["title"],
            "gate": meta["gate"],
            "status": status,
            "done": done[s.value],
        })

    completed_count = sum(1 for v in done.values() if v)

    return {
        "tenant_id": tenant_id,
        "mock": config.mock_mode(),
        "dry_run": config.dry_run_posting(),
        "current_stage": current,
        "complete": complete,
        "completed_count": completed_count,
        "total_stages": len(STAGE_SEQUENCE),
        "stages": stages,
        "gates": gates,
        "profile": profile[1].model_dump() if profile else None,
        "profile_id": profile[0] if profile else None,
        "identity": identity[1].model_dump() if identity else None,
        "identity_id": identity[0] if identity else None,
        "provider": provider[1].model_dump() if provider else None,
        "ideas": [{"id": i, "idea": m.model_dump()} for (i, m) in ideas],
        "approved_idea_id": approved_ideas[-1][0] if approved_ideas else None,
        "scripts": [{"id": i, "script": m.model_dump()} for (i, m) in scripts],
        "approved_script_id": approved_scripts[-1][0] if approved_scripts else None,
        "video": {"id": video[0], "video": video[1].model_dump()} if video else None,
        "quality": {"id": quality[0], "quality": quality[1].model_dump()} if quality else None,
        "posts": [{"id": i, "post": m.model_dump()} for (i, m) in posts],
        "publish_job": publish_job,
        "metrics": [m.model_dump() for (_i, m) in metrics],
        "learning": learning[1].model_dump() if learning else None,
    }
