"""Hermetic tests for search-intelligence metering (no wallet, no paid calls).

Verifies the zero-cost guarantees: credit-system-off and mock/zero units record
nothing, and the server-side limit helper degrades safely + attributes to the
seo_agent product operation types.
"""

from __future__ import annotations

import pytest

import seo.metering_search as m


def test_all_recorders_zero_when_credit_system_off(monkeypatch):
    # Default config has the credit system OFF → every recorder no-ops at 0.
    monkeypatch.setattr(m.credit_config, "credit_system_enabled", lambda: False)
    for res in (
        m.record_keyword_provider_call("t_a", call_count=5, job_id="j", is_mock=False),
        m.record_rank_check("t_a", keyword_count=10, job_id="j", is_mock=False),
        m.record_gsc_sync("t_a", property_count=2, job_id="j", is_mock=False),
        m.record_ga4_sync("t_a", property_count=2, job_id="j", is_mock=False),
        m.record_ai_clustering("t_a", project_id="p", keyword_count=20, is_mock=False),
        m.record_brief_generation("t_a", brief_id="b", is_mock=False),
        m.record_page_optimisation("t_a", page_ref="pg", is_mock=False),
    ):
        assert res["recorded"] is False
        assert res["credits_mc"] == 0


def test_mock_records_zero_even_when_credit_system_on(monkeypatch):
    monkeypatch.setattr(m.credit_config, "credit_system_enabled", lambda: True)
    res = m.record_rank_check("t_a", keyword_count=10, job_id="j", is_mock=True)
    assert res["recorded"] is False
    assert res["reason"] == "mock_or_zero"
    assert res["credits_mc"] == 0


def test_zero_units_records_nothing(monkeypatch):
    monkeypatch.setattr(m.credit_config, "credit_system_enabled", lambda: True)
    res = m.record_keyword_provider_call("t_a", call_count=0, job_id="j", is_mock=False)
    assert res["recorded"] is False


def test_limit_helper_allows_uncapped_key():
    res = m.check_seo_limit("t_a", m.LIMIT_KEYWORD_PROJECTS, used=999)
    # No cap defined in the base plan → unlimited/allowed (never blocks by default).
    assert res["allowed"] is True


def test_enforce_limit_does_not_raise_when_allowed():
    # Should return the check, not raise, when the resource is uncapped/allowed.
    res = m.enforce_seo_limit("t_a", m.LIMIT_SITES, used=1)
    assert res["allowed"] is True
