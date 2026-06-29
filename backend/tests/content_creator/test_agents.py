"""Tests for the Content Creator AI agents (idea / scoring / script).

PURE STDLIB unittest. The model path is inert locally (importing ``models`` pulls
in pydantic, which is absent), so even ``CcAiClient()`` falls back to heuristics;
we force ``mode="fallback"`` for fully deterministic assertions regardless.

Run from ``backend/``:
    python3 -m unittest tests.content_creator.test_agents -v
"""

from __future__ import annotations

import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from content_creator.agents.ai_client import CcAiClient
from content_creator.agents.idea_agent import generate_ideas
from content_creator.agents.scoring_agent import score_idea
from content_creator.agents.script_agent import generate_script


PROFILE = {
    "business_name": "Glow Salon",
    "niche": "hair salon",
    "brand_tone": "warm and confident",
    "target_audience": "salon owners",
    "language": "en",
    "key_offers": "color, cuts, styling",
    "compliance_notes": "no medical claims",
}


def _fb() -> CcAiClient:
    return CcAiClient(mode="fallback")


class TestIdeaAgent(unittest.TestCase):
    def test_returns_nonempty_shaped_list(self):
        ideas = generate_ideas(PROFILE, ai=_fb())
        self.assertIsInstance(ideas, list)
        self.assertTrue(ideas)
        for idea in ideas:
            self.assertIn("title", idea)
            self.assertIn("angle", idea)
            self.assertIn("hook", idea)

    def test_respects_n(self):
        ideas = generate_ideas(PROFILE, ai=_fb(), n=3)
        self.assertEqual(len(ideas), 3)

    def test_deterministic(self):
        a = generate_ideas(PROFILE, ai=_fb(), n=5)
        b = generate_ideas(PROFILE, ai=_fb(), n=5)
        self.assertEqual(a, b)


class TestScoringAgent(unittest.TestCase):
    def test_score_in_range_with_reasons(self):
        idea = {"title": "The 4pm slump booking trick", "angle": "tip", "hook": "Your chair is empty."}
        result = score_idea(idea, PROFILE, ai=_fb())
        self.assertIn("score", result)
        self.assertIn("reasons", result)
        self.assertIsInstance(result["score"], int)
        self.assertGreaterEqual(result["score"], 0)
        self.assertLessEqual(result["score"], 100)
        self.assertIsInstance(result["reasons"], list)
        self.assertTrue(result["reasons"])

    def test_deterministic(self):
        idea = {"title": "Same title every time"}
        a = score_idea(idea, PROFILE, ai=_fb())
        b = score_idea(idea, PROFILE, ai=_fb())
        self.assertEqual(a, b)


class TestScriptAgent(unittest.TestCase):
    def test_shape_and_word_band(self):
        idea = {"title": "The 4pm slump booking trick", "hook": "Your chair is empty."}
        script = generate_script(idea, PROFILE, ai=_fb())
        self.assertIn("hook", script)
        self.assertIn("body", script)
        self.assertIn("cta", script)
        self.assertEqual(script["approx_seconds"], 15)
        self.assertIsInstance(script["word_count"], int)
        self.assertGreaterEqual(script["word_count"], 30)
        self.assertLessEqual(script["word_count"], 60)

    def test_deterministic(self):
        idea = {"title": "Steady idea", "hook": "Watch this."}
        a = generate_script(idea, PROFILE, ai=_fb())
        b = generate_script(idea, PROFILE, ai=_fb())
        self.assertEqual(a, b)


class TestNeverRaiseOnGarbage(unittest.TestCase):
    def test_generate_ideas_empty(self):
        ideas = generate_ideas({}, ai=_fb())
        self.assertIsInstance(ideas, list)
        self.assertTrue(ideas)

    def test_generate_ideas_garbage(self):
        ideas = generate_ideas({"niche": None, "business_name": 123}, trends=["x"], history=None, ai=_fb())
        self.assertIsInstance(ideas, list)
        self.assertTrue(ideas)

    def test_score_idea_empty(self):
        result = score_idea({}, {}, ai=_fb())
        self.assertIn("score", result)
        self.assertGreaterEqual(result["score"], 0)
        self.assertLessEqual(result["score"], 100)

    def test_generate_script_empty(self):
        script = generate_script({}, {}, ai=_fb())
        self.assertIn("hook", script)
        self.assertIn("body", script)
        self.assertIn("cta", script)
        self.assertEqual(script["approx_seconds"], 15)


if __name__ == "__main__":
    unittest.main()
