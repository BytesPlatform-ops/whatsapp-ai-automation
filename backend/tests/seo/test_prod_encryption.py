"""Production token-encryption guarantees (Part 1).

- cryptography is importable (declared in requirements).
- With a real Fernet key, seal() produces authenticated ciphertext (fer:) that
  round-trips and is never equal to plaintext.
- When encryption is REQUIRED but no key is present, seal() and the startup
  assertion both fail closed (no silent obfuscation).
- When not required (dev/tests), the labelled obfuscation fallback still works.
No network, no secrets.
"""

from __future__ import annotations

import base64
import os

import pytest

from seo.google import crypto


def _fernet_key() -> str:
    from cryptography.fernet import Fernet
    return Fernet.generate_key().decode("utf-8")


def test_cryptography_is_installed():
    import cryptography  # noqa: F401
    from cryptography.fernet import Fernet  # noqa: F401


def test_fernet_roundtrip_with_key(monkeypatch):
    monkeypatch.setenv("GOOGLE_TOKEN_ENCRYPTION_KEY", _fernet_key())
    monkeypatch.delenv("SEO_REQUIRE_TOKEN_ENCRYPTION", raising=False)
    sealed = crypto.seal("refresh-token-abc")
    assert sealed.startswith("fer:")
    assert sealed != "refresh-token-abc"
    assert crypto.unseal(sealed) == "refresh-token-abc"
    assert crypto.encryption_status()["active"] is True
    assert crypto.encryption_status()["mode"] == "fernet"


def test_required_but_no_key_fails_closed(monkeypatch):
    monkeypatch.delenv("GOOGLE_TOKEN_ENCRYPTION_KEY", raising=False)
    monkeypatch.setenv("SEO_REQUIRE_TOKEN_ENCRYPTION", "1")
    with pytest.raises(RuntimeError):
        crypto.seal("secret")
    with pytest.raises(RuntimeError):
        crypto.assert_token_encryption_ready()
    assert crypto.encryption_status()["mode"] == "unavailable"


def test_startup_assert_passes_with_key(monkeypatch):
    monkeypatch.setenv("SEO_REQUIRE_TOKEN_ENCRYPTION", "1")
    monkeypatch.setenv("GOOGLE_TOKEN_ENCRYPTION_KEY", _fernet_key())
    crypto.assert_token_encryption_ready()  # must not raise


def test_dev_fallback_allowed_when_not_required(monkeypatch):
    monkeypatch.delenv("GOOGLE_TOKEN_ENCRYPTION_KEY", raising=False)
    monkeypatch.delenv("SEO_REQUIRE_TOKEN_ENCRYPTION", raising=False)
    sealed = crypto.seal("dev-token")
    assert sealed.startswith("obf:")
    assert sealed != "dev-token"
    assert crypto.unseal(sealed) == "dev-token"
    crypto.assert_token_encryption_ready()  # no-op when not required
