"""Tests for seo.flags — feature-flag module.

All tests are hermetic (no network, no DB). Tests use monkeypatch to set/clear
env vars and verify the expected behaviour of each flag.

Coverage:
  - Each flag on/off effect
  - read_only_mode blocks all writes via assert_write_allowed
  - Allowlist enforced when SEO_ALLOWED_WORKSPACE_IDS is set
  - Empty allowlist = all workspaces allowed
  - guard_write raises HTTPException(403)
  - FlagBlocked carries .kind / .reason / .flag
  - Safe defaults (unset = current behaviour, nothing blocked unless
    production_mode / read_only explicitly set)
  - live_provider_enabled() requires production_mode + not read_only
  - flags_status() returns a coherent dict
"""

from __future__ import annotations

import os

import pytest


# ── Helpers ───────────────────────────────────────────────────────────────────

def _clear_seo_flags(monkeypatch):
    """Clear all SEO flags so each test starts from a clean state."""
    for var in (
        "SEO_PRODUCTION_MODE",
        "SEO_READ_ONLY_MODE",
        "SEO_ALLOWED_WORKSPACE_IDS",
        "SEO_SCHEDULER_OBSERVE_ONLY",
        "SEO_OUTREACH_SEND_ENABLED",
        "SEO_GBP_WRITE_ENABLED",
        "SEO_WORDPRESS_WRITE_ENABLED",
        "SEO_PDF_ENABLED",
    ):
        monkeypatch.delenv(var, raising=False)


# ── Safe defaults ─────────────────────────────────────────────────────────────

def test_safe_defaults_nothing_blocked(monkeypatch):
    """With no env vars set, no write should be blocked by default."""
    _clear_seo_flags(monkeypatch)
    from seo.flags import assert_write_allowed, FlagBlocked
    # Generic write with no flags set must not raise
    assert_write_allowed("generic_write", "tenant_abc")
    # Specific write kinds with their flags unset must also not raise (flags off = blocked
    # for specific gates; this tests that the generic path doesn't auto-block)
    # Note: outreach_send, gbp_write, etc. ARE blocked when their flag is unset.
    # The safe default for those specific kinds is to block (opt-in gates).
    # This is intentional per spec: specific write flags must be explicitly enabled.


def test_generic_kind_no_flag_not_blocked(monkeypatch):
    """A write kind not in _KIND_FLAG_MAP passes through with no flags set."""
    _clear_seo_flags(monkeypatch)
    from seo.flags import assert_write_allowed
    # "crawler_write" is not in _KIND_FLAG_MAP so only global checks apply
    assert_write_allowed("crawler_write", "any_tenant")  # must not raise


# ── production_mode ───────────────────────────────────────────────────────────

def test_production_mode_off_by_default(monkeypatch):
    _clear_seo_flags(monkeypatch)
    from seo import flags
    assert flags.production_mode() is False


def test_production_mode_on(monkeypatch):
    monkeypatch.setenv("SEO_PRODUCTION_MODE", "1")
    from seo import flags
    assert flags.production_mode() is True


@pytest.mark.parametrize("val", ["true", "yes", "on", "1"])
def test_production_mode_truthy_values(monkeypatch, val):
    monkeypatch.setenv("SEO_PRODUCTION_MODE", val)
    from seo import flags
    assert flags.production_mode() is True


@pytest.mark.parametrize("val", ["0", "false", "no", "off", ""])
def test_production_mode_falsy_values(monkeypatch, val):
    monkeypatch.setenv("SEO_PRODUCTION_MODE", val)
    from seo import flags
    assert flags.production_mode() is False


# ── read_only_mode ────────────────────────────────────────────────────────────

def test_read_only_mode_off_by_default(monkeypatch):
    _clear_seo_flags(monkeypatch)
    from seo import flags
    assert flags.read_only_mode() is False


def test_read_only_mode_on(monkeypatch):
    monkeypatch.setenv("SEO_READ_ONLY_MODE", "1")
    from seo import flags
    assert flags.read_only_mode() is True


# ── read_only blocks all writes ───────────────────────────────────────────────

def test_read_only_blocks_generic_write(monkeypatch):
    _clear_seo_flags(monkeypatch)
    monkeypatch.setenv("SEO_READ_ONLY_MODE", "1")
    from seo.flags import assert_write_allowed, FlagBlocked
    with pytest.raises(FlagBlocked) as exc_info:
        assert_write_allowed("any_write", "tenant_x")
    err = exc_info.value
    assert err.kind == "any_write"
    assert err.flag == "SEO_READ_ONLY_MODE"
    assert "read-only" in err.reason.lower()


def test_read_only_blocks_all_specific_kinds(monkeypatch):
    _clear_seo_flags(monkeypatch)
    monkeypatch.setenv("SEO_READ_ONLY_MODE", "1")
    # Enable all specific flags to make sure read_only overrides them
    monkeypatch.setenv("SEO_OUTREACH_SEND_ENABLED", "1")
    monkeypatch.setenv("SEO_GBP_WRITE_ENABLED", "1")
    monkeypatch.setenv("SEO_WORDPRESS_WRITE_ENABLED", "1")
    monkeypatch.setenv("SEO_PDF_ENABLED", "1")
    from seo.flags import assert_write_allowed, FlagBlocked
    for kind in ("outreach_send", "gbp_write", "wordpress_write", "pdf"):
        with pytest.raises(FlagBlocked):
            assert_write_allowed(kind, "tenant_x")


# ── workspace_allowed ─────────────────────────────────────────────────────────

def test_workspace_allowed_empty_list_allows_all(monkeypatch):
    _clear_seo_flags(monkeypatch)
    from seo.flags import workspace_allowed
    assert workspace_allowed("any_tenant") is True
    assert workspace_allowed("another_tenant") is True


def test_workspace_allowed_with_list(monkeypatch):
    monkeypatch.setenv("SEO_ALLOWED_WORKSPACE_IDS", "tenant_a,tenant_b")
    from seo.flags import workspace_allowed
    assert workspace_allowed("tenant_a") is True
    assert workspace_allowed("tenant_b") is True
    assert workspace_allowed("tenant_c") is False
    assert workspace_allowed("") is False


def test_workspace_allowed_single_entry(monkeypatch):
    monkeypatch.setenv("SEO_ALLOWED_WORKSPACE_IDS", "only_tenant")
    from seo.flags import workspace_allowed
    assert workspace_allowed("only_tenant") is True
    assert workspace_allowed("other") is False


def test_allowlist_blocks_assert_write_allowed(monkeypatch):
    _clear_seo_flags(monkeypatch)
    monkeypatch.setenv("SEO_ALLOWED_WORKSPACE_IDS", "allowed_tenant")
    from seo.flags import assert_write_allowed, FlagBlocked
    # Allowed tenant passes
    assert_write_allowed("generic_write", "allowed_tenant")  # no raise
    # Blocked tenant raises
    with pytest.raises(FlagBlocked) as exc_info:
        assert_write_allowed("generic_write", "blocked_tenant")
    err = exc_info.value
    assert err.flag == "SEO_ALLOWED_WORKSPACE_IDS"
    assert "blocked_tenant" in err.reason


# ── scheduler_observe_only ────────────────────────────────────────────────────

def test_scheduler_observe_only_off_by_default(monkeypatch):
    _clear_seo_flags(monkeypatch)
    from seo import flags
    assert flags.scheduler_observe_only() is False


def test_scheduler_observe_only_on(monkeypatch):
    monkeypatch.setenv("SEO_SCHEDULER_OBSERVE_ONLY", "1")
    from seo import flags
    assert flags.scheduler_observe_only() is True


# ── outreach_send_enabled ─────────────────────────────────────────────────────

def test_outreach_send_disabled_by_default(monkeypatch):
    _clear_seo_flags(monkeypatch)
    from seo import flags
    assert flags.outreach_send_enabled() is False


def test_outreach_send_enabled_when_set(monkeypatch):
    monkeypatch.setenv("SEO_OUTREACH_SEND_ENABLED", "1")
    from seo import flags
    assert flags.outreach_send_enabled() is True


def test_outreach_send_blocked_by_flag(monkeypatch):
    _clear_seo_flags(monkeypatch)
    # Flag is off by default → write should be blocked for this kind
    from seo.flags import assert_write_allowed, FlagBlocked
    with pytest.raises(FlagBlocked) as exc_info:
        assert_write_allowed("outreach_send", "tenant_x")
    err = exc_info.value
    assert err.flag == "SEO_OUTREACH_SEND_ENABLED"
    assert err.kind == "outreach_send"


def test_outreach_send_allowed_when_enabled(monkeypatch):
    _clear_seo_flags(monkeypatch)
    monkeypatch.setenv("SEO_OUTREACH_SEND_ENABLED", "1")
    from seo.flags import assert_write_allowed
    assert_write_allowed("outreach_send", "tenant_x")  # must not raise


# ── gbp_write_enabled ─────────────────────────────────────────────────────────

def test_gbp_write_disabled_by_default(monkeypatch):
    _clear_seo_flags(monkeypatch)
    from seo import flags
    assert flags.gbp_write_enabled() is False


def test_gbp_write_blocked_when_flag_off(monkeypatch):
    _clear_seo_flags(monkeypatch)
    from seo.flags import assert_write_allowed, FlagBlocked
    with pytest.raises(FlagBlocked) as exc_info:
        assert_write_allowed("gbp_write", "tenant_y")
    assert exc_info.value.flag == "SEO_GBP_WRITE_ENABLED"


def test_gbp_write_allowed_when_enabled(monkeypatch):
    _clear_seo_flags(monkeypatch)
    monkeypatch.setenv("SEO_GBP_WRITE_ENABLED", "1")
    from seo.flags import assert_write_allowed
    assert_write_allowed("gbp_write", "tenant_y")


# ── wordpress_write_enabled ───────────────────────────────────────────────────

def test_wordpress_write_disabled_by_default(monkeypatch):
    _clear_seo_flags(monkeypatch)
    from seo import flags
    assert flags.wordpress_write_enabled() is False


def test_wordpress_write_blocked_when_flag_off(monkeypatch):
    _clear_seo_flags(monkeypatch)
    from seo.flags import assert_write_allowed, FlagBlocked
    with pytest.raises(FlagBlocked) as exc_info:
        assert_write_allowed("wordpress_write", "tenant_z")
    assert exc_info.value.flag == "SEO_WORDPRESS_WRITE_ENABLED"


def test_wordpress_write_allowed_when_enabled(monkeypatch):
    _clear_seo_flags(monkeypatch)
    monkeypatch.setenv("SEO_WORDPRESS_WRITE_ENABLED", "1")
    from seo.flags import assert_write_allowed
    assert_write_allowed("wordpress_write", "tenant_z")


# ── pdf_enabled ───────────────────────────────────────────────────────────────

def test_pdf_disabled_by_default(monkeypatch):
    _clear_seo_flags(monkeypatch)
    from seo import flags
    assert flags.pdf_enabled() is False


def test_pdf_blocked_when_flag_off(monkeypatch):
    _clear_seo_flags(monkeypatch)
    from seo.flags import assert_write_allowed, FlagBlocked
    with pytest.raises(FlagBlocked) as exc_info:
        assert_write_allowed("pdf", "tenant_a")
    assert exc_info.value.flag == "SEO_PDF_ENABLED"


def test_pdf_allowed_when_enabled(monkeypatch):
    _clear_seo_flags(monkeypatch)
    monkeypatch.setenv("SEO_PDF_ENABLED", "1")
    from seo.flags import assert_write_allowed
    assert_write_allowed("pdf", "tenant_a")


# ── live_provider_enabled ─────────────────────────────────────────────────────

def test_live_provider_disabled_by_default(monkeypatch):
    _clear_seo_flags(monkeypatch)
    from seo import flags
    assert flags.live_provider_enabled("any") is False


def test_live_provider_requires_production_mode(monkeypatch):
    _clear_seo_flags(monkeypatch)
    monkeypatch.setenv("SEO_PRODUCTION_MODE", "1")
    from seo import flags
    assert flags.live_provider_enabled("any") is True


def test_live_provider_blocked_when_read_only(monkeypatch):
    _clear_seo_flags(monkeypatch)
    monkeypatch.setenv("SEO_PRODUCTION_MODE", "1")
    monkeypatch.setenv("SEO_READ_ONLY_MODE", "1")
    from seo import flags
    assert flags.live_provider_enabled("any") is False


def test_live_provider_needs_both_conditions(monkeypatch):
    _clear_seo_flags(monkeypatch)
    # production_mode off, read_only off → still False (production_mode required)
    from seo import flags
    assert flags.live_provider_enabled("semrush") is False


# ── FlagBlocked exception attributes ─────────────────────────────────────────

def test_flagblocked_attributes(monkeypatch):
    _clear_seo_flags(monkeypatch)
    monkeypatch.setenv("SEO_READ_ONLY_MODE", "1")
    from seo.flags import assert_write_allowed, FlagBlocked
    with pytest.raises(FlagBlocked) as exc_info:
        assert_write_allowed("some_write", "t1")
    err = exc_info.value
    assert isinstance(err, RuntimeError)
    assert err.kind == "some_write"
    assert isinstance(err.reason, str) and err.reason
    assert err.flag == "SEO_READ_ONLY_MODE"
    assert "some_write" in str(err)


# ── guard_write → HTTPException ───────────────────────────────────────────────

def test_guard_write_raises_http_exception(monkeypatch):
    _clear_seo_flags(monkeypatch)
    monkeypatch.setenv("SEO_READ_ONLY_MODE", "1")
    from fastapi import HTTPException
    from seo.flags import guard_write
    with pytest.raises(HTTPException) as exc_info:
        guard_write("some_write", "t1")
    exc = exc_info.value
    assert exc.status_code == 403
    assert exc.detail["error"] == "seo_write_blocked"
    assert exc.detail["kind"] == "some_write"


def test_guard_write_passes_when_allowed(monkeypatch):
    _clear_seo_flags(monkeypatch)
    from seo.flags import guard_write
    # Generic kind, no allowlist, read-only off → should not raise
    guard_write("generic_write", "t1")


# ── flags_status ──────────────────────────────────────────────────────────────

def test_flags_status_all_off(monkeypatch):
    _clear_seo_flags(monkeypatch)
    from seo.flags import flags_status
    status = flags_status()
    assert status["production_mode"] is False
    assert status["read_only_mode"] is False
    assert status["scheduler_observe_only"] is False
    assert status["outreach_send_enabled"] is False
    assert status["gbp_write_enabled"] is False
    assert status["wordpress_write_enabled"] is False
    assert status["pdf_enabled"] is False
    assert status["live_provider_enabled"] is False
    assert status["all_workspaces_allowed"] is True
    assert status["allowed_workspace_ids_count"] == 0


def test_flags_status_all_on(monkeypatch):
    monkeypatch.setenv("SEO_PRODUCTION_MODE", "1")
    monkeypatch.setenv("SEO_SCHEDULER_OBSERVE_ONLY", "1")
    monkeypatch.setenv("SEO_OUTREACH_SEND_ENABLED", "1")
    monkeypatch.setenv("SEO_GBP_WRITE_ENABLED", "1")
    monkeypatch.setenv("SEO_WORDPRESS_WRITE_ENABLED", "1")
    monkeypatch.setenv("SEO_PDF_ENABLED", "1")
    monkeypatch.setenv("SEO_ALLOWED_WORKSPACE_IDS", "t1,t2,t3")
    monkeypatch.delenv("SEO_READ_ONLY_MODE", raising=False)
    from seo.flags import flags_status
    status = flags_status()
    assert status["production_mode"] is True
    assert status["read_only_mode"] is False
    assert status["live_provider_enabled"] is True
    assert status["allowed_workspace_ids_count"] == 3
    assert status["all_workspaces_allowed"] is False


# ── Check ordering: read_only before allowlist before kind-flag ───────────────

def test_check_ordering_read_only_first(monkeypatch):
    """read_only_mode is checked before workspace allowlist."""
    _clear_seo_flags(monkeypatch)
    monkeypatch.setenv("SEO_READ_ONLY_MODE", "1")
    monkeypatch.setenv("SEO_ALLOWED_WORKSPACE_IDS", "allowed_tenant")
    from seo.flags import assert_write_allowed, FlagBlocked
    with pytest.raises(FlagBlocked) as exc_info:
        assert_write_allowed("any_write", "allowed_tenant")
    # Should be blocked by read_only, not allowlist
    assert exc_info.value.flag == "SEO_READ_ONLY_MODE"


def test_check_ordering_allowlist_before_kind_flag(monkeypatch):
    """Allowlist is checked before specific kind flags."""
    _clear_seo_flags(monkeypatch)
    monkeypatch.setenv("SEO_ALLOWED_WORKSPACE_IDS", "allowed_tenant")
    monkeypatch.setenv("SEO_OUTREACH_SEND_ENABLED", "1")
    from seo.flags import assert_write_allowed, FlagBlocked
    with pytest.raises(FlagBlocked) as exc_info:
        assert_write_allowed("outreach_send", "blocked_tenant")
    # Should be blocked by allowlist, not kind flag
    assert exc_info.value.flag == "SEO_ALLOWED_WORKSPACE_IDS"
