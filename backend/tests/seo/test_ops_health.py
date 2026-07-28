"""Tests for seo.ops.health — liveness, readiness, deps shapes + caching.

All tests are hermetic: no provider network calls, no external dependencies.
Health checks use cached/state-based readiness — we monkeypatch only env vars
and the readiness/scheduler modules to avoid any network path.
"""

import os
import pytest


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def clear_health_cache():
    from seo.ops.health import invalidate_cache
    invalidate_cache()
    yield
    invalidate_cache()


# ── Liveness ──────────────────────────────────────────────────────────────────

def test_liveness_returns_ok():
    from seo.ops.health import liveness
    result = liveness()
    assert result["status"] == "ok"
    assert result["check"] == "live"
    assert result["process"] == "up"


def test_liveness_has_required_keys():
    from seo.ops.health import liveness
    result = liveness()
    assert "status" in result
    assert "check" in result


def test_liveness_cached(monkeypatch):
    """Liveness should return the same object on second call within TTL."""
    monkeypatch.setenv("SEO_HEALTH_CACHE_LIVENESS_S", "60")
    from seo.ops.health import liveness
    r1 = liveness()
    r2 = liveness()
    assert r1 is r2  # same cached object


# ── Readiness ─────────────────────────────────────────────────────────────────

def test_readiness_has_required_keys():
    from seo.ops.health import readiness
    result = readiness()
    assert "status" in result
    assert "check" in result
    assert "failures" in result
    assert "checks" in result


def test_readiness_check_is_ready():
    from seo.ops.health import readiness
    result = readiness()
    assert result["check"] == "ready"


def test_readiness_checks_structure():
    from seo.ops.health import readiness
    result = readiness()
    checks = result["checks"]
    assert "required_env" in checks
    assert "token_encryption" in checks
    assert "persistence" in checks
    assert "migrations" in checks
    assert "scheduler" in checks


def test_readiness_failures_is_list():
    from seo.ops.health import readiness
    result = readiness()
    assert isinstance(result["failures"], list)


def test_readiness_migration_not_required_by_default(monkeypatch):
    monkeypatch.delenv("SEO_HEALTH_REQUIRE_MIGRATIONS", raising=False)
    from seo.ops.health import readiness
    result = readiness()
    assert result["checks"]["migrations"]["ok"] is True


def test_readiness_migration_required_but_not_applied(monkeypatch):
    monkeypatch.setenv("SEO_HEALTH_REQUIRE_MIGRATIONS", "1")
    monkeypatch.delenv("SEO_MIGRATIONS_APPLIED", raising=False)
    from seo.ops.health import readiness, invalidate_cache
    invalidate_cache()
    result = readiness()
    assert result["checks"]["migrations"]["ok"] is False
    assert any("migration" in f.lower() for f in result["failures"])


def test_readiness_migration_required_and_applied(monkeypatch):
    monkeypatch.setenv("SEO_HEALTH_REQUIRE_MIGRATIONS", "1")
    monkeypatch.setenv("SEO_MIGRATIONS_APPLIED", "1")
    from seo.ops.health import readiness, invalidate_cache
    invalidate_cache()
    result = readiness()
    assert result["checks"]["migrations"]["ok"] is True


def test_readiness_scheduler_disabled_is_ok(monkeypatch):
    monkeypatch.delenv("SEO_SCHEDULER_ENABLED", raising=False)
    from seo.ops.health import readiness, invalidate_cache
    invalidate_cache()
    result = readiness()
    # Disabled scheduler is always OK
    assert result["checks"]["scheduler"]["ok"] is True


def test_readiness_encryption_not_required_when_unset(monkeypatch):
    monkeypatch.delenv("SEO_REQUIRE_TOKEN_ENCRYPTION", raising=False)
    monkeypatch.delenv("GOOGLE_TOKEN_ENCRYPTION_KEY", raising=False)
    from seo.ops.health import readiness, invalidate_cache
    invalidate_cache()
    result = readiness()
    # When encryption is not required, check should be OK even without key
    assert result["checks"]["token_encryption"]["ok"] is True


def test_readiness_encryption_required_but_unavailable(monkeypatch):
    monkeypatch.setenv("SEO_REQUIRE_TOKEN_ENCRYPTION", "1")
    monkeypatch.delenv("GOOGLE_TOKEN_ENCRYPTION_KEY", raising=False)
    from seo.ops.health import readiness, invalidate_cache
    invalidate_cache()
    result = readiness()
    assert result["checks"]["token_encryption"]["ok"] is False
    assert any("encryption" in f.lower() for f in result["failures"])


def test_readiness_cache(monkeypatch):
    monkeypatch.setenv("SEO_HEALTH_CACHE_READY_S", "60")
    from seo.ops.health import readiness
    r1 = readiness()
    r2 = readiness()
    assert r1 is r2


# ── Dependency health ─────────────────────────────────────────────────────────

def test_deps_has_required_keys():
    from seo.ops.health import deps
    result = deps()
    assert "status" in result
    assert "check" in result
    assert "dependencies" in result


def test_deps_check_is_deps():
    from seo.ops.health import deps
    result = deps()
    assert result["check"] == "deps"


def test_deps_contains_expected_providers():
    from seo.ops.health import deps
    result = deps()
    d = result["dependencies"]
    assert "supabase" in d
    assert "google_oauth" in d
    assert "pagespeed" in d
    assert "seo_providers" in d
    assert "email" in d
    assert "pdf_renderer" in d
    assert "token_encryption" in d


def test_deps_seo_providers_contains_expected():
    from seo.ops.health import deps
    result = deps()
    seo = result["dependencies"]["seo_providers"]
    for name in ("gsc", "ga4", "keyword", "rank", "backlink", "gbp"):
        assert name in seo


def test_deps_no_secrets_in_response(monkeypatch):
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "super_secret_value_xyz")
    from seo.ops.health import deps, invalidate_cache
    invalidate_cache()
    result = deps()
    result_str = str(result)
    assert "super_secret_value_xyz" not in result_str


def test_deps_cache(monkeypatch):
    monkeypatch.setenv("SEO_HEALTH_CACHE_DEPS_S", "60")
    from seo.ops.health import deps
    d1 = deps()
    d2 = deps()
    assert d1 is d2


def test_deps_no_provider_network_calls(monkeypatch):
    """deps() must complete without any network calls.

    We patch urllib.request.urlopen to raise an error — if it's called
    the test will fail, proving deps() never touches the network.
    """
    import urllib.request

    def _fail(*args, **kwargs):
        raise AssertionError("deps() must not make network calls")

    monkeypatch.setattr(urllib.request, "urlopen", _fail)
    from seo.ops.health import deps, invalidate_cache
    invalidate_cache()
    # Should complete without hitting the patched urlopen
    result = deps()
    assert "dependencies" in result


def test_deps_overall_status_is_string():
    from seo.ops.health import deps
    result = deps()
    assert result["status"] in ("ok", "degraded", "error")
