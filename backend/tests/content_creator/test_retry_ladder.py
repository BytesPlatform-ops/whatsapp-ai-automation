import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from content_creator.quality.retry_ladder import (
    RETRY_LADDER,
    apply_action,
    next_action,
    run_quality_with_retries,
)

_APPROVED_STATE = {"approvals": {"production": "approved"}}


def _good_video(prompt):
    """A generate_fn that always returns a passing video."""
    return {
        "status": "mock",
        "asset_ref": "mock-video-good",
        "identity_ref": prompt.get("identity_ref", "identity-locked-abc"),
        "background": prompt.get("background", "studio-soft-light"),
        "script": prompt.get("script", "Hook. Value. CTA."),
        "aspect_ratio": "9:16",
        "duration_seconds": 15,
    }


def _bad_video(prompt):
    """A generate_fn that always returns a failing video (missing identity_ref)."""
    return {
        "status": "mock",
        "asset_ref": "mock-video-bad",
        "identity_ref": "",
        "background": prompt.get("background", "studio-soft-light"),
        "script": prompt.get("script", "Hook. Value. CTA."),
        "aspect_ratio": "9:16",
        "duration_seconds": 15,
    }


class NextActionTests(unittest.TestCase):
    def test_walks_the_ladder(self):
        budget = len(RETRY_LADDER)
        for i in range(len(RETRY_LADDER)):
            self.assertEqual(next_action(i, budget), RETRY_LADDER[i])

    def test_manual_review_at_or_after_budget(self):
        self.assertEqual(next_action(2, 2), "manual_review")
        self.assertEqual(next_action(3, 2), "manual_review")

    def test_manual_review_past_ladder(self):
        big = len(RETRY_LADDER) + 5
        self.assertEqual(next_action(len(RETRY_LADDER), big), "manual_review")

    def test_negative_attempt_is_manual(self):
        self.assertEqual(next_action(-1, 3), "manual_review")


class ApplyActionTests(unittest.TestCase):
    def test_does_not_mutate_input(self):
        prompt = {"realism_cues": ["a"], "model": "standard"}
        snapshot = {"realism_cues": ["a"], "model": "standard"}
        apply_action(prompt, "tweak_prompt")
        apply_action(prompt, "escalate_model")
        self.assertEqual(prompt, snapshot)

    def test_tweak_prompt_appends_realism_cue(self):
        out = apply_action({"realism_cues": ["x"]}, "tweak_prompt")
        self.assertEqual(len(out["realism_cues"]), 2)
        self.assertEqual(out["realism_cues"][0], "x")

    def test_tweak_prompt_handles_missing_cues(self):
        out = apply_action({}, "tweak_prompt")
        self.assertEqual(len(out["realism_cues"]), 1)

    def test_stricter_identity_sets_flag(self):
        out = apply_action({}, "stricter_identity")
        self.assertTrue(out["identity_strict"])

    def test_strengthen_negative_grows_negative_prompt(self):
        out1 = apply_action({}, "strengthen_negative")
        self.assertTrue(len(out1["negative_prompt"]) > 0)
        out2 = apply_action({"negative_prompt": "ugly"}, "strengthen_negative")
        self.assertTrue(out2["negative_prompt"].startswith("ugly"))
        self.assertTrue(len(out2["negative_prompt"]) > len("ugly"))

    def test_escalate_model_standard_to_premium(self):
        out = apply_action({"model": "standard"}, "escalate_model")
        self.assertEqual(out["model"], "premium")

    def test_manual_review_sets_flag(self):
        out = apply_action({}, "manual_review")
        self.assertTrue(out["manual_review"])

    def test_deterministic(self):
        prompt = {"realism_cues": ["x"], "model": "standard"}
        a = apply_action(prompt, "tweak_prompt")
        b = apply_action(prompt, "tweak_prompt")
        self.assertEqual(a, b)


class RunQualityWithRetriesTests(unittest.TestCase):
    def test_good_video_passes_first_attempt(self):
        prompt = {"identity_ref": "identity-locked-abc", "script": "Hook."}
        result = run_quality_with_retries(
            prompt, _good_video, state=_APPROVED_STATE, max_retries=2
        )
        self.assertEqual(result["status"], "pass")
        self.assertIn(result["attempts"], (0, 1))
        self.assertFalse(result["manual_review"])

    def test_bad_video_exhausts_retries_to_manual_review(self):
        prompt = {"identity_ref": "identity-locked-abc", "script": "Hook."}
        result = run_quality_with_retries(
            prompt, _bad_video, state=_APPROVED_STATE, max_retries=2
        )
        self.assertEqual(result["status"], "manual_review")
        self.assertTrue(result["manual_review"])
        self.assertEqual(result["attempts"], 2)
        self.assertEqual(len(result["actions"]), 2)

    def test_deterministic_results(self):
        prompt = {"identity_ref": "identity-locked-abc", "script": "Hook."}
        r1 = run_quality_with_retries(
            prompt, _bad_video, state=_APPROVED_STATE, max_retries=2
        )
        r2 = run_quality_with_retries(
            prompt, _bad_video, state=_APPROVED_STATE, max_retries=2
        )
        self.assertEqual(r1["status"], r2["status"])
        self.assertEqual(r1["attempts"], r2["attempts"])
        self.assertEqual(r1["actions"], r2["actions"])

    def test_never_raises_on_bad_input(self):
        result = run_quality_with_retries(
            {}, _good_video, state={}, max_retries=0
        )
        self.assertIn(result["status"], ("pass", "manual_review"))


if __name__ == "__main__":
    unittest.main()
