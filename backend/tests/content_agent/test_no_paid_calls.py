"""Guard: the standard (mock) suite must NEVER construct or call the real OpenAI
adapter. If any code path instantiates OpenAIProvider while mock mode is active,
these tests fail — catching an accidental paid call before it can happen.
"""

from __future__ import annotations

import pytest

pytest.importorskip("pydantic")

import models.openai as openai_mod
from content_agent import generator
from content_agent.enums import ContentType
from content_agent.schemas import GenerationInputs, GenerationOptions
from content_creator.agents.idea_agent import generate_ideas
from content_creator.agents.script_agent import generate_script


@pytest.fixture
def forbid_openai(monkeypatch):
    """Make constructing the real OpenAI provider an immediate hard failure."""
    def _boom(*a, **k):
        raise AssertionError("OpenAIProvider was constructed during the mock suite — possible paid call!")
    monkeypatch.setattr(openai_mod, "OpenAIProvider", _boom)
    # conftest already forces PIXIE_MODEL_MODE=fake for the whole suite.
    monkeypatch.setenv("PIXIE_MODEL_MODE", "fake")
    yield


def test_content_agent_mock_makes_no_real_provider(forbid_openai):
    res = generator.generate(ContentType.SOCIAL_POST, GenerationInputs(topic="x"), GenerationOptions(platform="instagram", variations=3))
    assert res.usage.mock is True and res.usage.provider == "mock"
    assert len(res.variations) == 3


def test_influencer_ideas_scripts_mock_make_no_real_provider(forbid_openai):
    ideas = generate_ideas({"niche": "hvac", "business_name": "Acme"})
    assert ideas
    script = generate_script(ideas[0], {"brand_tone": "friendly"})
    assert "hook" in script


def test_is_mock_true_by_default():
    # With the suite's forced fake mode, is_mock() must be True.
    assert generator.is_mock() is True
