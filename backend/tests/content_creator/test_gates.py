import os, sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

import unittest

from content_creator.enums import ApprovalGate, ApprovalStatus, PipelineStage
from content_creator.pipeline.gates import (
    GateError,
    gate_status,
    is_approved,
    require_for_stage,
    set_approval,
)
from content_creator.pipeline.stages import PipelineState


# Map each gated stage to the gate that guards it.
GATED = {
    PipelineStage.SCRIPT_GENERATION: ApprovalGate.IDEA,
    PipelineStage.COST_ESTIMATE: ApprovalGate.SCRIPT,
    PipelineStage.VIDEO_GENERATION: ApprovalGate.PRODUCTION,
    PipelineStage.POSTING: ApprovalGate.PUBLISH,
}


class TestGateEnforcement(unittest.TestCase):
    def test_blocks_when_pending(self):
        for stage, gate in GATED.items():
            state = PipelineState(tenant_id="t1")
            with self.assertRaises(GateError, msg="%s should block" % stage.value) as cm:
                require_for_stage(state, stage)
            self.assertEqual(cm.exception.gate, gate)
            self.assertEqual(cm.exception.stage, stage)

    def test_passes_after_approval(self):
        for stage, gate in GATED.items():
            state = PipelineState(tenant_id="t1")
            set_approval(state, gate, ApprovalStatus.APPROVED)
            self.assertTrue(is_approved(state, gate))
            # Should not raise.
            require_for_stage(state, stage)

    def test_ungated_stage_never_blocks(self):
        state = PipelineState(tenant_id="t1")
        for stage in (
            PipelineStage.INTAKE,
            PipelineStage.IDEA_GENERATION,
            PipelineStage.IDEA_APPROVAL,
            PipelineStage.QUALITY_CHECK,
            PipelineStage.ANALYTICS,
        ):
            require_for_stage(state, stage)  # no raise


class TestNoSpendBeforeGate3(unittest.TestCase):
    """VIDEO_GENERATION (the first paid stage) must be blocked until PRODUCTION."""

    def test_video_blocked_until_production_approved(self):
        state = PipelineState(tenant_id="t1")
        # Approving earlier gates does NOT unlock video generation.
        set_approval(state, ApprovalGate.IDEA, ApprovalStatus.APPROVED)
        set_approval(state, ApprovalGate.SCRIPT, ApprovalStatus.APPROVED)
        with self.assertRaises(GateError):
            require_for_stage(state, PipelineStage.VIDEO_GENERATION)

        # Only the PRODUCTION (Gate 3) approval unlocks the spend.
        set_approval(state, ApprovalGate.PRODUCTION, ApprovalStatus.APPROVED)
        require_for_stage(state, PipelineStage.VIDEO_GENERATION)  # no raise

    def test_rejected_status_still_blocks(self):
        state = PipelineState(tenant_id="t1")
        set_approval(state, ApprovalGate.PRODUCTION, ApprovalStatus.REJECTED)
        with self.assertRaises(GateError):
            require_for_stage(state, PipelineStage.VIDEO_GENERATION)


class TestGateStatus(unittest.TestCase):
    def test_reports_all_four_gates(self):
        state = PipelineState(tenant_id="t1")
        status = gate_status(state)
        self.assertEqual(set(status), {g.value for g in ApprovalGate})
        for v in status.values():
            self.assertEqual(v, ApprovalStatus.PENDING.value)

        set_approval(state, ApprovalGate.IDEA, ApprovalStatus.APPROVED)
        self.assertEqual(
            gate_status(state)[ApprovalGate.IDEA.value],
            ApprovalStatus.APPROVED.value,
        )


if __name__ == "__main__":
    unittest.main()
