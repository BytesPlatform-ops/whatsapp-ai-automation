"""Approval gates — owner-in-the-loop enforcement — PURE STDLIB.

Four gates guard the pipeline (see enums.ApprovalGate / GATE_BLOCKS_STAGE):

    Gate 1 · IDEA       must be APPROVED before SCRIPT_GENERATION
    Gate 2 · SCRIPT     must be APPROVED before COST_ESTIMATE
    Gate 3 · PRODUCTION must be APPROVED before VIDEO_GENERATION  ← NO SPEND before this
    Gate 4 · PUBLISH    must be APPROVED before POSTING

`require_for_stage` is the single enforcement point the orchestrator/runner call
before doing any work for a stage. Gate state lives on `state.approvals`, a plain
dict keyed by `ApprovalGate.value` → `ApprovalStatus.value`, so the core stays
Pydantic-free and deterministic.
"""

from __future__ import annotations

from typing import Dict

from ..enums import ApprovalGate, ApprovalStatus, PipelineStage
from .stages import gate_blocking


class GateError(Exception):
    """Raised when a stage is attempted while its blocking gate is not approved."""

    def __init__(self, gate: ApprovalGate, stage: PipelineStage, status: str) -> None:
        self.gate = gate
        self.stage = stage
        self.status = status
        super().__init__(
            "Stage '%s' is blocked by gate '%s' (status=%s); owner approval required."
            % (stage.value, gate.value, status)
        )


def set_approval(state, gate: ApprovalGate, status: ApprovalStatus, note: str = "") -> None:
    """Record an owner decision for `gate`. `note` is accepted for API parity."""
    state.approvals[gate.value] = status.value


def is_approved(state, gate: ApprovalGate) -> bool:
    """True only when the gate is explicitly APPROVED."""
    return state.approvals.get(gate.value) == ApprovalStatus.APPROVED.value


def require_for_stage(state, stage: PipelineStage) -> None:
    """Enforce the gate that guards `stage`. No-op for ungated stages.

    Raises `GateError` if the stage has a blocking gate that is not APPROVED.
    This is the no-spend guarantee for VIDEO_GENERATION (Gate 3 / PRODUCTION).
    """
    gate = gate_blocking(stage)
    if gate is None:
        return
    if not is_approved(state, gate):
        status = state.approvals.get(gate.value, ApprovalStatus.PENDING.value)
        raise GateError(gate, stage, status)


def gate_status(state) -> Dict[str, str]:
    """Current status of all four gates: {gate.value: status.value}."""
    return {
        g.value: state.approvals.get(g.value, ApprovalStatus.PENDING.value)
        for g in ApprovalGate
    }
