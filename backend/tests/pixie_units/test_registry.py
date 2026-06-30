"""Registry normalize + trial routing tests. $0, no network."""
from __future__ import annotations
import pytest
from fastapi import HTTPException
from pixie_units.registry import normalize_pixie_slug, get_pixie_unit
from pixie_units.router import agent_trial, omni_trial, TrialBody

def test_aliases_normalize():
    assert normalize_pixie_slug("seo-audit") == "seo-agent"
    assert normalize_pixie_slug("ask-pixie") == "omni"
    assert normalize_pixie_slug("receptionist") == "ai-receptionist"
    assert normalize_pixie_slug("ai-content-creator") == "content-creator"

def test_units_resolve_with_real_backend_keys():
    assert get_pixie_unit("seo-audit")["backend_key"] == "seo"
    assert get_pixie_unit("omni")["type"] == "omni"

def test_agent_trial_returns_canonical_redirect():
    out = agent_trial("seo-audit", TrialBody(tenant_id="tt"))
    assert out["unit"] == "seo-agent"
    assert out["unit_type"] == "agent"
    assert out["redirect"] == "/app/agents/seo-agent"

def test_omni_trial_redirects_to_app_omni():
    out = omni_trial(TrialBody(tenant_id="tt"))
    assert out["unit"] == "omni" and out["redirect"] == "/app/omni"

def test_invalid_agent_404():
    with pytest.raises(HTTPException) as e:
        agent_trial("bogus", TrialBody())
    assert e.value.status_code == 404
