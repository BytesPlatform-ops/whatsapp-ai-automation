"""Tests for seo.ops.metrics — counters, histograms, snapshots, PII safety.

All tests are hermetic: no network calls, no external dependencies.
"""

import os
import pytest


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def reset_metrics():
    """Reset the metrics registry before and after each test."""
    from seo.ops.metrics import reset
    reset()
    yield
    reset()


# ── Counter tests ─────────────────────────────────────────────────────────────

def test_incr_basic():
    from seo.ops import metrics
    metrics.incr("seo.crawl.jobs", operation_type="crawl", result="success")
    snap = metrics.snapshot()
    assert "seo.crawl.jobs" in snap["counters"]


def test_incr_accumulates():
    from seo.ops import metrics
    metrics.incr("seo.crawl.jobs")
    metrics.incr("seo.crawl.jobs")
    metrics.incr("seo.crawl.jobs")
    snap = metrics.snapshot()
    total = sum(snap["counters"]["seo.crawl.jobs"].values())
    assert total == 3


def test_incr_separate_label_series():
    from seo.ops import metrics
    metrics.incr("seo.provider.calls", provider="gsc")
    metrics.incr("seo.provider.calls", provider="ga4")
    snap = metrics.snapshot()
    series = snap["counters"]["seo.provider.calls"]
    assert len(series) == 2


def test_multiple_metric_names():
    from seo.ops import metrics
    metrics.incr("seo.crawl.jobs")
    metrics.incr("seo.crawl.failures")
    metrics.incr("seo.provider.errors", provider="gsc")
    snap = metrics.snapshot()
    assert "seo.crawl.jobs" in snap["counters"]
    assert "seo.crawl.failures" in snap["counters"]
    assert "seo.provider.errors" in snap["counters"]


# ── Histogram tests ────────────────────────────────────────────────────────────

def test_observe_basic():
    from seo.ops import metrics
    metrics.observe("seo.provider.latency_ms", 123.4, provider="gsc")
    snap = metrics.snapshot()
    assert "seo.provider.latency_ms" in snap["histograms"]


def test_observe_summary_fields():
    from seo.ops import metrics
    for ms in [10.0, 20.0, 30.0, 100.0, 200.0]:
        metrics.observe("seo.provider.latency_ms", ms, provider="pagespeed")
    snap = metrics.snapshot()
    hist = snap["histograms"]["seo.provider.latency_ms"]
    key = list(hist.keys())[0]
    summary = hist[key]
    assert summary["count"] == 5
    assert summary["min_ms"] == 10.0
    assert summary["max_ms"] == 200.0
    assert "p50_ms" in summary
    assert "p95_ms" in summary
    assert "p99_ms" in summary
    assert summary["sum_ms"] == pytest.approx(360.0, abs=0.01)


# ── Tenant hashing (PII safety) ───────────────────────────────────────────────

def test_tenant_label_is_hashed():
    from seo.ops import metrics
    metrics.incr("seo.crawl.jobs", tenant="real_tenant_abc123")
    snap = metrics.snapshot()
    series = snap["counters"]["seo.crawl.jobs"]
    # Raw tenant value must not appear in any key
    for key in series:
        assert "real_tenant_abc123" not in key
        # Should contain the hashed form
        assert "t_" in key


def test_tenant_id_label_is_hashed():
    from seo.ops import metrics
    metrics.incr("seo.rank.jobs", tenant_id="my_sensitive_tenant")
    snap = metrics.snapshot()
    series = snap["counters"]["seo.rank.jobs"]
    for key in series:
        assert "my_sensitive_tenant" not in key
        assert "t_" in key


def test_non_tenant_labels_not_hashed():
    from seo.ops import metrics
    metrics.incr("seo.provider.calls", provider="gsc", result="success")
    snap = metrics.snapshot()
    series = snap["counters"]["seo.provider.calls"]
    keys = list(series.keys())
    assert any("provider=gsc" in k for k in keys)
    assert any("result=success" in k for k in keys)


def test_no_pii_in_snapshot():
    """Snapshot must never contain email, token, domain text."""
    from seo.ops import metrics
    metrics.incr("seo.outreach.sends", tenant="user@example.com")
    snap = metrics.snapshot()
    snap_str = str(snap)
    assert "user@example.com" not in snap_str


# ── Enabled gate ──────────────────────────────────────────────────────────────

def test_disabled_no_record(monkeypatch):
    monkeypatch.setenv("SEO_METRICS_ENABLED", "0")
    from seo.ops import metrics
    metrics.incr("seo.crawl.jobs")
    metrics.observe("seo.provider.latency_ms", 100.0)
    snap = metrics.snapshot()
    assert snap["enabled"] is False
    # When disabled, nothing should be recorded
    assert snap["counters"] == {}
    assert snap["histograms"] == {}


def test_enabled_by_default(monkeypatch):
    monkeypatch.delenv("SEO_METRICS_ENABLED", raising=False)
    from seo.ops import metrics
    snap = metrics.snapshot()
    assert snap["enabled"] is True


# ── Timer context manager ─────────────────────────────────────────────────────

def test_timer_records_observation():
    import time
    from seo.ops import metrics
    with metrics.timer("seo.provider.latency_ms", provider="backlink"):
        time.sleep(0.01)  # 10ms
    snap = metrics.snapshot()
    assert "seo.provider.latency_ms" in snap["histograms"]
    key = list(snap["histograms"]["seo.provider.latency_ms"].keys())[0]
    assert snap["histograms"]["seo.provider.latency_ms"][key]["count"] == 1
    assert snap["histograms"]["seo.provider.latency_ms"][key]["min_ms"] >= 5.0  # at least 5ms


# ── Reset ─────────────────────────────────────────────────────────────────────

def test_reset_clears_everything():
    from seo.ops import metrics
    metrics.incr("seo.crawl.jobs")
    metrics.observe("seo.provider.latency_ms", 50.0)
    metrics.reset()
    snap = metrics.snapshot()
    assert snap["counters"] == {}
    assert snap["histograms"] == {}


# ── Snapshot structure ────────────────────────────────────────────────────────

def test_snapshot_has_required_keys():
    from seo.ops import metrics
    snap = metrics.snapshot()
    assert "enabled" in snap
    assert "counters" in snap
    assert "histograms" in snap


def test_all_canonical_metric_names_record():
    """Verify all documented metric names can be recorded."""
    from seo.ops import metrics
    canonical = [
        "seo.crawl.jobs",
        "seo.crawl.pages",
        "seo.crawl.failures",
        "seo.provider.calls",
        "seo.provider.errors",
        "seo.provider.latency_ms",
        "seo.scheduler.backlog",
        "seo.scheduler.job_duration_ms",
        "seo.scheduler.lock_recoveries",
        "seo.rank.jobs",
        "seo.google.sync.jobs",
        "seo.backlinks.jobs",
        "seo.citations.jobs",
        "seo.outreach.sends",
        "seo.outreach.bounces",
        "seo.pdf.generations",
        "seo.pdf.failures",
        "seo.billing.reservations",
        "seo.billing.settlements",
        "seo.billing.releases",
        "seo.rate_limit.blocks",
        "seo.ssrf.blocks",
        "seo.tenant_access.denials",
    ]
    for name in canonical:
        if "latency" in name or "duration" in name:
            metrics.observe(name, 10.0)
        else:
            metrics.incr(name)
    snap = metrics.snapshot()
    for name in canonical:
        found = name in snap["counters"] or name in snap["histograms"]
        assert found, f"Metric {name} not found in snapshot"
