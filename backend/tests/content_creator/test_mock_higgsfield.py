import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from content_creator.providers import get_higgsfield_provider
from content_creator.providers.mock_higgsfield import MockHiggsfieldProvider


PROMPT = {
    "identity_ref": "identity-locked-abc",
    "background": "studio-soft-light",
    "script": "Hook. Value. CTA.",
    "aspect_ratio": "9:16",
    "model": "standard",
}


class TestMockHiggsfield(unittest.TestCase):
    def setUp(self):
        # Ensure no key is present so the mock path is exercised.
        self._saved_key = os.environ.pop("HIGGSFIELD_API_KEY", None)

    def tearDown(self):
        if self._saved_key is not None:
            os.environ["HIGGSFIELD_API_KEY"] = self._saved_key

    def test_generates_without_api_key(self):
        provider = MockHiggsfieldProvider()
        result = provider.generate(PROMPT, duration_seconds=15)
        self.assertEqual(result["status"], "mock")
        self.assertTrue(result["asset_ref"].startswith("mock-video-"))
        self.assertTrue(result["preview_ref"].startswith("mock-preview-"))
        self.assertEqual(result["duration_seconds"], 15)

    def test_echoes_locked_identity_invariant(self):
        result = MockHiggsfieldProvider().generate(PROMPT)
        self.assertEqual(result["identity_ref"], "identity-locked-abc")
        self.assertEqual(result["background"], "studio-soft-light")
        self.assertEqual(result["aspect_ratio"], "9:16")
        self.assertEqual(result["script"], "Hook. Value. CTA.")

    def test_default_aspect_ratio_is_vertical(self):
        result = MockHiggsfieldProvider().generate({"identity_ref": "x", "script": "y"})
        self.assertEqual(result["aspect_ratio"], "9:16")

    def test_deterministic_same_prompt_same_asset(self):
        a = MockHiggsfieldProvider().generate(PROMPT)
        b = MockHiggsfieldProvider().generate(PROMPT)
        self.assertEqual(a["asset_ref"], b["asset_ref"])
        self.assertEqual(a["preview_ref"], b["preview_ref"])

    def test_different_prompt_different_asset(self):
        a = MockHiggsfieldProvider().generate(PROMPT)
        other = dict(PROMPT, script="Completely different script")
        b = MockHiggsfieldProvider().generate(other)
        self.assertNotEqual(a["asset_ref"], b["asset_ref"])

    def test_factory_returns_mock_without_key(self):
        provider = get_higgsfield_provider()
        self.assertIsInstance(provider, MockHiggsfieldProvider)
        self.assertEqual(provider.name, "mock")


if __name__ == "__main__":
    unittest.main()
