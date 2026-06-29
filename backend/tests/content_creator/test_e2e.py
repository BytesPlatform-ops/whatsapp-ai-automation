"""Wave 4 end-to-end QA sweep for the Content Creator — PURE STDLIB, OFFLINE.

Drives the full 13-stage pipeline through the synchronous local runner
(``content_creator.queue.sync_runner.run_pipeline``) with NO API keys, asserting
the Definition of Done (§18):

  1. Full 13-stage mock pipeline runs end-to-end with no keys.
  2. The 4 owner-approval gates are enforced (runner stops; require_for_stage raises).
  3. No spend before Gate 3 — VIDEO_GENERATION blocked until PRODUCTION approved.
  4. No live posting — every post is dry-run (would_post=False / status dry_run).
  5. Locked identity — the generated video carries a non-empty identity_ref.
  6. Tenant scoping — tenant A's store data is invisible to tenant B.
  7. Agent logs — one per stage, each carrying tenant/stage/status + cost/latency/model.
  8. AI-vs-deterministic boundary — deterministic stages log model == "".

Everything runs on the system Python 3.9 (stdlib only); the FastAPI router / demo /
TestClient + pydantic tests run in the lead's venv and are intentionally NOT touched.
"""

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

import unittest

from content_creator.agents.agent_log import AgentLog, get_agent_log_store
from content_creator.enums import (
    ApprovalGate,
    ApprovalStatus,
    JobStatus,
    PipelineStage,
    STAGE_SEQUENCE,
)
from content_creator.pipeline.gates import (
    GateError,
    require_for_stage,
    set_approval,
)
from content_creator.pipeline.stages import PipelineState
from content_creator.queue.sync_runner import run_pipeline

# NOTE: content_creator.store (idea/video/post repos) imports the Pydantic
# schemas, which are NOT installed on the system 3.9 interpreter these E2E tests
# target. To stay stdlib-only/offline we exercise tenant scoping through the
# pure-stdlib AgentLog store (and the pipeline's own per-tenant state) instead of
# the Pydantic-backed repositories. The repository-level scoping is covered by
# the lead's venv tests (tests.content_creator.test_stores).


# Stages that must never carry an AI model in fake/mock mode (the deterministic
# boundary). idea/script may carry a model in a real run; in fake mode they are ""
# too — but these stages must ALWAYS be "".
_DETERMINISTIC_STAGES = {
    PipelineStage.INTAKE.value,
    PipelineStage.INFLUENCER_SETUP.value,
    PipelineStage.PROVIDER_CONNECTION.value,
    PipelineStage.IDEA_APPROVAL.value,
    PipelineStage.SCRIPT_APPROVAL.value,
    PipelineStage.COST_ESTIMATE.value,
    PipelineStage.VIDEO_GENERATION.value,
    PipelineStage.QUALITY_CHECK.value,
    PipelineStage.PUBLISH_APPROVAL.value,
    PipelineStage.POSTING.value,
    PipelineStage.ANALYTICS.value,
}

# Stages that MAY carry an AI model (idea/script generation).
_AI_CAPABLE_STAGES = {
    PipelineStage.IDEA_GENERATION.value,
    PipelineStage.SCRIPT_GENERATION.value,
}

_LOG_FIELDS = (
    "tenant_id",
    "stage",
    "status",
    "model",
    "estimated_cost",
    "actual_cost",
    "latency_ms",
)


class TestFullMockPipeline(unittest.TestCase):
    """DoD #1 — full 13-stage run with NO keys reaches analytics with all artifacts."""

    def test_auto_approve_reaches_analytics_with_artifacts(self):
        state = run_pipeline(PipelineState(tenant_id="e2e_full"), auto_approve=True)

        # Terminal stage reached.
        self.assertEqual(state.stage, PipelineStage.ANALYTICS)

        # All 13 stages produced something.
        self.assertTrue(state.profile, "profile seeded at intake")
        self.assertTrue(state.identity, "identity seeded at influencer setup")
        self.assertTrue(state.provider, "provider seeded at connection")
        self.assertTrue(state.ideas, "ideas generated")
        self.assertTrue(state.script.get("body"), "script body produced")
        self.assertTrue(state.cost_estimate, "cost estimate produced")
        self.assertEqual(state.video.get("status"), "mock", "mock video produced")
        self.assertTrue(state.quality, "quality result produced")
        self.assertTrue(state.posts, "dry-run posts produced")
        self.assertTrue(state.metrics, "metrics synced")
        self.assertEqual(state.metrics.get("synced"), len(state.metrics.get("items", [])))
        self.assertTrue(state.learning, "learning summary produced")
        self.assertIn("insights", state.learning)
        self.assertIn("next_focus", state.learning)

    def test_all_four_gates_approved_after_auto_run(self):
        state = run_pipeline(PipelineState(tenant_id="e2e_gates_open"), auto_approve=True)
        for gate in ApprovalGate:
            self.assertEqual(
                state.approvals[gate.value],
                ApprovalStatus.APPROVED.value,
                "gate %s should be auto-approved" % gate.value,
            )


class TestGatesEnforced(unittest.TestCase):
    """DoD #2 — the 4 gates are enforced: runner stops + require_for_stage raises."""

    def test_manual_run_stops_at_first_gate(self):
        state = run_pipeline(PipelineState(tenant_id="e2e_stop"), auto_approve=False)

        # Parked at SCRIPT_GENERATION (the first gated stage), behind Gate 1 (idea).
        self.assertEqual(state.stage, PipelineStage.SCRIPT_GENERATION)

        # Ideas precede the gate and exist; nothing past the gate was produced.
        self.assertTrue(state.ideas, "ideas precede Gate 1")
        self.assertFalse(state.script, "no script before Gate 1")
        self.assertFalse(state.cost_estimate, "no cost before Gate 1")
        self.assertFalse(state.video, "no video before Gate 1")

    def test_require_for_stage_raises_for_each_gated_stage(self):
        # A pristine state: every gate PENDING. Each gated stage must raise.
        gated = {
            PipelineStage.SCRIPT_GENERATION: ApprovalGate.IDEA,
            PipelineStage.COST_ESTIMATE: ApprovalGate.SCRIPT,
            PipelineStage.VIDEO_GENERATION: ApprovalGate.PRODUCTION,
            PipelineStage.POSTING: ApprovalGate.PUBLISH,
        }
        for stage, gate in gated.items():
            state = PipelineState(tenant_id="e2e_req")
            with self.assertRaises(GateError) as ctx:
                require_for_stage(state, stage)
            self.assertEqual(ctx.exception.gate, gate)
            self.assertEqual(ctx.exception.stage, stage)
            self.assertEqual(ctx.exception.status, ApprovalStatus.PENDING.value)

    def test_ungated_stage_does_not_raise(self):
        # IDEA_GENERATION / QUALITY_CHECK / ANALYTICS are ungated.
        state = PipelineState(tenant_id="e2e_ungated")
        for stage in (
            PipelineStage.IDEA_GENERATION,
            PipelineStage.QUALITY_CHECK,
            PipelineStage.ANALYTICS,
        ):
            require_for_stage(state, stage)  # must not raise


class TestNoSpendBeforeProductionGate(unittest.TestCase):
    """DoD #3 — VIDEO_GENERATION (spend) is blocked until Gate 3 (PRODUCTION)."""

    def test_video_blocked_until_production_approved(self):
        state = PipelineState(tenant_id="e2e_spend")
        # Approve the gates that precede production so we isolate Gate 3.
        set_approval(state, ApprovalGate.IDEA, ApprovalStatus.APPROVED)
        set_approval(state, ApprovalGate.SCRIPT, ApprovalStatus.APPROVED)

        # PRODUCTION still PENDING → video generation must raise, no video produced.
        with self.assertRaises(GateError) as ctx:
            require_for_stage(state, PipelineStage.VIDEO_GENERATION)
        self.assertEqual(ctx.exception.gate, ApprovalGate.PRODUCTION)
        self.assertFalse(state.video, "no video before PRODUCTION approval")

        # Approve PRODUCTION → now the gate passes (no spend happened before).
        set_approval(state, ApprovalGate.PRODUCTION, ApprovalStatus.APPROVED)
        require_for_stage(state, PipelineStage.VIDEO_GENERATION)  # must not raise

    def test_manual_run_to_production_then_resume_produces_video(self):
        # Walk the owner-in-the-loop path: park, approve, resume, repeat.
        state = PipelineState(tenant_id="e2e_resume")

        state = run_pipeline(state, auto_approve=False)
        self.assertEqual(state.stage, PipelineStage.SCRIPT_GENERATION)
        self.assertFalse(state.video)

        set_approval(state, ApprovalGate.IDEA, ApprovalStatus.APPROVED)
        state = run_pipeline(state, auto_approve=False)
        self.assertEqual(state.stage, PipelineStage.COST_ESTIMATE)
        self.assertFalse(state.video, "still no spend before PRODUCTION")

        set_approval(state, ApprovalGate.SCRIPT, ApprovalStatus.APPROVED)
        state = run_pipeline(state, auto_approve=False)
        # Parked at VIDEO_GENERATION behind Gate 3 — cost estimated but NO video.
        self.assertEqual(state.stage, PipelineStage.VIDEO_GENERATION)
        self.assertTrue(state.cost_estimate, "cost estimate runs before the spend gate")
        self.assertFalse(state.video, "NO spend / video before PRODUCTION approval")

        set_approval(state, ApprovalGate.PRODUCTION, ApprovalStatus.APPROVED)
        set_approval(state, ApprovalGate.PUBLISH, ApprovalStatus.APPROVED)
        state = run_pipeline(state, auto_approve=False)
        self.assertEqual(state.stage, PipelineStage.ANALYTICS)
        self.assertEqual(state.video.get("status"), "mock", "video only after Gate 3")


class TestNoLivePosting(unittest.TestCase):
    """DoD #4 — every post is dry-run; nothing publishes live."""

    def test_every_post_is_dry_run(self):
        state = run_pipeline(PipelineState(tenant_id="e2e_post"), auto_approve=True)
        self.assertTrue(state.posts)
        for post in state.posts:
            self.assertFalse(post["would_post"], "would_post must be False")
            self.assertEqual(post["status"], "dry_run", "status must be dry_run")


class TestLockedIdentity(unittest.TestCase):
    """DoD #5 — the generated video carries the locked identity reference."""

    def test_video_carries_non_empty_identity_ref(self):
        state = run_pipeline(PipelineState(tenant_id="e2e_identity"), auto_approve=True)
        identity_ref = state.video.get("identity_ref", "")
        self.assertTrue(identity_ref, "video must carry a non-empty identity_ref")
        # The seeded identity reference is injected into the prompt and echoed back.
        self.assertEqual(identity_ref, state.identity.get("reference_ref"))


class TestTenantScoping(unittest.TestCase):
    """DoD #6 — tenant A's data is invisible to tenant B.

    Exercised through the pure-stdlib AgentLog store (a representative tenant-
    scoped store) plus the pipeline's own per-tenant state. The Pydantic-backed
    idea/video/post repositories cannot be imported on the stdlib-only 3.9
    interpreter, so repo-level scoping is left to the lead's venv suite
    (tests.content_creator.test_stores).
    """

    def test_agent_log_store_filters_by_tenant_direct(self):
        store = get_agent_log_store()
        a, b = "e2e_scope_A", "e2e_scope_B"

        # Distinct stages logged for each tenant.
        store.add(AgentLog(tenant_id=a, stage="intake", status=JobStatus.DONE.value))
        store.add(AgentLog(tenant_id=a, stage="posting", status=JobStatus.DONE.value))
        store.add(AgentLog(tenant_id=b, stage="intake", status=JobStatus.DONE.value))

        a_logs = store.list(a)
        b_logs = store.list(b)

        # Each tenant sees only its own rows.
        self.assertEqual(len(a_logs), 2)
        self.assertEqual(len(b_logs), 1)
        self.assertTrue(all(r["tenant_id"] == a for r in a_logs))
        self.assertTrue(all(r["tenant_id"] == b for r in b_logs))

        # Stage filtering is also tenant-scoped: B's "posting" is empty.
        self.assertEqual(store.list(a, stage="posting"), [r for r in a_logs if r["stage"] == "posting"])
        self.assertEqual(store.list(b, stage="posting"), [])

        # An unrelated tenant sees nothing.
        self.assertEqual(store.list("e2e_scope_unknown"), [])

    def test_pipeline_runs_keep_tenants_isolated(self):
        run_pipeline(PipelineState(tenant_id="e2e_log_A"), auto_approve=True)
        run_pipeline(PipelineState(tenant_id="e2e_log_B"), auto_approve=True)
        store = get_agent_log_store()
        a_logs = store.list("e2e_log_A")
        b_logs = store.list("e2e_log_B")
        self.assertTrue(a_logs and b_logs)
        for rec in a_logs:
            self.assertEqual(rec["tenant_id"], "e2e_log_A")
        for rec in b_logs:
            self.assertEqual(rec["tenant_id"], "e2e_log_B")
        # A full run logs exactly one row per stage for its tenant.
        self.assertEqual(len(a_logs), len(STAGE_SEQUENCE))
        self.assertEqual(len(b_logs), len(STAGE_SEQUENCE))


class TestAgentLogsPerStage(unittest.TestCase):
    """DoD #7 — one agent log per stage, each carrying the required fields."""

    def test_one_log_per_stage_with_required_fields(self):
        tenant = "e2e_logs_fields"
        state = run_pipeline(PipelineState(tenant_id=tenant), auto_approve=True)

        # Per-run logs: exactly one per stage, in sequence.
        self.assertEqual(len(state.logs), len(STAGE_SEQUENCE))
        self.assertEqual(
            [rec["stage"] for rec in state.logs],
            [s.value for s in STAGE_SEQUENCE],
        )

        for rec in state.logs:
            self.assertEqual(rec["tenant_id"], tenant)
            self.assertEqual(rec["status"], "done")
            for field in _LOG_FIELDS:
                self.assertIn(field, rec, "log must carry field %r" % field)

        # The store independently returns one entry per stage for this tenant.
        store_logs = get_agent_log_store().list(tenant)
        self.assertEqual(
            sorted(r["stage"] for r in store_logs),
            sorted(s.value for s in STAGE_SEQUENCE),
        )


class TestAiVsDeterministicBoundary(unittest.TestCase):
    """DoD #8 — deterministic stages carry model == ""; the model field always exists."""

    def test_deterministic_stages_have_empty_model(self):
        tenant = "e2e_boundary"
        state = run_pipeline(PipelineState(tenant_id=tenant), auto_approve=True)

        by_stage = {rec["stage"]: rec for rec in state.logs}
        for stage_value, rec in by_stage.items():
            # The model field is always present (auditable).
            self.assertIn("model", rec)
            if stage_value in _DETERMINISTIC_STAGES:
                self.assertEqual(
                    rec["model"], "",
                    "deterministic stage %s must use no AI model" % stage_value,
                )
            else:
                # AI-capable stages: field exists; in fake mode it is "" too.
                self.assertIn(stage_value, _AI_CAPABLE_STAGES)


if __name__ == "__main__":
    unittest.main()
