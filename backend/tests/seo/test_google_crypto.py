"""Tests for seo.google.crypto — token sealing / unsealing.

All tests are hermetic (no network, no real keys required).
Covers:
  - seal/unseal roundtrip with Fernet key present
  - seal/unseal roundtrip in obfuscation fallback (no key)
  - sealed value never equals plaintext
  - is_sealed detection
  - cross-mode mismatch raises ValueError
  - empty string handling
"""

from __future__ import annotations

import base64
import os

import pytest


# ── Helpers ────────────────────────────────────────────────────────────────────

def _make_fernet_key() -> str:
    """Generate a valid Fernet key (URL-safe base64 32 bytes)."""
    from cryptography.fernet import Fernet
    return Fernet.generate_key().decode("utf-8")


# ── Obfuscation fallback (no key) ───────────────────────────────────────────────

def test_seal_unseal_obfuscation_roundtrip(monkeypatch):
    """Without GOOGLE_TOKEN_ENCRYPTION_KEY, seal/unseal uses obf: prefix."""
    monkeypatch.delenv("GOOGLE_TOKEN_ENCRYPTION_KEY", raising=False)
    # Re-import to pick up cleared env
    import importlib
    import seo.google.crypto as crypto
    importlib.reload(crypto)

    plaintext = "ya29.some_access_token_here"
    sealed = crypto.seal(plaintext)
    assert sealed != plaintext, "sealed must not equal plaintext"
    assert sealed.startswith("obf:"), f"expected obf: prefix, got {sealed[:10]!r}"
    assert crypto.unseal(sealed) == plaintext


def test_seal_empty_obfuscation(monkeypatch):
    monkeypatch.delenv("GOOGLE_TOKEN_ENCRYPTION_KEY", raising=False)
    import importlib
    import seo.google.crypto as crypto
    importlib.reload(crypto)

    sealed = crypto.seal("")
    assert sealed != "", "sealing empty string must not return empty (has prefix)"
    assert crypto.unseal(sealed) == ""


def test_is_sealed_obf(monkeypatch):
    monkeypatch.delenv("GOOGLE_TOKEN_ENCRYPTION_KEY", raising=False)
    import importlib
    import seo.google.crypto as crypto
    importlib.reload(crypto)

    sealed = crypto.seal("some_token")
    assert crypto.is_sealed(sealed) is True
    assert crypto.is_sealed("some_token") is False
    assert crypto.is_sealed("") is False


# ── Fernet path ─────────────────────────────────────────────────────────────────

def test_seal_unseal_fernet_roundtrip(monkeypatch):
    """With a valid Fernet key, seal/unseal uses fer: prefix."""
    pytest.importorskip("cryptography")
    key = _make_fernet_key()
    monkeypatch.setenv("GOOGLE_TOKEN_ENCRYPTION_KEY", key)

    import importlib
    import seo.google.crypto as crypto
    importlib.reload(crypto)

    plaintext = "1//0g_refresh_token_example"
    sealed = crypto.seal(plaintext)
    assert sealed != plaintext
    assert sealed.startswith("fer:"), f"expected fer: prefix, got {sealed[:10]!r}"
    assert crypto.unseal(sealed) == plaintext


def test_fernet_sealed_not_equal_plaintext(monkeypatch):
    pytest.importorskip("cryptography")
    key = _make_fernet_key()
    monkeypatch.setenv("GOOGLE_TOKEN_ENCRYPTION_KEY", key)

    import importlib
    import seo.google.crypto as crypto
    importlib.reload(crypto)

    for plaintext in ["token_abc", "", "x" * 200]:
        sealed = crypto.seal(plaintext)
        assert sealed != plaintext, f"sealed must differ from plaintext for {plaintext!r}"


def test_is_sealed_fernet(monkeypatch):
    pytest.importorskip("cryptography")
    key = _make_fernet_key()
    monkeypatch.setenv("GOOGLE_TOKEN_ENCRYPTION_KEY", key)

    import importlib
    import seo.google.crypto as crypto
    importlib.reload(crypto)

    sealed = crypto.seal("tok")
    assert crypto.is_sealed(sealed) is True
    assert crypto.is_sealed("tok") is False


def test_unseal_unknown_prefix_raises(monkeypatch):
    """A value without a known prefix is refused — not returned as plaintext."""
    monkeypatch.delenv("GOOGLE_TOKEN_ENCRYPTION_KEY", raising=False)
    import importlib
    import seo.google.crypto as crypto
    importlib.reload(crypto)

    with pytest.raises(ValueError, match="not sealed"):
        crypto.unseal("raw_plaintext_no_prefix")


def test_unseal_fer_without_key_raises(monkeypatch):
    """A Fernet-sealed value cannot be unsealed when the key is absent."""
    monkeypatch.delenv("GOOGLE_TOKEN_ENCRYPTION_KEY", raising=False)
    import importlib
    import seo.google.crypto as crypto
    importlib.reload(crypto)

    with pytest.raises(ValueError, match="GOOGLE_TOKEN_ENCRYPTION_KEY"):
        crypto.unseal("fer:gAAAAA_fake_fernet_payload")


def test_unseal_empty_returns_empty(monkeypatch):
    monkeypatch.delenv("GOOGLE_TOKEN_ENCRYPTION_KEY", raising=False)
    import importlib
    import seo.google.crypto as crypto
    importlib.reload(crypto)

    assert crypto.unseal("") == ""
