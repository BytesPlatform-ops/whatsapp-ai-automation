import os, sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

import importlib
import unittest

from content_creator.enums import PipelineStage
from content_creator.pipeline.stages import PipelineState
from content_creator.queue.sync_runner import run_pipeline


def _providers_available():
    """The full run touches modules built by the providers subagent."""
    for mod in (
        "content_creator.providers.base",
        "content_creator.cost.estimator",
        "content_creator.quality.deterministic",
    ):
        try:
            importlib.import_module(mod)
        except Exception:
            return False
    return True


PROVIDERS_READY = _providers_available()


class TestAutoApproveFullRun(unittest.TestCase):
    @unittest.skipUnless(
        PROVIDERS_READY,
        "providers/cost/quality modules not merged yet (parallel subagent)",
    )
    def test_full_pipeline_reaches_analytics(self):
        state = run_pipeline(PipelineState(tenant_id="t1"), auto_approve=True)

        # Terminal stage reached.
        self.assertEqual(state.stage, PipelineStage.ANALYTICS)

        # Artifacts produced along the way.
        self.assertTrue(state.ideas, "ideas should be generated")
        self.assertTrue(state.script.get("body"), "script body should exist")
        self.assertTrue(state.cost_estimate, "cost_estimate should exist")
        self.assertEqual(state.video.get("status"), "mock")
        self.assertTrue(state.quality, "quality result should exist")
        self.assertTrue(state.posts, "a dry-run post should be recorded")
        self.assertTrue(state.metrics, "metrics stub should exist")
        self.assertTrue(state.learning, "learning stub should exist")

    @unittest.skipUnless(
        PROVIDERS_READY,
        "providers/cost/quality modules not merged yet (parallel subagent)",
    )
    def test_one_agent_log_per_stage_with_tenant(self):
        state = run_pipeline(PipelineState(tenant_id="t1"), auto_approve=True)

        # One log per stage in STAGE_SEQUENCE.
        self.assertEqual(len(state.logs), len(list(PipelineStage)))
        stages_logged = [rec["stage"] for rec in state.logs]
        self.assertEqual(stages_logged, [s.value for s in PipelineStage])

        # Every log carries the tenant.
        for rec in state.logs:
            self.assertEqual(rec["tenant_id"], "t1")


class TestManualGateStops(unittest.TestCase):
    """auto_approve=False stops at the first closed gate — no script generated.

    This needs only gates + mock_ai (idea generation), so it runs even before the
    providers subagent is merged.
    """

    def test_stops_at_first_gate(self):
        state = run_pipeline(PipelineState(tenant_id="t2"), auto_approve=False)

        # IDEA_APPROVAL (stage 5) is ungated and runs; SCRIPT_GENERATION (stage 6)
        # is the first gated stage and is blocked → parked there.
        self.assertEqual(state.stage, PipelineStage.SCRIPT_GENERATION)

        # Ideas were generated (before the gate); script was NOT.
        self.assertTrue(state.ideas, "ideas precede the first gate")
        self.assertFalse(state.script, "script must not be generated before Gate 1")

        # No cost estimate / video / spend.
        self.assertFalse(state.cost_estimate)
        self.assertFalse(state.video)


if __name__ == "__main__":
    unittest.main()
