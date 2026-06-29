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
from ..agents.mock_ai import mock_learning
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


def _h_video_generation(state: PipelineState) -> None:
    from ..providers.base import get_higgsfield_provider

    prompt = {
        "identity_ref": state.identity.get("reference_ref", ""),
        "script": state.script.get("body", ""),
        "background": "studio-mock",
        "aspect_ratio": "9:16",
        "duration_seconds": 15,
        "negative_prompt": "low quality, distorted",
    }
    state.video = get_higgsfield_provider().generate(prompt)


def _h_quality_check(state: PipelineState) -> None:
    from ..quality.deterministic import run_deterministic_checks

    state.quality = run_deterministic_checks(state.video, state=state.to_dict())


def _h_posting(state: PipelineState) -> None:
    # Wave 1 dry-run stub. TODO(Wave 3): real Meta/Instagram/TikTok publish
    # adapters replace this stub with scheduled/posted records + platform ids.
    state.posts.append({"platform": "meta", "status": "dry_run", "dry_run": True})


def _h_analytics(state: PipelineState) -> None:
    # Wave 1 stub. TODO(Wave 3): pull real per-platform metrics and feed the
    # full learning loop instead of an empty-sample mock.
    state.metrics = {"views": 0, "likes": 0, "comments": 0, "shares": 0, "saves": 0}
    state.learning = mock_learning([])


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
