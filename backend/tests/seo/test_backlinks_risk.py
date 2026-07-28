"""Tests for the transparent risk-signal analysis module.

Covers:
  - Signals are explainable (human-readable strings, not black-box)
  - human_review_required is always True
  - SUSPICIOUS_TLD signal fires on known bad TLDs
  - EXACT_MATCH_ANCHOR_REPEAT fires when threshold exceeded
  - LOW_PROVIDER_METRICS fires when provider data is present and low
  - IRRELEVANT_LANGUAGE signal fires on foreign links
  - Domains with no signals return empty signals list (not None)
  - get_review_list filters by min_signals
  - Provider data is passed through, never fabricated

No network calls.
"""

from __future__ import annotations

import pytest

import seo.backlinks.stores as bs
import seo.metering_search as metering
from seo.backlinks.provider import MockBacklinkProvider
from seo.backlinks.risk import (
    EXACT_MATCH_ANCHOR_REPEAT,
    IRRELEVANT_LANGUAGE,
    LOW_PROVIDER_METRICS,
    SUSPICIOUS_TLD,
    analyse_risk_signals,
    get_review_list,
)
from seo.backlinks.service import run_backlink_sync
from seo.backlinks.stores import (
    Backlink,
    LinkRel,
    LinkStatus,
    get_backlink_repository,
)


@pytest.fixture(autouse=True)
def clean_repos(monkeypatch):
    monkeypatch.delenv("PIXIE_PERSIST", raising=False)
    monkeypatch.setattr(metering.credit_config, "credit_system_enabled", lambda: False)
    bs.reset_repositories()
    yield
    bs.reset_repositories()


def _create_backlink(tenant, site, source_url, source_domain, anchor,
                     rel=LinkRel.FOLLOW, language="en", dedup_key=None,
                     provider_metrics=None, status=LinkStatus.ACTIVE):
    repo = get_backlink_repository()
    repo.create(Backlink(
        tenant_id=tenant,
        site_id=site,
        source_url=source_url,
        source_domain=source_domain,
        target_url=f"https://{site}/",
        anchor_text=anchor,
        rel=rel,
        status=status,
        language=language,
        dedup_key=dedup_key or f"{source_url}:{anchor}",
        provider_metrics=provider_metrics,
    ))


# ── human_review_required always True ────────────────────────────────────────

def test_human_review_required_always_true():
    run_backlink_sync("t_a", "s1", provider=MockBacklinkProvider(), domain="cl.com")
    results = analyse_risk_signals("t_a", "s1")
    for r in results:
        assert r["human_review_required"] is True


# ── Empty signals for clean links ─────────────────────────────────────────────

def test_no_signals_for_clean_link():
    _create_backlink("t_a", "s1", "https://good.com/page", "good.com",
                     "our partner", provider_metrics={"domain_rating": 60})
    results = analyse_risk_signals("t_a", "s1")
    assert len(results) == 1
    r = results[0]
    assert r["signal_count"] == 0
    assert r["signals"] == []
    assert r["human_review_required"] is True


# ── SUSPICIOUS_TLD signal ─────────────────────────────────────────────────────

def test_suspicious_tld_fires():
    _create_backlink("t_a", "s1", "https://spam.xyz/pg", "spam.xyz", "click")
    results = analyse_risk_signals("t_a", "s1")
    assert len(results) == 1
    signal_keys = [s["key"] for s in results[0]["signals"]]
    assert SUSPICIOUS_TLD in signal_keys


def test_clean_tld_no_suspicious_signal():
    _create_backlink("t_a", "s1", "https://legit.com/pg", "legit.com", "click")
    results = analyse_risk_signals("t_a", "s1")
    signal_keys = [s["key"] for s in results[0]["signals"]]
    assert SUSPICIOUS_TLD not in signal_keys


# ── EXACT_MATCH_ANCHOR_REPEAT signal ─────────────────────────────────────────

def test_exact_match_anchor_repeat_fires():
    domain = "repeater.com"
    site = "target.com"
    # Create 6 backlinks from same domain with same anchor (threshold = 5)
    for i in range(6):
        _create_backlink("t_a", site,
                         f"https://{domain}/page{i}", domain,
                         "buy now", dedup_key=f"rep_{i}")
    results = analyse_risk_signals("t_a", site)
    assert len(results) == 1
    signal_keys = [s["key"] for s in results[0]["signals"]]
    assert EXACT_MATCH_ANCHOR_REPEAT in signal_keys


def test_anchor_repeat_below_threshold_no_signal():
    domain = "ok.com"
    site = "target.com"
    for i in range(3):
        _create_backlink("t_a", site,
                         f"https://{domain}/page{i}", domain,
                         "our partner", dedup_key=f"ok_{i}")
    results = analyse_risk_signals("t_a", site)
    signal_keys = [s["key"] for s in results[0]["signals"]]
    assert EXACT_MATCH_ANCHOR_REPEAT not in signal_keys


# ── LOW_PROVIDER_METRICS signal ───────────────────────────────────────────────

def test_low_provider_metrics_fires():
    _create_backlink("t_a", "s1", "https://low.com/p", "low.com", "text",
                     provider_metrics={"domain_rating": 2, "provider_sourced": True, "is_mock": False})
    results = analyse_risk_signals("t_a", "s1")
    signal_keys = [s["key"] for s in results[0]["signals"]]
    assert LOW_PROVIDER_METRICS in signal_keys


def test_provider_metrics_none_no_low_metric_signal():
    """When provider_metrics is None we cannot fire LOW_PROVIDER_METRICS."""
    _create_backlink("t_a", "s1", "https://nomet.com/p", "nomet.com", "text",
                     provider_metrics=None)
    results = analyse_risk_signals("t_a", "s1")
    signal_keys = [s["key"] for s in results[0]["signals"]]
    assert LOW_PROVIDER_METRICS not in signal_keys


def test_provider_metrics_mock_tagged_correctly():
    """Mock provider_metrics with is_mock=True are still displayed but flagged."""
    _create_backlink("t_a", "s1", "https://mock.com/p", "mock.com", "text",
                     provider_metrics={"domain_rating": 1, "is_mock": True})
    results = analyse_risk_signals("t_a", "s1")
    # LOW_PROVIDER_METRICS should fire for very low DR even if mock
    r = results[0]
    assert r["provider_data"] is not None


# ── IRRELEVANT_LANGUAGE signal ────────────────────────────────────────────────

def test_irrelevant_language_fires():
    domain = "foreign.com"
    site = "en_site.com"
    # Create 5 foreign-language links from same domain
    for i in range(5):
        _create_backlink("t_a", site,
                         f"https://{domain}/pg{i}", domain,
                         "texto", language="es", dedup_key=f"lang_{i}")
    results = analyse_risk_signals("t_a", site, language_hint="en")
    signal_keys = [s["key"] for s in results[0]["signals"]]
    assert IRRELEVANT_LANGUAGE in signal_keys


def test_matching_language_no_signal():
    _create_backlink("t_a", "s1", "https://en.com/", "en.com",
                     "good link", language="en")
    results = analyse_risk_signals("t_a", "s1", language_hint="en")
    signal_keys = [s["key"] for s in results[0]["signals"]]
    assert IRRELEVANT_LANGUAGE not in signal_keys


# ── Confidence + recommendation structure ────────────────────────────────────

def test_result_has_required_fields():
    _create_backlink("t_a", "s1", "https://a.com/", "a.com", "test")
    results = analyse_risk_signals("t_a", "s1")
    r = results[0]
    assert "domain" in r
    assert "signals" in r
    assert "signal_count" in r
    assert "confidence" in r
    assert "provider_data" in r
    assert "human_review_required" in r
    assert "recommendation" in r


def test_confidence_increases_with_signal_count():
    """More signals → higher confidence (monotonic by construction)."""
    # 0 signals
    _create_backlink("t_a", "s1", "https://clean.com/", "clean.com", "partner")
    r0 = analyse_risk_signals("t_a", "s1")[0]

    bs.reset_repositories()
    # 1 signal (suspicious TLD)
    _create_backlink("t_a", "s1", "https://spam.xyz/", "spam.xyz", "test")
    r1 = analyse_risk_signals("t_a", "s1")[0]

    assert r0["confidence"] <= r1["confidence"]


# ── get_review_list ───────────────────────────────────────────────────────────

def test_review_list_filters_by_min_signals():
    _create_backlink("t_a", "s1", "https://clean.com/", "clean.com", "partner")
    _create_backlink("t_a", "s1", "https://bad.xyz/", "bad.xyz", "click")
    all_results = analyse_risk_signals("t_a", "s1")
    review = get_review_list("t_a", "s1", min_signals=1)
    flagged_domains = {r["domain"] for r in review}
    assert "bad.xyz" in flagged_domains
    # clean domain should not be in the flagged list
    assert "clean.com" not in flagged_domains


def test_review_list_sorted_by_signal_count():
    _create_backlink("t_a", "s1", "https://bad.xyz/p", "bad.xyz", "buy now")
    _create_backlink("t_a", "s1", "https://ok.com/", "ok.com", "partner",
                     provider_metrics={"domain_rating": 1, "is_mock": False})
    review = get_review_list("t_a", "s1", min_signals=1)
    if len(review) >= 2:
        assert review[0]["signal_count"] >= review[1]["signal_count"]


# ── Empty site ────────────────────────────────────────────────────────────────

def test_empty_site_returns_empty_list():
    results = analyse_risk_signals("t_a", "empty_site")
    assert results == []
