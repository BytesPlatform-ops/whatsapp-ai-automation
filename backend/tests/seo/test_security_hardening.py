"""Security hardening tests for the SEO agent and shared internal-secret middleware.

Tests are completely offline (no network, no paid calls) and use FastAPI's
TestClient with monkeypatched env vars.

Coverage:
  (a) validate_internal_secret() raises StartupConfigError when
      PIXIE_REQUIRE_INTERNAL_SECRET=1 but no secret is set; passes when set.
  (b) Global middleware: with secret set, non-public requests missing the header
      get 401; with the correct header they pass.
  (c) Tenant header resolution:
      - X-Pixie-Tenant header present → used as tenant; body tenant_id ignored
        (spoof blocked — header wins even when body says something different).
      - Strict mode (PIXIE_REQUIRE_INTERNAL_SECRET=1) + no header → 400.
      - Non-strict (flag off) → body/query tenant_id used; "demo_tenant" fallback.
  (d) Cross-tenant isolation: data written under ws_A is not visible to ws_B.
"""

from __future__ import annotations

import os
import pytest
from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

WP_HTML = (
    "<html><head><title>" + "Very long WordPress page title " * 4 + "</title>"
    "<link rel='stylesheet' href='/wp-content/themes/x/style.css'>"
    "<meta name='generator' content='WordPress 6.5'></head>"
    "<body><h1>Welcome</h1><img src='a.jpg'><p>Content here.</p></body></html>"
)


def _fake_fetch(url, timeout=20.0):
    return {"html": WP_HTML, "headers": {}, "final_url": url, "status": 200}


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def _reset(monkeypatch):
    """Reset per-test state and patch out real network calls."""
    import approvals.router as ar
    import activity.router as act
    import seo.audit_agent as aa

    ar._store = None
    act._store = None
    aa._repos = None

    monkeypatch.setattr("seo.audit_agent.fetch_full", _fake_fetch)
    monkeypatch.setattr("seo.agent_routes.fetch_full", _fake_fetch)
    monkeypatch.setenv("PIXIE_AGENT_MODE", "production")
    monkeypatch.setenv("PIXIE_EXECUTION_MODE", "mock")
    # Ensure secret and strict flag are unset by default so each test starts clean.
    monkeypatch.delenv("PIXIE_INTERNAL_API_SECRET", raising=False)
    monkeypatch.delenv("PIXIE_REQUIRE_INTERNAL_SECRET", raising=False)
    yield
    aa._repos = None


@pytest.fixture
def client():
    from app import app
    return TestClient(app, raise_server_exceptions=True)


# ---------------------------------------------------------------------------
# (a) validate_internal_secret — boot guard
# ---------------------------------------------------------------------------

class TestValidateInternalSecret:
    def test_raises_when_flag_set_and_secret_missing(self, monkeypatch):
        from startup_checks import StartupConfigError, validate_internal_secret

        monkeypatch.setenv("PIXIE_REQUIRE_INTERNAL_SECRET", "1")
        monkeypatch.delenv("PIXIE_INTERNAL_API_SECRET", raising=False)

        with pytest.raises(StartupConfigError, match="PIXIE_INTERNAL_API_SECRET"):
            validate_internal_secret()

    def test_raises_when_flag_set_and_secret_empty_string(self, monkeypatch):
        from startup_checks import StartupConfigError, validate_internal_secret

        monkeypatch.setenv("PIXIE_REQUIRE_INTERNAL_SECRET", "1")
        monkeypatch.setenv("PIXIE_INTERNAL_API_SECRET", "   ")  # whitespace-only

        with pytest.raises(StartupConfigError):
            validate_internal_secret()

    def test_passes_when_flag_set_and_secret_present(self, monkeypatch):
        from startup_checks import validate_internal_secret

        monkeypatch.setenv("PIXIE_REQUIRE_INTERNAL_SECRET", "1")
        monkeypatch.setenv("PIXIE_INTERNAL_API_SECRET", "a-strong-secret-value")

        # Must not raise
        validate_internal_secret()

    def test_noop_when_flag_off(self, monkeypatch):
        from startup_checks import validate_internal_secret

        monkeypatch.delenv("PIXIE_REQUIRE_INTERNAL_SECRET", raising=False)
        monkeypatch.delenv("PIXIE_INTERNAL_API_SECRET", raising=False)

        # Must not raise even with no secret
        validate_internal_secret()

    def test_truthy_variants(self, monkeypatch):
        """All _truthy() values for the flag trigger the guard."""
        from startup_checks import StartupConfigError, validate_internal_secret

        monkeypatch.delenv("PIXIE_INTERNAL_API_SECRET", raising=False)
        for val in ("1", "true", "yes", "on", "True", "YES"):
            monkeypatch.setenv("PIXIE_REQUIRE_INTERNAL_SECRET", val)
            with pytest.raises(StartupConfigError):
                validate_internal_secret()

    def test_falsy_variants_are_noop(self, monkeypatch):
        """0 / false / no → no-op."""
        from startup_checks import validate_internal_secret

        monkeypatch.delenv("PIXIE_INTERNAL_API_SECRET", raising=False)
        for val in ("0", "false", "no", "off", "", "FALSE"):
            monkeypatch.setenv("PIXIE_REQUIRE_INTERNAL_SECRET", val)
            validate_internal_secret()  # must not raise


# ---------------------------------------------------------------------------
# (b) Middleware — X-Pixie-Internal-Secret enforcement
# ---------------------------------------------------------------------------

class TestMiddleware:
    def test_no_secret_configured_allows_all(self, client, monkeypatch):
        """When the env var is unset, middleware is a no-op."""
        monkeypatch.delenv("PIXIE_INTERNAL_API_SECRET", raising=False)
        r = client.get("/api/agents/seo/history", params={"tenant_id": "t_test"})
        assert r.status_code == 200

    def test_secret_set_missing_header_returns_401(self, client, monkeypatch):
        monkeypatch.setenv("PIXIE_INTERNAL_API_SECRET", "super-secret-xyz")
        r = client.get("/api/agents/seo/history", params={"tenant_id": "t_test"})
        assert r.status_code == 401

    def test_secret_set_wrong_header_returns_401(self, client, monkeypatch):
        monkeypatch.setenv("PIXIE_INTERNAL_API_SECRET", "super-secret-xyz")
        r = client.get(
            "/api/agents/seo/history",
            params={"tenant_id": "t_test"},
            headers={"X-Pixie-Internal-Secret": "wrong-secret"},
        )
        assert r.status_code == 401

    def test_secret_set_correct_header_passes(self, client, monkeypatch):
        monkeypatch.setenv("PIXIE_INTERNAL_API_SECRET", "super-secret-xyz")
        r = client.get(
            "/api/agents/seo/history",
            params={"tenant_id": "t_test"},
            headers={"X-Pixie-Internal-Secret": "super-secret-xyz"},
        )
        assert r.status_code == 200

    def test_public_paths_exempt_from_secret(self, client, monkeypatch):
        """Health endpoint is public — no secret needed even when it's configured."""
        monkeypatch.setenv("PIXIE_INTERNAL_API_SECRET", "super-secret-xyz")
        r = client.get("/health")
        assert r.status_code == 200

    def test_secret_never_logged_in_response(self, client, monkeypatch):
        """The response body MUST NOT contain the secret value."""
        secret = "top-secret-value-xyz"
        monkeypatch.setenv("PIXIE_INTERNAL_API_SECRET", secret)
        r = client.get("/api/agents/seo/history", params={"tenant_id": "t_test"})
        assert secret not in r.text


# ---------------------------------------------------------------------------
# (c) Tenant resolution
# ---------------------------------------------------------------------------

class TestTenantResolution:
    """Tests for resolve_tenant dependency in SEO routes."""

    # --- Non-strict mode (flag off, existing behaviour) ---

    def test_body_tenant_used_in_non_strict_mode(self, client):
        """POST with body tenant_id works in dev/test mode (no header, flag off)."""
        r = client.post(
            "/api/agents/seo/audit/start",
            json={"tenant_id": "t_body_tenant", "website_url": "https://mysite.com"},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["audit"]["tenant_id"] == "t_body_tenant"

    def test_query_tenant_used_for_get_in_non_strict_mode(self, client):
        """GET with tenant_id query param works in dev/test mode."""
        r = client.get("/api/agents/seo/history", params={"tenant_id": "t_query_tenant"})
        assert r.status_code == 200

    def test_demo_fallback_in_non_strict_mode(self, client):
        """With no header and no query param, falls back to demo_tenant."""
        r = client.get("/api/agents/seo/history")
        assert r.status_code == 200

    def test_header_wins_over_body_tenant(self, client):
        """X-Pixie-Tenant header overrides body tenant_id — spoof blocked."""
        # Write an audit under the header tenant ws_A
        r1 = client.post(
            "/api/agents/seo/audit/start",
            json={"tenant_id": "ws_BODY_IGNORED", "website_url": "https://mysite.com"},
            headers={"X-Pixie-Tenant": "ws_A"},
        )
        assert r1.status_code == 200
        data1 = r1.json()
        # The audit must be stored under ws_A, NOT ws_BODY_IGNORED
        assert data1["audit"]["tenant_id"] == "ws_A"

    def test_header_win_cross_tenant_spoof_blocked(self, client):
        """Body claims ws_B but header says ws_A — audit is stored under ws_A.

        A subsequent read using ws_B (body) but header ws_A sees the audit,
        confirming the header was authoritative and the body was suppressed.
        """
        # Create audit under ws_A (header overrides the body ws_B spoof)
        r1 = client.post(
            "/api/agents/seo/audit/start",
            json={"tenant_id": "ws_B", "website_url": "https://spoof.com"},
            headers={"X-Pixie-Tenant": "ws_A"},
        )
        assert r1.status_code == 200
        audit_id = r1.json()["audit"]["id"]
        assert r1.json()["audit"]["tenant_id"] == "ws_A"

        # ws_B cannot read ws_A's audit (cross-tenant isolation)
        r2 = client.get(
            f"/api/agents/seo/audit/{audit_id}",
            params={"tenant_id": "ws_B"},  # no header → uses ws_B
        )
        # Should be 404 because audit is stored under ws_A, not ws_B
        assert r2.status_code == 404

        # ws_A can read its own audit
        r3 = client.get(
            f"/api/agents/seo/audit/{audit_id}",
            headers={"X-Pixie-Tenant": "ws_A"},
        )
        assert r3.status_code == 200

    # --- Strict mode (PIXIE_REQUIRE_INTERNAL_SECRET=1) ---

    def test_strict_mode_no_header_returns_400(self, client, monkeypatch):
        """In strict mode, requests without X-Pixie-Tenant get HTTP 400."""
        monkeypatch.setenv("PIXIE_REQUIRE_INTERNAL_SECRET", "1")
        monkeypatch.setenv("PIXIE_INTERNAL_API_SECRET", "strict-secret")

        r = client.get(
            "/api/agents/seo/history",
            params={"tenant_id": "t_should_not_be_used"},
            headers={"X-Pixie-Internal-Secret": "strict-secret"},
        )
        assert r.status_code == 400
        assert r.json()["detail"]["error"] == "tenant_required"

    def test_strict_mode_with_header_succeeds(self, client, monkeypatch):
        """In strict mode, X-Pixie-Tenant header present → request succeeds."""
        monkeypatch.setenv("PIXIE_REQUIRE_INTERNAL_SECRET", "1")
        monkeypatch.setenv("PIXIE_INTERNAL_API_SECRET", "strict-secret")

        r = client.get(
            "/api/agents/seo/history",
            headers={
                "X-Pixie-Internal-Secret": "strict-secret",
                "X-Pixie-Tenant": "ws_valid",
            },
        )
        assert r.status_code == 200

    def test_strict_mode_body_tenant_ignored_without_header(self, client, monkeypatch):
        """In strict mode, body tenant_id without header → 400 (no fallback)."""
        monkeypatch.setenv("PIXIE_REQUIRE_INTERNAL_SECRET", "1")
        monkeypatch.setenv("PIXIE_INTERNAL_API_SECRET", "strict-secret")

        r = client.post(
            "/api/agents/seo/audit/start",
            json={"tenant_id": "t_attempt_spoof", "website_url": "https://mysite.com"},
            headers={"X-Pixie-Internal-Secret": "strict-secret"},
        )
        assert r.status_code == 400
        assert r.json()["detail"]["error"] == "tenant_required"

    def test_strict_mode_header_tenant_used_in_post(self, client, monkeypatch):
        """In strict mode, POST with X-Pixie-Tenant header → audit stored under that tenant."""
        monkeypatch.setenv("PIXIE_REQUIRE_INTERNAL_SECRET", "1")
        monkeypatch.setenv("PIXIE_INTERNAL_API_SECRET", "strict-secret")

        r = client.post(
            "/api/agents/seo/audit/start",
            json={"website_url": "https://mysite.com"},
            headers={
                "X-Pixie-Internal-Secret": "strict-secret",
                "X-Pixie-Tenant": "ws_prod_workspace",
            },
        )
        assert r.status_code == 200
        assert r.json()["audit"]["tenant_id"] == "ws_prod_workspace"


# ---------------------------------------------------------------------------
# (d) Cross-tenant isolation in non-strict mode
# ---------------------------------------------------------------------------

class TestCrossTenantIsolation:
    """Rows written under tenant ws_A must not be visible to ws_B."""

    def test_audit_not_visible_to_other_tenant(self, client):
        # Write under ws_A
        r1 = client.post(
            "/api/agents/seo/audit/start",
            json={"tenant_id": "ws_iso_A", "website_url": "https://mysite.com"},
        )
        assert r1.status_code == 200
        audit_id = r1.json()["audit"]["id"]

        # ws_B cannot see it
        r2 = client.get(
            f"/api/agents/seo/audit/{audit_id}",
            params={"tenant_id": "ws_iso_B"},
        )
        assert r2.status_code == 404

    def test_history_isolated_per_tenant(self, client):
        # ws_A runs an audit
        client.post(
            "/api/agents/seo/audit/start",
            json={"tenant_id": "ws_hist_A", "website_url": "https://mysite.com"},
        )
        # ws_B's history should be empty
        h = client.get("/api/agents/seo/history", params={"tenant_id": "ws_hist_B"}).json()
        assert h["audits"] == []
