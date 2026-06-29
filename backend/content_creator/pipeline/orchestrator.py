"""Stage orchestrator — deterministic per-stage handlers — PURE STDLIB.

`run_stage(state, stage)` enforces the blocking gate, runs the stage's
deterministic handler, writes one AgentLog, and advances `state.stage`. It never
raises except `GateError` (from the gate check) — every handler is a pure,
network-free transform of the mock layer so the whole pipeline runs offline and
reproducibly.

Cross-module deps (built in parallel by the providers subagent) are imported
lazily inside the handlers that need them, so importing this module never fails
just because providers/cost/quality aren't merged yet.
"""

from __future__ import annotations

from ..agents.agent_log import AgentLog, get_agent_log_store
from ..enums import JobStatus, PipelineStage
from .gates import require_for_stage
from .stages import PipelineState, next_stage


# ---------------------------------------------------------------------------
# Stage handlers — each mutates `state` in place. Pure + deterministic.
# ---------------------------------------------------------------------------

def _h_intake(state: PipelineState) -> None:
    # Pass-through: the API seeds profile. Seed a minimal mock if empty so the
    # local runner can proceed end-to-end without an HTTP front end.
    if not state.profile:
        state.profile = {"niche": "your service", "brand": "", "tone": "friendly"}


def _h_influencer_setup(state: PipelineState) -> None:
    if not state.identity:
        state.identity = {
            "source": "generated_character",
            "reference_ref": "mock-identity-001",
        }


def _h_provider_connection(state: PipelineState) -> None:
    if not state.provider:
        state.provider = {"mode": "pixie_account"}


def _h_idea_generation(state: PipelineState) -> None:
    # Real agents (fall back to deterministic mock AI in fake mode).
    from ..agents.idea_agent import generate_ideas
    from ..integrations.trends import gather_trends

    trends = gather_trends(state.profile)
    state.ideas = generate_ideas(state.profile, trends=trends)


def _h_gate_passthrough(state: PipelineState) -> None:
    # IDEA_APPROVAL / SCRIPT_APPROVAL / PUBLISH_APPROVAL: no work here; the
    # owner decision is recorded via the API/gates layer (set_approval).
    return None


def _h_script_generation(state: PipelineState) -> None:
    from ..agents.script_agent import generate_script

    top_idea = state.ideas[0] if state.ideas else {}
    state.script = generate_script(top_idea, state.profile)


def _h_cost_estimate(state: PipelineState) -> None:
    from ..cost.estimator import estimate_cost

    mode = state.provider.get("mode", "pixie_account")
    state.cost_estimate = estimate_cost(
        provider_mode=mode,
        model="standard",
        duration_seconds=15,
        retry_budget=2,
    )


def _build_video_prompt(state: PipelineState) -> dict:
    from ..providers.prompt_builder import build_higgsfield_prompt

    model = state.cost_estimate.get("model", "standard")
    return build_higgsfield_prompt(
        identity=state.identity, script=state.script, profile=state.profile, model=model
    )


def _h_video_generation(state: PipelineState) -> None:
    from ..providers.base import get_higgsfield_provider

    # Prompt always injects the locked identity (deterministic builder).
    prompt = _build_video_prompt(state)
    state.video = get_higgsfield_provider().generate(prompt)


def _h_quality_check(state: PipelineState) -> None:
    # Deterministic checks + the retry ladder (regenerates via the provider on
    # failure, escalating up to the cost-estimate's retry budget).
    from ..providers.base import get_higgsfield_provider
    from ..quality.retry_ladder import run_quality_with_retries

    budget = int(state.cost_estimate.get("retry_budget", 2) or 2)
    prompt = _build_video_prompt(state)
    result = run_quality_with_retries(
        prompt, get_higgsfield_provider().generate, state=state.to_dict(), max_retries=budget
    )
    state.video = result.get("video", state.video)
    state.quality = result.get("quality", {})
    state.quality["retry"] = {
        "attempts": result.get("attempts", 0),
        "status": result.get("status"),
        "manual_review": result.get("manual_review", False),
        "actions": result.get("actions", []),
    }


def _h_posting(state: PipelineState) -> None:
    # Dry-run only — schedule_posts uses the placeholder adapters (no live post).
    from ..integrations.scheduler import schedule_posts

    video_ref = state.video.get("asset_ref", "")
    state.posts = schedule_posts(state.tenant_id, video_ref, ["meta", "instagram"])


def _h_analytics(state: PipelineState) -> None:
    from ..analytics.learning_loop import LearningLoop
    from ..analytics.metrics import sync_metrics

    post_refs = [p.get("external_ref", "") for p in state.posts if p.get("external_ref")]
    metrics = sync_metrics(state.tenant_id, post_refs)
    state.metrics = {"items": metrics, "synced": len(metrics)}
    state.learning = LearningLoop().summarize(state.tenant_id, metrics)


_HANDLERS = {
    PipelineStage.INTAKE: _h_intake,
    PipelineStage.INFLUENCER_SETUP: _h_influencer_setup,
    PipelineStage.PROVIDER_CONNECTION: _h_provider_connection,
    PipelineStage.IDEA_GENERATION: _h_idea_generation,
    PipelineStage.IDEA_APPROVAL: _h_gate_passthrough,
    PipelineStage.SCRIPT_GENERATION: _h_script_generation,
    PipelineStage.SCRIPT_APPROVAL: _h_gate_passthrough,
    PipelineStage.COST_ESTIMATE: _h_cost_estimate,
    PipelineStage.VIDEO_GENERATION: _h_video_generation,
    PipelineStage.QUALITY_CHECK: _h_quality_check,
    PipelineStage.PUBLISH_APPROVAL: _h_gate_passthrough,
    PipelineStage.POSTING: _h_posting,
    PipelineStage.ANALYTICS: _h_analytics,
}


def _estimated_cost_for(state: PipelineState, stage: PipelineStage) -> float:
    """Surface the run's estimated cost on cost/video stage logs (else 0.0)."""
    if stage in (PipelineStage.COST_ESTIMATE, PipelineStage.VIDEO_GENERATION):
        try:
            return float(state.cost_estimate.get("estimated_provider_cost", 0.0))
        except (TypeError, ValueError):
            return 0.0
    return 0.0


def run_stage(state: PipelineState, stage: PipelineStage) -> PipelineState:
    """Run one pipeline stage, log it, and advance the cursor.

    Steps: (1) gate enforcement, (2) deterministic handler dispatch,
    (3) AgentLog write + append to `state.logs`, (4) advance `state.stage`.
    Never raises except `GateError`.
    """
    require_for_stage(state, stage)

    handler = _HANDLERS[stage]
    handler(state)

    log = AgentLog(
        tenant_id=state.tenant_id,
        stage=stage.value,
        status=JobStatus.DONE.value,
        model="",  # deterministic stages use no AI model
        estimated_cost=_estimated_cost_for(state, stage),
    )
    rec = get_agent_log_store().add(log)
    state.logs.append(rec)

    nxt = next_stage(stage)
    if nxt is not None:
        state.stage = nxt

    return state
