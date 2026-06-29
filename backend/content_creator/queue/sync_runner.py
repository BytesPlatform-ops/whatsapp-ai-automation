"""Synchronous local pipeline runner — PURE STDLIB.

`run_pipeline` walks `STAGE_SEQUENCE` from the state's current stage and runs each
stage via `orchestrator.run_stage`, with no Redis and no async worker. It is the
local driver used by the demo/tests so the whole 13-stage workflow runs offline.

Gate handling per stage (the only branch that matters):
  * Before each stage we call `require_for_stage` (inside `run_stage`).
  * If a `GateError` is raised:
      - `auto_approve=True`  → APPROVE that gate and retry the stage (demo mode).
      - `auto_approve=False` → STOP and return the state parked at the blocked
        stage (real owner-in-the-loop: the API resumes after the human decides).
"""

from __future__ import annotations

from typing import Optional

from ..enums import ApprovalStatus, PipelineStage
from ..pipeline import orchestrator
from ..pipeline.gates import GateError, set_approval
from ..pipeline.stages import PipelineState, gate_blocking, stage_index


def run_pipeline(
    state: PipelineState,
    *,
    auto_approve: bool = False,
    stop_at: Optional[PipelineStage] = None,
) -> PipelineState:
    """Run stages from `state.stage` forward.

    Returns `state` when it reaches the end, hits a closed gate (auto_approve
    False), or completes `stop_at` (inclusive). Idempotent re-entry: call again
    after recording an approval to continue from where it parked.
    """
    while True:
        stage = state.stage

        try:
            orchestrator.run_stage(state, stage)
        except GateError as exc:
            if not auto_approve:
                # Park at the blocked stage; caller resumes after owner decides.
                return state
            # Demo mode: auto-approve the blocking gate and retry this stage.
            set_approval(state, exc.gate, ApprovalStatus.APPROVED)
            continue

        # `run_stage` advanced state.stage already. Honor stop_at (inclusive).
        if stop_at is not None and stage_index(stage) >= stage_index(stop_at):
            return state

        # Reached the terminal stage (no advance happened) → done.
        if state.stage == stage:
            return state

    return state  # unreachable; for clarity


# `gate_blocking` is imported for callers that want to introspect the next gate
# without invoking a stage; re-exported here to keep the runner self-describing.
__all__ = ["run_pipeline", "gate_blocking"]
