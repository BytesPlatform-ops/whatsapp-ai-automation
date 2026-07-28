"""Tests for seo.ops.readiness — provider state detection from env (no network).

All tests are hermetic: env is monkeypatched, no network calls.
"""

import os
import pytest


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def clear_smoke_store():
    from seo.ops.readiness import reset_smoke_store
    reset_smoke_store()
    yield
    reset_smoke_store()


@pytest.fixture()
def no_google_creds(monkeypatch):
    monkeypatch.delenv("GOOGLE_CLIENT_ID", raising=False)
    monkeypatch.delenv("GOOGLE_CLIENT_SECRET", raising=False)
    monkeypatch.delenv("GOOGLE_OAUTH_REDIRECT_SEO", raising=False)


@pytest.fixture()
def with_google_creds(monkeypatch):
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "fake_client_id")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "fake_client_secret")
    monkeypatch.setenv("GOOGLE_OAUTH_REDIRECT_SEO", "https://example.com/callback")


# ── google_oauth ──────────────────────────────────────────────────────────────

def test_google_oauth_not_configured_without_creds(no_google_creds):
    from seo.ops.readiness import get_provider_readiness
    r = get_provider_readiness("google_oauth")
    assert r["configured"] is False
    assert r["creds_present"] is False


def test_google_oauth_configured_with_creds(with_google_creds):
    from seo.ops.readiness import get_provider_readiness
    r = get_provider_readiness("google_oauth")
    assert r["configured"] is True
    assert r["creds_present"] is True


def test_google_oauth_redirect_valid(with_google_creds):
    from seo.ops.readiness import get_provider_readiness
    r = get_provider_readiness("google_oauth")
    assert r["oauth_redirect_valid"] is True


def test_google_oauth_no_redirect(monkeypatch):
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "x")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "y")
    monkeypatch.delenv("GOOGLE_OAUTH_REDIRECT_SEO", raising=False)
    from seo.ops.readiness import get_provider_readiness
    r = get_provider_readiness("google_oauth")
    assert r["oauth_redirect_valid"] is False


# ── gsc / ga4 ─────────────────────────────────────────────────────────────────

def test_gsc_configured_with_google_creds(with_google_creds):
    from seo.ops.readiness import get_provider_readiness
    r = get_provider_readiness("gsc")
    assert r["configured"] is True


def test_gsc_not_configured_without_creds(no_google_creds):
    from seo.ops.readiness import get_provider_readiness
    r = get_provider_readiness("gsc")
    assert r["configured"] is False


def test_ga4_configured_with_google_creds(with_google_creds):
    from seo.ops.readiness import get_provider_readiness
    r = get_provider_readiness("ga4")
    assert r["configured"] is True


# ── pagespeed ─────────────────────────────────────────────────────────────────

def test_pagespeed_always_configured():
    """PageSpeed free tier is always available even without an API key."""
    from seo.ops.readiness import get_provider_readiness
    r = get_provider_readiness("pagespeed")
    assert r["configured"] is True
    assert r["live_mode_enabled"] is True


def test_pagespeed_api_key_present(monkeypatch):
    monkeypatch.setenv("PAGESPEED_API_KEY", "fake_key_xyz")
    from seo.ops.readiness import get_provider_readiness
    r = get_provider_readiness("pagespeed")
    assert r["creds_present"] is True
    assert r["api_key_present"] is True


def test_pagespeed_api_key_absent(monkeypatch):
    monkeypatch.delenv("PAGESPEED_API_KEY", raising=False)
    from seo.ops.readiness import get_provider_readiness
    r = get_provider_readiness("pagespeed")
    assert r["creds_present"] is False


# ── keyword ───────────────────────────────────────────────────────────────────

def test_keyword_not_configured_without_creds(monkeypatch):
    monkeypatch.delenv("DATAFORSEO_LOGIN", raising=False)
    monkeypatch.delenv("DATAFORSEO_PASSWORD", raising=False)
    monkeypatch.delenv("KEYWORD_API_KEY", raising=False)
    from seo.ops.readiness import get_provider_readiness
    r = get_provider_readiness("keyword")
    assert r["configured"] is False


def test_keyword_configured_with_dataforseo(monkeypatch):
    monkeypatch.setenv("DATAFORSEO_LOGIN", "user@example.com")
    monkeypatch.setenv("DATAFORSEO_PASSWORD", "secret")
    from seo.ops.readiness import get_provider_readiness
    r = get_provider_readiness("keyword")
    assert r["configured"] is True


def test_keyword_configured_with_api_key(monkeypatch):
    monkeypatch.setenv("KEYWORD_API_KEY", "somekey")
    from seo.ops.readiness import get_provider_readiness
    r = get_provider_readiness("keyword")
    assert r["configured"] is True


# ── rank ──────────────────────────────────────────────────────────────────────

def test_rank_not_configured(monkeypatch):
    monkeypatch.delenv("SERP_API_KEY", raising=False)
    monkeypatch.delenv("RANK_API_KEY", raising=False)
    monkeypatch.delenv("DATAFORSEO_LOGIN", raising=False)
    monkeypatch.delenv("DATAFORSEO_PASSWORD", raising=False)
    from seo.ops.readiness import get_provider_readiness
    r = get_provider_readiness("rank")
    assert r["configured"] is False


def test_rank_configured_with_serp_key(monkeypatch):
    monkeypatch.setenv("SERP_API_KEY", "serpkey123")
    from seo.ops.readiness import get_provider_readiness
    r = get_provider_readiness("rank")
    assert r["configured"] is True


# ── backlink ──────────────────────────────────────────────────────────────────

def test_backlink_not_configured(monkeypatch):
    monkeypatch.delenv("SEO_BACKLINK_API_KEY", raising=False)
    monkeypatch.delenv("DATAFORSEO_LOGIN", raising=False)
    monkeypatch.delenv("DATAFORSEO_PASSWORD", raising=False)
    from seo.ops.readiness import get_provider_readiness
    r = get_provider_readiness("backlink")
    assert r["configured"] is False


def test_backlink_configured(monkeypatch):
    monkeypatch.setenv("SEO_BACKLINK_API_KEY", "bk_key")
    from seo.ops.readiness import get_provider_readiness
    r = get_provider_readiness("backlink")
    assert r["configured"] is True


# ── gbp ───────────────────────────────────────────────────────────────────────

def test_gbp_not_configured(no_google_creds, monkeypatch):
    monkeypatch.delenv("GBP_OAUTH_REDIRECT", raising=False)
    from seo.ops.readiness import get_provider_readiness
    r = get_provider_readiness("gbp")
    assert r["configured"] is False


def test_gbp_configured(with_google_creds, monkeypatch):
    monkeypatch.setenv("GBP_OAUTH_REDIRECT", "https://example.com/gbp/callback")
    from seo.ops.readiness import get_provider_readiness
    r = get_provider_readiness("gbp")
    assert r["configured"] is True
    assert r["oauth_redirect_valid"] is True


# ── email ─────────────────────────────────────────────────────────────────────

def test_email_not_configured(monkeypatch):
    monkeypatch.delenv("EMAIL_PROVIDER_API_KEY", raising=False)
    monkeypatch.delenv("AI_RECEPTIONIST_TEAM_EMAIL", raising=False)
    from seo.ops.readiness import get_provider_readiness
    r = get_provider_readiness("email")
    assert r["configured"] is False


def test_email_configured(monkeypatch):
    monkeypatch.setenv("EMAIL_PROVIDER_API_KEY", "re_key")
    monkeypatch.setenv("AI_RECEPTIONIST_TEAM_EMAIL", "team@example.com")
    from seo.ops.readiness import get_provider_readiness
    r = get_provider_readiness("email")
    assert r["configured"] is True
    assert r["team_email_configured"] is True


def test_email_key_but_no_team(monkeypatch):
    monkeypatch.setenv("EMAIL_PROVIDER_API_KEY", "re_key")
    monkeypatch.delenv("AI_RECEPTIONIST_TEAM_EMAIL", raising=False)
    from seo.ops.readiness import get_provider_readiness
    r = get_provider_readiness("email")
    assert r["configured"] is False
    assert r["creds_present"] is True
    assert r["team_email_configured"] is False


# ── pdf ───────────────────────────────────────────────────────────────────────

def test_pdf_readiness_reflects_reportlab():
    from seo.ops.readiness import get_provider_readiness
    r = get_provider_readiness("pdf")
    assert "configured" in r
    assert "renderer" in r
    # configured should match whether reportlab is importable
    try:
        import reportlab  # noqa
        assert r["configured"] is True
        assert r["renderer"] == "reportlab"
    except ImportError:
        assert r["configured"] is False
        assert r["renderer"] == "unavailable"


# ── Unknown provider ──────────────────────────────────────────────────────────

def test_unknown_provider():
    from seo.ops.readiness import get_provider_readiness
    r = get_provider_readiness("totally_unknown_provider_xyz")
    assert r["configured"] is False
    assert "error" in r


# ── all_providers_readiness ───────────────────────────────────────────────────

def test_all_providers_returns_list():
    from seo.ops.readiness import all_providers_readiness
    providers = all_providers_readiness()
    assert isinstance(providers, list)
    assert len(providers) == 10  # google_oauth, gsc, ga4, pagespeed, keyword, rank, backlink, gbp, email, pdf
    names = {p["provider"] for p in providers}
    assert "google_oauth" in names
    assert "gsc" in names
    assert "ga4" in names
    assert "pagespeed" in names
    assert "keyword" in names
    assert "rank" in names
    assert "backlink" in names
    assert "gbp" in names
    assert "email" in names
    assert "pdf" in names


def test_all_providers_no_credential_values(monkeypatch):
    """Provider readiness must never expose raw credential values."""
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "super_secret_client_id")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "super_secret_client_secret")
    from seo.ops.readiness import all_providers_readiness
    providers = all_providers_readiness()
    providers_str = str(providers)
    assert "super_secret_client_id" not in providers_str
    assert "super_secret_client_secret" not in providers_str


# ── Smoke result persistence ──────────────────────────────────────────────────

def test_record_smoke_result_success():
    from seo.ops.readiness import record_smoke_result, get_provider_readiness
    record_smoke_result("gsc", success=True, latency_ms=123.4, quota_ok=True)
    r = get_provider_readiness("gsc")
    assert r["creds_valid"] is True
    assert r["last_smoke"] is not None
    assert r["last_success"] is not None
    assert r["last_failure"] is None
    assert r["latency_ms"] == 123.4
    assert r["quota_ok"] is True


def test_record_smoke_result_failure():
    from seo.ops.readiness import record_smoke_result, get_provider_readiness
    record_smoke_result("gsc", success=False, latency_ms=50.0)
    r = get_provider_readiness("gsc")
    assert r["creds_valid"] is False
    assert r["last_failure"] is not None
    assert r["last_success"] is None


def test_reset_smoke_store():
    from seo.ops.readiness import record_smoke_result, reset_smoke_store, get_provider_readiness
    record_smoke_result("gsc", success=True, latency_ms=10.0)
    reset_smoke_store()
    r = get_provider_readiness("gsc")
    assert r["creds_valid"] is None
    assert r["last_smoke"] is None


def test_initial_smoke_fields_are_none():
    from seo.ops.readiness import get_provider_readiness
    r = get_provider_readiness("keyword")
    assert r["creds_valid"] is None
    assert r["last_smoke"] is None
    assert r["last_success"] is None
    assert r["last_failure"] is None
    assert r["latency_ms"] is None
    assert r["quota_ok"] is None
