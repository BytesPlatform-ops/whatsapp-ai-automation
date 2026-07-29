"""Tests for AI Receptionist / integrations token encryption.

Hermetic — no network calls, no file I/O, no Supabase.
All keys are generated or monkeypatched in-test.

Covers:
  - seal → unseal round-trip (Fernet)
  - wrong key raises on unseal
  - corrupted ciphertext raises
  - is_sealed true/false
  - plaintext upgrade-on-read (legacy descriptor)
  - redact_descriptor hides sensitive values
  - require_encryption() + missing key makes seal raise
  - encryption_status() never contains the key
  - register a Google connection under tenantA; tenantB's find_active_connection returns None
  - seal_descriptor is idempotent (no double-seal)
  - unseal_descriptor recurses into nested dicts and lists (page_access_token in pages[])
  - find_active_connection returns sealed form; find_active_connection_unsealed returns plaintext
  - safe_status never exposes tokens
  - Meta token save/get round-trip via token_service
"""

from __future__ import annotations

import os

import pytest
from cryptography.fernet import Fernet


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture()
def fernet_key() -> str:
    """A fresh valid Fernet key for each test."""
    return Fernet.generate_key().decode()


@pytest.fixture()
def other_fernet_key() -> str:
    """A second distinct Fernet key."""
    return Fernet.generate_key().decode()


@pytest.fixture(autouse=True)
def _clean_connections():
    """Reset the in-memory connections store before each test."""
    from integrations import connections
    connections._CONNECTIONS.clear()
    yield
    connections._CONNECTIONS.clear()


@pytest.fixture(autouse=True)
def _reset_warned():
    """Reset the once-only warning flag in token_crypto before each test."""
    import integrations.token_crypto as tc
    tc._WARNED = False
    yield
    tc._WARNED = False


# ── Helpers ────────────────────────────────────────────────────────────────────

def _set_key(monkeypatch, key: str) -> None:
    monkeypatch.setenv("AI_RECEPTIONIST_TOKEN_ENCRYPTION_KEY", key)
    monkeypatch.delenv("GOOGLE_TOKEN_ENCRYPTION_KEY", raising=False)
    monkeypatch.delenv("PIXIE_TOKEN_ENCRYPTION_KEY", raising=False)


def _clear_keys(monkeypatch) -> None:
    for env in (
        "AI_RECEPTIONIST_TOKEN_ENCRYPTION_KEY",
        "GOOGLE_TOKEN_ENCRYPTION_KEY",
        "PIXIE_TOKEN_ENCRYPTION_KEY",
    ):
        monkeypatch.delenv(env, raising=False)


def _clear_require_flags(monkeypatch) -> None:
    monkeypatch.delenv("AI_RECEPTIONIST_REQUIRE_TOKEN_ENCRYPTION", raising=False)
    monkeypatch.delenv("SEO_REQUIRE_TOKEN_ENCRYPTION", raising=False)


# ── 1. seal → unseal round-trip ───────────────────────────────────────────────

def test_seal_unseal_round_trip_fernet(monkeypatch, fernet_key):
    _set_key(monkeypatch, fernet_key)
    import integrations.token_crypto as tc

    plaintext = "ya29.super_secret_access_token"
    sealed = tc.seal(plaintext)

    assert sealed.startswith("fer:")
    assert sealed != plaintext
    assert tc.unseal(sealed) == plaintext


def test_seal_unseal_round_trip_obf(monkeypatch):
    _clear_keys(monkeypatch)
    _clear_require_flags(monkeypatch)
    import integrations.token_crypto as tc

    plaintext = "EAABwzL..."
    sealed = tc.seal(plaintext)

    assert sealed.startswith("obf:")
    assert sealed != plaintext
    assert tc.unseal(sealed) == plaintext


def test_seal_empty_string(monkeypatch, fernet_key):
    _set_key(monkeypatch, fernet_key)
    import integrations.token_crypto as tc

    sealed = tc.seal("")
    assert sealed.startswith("fer:")
    assert tc.unseal(sealed) == ""


# ── 2. wrong key raises on unseal ─────────────────────────────────────────────

def test_wrong_key_raises_on_unseal(monkeypatch, fernet_key, other_fernet_key):
    _set_key(monkeypatch, fernet_key)
    import integrations.token_crypto as tc

    sealed = tc.seal("my_token")
    assert tc.unseal(sealed) == "my_token"

    # Switch to a different key — unsealing must fail
    _set_key(monkeypatch, other_fernet_key)
    with pytest.raises(ValueError, match="Fernet unseal failed"):
        tc.unseal(sealed)


# ── 3. corrupted ciphertext raises ────────────────────────────────────────────

def test_corrupted_ciphertext_raises(monkeypatch, fernet_key):
    _set_key(monkeypatch, fernet_key)
    import integrations.token_crypto as tc

    sealed = tc.seal("real_token")
    corrupted = "fer:" + "AAAA" + sealed[4 + 4:]
    with pytest.raises(ValueError):
        tc.unseal(corrupted)


def test_corrupted_obf_raises(monkeypatch):
    _clear_keys(monkeypatch)
    _clear_require_flags(monkeypatch)
    import integrations.token_crypto as tc

    bad = "obf:!!not_valid_base64!!"
    with pytest.raises(ValueError, match="obfuscation unseal failed"):
        tc.unseal(bad)


# ── 4. is_sealed true/false ────────────────────────────────────────────────────

def test_is_sealed_fernet(monkeypatch, fernet_key):
    _set_key(monkeypatch, fernet_key)
    import integrations.token_crypto as tc

    sealed = tc.seal("tok")
    assert tc.is_sealed(sealed) is True


def test_is_sealed_obf(monkeypatch):
    _clear_keys(monkeypatch)
    _clear_require_flags(monkeypatch)
    import integrations.token_crypto as tc

    sealed = tc.seal("tok")
    assert tc.is_sealed(sealed) is True


def test_is_sealed_plaintext(monkeypatch):
    import integrations.token_crypto as tc

    assert tc.is_sealed("ya29.super_secret") is False
    assert tc.is_sealed("") is False
    assert tc.is_sealed("EAABwzLtoken") is False


def test_unseal_refuses_plaintext(monkeypatch):
    """unseal() must raise on a value with no known prefix — never return suspected plaintext."""
    import integrations.token_crypto as tc

    with pytest.raises(ValueError, match="not sealed"):
        tc.unseal("ya29.plaintext_token")


# ── 5. plaintext upgrade-on-read ─────────────────────────────────────────────

def test_unseal_descriptor_upgrades_legacy_plaintext(monkeypatch, fernet_key):
    """A descriptor with raw (non-sealed) token values is returned as-is on unseal
    (upgrade-on-read), so callers always get the usable token value."""
    _set_key(monkeypatch, fernet_key)
    import integrations.token_crypto as tc

    legacy = {
        "provider": "google",
        "access_token": "ya29.legacy_plain_access",
        "refresh_token": "1//legacy_refresh",
        "email": "user@example.com",
    }
    unsealed = tc.unseal_descriptor(legacy)
    # plaintext values are returned as-is (upgrade-on-read semantics)
    assert unsealed["access_token"] == "ya29.legacy_plain_access"
    assert unsealed["refresh_token"] == "1//legacy_refresh"
    assert unsealed["email"] == "user@example.com"


def test_register_seals_on_write(monkeypatch, fernet_key):
    """After register_connection the stored descriptor has sealed tokens."""
    _set_key(monkeypatch, fernet_key)
    from integrations import connections
    import integrations.token_crypto as tc

    connections.register_connection("tenantA", "google_search_console", {
        "access_token": "ya29.plain_at",
        "refresh_token": "1//plain_rt",
        "email": "a@example.com",
    })

    stored = connections.find_active_connection("tenantA", "google_search_console")
    # The stored form must have sealed values
    assert tc.is_sealed(stored["access_token"])
    assert tc.is_sealed(stored["refresh_token"])
    # Non-sensitive field unchanged
    assert stored["email"] == "a@example.com"


def test_find_active_connection_unsealed_returns_plaintext(monkeypatch, fernet_key):
    """find_active_connection_unsealed returns the decrypted token."""
    _set_key(monkeypatch, fernet_key)
    from integrations import connections

    connections.register_connection("tenantA", "google_search_console", {
        "access_token": "ya29.plain_at",
        "refresh_token": "1//plain_rt",
        "email": "a@example.com",
    })

    unsealed = connections.find_active_connection_unsealed("tenantA", "google_search_console")
    assert unsealed["access_token"] == "ya29.plain_at"
    assert unsealed["refresh_token"] == "1//plain_rt"


# ── 6. redact_descriptor hides sensitive values ───────────────────────────────

def test_redact_descriptor_hides_tokens(monkeypatch):
    import integrations.token_crypto as tc

    d = {
        "provider": "google",
        "access_token": "ya29.secret",
        "refresh_token": "1//secret_refresh",
        "email": "user@example.com",
        "pages": [
            {"id": "PAGE1", "page_access_token": "page_tok_secret", "name": "My Page"},
        ],
    }
    redacted = tc.redact_descriptor(d)
    assert redacted["access_token"] == "***"
    assert redacted["refresh_token"] == "***"
    assert redacted["email"] == "user@example.com"  # not a sensitive key
    assert redacted["pages"][0]["page_access_token"] == "***"
    assert redacted["pages"][0]["name"] == "My Page"

    # Original dict is unchanged
    assert d["access_token"] == "ya29.secret"


def test_redact_does_not_contain_key_value(monkeypatch, fernet_key):
    _set_key(monkeypatch, fernet_key)
    import integrations.token_crypto as tc

    d = {"access_token": fernet_key, "provider": "test"}
    redacted = tc.redact_descriptor(d)
    assert fernet_key not in str(redacted)


# ── 7. require_encryption + missing key makes seal raise ─────────────────────

def test_seal_raises_when_required_and_no_key(monkeypatch):
    """seal() must raise RuntimeError when require=1 but no key is set."""
    _clear_keys(monkeypatch)
    monkeypatch.setenv("AI_RECEPTIONIST_REQUIRE_TOKEN_ENCRYPTION", "1")
    monkeypatch.delenv("SEO_REQUIRE_TOKEN_ENCRYPTION", raising=False)
    import integrations.token_crypto as tc

    with pytest.raises(RuntimeError, match="REQUIRED"):
        tc.seal("my_secret_token")


def test_seal_raises_when_seo_require_flag_set_and_no_key(monkeypatch):
    """SEO_REQUIRE_TOKEN_ENCRYPTION=1 also triggers the fail-closed behaviour."""
    _clear_keys(monkeypatch)
    monkeypatch.delenv("AI_RECEPTIONIST_REQUIRE_TOKEN_ENCRYPTION", raising=False)
    monkeypatch.setenv("SEO_REQUIRE_TOKEN_ENCRYPTION", "1")
    import integrations.token_crypto as tc

    with pytest.raises(RuntimeError, match="REQUIRED"):
        tc.seal("my_secret_token")


def test_require_encryption_false_without_flags(monkeypatch):
    _clear_require_flags(monkeypatch)
    import integrations.token_crypto as tc

    assert tc.require_encryption() is False


def test_require_encryption_true_with_ai_flag(monkeypatch):
    monkeypatch.setenv("AI_RECEPTIONIST_REQUIRE_TOKEN_ENCRYPTION", "1")
    import integrations.token_crypto as tc

    assert tc.require_encryption() is True


def test_assert_token_encryption_ready_raises_when_required_no_key(monkeypatch):
    _clear_keys(monkeypatch)
    monkeypatch.setenv("AI_RECEPTIONIST_REQUIRE_TOKEN_ENCRYPTION", "1")
    import integrations.token_crypto as tc

    with pytest.raises(RuntimeError):
        tc.assert_token_encryption_ready()


def test_assert_token_encryption_ready_passes_with_key(monkeypatch, fernet_key):
    _set_key(monkeypatch, fernet_key)
    monkeypatch.setenv("AI_RECEPTIONIST_REQUIRE_TOKEN_ENCRYPTION", "1")
    import integrations.token_crypto as tc

    tc.assert_token_encryption_ready()  # must not raise


# ── 8. encryption_status() never contains the key ────────────────────────────

def test_encryption_status_never_exposes_key(monkeypatch, fernet_key):
    _set_key(monkeypatch, fernet_key)
    import integrations.token_crypto as tc

    status = tc.encryption_status()
    status_str = str(status)

    # The actual key value must not appear
    assert fernet_key not in status_str
    # Must have expected shape
    assert "required" in status
    assert "active" in status
    assert "mode" in status
    assert status["active"] is True
    assert status["mode"] == "fernet"


def test_encryption_status_no_key(monkeypatch):
    _clear_keys(monkeypatch)
    _clear_require_flags(monkeypatch)
    import integrations.token_crypto as tc

    status = tc.encryption_status()
    assert status["active"] is False
    assert status["mode"] == "insecure_obfuscation"


# ── 9. cross-tenant isolation ─────────────────────────────────────────────────

def test_cross_tenant_connection_isolation(monkeypatch, fernet_key):
    """Register a Google connection under tenantA; tenantB must get None."""
    _set_key(monkeypatch, fernet_key)
    from integrations import connections

    connections.register_connection("tenantA", "google_search_console", {
        "access_token": "ya29.tok_a",
        "refresh_token": "1//ref_a",
        "email": "a@example.com",
    })

    assert connections.find_active_connection("tenantA", "google_search_console") is not None
    assert connections.find_active_connection("tenantB", "google_search_console") is None
    assert connections.find_active_connection_unsealed("tenantB", "google_search_console") is None


def test_cross_tenant_different_capabilities(monkeypatch, fernet_key):
    """tenantA with capability X must not be visible to tenantB's same capability."""
    _set_key(monkeypatch, fernet_key)
    from integrations import connections

    connections.register_connection("tenantA", "email_send", {"access_token": "tok"})
    assert connections.find_active_connection("tenantB", "email_send") is None


# ── 10. seal_descriptor idempotency ──────────────────────────────────────────

def test_seal_descriptor_is_idempotent(monkeypatch, fernet_key):
    """Re-sealing an already-sealed descriptor must not double-seal."""
    _set_key(monkeypatch, fernet_key)
    import integrations.token_crypto as tc

    d = {"access_token": "ya29.plain", "email": "x@example.com"}
    sealed_once = tc.seal_descriptor(d)
    sealed_twice = tc.seal_descriptor(sealed_once)

    # The value must still be a single-level sealed token (not fer:fer:...)
    assert not sealed_twice["access_token"].startswith("fer:fer:")
    # And unsealing once recovers the original
    assert tc.unseal(sealed_twice["access_token"]) == "ya29.plain"


# ── 11. nested descriptor (pages[].page_access_token) ────────────────────────

def test_seal_unseal_nested_page_tokens(monkeypatch, fernet_key):
    """page_access_token inside pages[] list must be sealed/unsealed recursively."""
    _set_key(monkeypatch, fernet_key)
    import integrations.token_crypto as tc

    d = {
        "provider": "meta",
        "user_token": "EAABwzL_user",
        "pages": [
            {"id": "PAGE1", "name": "Cafe", "page_access_token": "EAABwzL_page1"},
            {"id": "PAGE2", "name": "Shop", "page_access_token": "EAABwzL_page2"},
        ],
    }
    sealed = tc.seal_descriptor(d)
    assert tc.is_sealed(sealed["user_token"])
    assert tc.is_sealed(sealed["pages"][0]["page_access_token"])
    assert tc.is_sealed(sealed["pages"][1]["page_access_token"])
    assert sealed["pages"][0]["name"] == "Cafe"  # non-sensitive unchanged

    unsealed = tc.unseal_descriptor(sealed)
    assert unsealed["user_token"] == "EAABwzL_user"
    assert unsealed["pages"][0]["page_access_token"] == "EAABwzL_page1"
    assert unsealed["pages"][1]["page_access_token"] == "EAABwzL_page2"


# ── 12. find_active_connection returns sealed; unsealed returns plaintext ─────

def test_find_active_connection_keeps_sealed(monkeypatch, fernet_key):
    """find_active_connection must return the sealed form (not plaintext)."""
    _set_key(monkeypatch, fernet_key)
    from integrations import connections
    import integrations.token_crypto as tc

    connections.register_connection("tenantA", "google_analytics", {
        "access_token": "ya29.analytics_tok",
        "refresh_token": "1//analytics_ref",
    })

    conn = connections.find_active_connection("tenantA", "google_analytics")
    assert conn is not None
    assert tc.is_sealed(conn["access_token"])
    assert tc.is_sealed(conn["refresh_token"])

    unsealed = connections.find_active_connection_unsealed("tenantA", "google_analytics")
    assert unsealed["access_token"] == "ya29.analytics_tok"
    assert unsealed["refresh_token"] == "1//analytics_ref"


# ── 13. register_many seals across all capabilities ──────────────────────────

def test_register_many_seals_all_capabilities(monkeypatch, fernet_key):
    _set_key(monkeypatch, fernet_key)
    from integrations import connections
    import integrations.token_crypto as tc

    capabilities = ["meta_content_publish", "meta_reel_publish", "meta_comment_reply"]
    descriptor = {
        "provider": "meta",
        "user_token": "EAABwzL_multi",
        "pages": [{"id": "PAGE1", "page_access_token": "PAGE_TOK", "name": "P"}],
    }
    connections.register_many("tenantA", capabilities, descriptor)

    for cap in capabilities:
        stored = connections.find_active_connection("tenantA", cap)
        assert stored is not None
        assert tc.is_sealed(stored["user_token"])


# ── 14. Meta token_service round-trip ─────────────────────────────────────────

def test_meta_token_service_save_and_get(monkeypatch, fernet_key):
    """save_token_ref seals at rest; get_token_for_server_call returns plaintext."""
    _set_key(monkeypatch, fernet_key)
    from meta import token_service as ts
    import integrations.token_crypto as tc

    descriptor = {
        "provider": "meta",
        "user_token": "EAABwzL_user_tok",
        "pages": [
            {
                "id": "PAGE1",
                "name": "Test Page",
                "page_access_token": "EAABwzL_page_tok",
                "linked_instagram": {"id": "IG1", "username": "testgram"},
            }
        ],
    }
    ts.save_token_ref("tenantA", descriptor)

    # get_token_for_server_call must return the real plaintext token
    page_tok = ts.get_token_for_server_call("tenantA", "PAGE1")
    assert page_tok == "EAABwzL_page_tok"

    user_tok = ts.get_user_token("tenantA")
    assert user_tok == "EAABwzL_user_tok"


def test_meta_safe_status_never_exposes_tokens(monkeypatch, fernet_key):
    """safe_status() must not expose any token value."""
    _set_key(monkeypatch, fernet_key)
    from meta import token_service as ts

    descriptor = {
        "provider": "meta",
        "user_token": "EAABwzL_super_secret",
        "display_name": "Acme Corp",
        "scopes": ["pages_manage_posts"],
        "pages": [{"id": "P1", "page_access_token": "PAGE_SECRET", "name": "P"}],
    }
    ts.save_token_ref("tenantA", descriptor)

    status = ts.safe_status("tenantA")
    status_str = str(status)

    assert "EAABwzL_super_secret" not in status_str
    assert "PAGE_SECRET" not in status_str
    assert status["connected"] is True
    assert status["display_name"] == "Acme Corp"


def test_meta_safe_status_disconnected(monkeypatch):
    from meta import token_service as ts

    status = ts.safe_status("tenantX_no_connection")
    assert status["connected"] is False
    assert "token" not in str(status).lower() or "***" in str(status)


# ── 15. key fallback chain ────────────────────────────────────────────────────

def test_key_fallback_google_key(monkeypatch, fernet_key):
    """Falls back to GOOGLE_TOKEN_ENCRYPTION_KEY when AI_RECEPTIONIST key is absent."""
    monkeypatch.delenv("AI_RECEPTIONIST_TOKEN_ENCRYPTION_KEY", raising=False)
    monkeypatch.setenv("GOOGLE_TOKEN_ENCRYPTION_KEY", fernet_key)
    monkeypatch.delenv("PIXIE_TOKEN_ENCRYPTION_KEY", raising=False)
    import integrations.token_crypto as tc

    sealed = tc.seal("tok")
    assert sealed.startswith("fer:")
    assert tc.unseal(sealed) == "tok"


def test_key_fallback_pixie_key(monkeypatch, fernet_key):
    """Falls back to PIXIE_TOKEN_ENCRYPTION_KEY as last resort."""
    monkeypatch.delenv("AI_RECEPTIONIST_TOKEN_ENCRYPTION_KEY", raising=False)
    monkeypatch.delenv("GOOGLE_TOKEN_ENCRYPTION_KEY", raising=False)
    monkeypatch.setenv("PIXIE_TOKEN_ENCRYPTION_KEY", fernet_key)
    import integrations.token_crypto as tc

    sealed = tc.seal("tok_pixie")
    assert sealed.startswith("fer:")
    assert tc.unseal(sealed) == "tok_pixie"


# ── 16. SENSITIVE_KEYS coverage ───────────────────────────────────────────────

def test_all_sensitive_keys_are_sealed(monkeypatch, fernet_key):
    """Every key in SENSITIVE_KEYS must be sealed by seal_descriptor."""
    _set_key(monkeypatch, fernet_key)
    import integrations.token_crypto as tc

    d = {k: f"plain_value_for_{k}" for k in tc.SENSITIVE_KEYS}
    d["non_sensitive"] = "leave_me_alone"

    sealed = tc.seal_descriptor(d)
    for k in tc.SENSITIVE_KEYS:
        assert tc.is_sealed(sealed[k]), f"Expected {k} to be sealed"
    assert sealed["non_sensitive"] == "leave_me_alone"

    unsealed = tc.unseal_descriptor(sealed)
    for k in tc.SENSITIVE_KEYS:
        assert unsealed[k] == f"plain_value_for_{k}"
