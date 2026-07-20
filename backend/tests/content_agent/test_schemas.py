"""Content Agent schema + type-registry contract tests."""

from __future__ import annotations

import pytest

pytest.importorskip("pydantic")

from content_agent.enums import STRUCTURED_TYPES, ContentType
from content_agent.schemas import GenerationInputs, GenerationOptions, GenerationRequest
from content_agent.types import TYPES, required_inputs, type_catalog


def test_all_ten_content_types_registered():
    assert set(TYPES.keys()) == set(ContentType)
    assert len(TYPES) == 10


def test_type_catalog_is_serializable_and_complete():
    cat = type_catalog()
    assert len(cat) == 10
    for entry in cat:
        assert entry["content_type"] in {c.value for c in ContentType}
        assert entry["label"] and entry["description"]
        assert isinstance(entry["fields"], list) and entry["fields"]
        assert isinstance(entry["controls"], list)
        # every field declares a name + a known kind
        for f in entry["fields"]:
            assert f["name"] and f["kind"] in {"text", "textarea", "select", "multiselect", "number", "toggle", "tags"}


def test_structured_types_flagged():
    cat = {e["content_type"]: e for e in type_catalog()}
    assert cat["carousel"]["structured"] is True
    assert cat["social_post"]["structured"] is False
    assert {c.value for c in STRUCTURED_TYPES} == {"carousel", "ad_copy", "seo_content"}


def test_required_inputs_present_per_type():
    assert "topic" in required_inputs(ContentType.SOCIAL_POST)
    assert "platform" in required_inputs(ContentType.SOCIAL_POST)
    assert "original_content" in required_inputs(ContentType.REWRITE)
    assert "keyword" in required_inputs(ContentType.SEO_CONTENT)


def test_generation_request_defaults_and_validation():
    req = GenerationRequest(tenant_id="ws", content_type=ContentType.BLOG)
    assert req.options.variations == 1
    assert isinstance(req.inputs, GenerationInputs)
    # variation bounds enforced
    with pytest.raises(Exception):
        GenerationOptions(variations=99)
    # tenant required
    with pytest.raises(Exception):
        GenerationRequest(content_type=ContentType.BLOG)  # type: ignore
