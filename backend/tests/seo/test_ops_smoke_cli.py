"""Tests for scripts/seo_smoke.py — dry-run makes NO calls, secrets redacted.

This test file NEVER sets RUN_LIVE_SEO_SMOKE_TESTS or SEO_PROVIDER_SMOKE_TEST_ENABLED.
All probes are exercised in offline/dry-run/mock mode only.
"""

from __future__ import annotations

import os
import sys
import pytest


# Ensure backend/ is in sys.path
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)


# ── Import helpers ────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def clear_live_env(monkeypatch):
    """Ensure live env vars are never set during this test module."""
    monkeypatch.delenv("RUN_LIVE_SEO_SMOKE_TESTS", raising=False)
    monkeypatch.delenv("SEO_PROVIDER_SMOKE_TEST_ENABLED", raising=False)


# ── Live mode guard ───────────────────────────────────────────────────────────

def test_live_mode_not_enabled_without_env(monkeypatch):
    from scripts.seo_smoke import _live_mode_enabled
    assert _live_mode_enabled() is False


def test_live_mode_requires_both_env_vars(monkeypatch):
    from scripts.seo_smoke import _live_mode_enabled
    monkeypatch.setenv("RUN_LIVE_SEO_SMOKE_TESTS", "1")
    # Only one var — still False
    assert _live_mode_enabled() is False

    monkeypatch.setenv("SEO_PROVIDER_SMOKE_TEST_ENABLED", "1")
    assert _live_mode_enabled() is True


# ── Credential redaction ──────────────────────────────────────────────────────

def test_redact_hides_value():
    from scripts.seo_smoke import _redact
    result = _redact("super_secret_key")
    assert "super_secret_key" not in result
    assert "<set" in result


def test_redact_empty_shows_not_set():
    from scripts.seo_smoke import _redact
    result = _redact("")
    assert "not set" in result


def test_redact_none_shows_not_set():
    from scripts.seo_smoke import _redact
    result = _redact(None)
    assert "not set" in result


def test_env_display_redacts(monkeypatch):
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "my_real_secret_xyz")
    from scripts.seo_smoke import _env_display
    result = _env_display("GOOGLE_CLIENT_SECRET")
    assert "my_real_secret_xyz" not in result
    assert "<set" in result


# ── Individual probe offline behaviour ───────────────────────────────────────

def test_probe_google_oauth_no_creds(monkeypatch):
    monkeypatch.delenv("GOOGLE_CLIENT_ID", raising=False)
    monkeypatch.delenv("GOOGLE_CLIENT_SECRET", raising=False)
    from scripts.seo_smoke import probe_google_oauth
    result = probe_google_oauth()
    assert result["provider"] == "google_oauth"
    assert result["success"] is False
    # No credential values in detail
    assert "my_secret" not in result["detail"]


def test_probe_google_oauth_with_creds(monkeypatch):
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "fake_id")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "fake_secret")
    monkeypatch.setenv("GOOGLE_OAUTH_REDIRECT_SEO", "https://example.com/cb")
    from scripts.seo_smoke import probe_google_oauth
    result = probe_google_oauth()
    assert result["success"] is True
    assert "fake_secret" not in result["detail"]
    assert "fake_id" not in result["detail"]


def test_probe_gsc_no_creds(monkeypatch):
    monkeypatch.delenv("GOOGLE_CLIENT_ID", raising=False)
    monkeypatch.delenv("GOOGLE_CLIENT_SECRET", raising=False)
    from scripts.seo_smoke import probe_gsc
    result = probe_gsc()
    assert result["provider"] == "gsc"
    assert result["success"] is False


def test_probe_ga4_no_creds(monkeypatch):
    monkeypatch.delenv("GOOGLE_CLIENT_ID", raising=False)
    monkeypatch.delenv("GOOGLE_CLIENT_SECRET", raising=False)
    from scripts.seo_smoke import probe_ga4
    result = probe_ga4()
    assert result["provider"] == "ga4"
    assert result["success"] is False


def test_probe_keyword_no_creds_uses_mock(monkeypatch):
    monkeypatch.delenv("DATAFORSEO_LOGIN", raising=False)
    monkeypatch.delenv("DATAFORSEO_PASSWORD", raising=False)
    monkeypatch.delenv("KEYWORD_API_KEY", raising=False)
    from scripts.seo_smoke import probe_keyword
    result = probe_keyword()
    assert result["provider"] == "keyword"
    # No creds → success=False (mock path)
    assert result["success"] is False


def test_probe_keyword_with_creds_runs_mock(monkeypatch):
    monkeypatch.setenv("KEYWORD_API_KEY", "fake_key_xyz")
    from scripts.seo_smoke import probe_keyword
    result = probe_keyword()
    assert result["provider"] == "keyword"
    assert result["success"] is True
    # Latency recorded
    assert result["latency_ms"] is not None
    # No credentials in detail
    assert "fake_key_xyz" not in result["detail"]


def test_probe_rank_no_creds(monkeypatch):
    monkeypatch.delenv("SERP_API_KEY", raising=False)
    monkeypatch.delenv("RANK_API_KEY", raising=False)
    monkeypatch.delenv("DATAFORSEO_LOGIN", raising=False)
    monkeypatch.delenv("DATAFORSEO_PASSWORD", raising=False)
    from scripts.seo_smoke import probe_rank
    result = probe_rank()
    assert result["provider"] == "rank"
    assert result["success"] is False


def test_probe_rank_with_creds_runs_mock(monkeypatch):
    monkeypatch.setenv("SERP_API_KEY", "fake_serp_key")
    from scripts.seo_smoke import probe_rank
    result = probe_rank()
    assert result["provider"] == "rank"
    assert result["success"] is True
    assert "fake_serp_key" not in result["detail"]


def test_probe_backlink_no_creds(monkeypatch):
    monkeypatch.delenv("SEO_BACKLINK_API_KEY", raising=False)
    monkeypatch.delenv("DATAFORSEO_LOGIN", raising=False)
    monkeypatch.delenv("DATAFORSEO_PASSWORD", raising=False)
    from scripts.seo_smoke import probe_backlink
    result = probe_backlink()
    assert result["provider"] == "backlink"
    assert result["success"] is False


def test_probe_backlink_with_creds_runs_mock(monkeypatch):
    monkeypatch.setenv("SEO_BACKLINK_API_KEY", "fake_bk_key")
    from scripts.seo_smoke import probe_backlink
    result = probe_backlink()
    assert result["provider"] == "backlink"
    assert result["success"] is True
    assert "fake_bk_key" not in result["detail"]


def test_probe_gbp_no_creds(monkeypatch):
    monkeypatch.delenv("GOOGLE_CLIENT_ID", raising=False)
    monkeypatch.delenv("GOOGLE_CLIENT_SECRET", raising=False)
    from scripts.seo_smoke import probe_gbp
    result = probe_gbp()
    assert result["provider"] == "gbp"
    assert result["success"] is False


def test_probe_gbp_with_creds(monkeypatch):
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "gid")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "gsecret")
    monkeypatch.setenv("GBP_OAUTH_REDIRECT", "https://example.com/gbp")
    from scripts.seo_smoke import probe_gbp
    result = probe_gbp()
    assert result["provider"] == "gbp"
    assert result["success"] is True
    assert "gsecret" not in result["detail"]


def test_probe_email_no_send_flag_no_network(monkeypatch):
    """email probe without --send must NEVER make network calls."""
    import urllib.request
    monkeypatch.setenv("EMAIL_PROVIDER_API_KEY", "re_fake_key")
    monkeypatch.setenv("AI_RECEPTIONIST_TEAM_EMAIL", "team@example.com")

    def _fail(*args, **kwargs):
        raise AssertionError("email probe must not send without --send flag")

    monkeypatch.setattr(urllib.request, "urlopen", _fail)
    from scripts.seo_smoke import probe_email
    result = probe_email(allow_send=False)
    assert result["provider"] == "email"
    # config check only — should succeed
    assert result["success"] is True
    assert "re_fake_key" not in result["detail"]


def test_probe_email_no_key(monkeypatch):
    monkeypatch.delenv("EMAIL_PROVIDER_API_KEY", raising=False)
    from scripts.seo_smoke import probe_email
    result = probe_email(allow_send=False)
    assert result["success"] is False


def test_probe_pdf_offline():
    """PDF probe should work offline (uses local reportlab)."""
    from scripts.seo_smoke import probe_pdf
    result = probe_pdf()
    assert result["provider"] == "pdf"
    # success depends on whether reportlab is installed
    if result["success"]:
        assert result["schema_valid"] is True
        assert result["latency_ms"] is not None


# ── dry-run CLI main ──────────────────────────────────────────────────────────

def test_main_dry_run_no_live_env(monkeypatch, capsys):
    """Dry-run by default: no network, no side effects, exit 0."""
    import urllib.request

    def _fail(*args, **kwargs):
        raise AssertionError("dry-run must not make any network calls")

    monkeypatch.setattr(urllib.request, "urlopen", _fail)
    from scripts.seo_smoke import main
    exit_code = main.__wrapped__() if hasattr(main, "__wrapped__") else None
    # Call main with no live env — should return 0 (dry-run)
    import sys
    old_argv = sys.argv
    sys.argv = ["seo_smoke.py"]
    try:
        result = main()
    except SystemExit as e:
        result = e.code
    finally:
        sys.argv = old_argv
    assert result == 0


def test_main_dry_run_exit_without_live_flag(monkeypatch, capsys):
    """--live without env vars should still stay in dry-run."""
    import urllib.request

    def _fail(*args, **kwargs):
        raise AssertionError("should not make network calls")

    monkeypatch.setattr(urllib.request, "urlopen", _fail)
    from scripts.seo_smoke import main
    import sys
    old_argv = sys.argv
    sys.argv = ["seo_smoke.py", "--live"]
    try:
        result = main()
    except SystemExit as e:
        result = e.code
    finally:
        sys.argv = old_argv
    assert result == 0


# ── Result structure ──────────────────────────────────────────────────────────

def test_result_has_required_fields():
    from scripts.seo_smoke import _result
    r = _result("test_provider", True, latency_ms=50.0, detail="ok")
    assert r["provider"] == "test_provider"
    assert r["success"] is True
    assert r["latency_ms"] == 50.0
    assert r["detail"] == "ok"
    assert "schema_valid" in r
    assert "quota_ok" in r
    assert "skipped" in r


def test_probes_list_has_all_providers():
    from scripts.seo_smoke import _PROBES
    names = {name for name, *_ in _PROBES}
    for expected in (
        "google_oauth", "gsc", "ga4", "pagespeed", "keyword",
        "rank", "backlink", "gbp", "email", "pdf",
    ):
        assert expected in names, f"Missing probe: {expected}"


def test_no_probe_makes_network_call_without_live_env(monkeypatch):
    """All probes that don't have explicit network in offline mode must not call network."""
    import urllib.request

    def _fail(*args, **kwargs):
        raise AssertionError(f"Network call attempted: {args}")

    monkeypatch.setattr(urllib.request, "urlopen", _fail)
    monkeypatch.delenv("DATAFORSEO_LOGIN", raising=False)
    monkeypatch.delenv("DATAFORSEO_PASSWORD", raising=False)
    monkeypatch.delenv("SEO_BACKLINK_API_KEY", raising=False)
    monkeypatch.delenv("SERP_API_KEY", raising=False)
    monkeypatch.delenv("RANK_API_KEY", raising=False)
    monkeypatch.delenv("PAGESPEED_API_KEY", raising=False)  # no key = no network anyway in mock
    monkeypatch.delenv("KEYWORD_API_KEY", raising=False)

    from scripts.seo_smoke import (
        probe_google_oauth, probe_gsc, probe_ga4,
        probe_keyword, probe_rank, probe_backlink,
        probe_gbp, probe_email, probe_pdf,
    )

    # These probes should NEVER hit network in no-creds mode
    probe_google_oauth()
    probe_gsc()
    probe_ga4()
    probe_keyword()
    probe_rank()
    probe_backlink()
    probe_gbp()
    probe_email(allow_send=False)
    # pdf uses reportlab (local) — no network
    probe_pdf()
    # pagespeed DOES hit network when available — exclude from this test
