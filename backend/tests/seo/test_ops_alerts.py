"""Tests for seo.ops.alerts — alert conditions fire on seeded state.

All tests are hermetic: metrics are seeded directly, no network calls.
"""

import os
import pytest


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def reset_all():
    from seo.ops.metrics import reset
    reset()
    yield
    reset()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _fire_codes(alerts):
    return {a["code"] for a in alerts}


# ── Scheduler heartbeat ───────────────────────────────────────────────────────

def test_no_alert_when_scheduler_disabled():
    """No heartbeat alert when scheduler is not enabled."""
    from seo.ops.alerts import _check_scheduler_heartbeat
    result = _check_scheduler_heartbeat({"enabled": False})
    assert result is None


def test_heartbeat_alert_fires_when_stale():
    from seo.ops.alerts import _check_scheduler_heartbeat
    # Heartbeat was a long time ago (epoch)
    old_hb = "2020-01-01T00:00:00+00:00"
    result = _check_scheduler_heartbeat({"enabled": True, "last_heartbeat": old_hb})
    assert result is not None
    assert result["code"] == "SCHEDULER_HEARTBEAT_MISSING"
    assert result["severity"] == "critical"


def test_heartbeat_alert_fires_when_missing():
    from seo.ops.alerts import _check_scheduler_heartbeat
    result = _check_scheduler_heartbeat({"enabled": True, "last_heartbeat": None})
    assert result is not None
    assert result["code"] == "SCHEDULER_HEARTBEAT_MISSING"


def test_heartbeat_alert_absent_when_recent():
    from datetime import datetime, timezone, timedelta
    from seo.ops.alerts import _check_scheduler_heartbeat
    recent = (datetime.now(timezone.utc) - timedelta(seconds=10)).isoformat()
    result = _check_scheduler_heartbeat({"enabled": True, "last_heartbeat": recent})
    assert result is None


# ── Scheduler backlog ─────────────────────────────────────────────────────────

def test_backlog_alert_fires_when_old(monkeypatch):
    monkeypatch.setenv("SEO_ALERT_THRESHOLD_SCHEDULER_BACKLOG_MAX_AGE_S", "30")
    from seo.ops.alerts import _check_scheduler_backlog
    old = "2020-01-01T00:00:00+00:00"
    result = _check_scheduler_backlog({"oldest_due": old})
    assert result is not None
    assert result["code"] == "SCHEDULER_BACKLOG_STALE"


def test_backlog_alert_absent_when_recent():
    from datetime import datetime, timezone, timedelta
    from seo.ops.alerts import _check_scheduler_backlog
    recent = (datetime.now(timezone.utc) - timedelta(seconds=5)).isoformat()
    result = _check_scheduler_backlog({"oldest_due": recent})
    assert result is None


def test_backlog_no_alert_when_no_oldest():
    from seo.ops.alerts import _check_scheduler_backlog
    result = _check_scheduler_backlog({"oldest_due": None})
    assert result is None


# ── Provider failures ─────────────────────────────────────────────────────────

def test_provider_failure_alert_fires_above_threshold(monkeypatch):
    monkeypatch.setenv("SEO_ALERT_THRESHOLD_PROVIDER_FAILURE_COUNT_MIN", "3")
    from seo.ops import metrics
    from seo.ops.alerts import _check_provider_failures
    for _ in range(5):
        metrics.incr("seo.provider.errors", provider="gsc", result="error")
    snap = metrics.snapshot()
    alerts = _check_provider_failures(snap["counters"])
    codes = _fire_codes(alerts)
    assert "PROVIDER_REPEATED_FAILURES" in codes


def test_provider_failure_no_alert_below_threshold(monkeypatch):
    monkeypatch.setenv("SEO_ALERT_THRESHOLD_PROVIDER_FAILURE_COUNT_MIN", "10")
    from seo.ops import metrics
    from seo.ops.alerts import _check_provider_failures
    for _ in range(2):
        metrics.incr("seo.provider.errors", provider="gsc")
    snap = metrics.snapshot()
    alerts = _check_provider_failures(snap["counters"])
    assert alerts == []


def test_provider_failure_identifies_provider(monkeypatch):
    monkeypatch.setenv("SEO_ALERT_THRESHOLD_PROVIDER_FAILURE_COUNT_MIN", "2")
    from seo.ops import metrics
    from seo.ops.alerts import _check_provider_failures
    for _ in range(3):
        metrics.incr("seo.provider.errors", provider="ga4")
    snap = metrics.snapshot()
    alerts = _check_provider_failures(snap["counters"])
    assert any("ga4" in a["detail"].get("provider", "") for a in alerts)


# ── Supabase unavailable ──────────────────────────────────────────────────────

def test_supabase_alert_not_fired_with_memory_backend(monkeypatch):
    monkeypatch.delenv("PIXIE_PERSIST", raising=False)
    from seo.ops.alerts import _check_supabase_unavailable
    result = _check_supabase_unavailable()
    assert result is None


# ── Migration mismatch ────────────────────────────────────────────────────────

def test_migration_alert_fires(monkeypatch):
    monkeypatch.setenv("SEO_HEALTH_REQUIRE_MIGRATIONS", "1")
    monkeypatch.delenv("SEO_MIGRATIONS_APPLIED", raising=False)
    from seo.ops.alerts import _check_migration_mismatch
    result = _check_migration_mismatch()
    assert result is not None
    assert result["code"] == "MIGRATION_MISMATCH"
    assert result["severity"] == "critical"


def test_migration_alert_absent_when_applied(monkeypatch):
    monkeypatch.setenv("SEO_HEALTH_REQUIRE_MIGRATIONS", "1")
    monkeypatch.setenv("SEO_MIGRATIONS_APPLIED", "1")
    from seo.ops.alerts import _check_migration_mismatch
    result = _check_migration_mismatch()
    assert result is None


def test_migration_alert_absent_when_not_required(monkeypatch):
    monkeypatch.delenv("SEO_HEALTH_REQUIRE_MIGRATIONS", raising=False)
    from seo.ops.alerts import _check_migration_mismatch
    result = _check_migration_mismatch()
    assert result is None


# ── Encryption not ready ──────────────────────────────────────────────────────

def test_encryption_alert_fires_when_required_but_missing(monkeypatch):
    monkeypatch.setenv("SEO_REQUIRE_TOKEN_ENCRYPTION", "1")
    monkeypatch.delenv("GOOGLE_TOKEN_ENCRYPTION_KEY", raising=False)
    from seo.ops.alerts import _check_encryption_not_ready
    result = _check_encryption_not_ready()
    assert result is not None
    assert result["code"] == "ENCRYPTION_NOT_READY"
    assert result["severity"] == "critical"


def test_encryption_alert_absent_when_not_required(monkeypatch):
    monkeypatch.delenv("SEO_REQUIRE_TOKEN_ENCRYPTION", raising=False)
    from seo.ops.alerts import _check_encryption_not_ready
    result = _check_encryption_not_ready()
    assert result is None


# ── Crawl failure rate ────────────────────────────────────────────────────────

def test_crawl_failure_rate_alert(monkeypatch):
    monkeypatch.setenv("SEO_ALERT_THRESHOLD_CRAWL_FAILURE_RATE_MAX", "0.3")
    from seo.ops import metrics
    from seo.ops.alerts import _check_crawl_failure_rate
    for _ in range(10):
        metrics.incr("seo.crawl.jobs")
    for _ in range(5):
        metrics.incr("seo.crawl.failures")
    snap = metrics.snapshot()
    result = _check_crawl_failure_rate(snap["counters"])
    assert result is not None
    assert result["code"] == "HIGH_CRAWL_FAILURE_RATE"


def test_crawl_failure_rate_no_alert_below_threshold(monkeypatch):
    monkeypatch.setenv("SEO_ALERT_THRESHOLD_CRAWL_FAILURE_RATE_MAX", "0.8")
    from seo.ops import metrics
    from seo.ops.alerts import _check_crawl_failure_rate
    for _ in range(10):
        metrics.incr("seo.crawl.jobs")
    for _ in range(1):
        metrics.incr("seo.crawl.failures")
    snap = metrics.snapshot()
    result = _check_crawl_failure_rate(snap["counters"])
    assert result is None


def test_crawl_failure_rate_no_alert_with_no_jobs():
    from seo.ops.alerts import _check_crawl_failure_rate
    result = _check_crawl_failure_rate({})
    assert result is None


# ── Billing recon ─────────────────────────────────────────────────────────────

def test_billing_recon_alert(monkeypatch):
    monkeypatch.setenv("SEO_ALERT_THRESHOLD_BILLING_RECON_COUNT_MAX", "5")
    from seo.ops import metrics
    from seo.ops.alerts import _check_billing_recon
    for _ in range(6):
        metrics.incr("seo.billing.settlements")
    snap = metrics.snapshot()
    result = _check_billing_recon(snap["counters"])
    assert result is not None
    assert result["code"] == "HIGH_BILLING_RECON_COUNT"


def test_billing_recon_no_alert_below_threshold(monkeypatch):
    monkeypatch.setenv("SEO_ALERT_THRESHOLD_BILLING_RECON_COUNT_MAX", "100")
    from seo.ops import metrics
    from seo.ops.alerts import _check_billing_recon
    for _ in range(3):
        metrics.incr("seo.billing.settlements")
    snap = metrics.snapshot()
    result = _check_billing_recon(snap["counters"])
    assert result is None


# ── Duplicate job claim ───────────────────────────────────────────────────────

def test_duplicate_job_claim_alert(monkeypatch):
    monkeypatch.setenv("SEO_ALERT_THRESHOLD_DUPLICATE_JOB_CLAIM_MAX", "3")
    from seo.ops.alerts import _check_duplicate_job_claim
    result = _check_duplicate_job_claim({"stale_lock_recoveries": 5})
    assert result is not None
    assert result["code"] == "DUPLICATE_JOB_CLAIM"


def test_duplicate_job_claim_no_alert_below_threshold(monkeypatch):
    monkeypatch.setenv("SEO_ALERT_THRESHOLD_DUPLICATE_JOB_CLAIM_MAX", "10")
    from seo.ops.alerts import _check_duplicate_job_claim
    result = _check_duplicate_job_claim({"stale_lock_recoveries": 2})
    assert result is None


# ── Outreach send failure ─────────────────────────────────────────────────────

def test_outreach_send_failure_alert(monkeypatch):
    monkeypatch.setenv("SEO_ALERT_THRESHOLD_OUTREACH_BOUNCE_RATE_MAX", "0.1")
    from seo.ops import metrics
    from seo.ops.alerts import _check_outreach_send_failure
    for _ in range(10):
        metrics.incr("seo.outreach.sends")
    for _ in range(3):
        metrics.incr("seo.outreach.bounces")
    snap = metrics.snapshot()
    result = _check_outreach_send_failure(snap["counters"])
    assert result is not None
    assert result["code"] == "OUTREACH_SEND_FAILURE_SPIKE"


def test_outreach_no_alert_with_no_sends():
    from seo.ops.alerts import _check_outreach_send_failure
    result = _check_outreach_send_failure({})
    assert result is None


# ── PDF failure ───────────────────────────────────────────────────────────────

def test_pdf_failure_alert(monkeypatch):
    monkeypatch.setenv("SEO_ALERT_THRESHOLD_PDF_FAILURE_RATE_MAX", "0.2")
    from seo.ops import metrics
    from seo.ops.alerts import _check_pdf_failure
    for _ in range(10):
        metrics.incr("seo.pdf.generations")
    for _ in range(5):
        metrics.incr("seo.pdf.failures")
    snap = metrics.snapshot()
    result = _check_pdf_failure(snap["counters"])
    assert result is not None
    assert result["code"] == "PDF_FAILURE_SPIKE"


# ── OAuth refresh failure ─────────────────────────────────────────────────────

def test_oauth_refresh_failure_alert(monkeypatch):
    monkeypatch.setenv("SEO_ALERT_THRESHOLD_OAUTH_FAILURE_COUNT_MAX", "3")
    from seo.ops import metrics
    from seo.ops.alerts import _check_oauth_refresh_failure
    for _ in range(5):
        metrics.incr("seo.provider.errors", provider="gsc")
    snap = metrics.snapshot()
    result = _check_oauth_refresh_failure(snap["counters"])
    assert result is not None
    assert result["code"] == "OAUTH_REFRESH_FAILURE_SPIKE"


# ── GBP disconnected ──────────────────────────────────────────────────────────

def test_gbp_disconnected_alert(monkeypatch):
    monkeypatch.setenv("SEO_ALERT_THRESHOLD_GBP_FAILURE_COUNT_MAX", "3")
    from seo.ops import metrics
    from seo.ops.alerts import _check_gbp_disconnected
    for _ in range(5):
        metrics.incr("seo.provider.errors", provider="gbp")
    snap = metrics.snapshot()
    result = _check_gbp_disconnected(snap["counters"])
    assert result is not None
    assert result["code"] == "GBP_DISCONNECTED_SPIKE"


# ── evaluate_alerts (integration) ────────────────────────────────────────────

def test_evaluate_alerts_returns_list():
    from seo.ops.alerts import evaluate_alerts
    alerts = evaluate_alerts()
    assert isinstance(alerts, list)


def test_evaluate_alerts_empty_on_clean_state():
    """With no seeded failures and benign env, alerts should be empty or minimal."""
    from seo.ops.alerts import evaluate_alerts
    alerts = evaluate_alerts()
    # Should not have any critical billing/encryption alerts in default state
    codes = _fire_codes(alerts)
    # These are only fired when specific env vars are set
    assert "MIGRATION_MISMATCH" not in codes or os.getenv("SEO_HEALTH_REQUIRE_MIGRATIONS")
    assert "ENCRYPTION_NOT_READY" not in codes or os.getenv("SEO_REQUIRE_TOKEN_ENCRYPTION")


def test_evaluate_alerts_all_have_required_fields():
    from seo.ops import metrics
    from seo.ops.alerts import evaluate_alerts
    # Seed enough data to trigger a crawl failure alert
    for _ in range(10):
        metrics.incr("seo.crawl.jobs")
    for _ in range(6):
        metrics.incr("seo.crawl.failures")
    alerts = evaluate_alerts()
    for alert in alerts:
        assert "code" in alert
        assert "severity" in alert
        assert "message" in alert
        assert "fired_at" in alert
        assert "detail" in alert
        assert alert["severity"] in ("critical", "warning", "info")


def test_evaluate_alerts_no_network_calls(monkeypatch):
    """evaluate_alerts must complete without any network calls."""
    import urllib.request

    def _fail(*args, **kwargs):
        raise AssertionError("evaluate_alerts() must not make network calls")

    monkeypatch.setattr(urllib.request, "urlopen", _fail)
    from seo.ops.alerts import evaluate_alerts
    # Should not raise
    alerts = evaluate_alerts()
    assert isinstance(alerts, list)
