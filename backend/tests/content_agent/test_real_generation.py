"""Real-provider Content Agent generation — via a MOCKED model router (no paid
calls). Covers bounded distinct variations, structured parse+validate, malformed
handling, usage summing, and no-silent-fallback.
"""

from __future__ import annotations

import json

import pytest

pytest.importorskip("pydantic")

import models
from models.base import ModelResult
from schemas import ModelTier

from content_agent import generator
from content_agent.enums import ContentType
from content_agent.errors import ErrorCategory, ProviderError
from content_agent.schemas import GenerationInputs, GenerationOptions


class _StubProvider:
    name = "stub-openai"


class _StubRouter:
    """Stands in for models.ModelRouter — returns scripted completions and counts
    calls so tests can assert bounded fan-out + usage summing."""

    def __init__(self, responder):
        self._responder = responder
        self._provider = _StubProvider()
        self.calls = 0

    async def complete(self, req):
        self.calls += 1
        text = self._responder(req, self.calls)
        return ModelResult(text=text, model="gpt-stub", tier=ModelTier.LARGE,
                           tokens_in=10, tokens_out=20, latency_ms=5, cost_usd=0.001)


@pytest.fixture
def real_mode(monkeypatch):
    monkeypatch.setenv("PIXIE_MODEL_MODE", "openai")
    assert generator.is_mock() is False
    yield


def _install(monkeypatch, responder):
    router = _StubRouter(responder)
    monkeypatch.setattr(models, "get_router", lambda: router)
    return router


def test_prose_variations_are_distinct_and_usage_summed(real_mode, monkeypatch):
    router = _install(monkeypatch, lambda req, n: f"Distinct post number {n} about the topic.")
    res = generator.generate(ContentType.SOCIAL_POST, GenerationInputs(topic="cold brew"), GenerationOptions(variations=3, platform="instagram"))
    assert router.calls == 3                      # one bounded call per variation
    texts = [v.text for v in res.variations]
    assert len(set(texts)) == 3                   # genuinely distinct, not duplicated
    assert res.usage.mock is False and res.usage.provider == "stub-openai"
    assert res.usage.tokens == 3 * 30             # summed across calls
    assert res.usage.estimated_cost == pytest.approx(0.003)


def test_variations_capped_at_five(real_mode, monkeypatch):
    router = _install(monkeypatch, lambda req, n: f"post {n}")
    generator.generate(ContentType.SOCIAL_POST, GenerationInputs(topic="x"), GenerationOptions(variations=5, platform="generic"))
    assert router.calls == 5


def test_structured_output_parsed_and_validated(real_mode, monkeypatch):
    payload = {"primary_text": "buy now", "headline": "Big Sale", "description": "great deal", "cta": "Shop"}
    _install(monkeypatch, lambda req, n: json.dumps(payload))
    res = generator.generate(ContentType.AD_COPY, GenerationInputs(product="Shoes"), GenerationOptions(platform="meta"))
    v = res.variations[0]
    assert v.structured == payload
    assert "Big Sale" in v.text                   # readable text rendered from structure


def test_malformed_structured_raises_not_fake(real_mode, monkeypatch):
    _install(monkeypatch, lambda req, n: "this is not json")
    with pytest.raises(ProviderError) as ei:
        generator.generate(ContentType.CAROUSEL, GenerationInputs(topic="tips"), GenerationOptions(platform="linkedin"))
    assert ei.value.category is ErrorCategory.MALFORMED_OUTPUT


def test_structured_missing_required_key_raises(real_mode, monkeypatch):
    _install(monkeypatch, lambda req, n: json.dumps({"headline": "x"}))  # missing primary_text/description/cta
    with pytest.raises(ProviderError) as ei:
        generator.generate(ContentType.AD_COPY, GenerationInputs(product="p"), GenerationOptions(platform="meta"))
    assert ei.value.category is ErrorCategory.MALFORMED_OUTPUT


def test_provider_exception_classified(real_mode, monkeypatch):
    def boom(req, n):
        raise RuntimeError("Error code: 429 rate limit reached")
    router = _StubRouter(boom)
    monkeypatch.setattr(models, "get_router", lambda: router)
    with pytest.raises(ProviderError) as ei:
        generator.generate(ContentType.BLOG, GenerationInputs(topic="x"), GenerationOptions())
    assert ei.value.category is ErrorCategory.RATE_LIMITED


def test_no_silent_fallback_to_mock(real_mode, monkeypatch):
    _install(monkeypatch, lambda req, n: "")  # empty completion
    with pytest.raises(ProviderError):
        generator.generate(ContentType.BLOG, GenerationInputs(topic="x"), GenerationOptions())
