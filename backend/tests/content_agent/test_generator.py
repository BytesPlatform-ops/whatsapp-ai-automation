"""Content Agent generation service — mock output per type + real-mode guard."""

from __future__ import annotations

import sys

import pytest

pytest.importorskip("pydantic")

from content_agent import generator
from content_agent.enums import STRUCTURED_TYPES, ContentType
from content_agent.prompts import PROMPT_VERSION, build_prompt, structured_schema
from content_agent.schemas import GenerationInputs, GenerationOptions


def _inputs(**kw):
    return GenerationInputs(**kw)


@pytest.mark.parametrize("ct", list(ContentType))
def test_mock_generates_schema_valid_content_for_every_type(monkeypatch, ct):
    monkeypatch.setenv("PIXIE_MODEL_MODE", "fake")
    res = generator.generate(ct, _inputs(topic="cold brew", product="Cold Brew", name="Cold Brew", keyword="cold brew", original_content="old text"), GenerationOptions(variations=2))
    assert res.usage.mock is True and res.usage.provider == "mock"
    assert res.usage.prompt_version == PROMPT_VERSION
    assert len(res.variations) == 2
    for v in res.variations:
        assert v.text.strip()  # meaningful, non-empty
    if ct in STRUCTURED_TYPES:
        required = structured_schema(ct)["required"]
        for v in res.variations:
            assert v.structured, f"{ct} must be structured"
            for key in required:
                assert key in v.structured


def test_variation_count_and_controls_affect_output(monkeypatch):
    monkeypatch.setenv("PIXIE_MODEL_MODE", "fake")
    with_tags = generator.generate(ContentType.SOCIAL_POST, _inputs(topic="sale", keyword="sale"), GenerationOptions(variations=3, include_hashtags=True))
    assert len(with_tags.variations) == 3
    assert "#" in with_tags.variations[0].text
    without = generator.generate(ContentType.SOCIAL_POST, _inputs(topic="sale"), GenerationOptions(include_hashtags=False))
    assert "#" not in without.variations[0].text


def test_carousel_slide_count_respected(monkeypatch):
    monkeypatch.setenv("PIXIE_MODEL_MODE", "fake")
    res = generator.generate(ContentType.CAROUSEL, _inputs(topic="tips", slide_count=7), GenerationOptions())
    assert len(res.variations[0].structured["slides"]) == 7


def test_real_mode_without_provider_raises_not_silent_fallback(monkeypatch):
    monkeypatch.setenv("PIXIE_MODEL_MODE", "openai")
    monkeypatch.setitem(sys.modules, "models", None)  # force the model layer import to fail
    assert generator.is_mock() is False
    with pytest.raises(generator.ProviderUnavailable):
        generator.generate(ContentType.BLOG, _inputs(topic="x"), GenerationOptions())


def test_prompt_forbids_inventing_facts_and_interpolates():
    p = build_prompt(ContentType.BLOG, _inputs(topic="running shoes", audience="runners").model_dump(), GenerationOptions(tone="friendly").model_dump())
    assert "Do NOT invent" in p
    assert "running shoes" in p
