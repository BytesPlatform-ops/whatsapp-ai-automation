"""Tests for seo.ops.routes — admin endpoint shapes + internal secret guard.

All tests are hermetic: no network calls. The internal secret guard is tested
by both positive (secret present + correct) and negative (missing / wrong)
cases.
"""

from __future__ import annotations

import os
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from seo.ops.routes import router


# ── App fixture ───────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def app():
    _app = FastAPI()
    _app.include_router(router)
    return _app


@pytest.fixture(scope="module")
def client(app):
    return TestClient(app, raise_server_exceptions=True)


@pytest.fixture(autouse=True)
def reset_between_tests():
    """Reset metrics + health cache + smoke store between tests."""
    from seo.ops.metrics import reset as metrics_reset
    from seo.ops.health import invalidate_cache
    from seo.ops.readiness import reset_smoke_store
    metrics_reset()
    invalidate_cache()
    reset_smoke_store()
    yield
    metrics_reset()
    invalidate_cache()
    reset_smoke_store()


# ── Secret guard helpers ───────────────────────────────────────────────────────

def _no_secret_headers():
    return {}


def _wrong_secret_headers():
    return {"X-Pixie-Internal-Secret": "wrong_secret_value"}


def _correct_secret_headers(secret: str):
    return {"X-Pixie-Internal-Secret": secret}


ALL_ENDPOINTS = [
    "/api/agents/seo/ops/health/live",
    "/api/agents/seo/ops/health/ready",
    "/api/agents/seo/ops/health/deps",
    "/api/agents/seo/ops/metrics",
    "/api/agents/seo/ops/readiness",
    "/api/agents/seo/ops/alerts",
]


# ── Admin secret guard tests ──────────────────────────────────────────────────

class TestAdminSecretGuard:
    """All endpoints must return 401 when secret is configured but missing/wrong."""

    def test_no_secret_returns_200_when_unset(self, client, monkeypatch):
        """When PIXIE_INTERNAL_API_SECRET is unset, all endpoints are open."""
        monkeypatch.delenv("PIXIE_INTERNAL_API_SECRET", raising=False)
        for endpoint in ALL_ENDPOINTS:
            resp = client.get(endpoint, headers=_no_secret_headers())
            assert resp.status_code == 200, f"{endpoint}: expected 200, got {resp.status_code}"

    def test_wrong_secret_returns_401_when_configured(self, client, monkeypatch):
        monkeypatch.setenv("PIXIE_INTERNAL_API_SECRET", "correct_secret_abc")
        for endpoint in ALL_ENDPOINTS:
            resp = client.get(endpoint, headers=_wrong_secret_headers())
            assert resp.status_code == 401, f"{endpoint}: expected 401, got {resp.status_code}"

    def test_missing_secret_returns_401_when_configured(self, client, monkeypatch):
        monkeypatch.setenv("PIXIE_INTERNAL_API_SECRET", "correct_secret_abc")
        for endpoint in ALL_ENDPOINTS:
            resp = client.get(endpoint, headers=_no_secret_headers())
            assert resp.status_code == 401, f"{endpoint}: expected 401, got {resp.status_code}"

    def test_correct_secret_returns_200(self, client, monkeypatch):
        secret = "correct_secret_abc"
        monkeypatch.setenv("PIXIE_INTERNAL_API_SECRET", secret)
        for endpoint in ALL_ENDPOINTS:
            resp = client.get(endpoint, headers=_correct_secret_headers(secret))
            assert resp.status_code == 200, f"{endpoint}: expected 200, got {resp.status_code}"


# ── Health/live endpoint ──────────────────────────────────────────────────────

class TestHealthLive:
    def test_returns_ok(self, client, monkeypatch):
        monkeypatch.delenv("PIXIE_INTERNAL_API_SECRET", raising=False)
        resp = client.get("/api/agents/seo/ops/health/live")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert data["check"] == "live"

    def test_response_shape(self, client, monkeypatch):
        monkeypatch.delenv("PIXIE_INTERNAL_API_SECRET", raising=False)
        resp = client.get("/api/agents/seo/ops/health/live")
        data = resp.json()
        assert "status" in data
        assert "check" in data
        assert "process" in data


# ── Health/ready endpoint ─────────────────────────────────────────────────────

class TestHealthReady:
    def test_returns_200(self, client, monkeypatch):
        monkeypatch.delenv("PIXIE_INTERNAL_API_SECRET", raising=False)
        resp = client.get("/api/agents/seo/ops/health/ready")
        assert resp.status_code == 200

    def test_response_shape(self, client, monkeypatch):
        monkeypatch.delenv("PIXIE_INTERNAL_API_SECRET", raising=False)
        resp = client.get("/api/agents/seo/ops/health/ready")
        data = resp.json()
        assert "status" in data
        assert "check" in data
        assert "failures" in data
        assert "checks" in data

    def test_check_value_is_ready(self, client, monkeypatch):
        monkeypatch.delenv("PIXIE_INTERNAL_API_SECRET", raising=False)
        resp = client.get("/api/agents/seo/ops/health/ready")
        data = resp.json()
        assert data["check"] == "ready"

    def test_no_secrets_in_response(self, client, monkeypatch):
        monkeypatch.delenv("PIXIE_INTERNAL_API_SECRET", raising=False)
        monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "top_secret_cred_xyz")
        resp = client.get("/api/agents/seo/ops/health/ready")
        assert "top_secret_cred_xyz" not in resp.text


# ── Health/deps endpoint ──────────────────────────────────────────────────────

class TestHealthDeps:
    def test_returns_200(self, client, monkeypatch):
        monkeypatch.delenv("PIXIE_INTERNAL_API_SECRET", raising=False)
        resp = client.get("/api/agents/seo/ops/health/deps")
        assert resp.status_code == 200

    def test_response_shape(self, client, monkeypatch):
        monkeypatch.delenv("PIXIE_INTERNAL_API_SECRET", raising=False)
        resp = client.get("/api/agents/seo/ops/health/deps")
        data = resp.json()
        assert "status" in data
        assert "check" in data
        assert "dependencies" in data

    def test_contains_expected_deps(self, client, monkeypatch):
        monkeypatch.delenv("PIXIE_INTERNAL_API_SECRET", raising=False)
        resp = client.get("/api/agents/seo/ops/health/deps")
        deps = resp.json()["dependencies"]
        assert "supabase" in deps
        assert "google_oauth" in deps
        assert "pagespeed" in deps
        assert "seo_providers" in deps
        assert "email" in deps
        assert "pdf_renderer" in deps
        assert "token_encryption" in deps

    def test_no_credentials_in_response(self, client, monkeypatch):
        monkeypatch.delenv("PIXIE_INTERNAL_API_SECRET", raising=False)
        monkeypatch.setenv("GOOGLE_CLIENT_ID", "g_client_id_secret_xyz")
        resp = client.get("/api/agents/seo/ops/health/deps")
        assert "g_client_id_secret_xyz" not in resp.text


# ── Metrics endpoint ──────────────────────────────────────────────────────────

class TestMetrics:
    def test_returns_200(self, client, monkeypatch):
        monkeypatch.delenv("PIXIE_INTERNAL_API_SECRET", raising=False)
        resp = client.get("/api/agents/seo/ops/metrics")
        assert resp.status_code == 200

    def test_snapshot_shape(self, client, monkeypatch):
        monkeypatch.delenv("PIXIE_INTERNAL_API_SECRET", raising=False)
        resp = client.get("/api/agents/seo/ops/metrics")
        data = resp.json()
        assert "enabled" in data
        assert "counters" in data
        assert "histograms" in data

    def test_reflects_recorded_counters(self, client, monkeypatch):
        monkeypatch.delenv("PIXIE_INTERNAL_API_SECRET", raising=False)
        from seo.ops import metrics
        metrics.incr("seo.crawl.jobs", result="success")
        metrics.incr("seo.crawl.jobs", result="success")
        resp = client.get("/api/agents/seo/ops/metrics")
        data = resp.json()
        total = sum(data["counters"].get("seo.crawl.jobs", {}).values())
        assert total == 2

    def test_no_raw_tenant_in_response(self, client, monkeypatch):
        monkeypatch.delenv("PIXIE_INTERNAL_API_SECRET", raising=False)
        from seo.ops import metrics
        metrics.incr("seo.rank.jobs", tenant="raw_tenant_value_xyz")
        resp = client.get("/api/agents/seo/ops/metrics")
        assert "raw_tenant_value_xyz" not in resp.text


# ── Readiness endpoint ────────────────────────────────────────────────────────

class TestReadiness:
    def test_returns_200(self, client, monkeypatch):
        monkeypatch.delenv("PIXIE_INTERNAL_API_SECRET", raising=False)
        resp = client.get("/api/agents/seo/ops/readiness")
        assert resp.status_code == 200

    def test_response_shape(self, client, monkeypatch):
        monkeypatch.delenv("PIXIE_INTERNAL_API_SECRET", raising=False)
        resp = client.get("/api/agents/seo/ops/readiness")
        data = resp.json()
        assert "providers" in data
        assert "count" in data
        assert isinstance(data["providers"], list)

    def test_returns_all_providers(self, client, monkeypatch):
        monkeypatch.delenv("PIXIE_INTERNAL_API_SECRET", raising=False)
        resp = client.get("/api/agents/seo/ops/readiness")
        data = resp.json()
        assert data["count"] == 10
        names = {p["provider"] for p in data["providers"]}
        for expected in ("google_oauth", "gsc", "ga4", "pagespeed", "keyword",
                         "rank", "backlink", "gbp", "email", "pdf"):
            assert expected in names

    def test_no_credential_values_in_response(self, client, monkeypatch):
        monkeypatch.delenv("PIXIE_INTERNAL_API_SECRET", raising=False)
        monkeypatch.setenv("EMAIL_PROVIDER_API_KEY", "re_secret_key_xyz")
        resp = client.get("/api/agents/seo/ops/readiness")
        assert "re_secret_key_xyz" not in resp.text

    def test_configured_reflects_env(self, client, monkeypatch):
        monkeypatch.delenv("PIXIE_INTERNAL_API_SECRET", raising=False)
        monkeypatch.setenv("GOOGLE_CLIENT_ID", "some_id")
        monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "some_secret")
        resp = client.get("/api/agents/seo/ops/readiness")
        data = resp.json()
        providers_by_name = {p["provider"]: p for p in data["providers"]}
        assert providers_by_name["google_oauth"]["configured"] is True


# ── Alerts endpoint ───────────────────────────────────────────────────────────

class TestAlerts:
    def test_returns_200(self, client, monkeypatch):
        monkeypatch.delenv("PIXIE_INTERNAL_API_SECRET", raising=False)
        resp = client.get("/api/agents/seo/ops/alerts")
        assert resp.status_code == 200

    def test_response_shape(self, client, monkeypatch):
        monkeypatch.delenv("PIXIE_INTERNAL_API_SECRET", raising=False)
        resp = client.get("/api/agents/seo/ops/alerts")
        data = resp.json()
        assert "alerts" in data
        assert "count" in data
        assert "has_critical" in data
        assert isinstance(data["alerts"], list)

    def test_count_matches_alerts_list(self, client, monkeypatch):
        monkeypatch.delenv("PIXIE_INTERNAL_API_SECRET", raising=False)
        resp = client.get("/api/agents/seo/ops/alerts")
        data = resp.json()
        assert data["count"] == len(data["alerts"])

    def test_has_critical_correct(self, client, monkeypatch):
        monkeypatch.delenv("PIXIE_INTERNAL_API_SECRET", raising=False)
        # Seed a critical alert condition
        monkeypatch.setenv("SEO_REQUIRE_TOKEN_ENCRYPTION", "1")
        monkeypatch.delenv("GOOGLE_TOKEN_ENCRYPTION_KEY", raising=False)
        resp = client.get("/api/agents/seo/ops/alerts")
        data = resp.json()
        if any(a["severity"] == "critical" for a in data["alerts"]):
            assert data["has_critical"] is True
        else:
            assert data["has_critical"] is False

    def test_fires_crawl_failure_alert(self, client, monkeypatch):
        monkeypatch.delenv("PIXIE_INTERNAL_API_SECRET", raising=False)
        monkeypatch.setenv("SEO_ALERT_THRESHOLD_CRAWL_FAILURE_RATE_MAX", "0.2")
        from seo.ops import metrics
        for _ in range(10):
            metrics.incr("seo.crawl.jobs")
        for _ in range(5):
            metrics.incr("seo.crawl.failures")
        resp = client.get("/api/agents/seo/ops/alerts")
        data = resp.json()
        codes = {a["code"] for a in data["alerts"]}
        assert "HIGH_CRAWL_FAILURE_RATE" in codes

    def test_no_network_calls(self, client, monkeypatch):
        """Alerts endpoint must not make any network calls."""
        import urllib.request
        monkeypatch.delenv("PIXIE_INTERNAL_API_SECRET", raising=False)

        def _fail(*args, **kwargs):
            raise AssertionError("alerts endpoint must not make network calls")

        monkeypatch.setattr(urllib.request, "urlopen", _fail)
        resp = client.get("/api/agents/seo/ops/alerts")
        assert resp.status_code == 200
