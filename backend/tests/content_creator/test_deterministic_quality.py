import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from content_creator.enums import QualityStatus
from content_creator.quality.deterministic import run_deterministic_checks


def _complete_video(**overrides):
    video = {
        "identity_ref": "identity-locked-abc",
        "background": "studio-soft-light",
        "script": "Hook. Value. CTA.",
        "aspect_ratio": "9:16",
        "duration_seconds": 15,
        "status": "mock",
    }
    video.update(overrides)
    return video


_APPROVED_STATE = {"approvals": {"production": "approved"}}


class TestDeterministicQuality(unittest.TestCase):
    def test_complete_video_passes(self):
        r = run_deterministic_checks(_complete_video(), state=_APPROVED_STATE)
        self.assertTrue(r["passed"])
        self.assertEqual(r["deterministic_flags"], [])
        self.assertEqual(r["status"], QualityStatus.PASS.value)

    def test_missing_identity_flags_and_needs_retry(self):
        video = _complete_video()
        del video["identity_ref"]
        r = run_deterministic_checks(video, state=_APPROVED_STATE)
        self.assertFalse(r["passed"])
        self.assertIn("identity_present", r["deterministic_flags"])
        self.assertEqual(r["status"], QualityStatus.NEEDS_RETRY.value)

    def test_wrong_aspect_ratio_flags(self):
        r = run_deterministic_checks(
            _complete_video(aspect_ratio="16:9"), state=_APPROVED_STATE
        )
        self.assertFalse(r["passed"])
        self.assertIn("aspect_ratio_9_16", r["deterministic_flags"])

    def test_missing_production_approval_flags(self):
        r = run_deterministic_checks(_complete_video(), state={"approvals": {}})
        self.assertFalse(r["passed"])
        self.assertIn("production_approved", r["deterministic_flags"])

    def test_never_raises_on_empty_inputs(self):
        r = run_deterministic_checks({}, state={})
        self.assertFalse(r["passed"])
        self.assertEqual(r["status"], QualityStatus.NEEDS_RETRY.value)


if __name__ == "__main__":
    unittest.main()
