"""Shared token-sealing helper for AI Receptionist and all integration credentials.

Mirrors seo/google/crypto.py exactly (same fer:/obf: prefixes, same Fernet
algorithm) so ciphertext produced by either module is interchangeable.

Key resolution order:
  1. AI_RECEPTIONIST_TOKEN_ENCRYPTION_KEY
  2. GOOGLE_TOKEN_ENCRYPTION_KEY
  3. PIXIE_TOKEN_ENCRYPTION_KEY

Require-flag: AI_RECEPTIONIST_REQUIRE_TOKEN_ENCRYPTION OR SEO_REQUIRE_TOKEN_ENCRYPTION.

Public API
----------
seal(str) -> str
unseal(str) -> str
is_sealed(str) -> bool
require_encryption() -> bool
encryption_status() -> dict         # never exposes the key
assert_token_encryption_ready()

SENSITIVE_KEYS: frozenset           # keys that hold tokens/secrets in descriptors
seal_descriptor(d: dict) -> dict    # seal sensitive fields; idempotent
unseal_descriptor(d: dict) -> dict  # unseal sealed fields; upgrade-on-read for legacy plaintext
redact_descriptor(d: dict) -> dict  # replace sensitive values with "***" for safe logging
"""

from __future__ import annotations

import base64
import logging
import os
from typing import Any

_log = logging.getLogger("pixie.integrations.token_crypto")

_FERNET_PREFIX = "fer:"
_OBF_PREFIX = "obf:"
_WARNED = False  # log the no-key warning only once per process

# Keys in a connection descriptor that hold OAuth tokens or client secrets.
SENSITIVE_KEYS: frozenset[str] = frozenset({
    "access_token",
    "refresh_token",
    "token",
    "user_token",
    "page_access_token",
    "client_secret",
    "id_token",
})


# ── Internal helpers ──────────────────────────────────────────────────────────

def _resolve_key() -> str:
    """Return the first non-empty encryption key found, else empty string."""
    for env in (
        "AI_RECEPTIONIST_TOKEN_ENCRYPTION_KEY",
        "GOOGLE_TOKEN_ENCRYPTION_KEY",
        "PIXIE_TOKEN_ENCRYPTION_KEY",
    ):
        val = os.getenv(env, "").strip()
        if val:
            return val
    return ""


def _fernet_instance():
    """Return a Fernet object if a valid key is configured, else None."""
    key_raw = _resolve_key()
    if not key_raw:
        return None
    try:
        from cryptography.fernet import Fernet  # noqa: F401
        return Fernet(key_raw.encode("utf-8"))
    except Exception as exc:
        _log.warning(
            "integrations.token_crypto: encryption key is invalid (%s); "
            "falling back to obfuscation",
            exc,
        )
        return None


def _warn_no_key() -> None:
    global _WARNED
    if not _WARNED:
        _log.warning(
            "integrations.token_crypto: no token encryption key is set "
            "(AI_RECEPTIONIST_TOKEN_ENCRYPTION_KEY / GOOGLE_TOKEN_ENCRYPTION_KEY / "
            "PIXIE_TOKEN_ENCRYPTION_KEY) — tokens will be obfuscated (NOT encrypted). "
            "Set a 32-byte Fernet key for production."
        )
        _WARNED = True


# ── Public API ────────────────────────────────────────────────────────────────

def require_encryption() -> bool:
    """True when real authenticated encryption is REQUIRED.

    Reads AI_RECEPTIONIST_REQUIRE_TOKEN_ENCRYPTION or SEO_REQUIRE_TOKEN_ENCRYPTION.
    Set either to 1/true/yes/on in production. When required and no valid Fernet key
    is available, seal() raises instead of obfuscating, and
    assert_token_encryption_ready() fails at startup."""
    for env in (
        "AI_RECEPTIONIST_REQUIRE_TOKEN_ENCRYPTION",
        "SEO_REQUIRE_TOKEN_ENCRYPTION",
    ):
        if os.getenv(env, "").strip().lower() in ("1", "true", "yes", "on"):
            return True
    return False


def seal(plaintext: str) -> str:
    """Seal (encrypt or obfuscate) a plaintext token.

    Always returns a str distinct from the plaintext (the prefix ensures this
    even for an empty string).

    Raises RuntimeError when require_encryption() is True but no valid Fernet key
    is available (fail-closed rather than store an insecurely-obfuscated token).
    """
    if not isinstance(plaintext, str):
        plaintext = str(plaintext)

    f = _fernet_instance()
    if f is not None:
        try:
            ciphertext = f.encrypt(plaintext.encode("utf-8")).decode("utf-8")
            return _FERNET_PREFIX + ciphertext
        except Exception as exc:
            _log.error("integrations.token_crypto: Fernet seal failed: %s", exc)
            raise

    # No usable Fernet key.
    if require_encryption():
        raise RuntimeError(
            "integrations.token_crypto: token encryption is REQUIRED "
            "(AI_RECEPTIONIST_REQUIRE_TOKEN_ENCRYPTION=1 or SEO_REQUIRE_TOKEN_ENCRYPTION=1) "
            "but no valid encryption key is configured (or the 'cryptography' package is "
            "missing) — refusing to store an unencrypted token."
        )

    # Fallback: obfuscation only (NOT secure — dev/test only)
    _warn_no_key()
    obf = base64.urlsafe_b64encode(plaintext.encode("utf-8")).decode("utf-8")
    return _OBF_PREFIX + obf


def unseal(sealed: str) -> str:
    """Unseal a previously sealed token.

    Raises ValueError if the value has no known prefix (refuses to return
    suspected plaintext — never returns an unsealed value).
    Returns empty string for empty input.
    """
    if not sealed:
        return ""
    if not isinstance(sealed, str):
        sealed = str(sealed)

    if sealed.startswith(_FERNET_PREFIX):
        f = _fernet_instance()
        if f is None:
            raise ValueError(
                "integrations.token_crypto: token was sealed with Fernet but "
                "no encryption key is set — cannot unseal"
            )
        try:
            payload = sealed[len(_FERNET_PREFIX):]
            return f.decrypt(payload.encode("utf-8")).decode("utf-8")
        except Exception as exc:
            raise ValueError(
                f"integrations.token_crypto: Fernet unseal failed: {exc}"
            ) from exc

    if sealed.startswith(_OBF_PREFIX):
        try:
            payload = sealed[len(_OBF_PREFIX):]
            return base64.urlsafe_b64decode(payload.encode("utf-8")).decode("utf-8")
        except Exception as exc:
            raise ValueError(
                f"integrations.token_crypto: obfuscation unseal failed: {exc}"
            ) from exc

    # Unknown prefix — might be plaintext stored by a bug; refuse to return it.
    raise ValueError(
        "integrations.token_crypto: value is not sealed (missing fer:/obf: prefix) — "
        "refusing to return potentially plaintext token"
    )


def is_sealed(value: str) -> bool:
    """Return True if value looks like a sealed token (has a known prefix)."""
    if not value:
        return False
    return value.startswith(_FERNET_PREFIX) or value.startswith(_OBF_PREFIX)


# ── Startup / health ──────────────────────────────────────────────────────────

def encryption_status() -> dict:
    """Non-secret status for health/observability. Never exposes the key value."""
    active = _fernet_instance() is not None
    return {
        "required": require_encryption(),
        "active": active,
        "mode": (
            "fernet" if active
            else ("insecure_obfuscation" if not require_encryption() else "unavailable")
        ),
        "key_sources_checked": [
            "AI_RECEPTIONIST_TOKEN_ENCRYPTION_KEY",
            "GOOGLE_TOKEN_ENCRYPTION_KEY",
            "PIXIE_TOKEN_ENCRYPTION_KEY",
        ],
    }


def assert_token_encryption_ready() -> None:
    """Call at application startup.

    Raises RuntimeError when encryption is required but a valid Fernet key or
    the cryptography package is unavailable, so a misconfigured production deploy
    fails fast instead of silently degrading to obfuscation."""
    if require_encryption() and _fernet_instance() is None:
        raise RuntimeError(
            "integrations.token_crypto: token encryption is REQUIRED but is not "
            "available — set a valid encryption key "
            "(AI_RECEPTIONIST_TOKEN_ENCRYPTION_KEY / GOOGLE_TOKEN_ENCRYPTION_KEY / "
            "PIXIE_TOKEN_ENCRYPTION_KEY) and ensure 'cryptography' is installed."
        )


# ── Descriptor helpers ────────────────────────────────────────────────────────

def _is_sealable_value(v: Any) -> bool:
    """Return True for non-empty string values that could be tokens."""
    return isinstance(v, str) and bool(v)


def seal_descriptor(d: dict) -> dict:
    """Return a copy of d with all SENSITIVE_KEYS values sealed.

    Idempotent: values already sealed (is_sealed returns True) are left unchanged
    so re-persisting never double-seals. Nested dicts (e.g. pages list) are
    recursed into. Non-string and falsy values are left unchanged.
    """
    if not isinstance(d, dict):
        return d
    result: dict = {}
    for k, v in d.items():
        if k in SENSITIVE_KEYS and _is_sealable_value(v) and not is_sealed(v):
            result[k] = seal(v)
        elif isinstance(v, dict):
            result[k] = seal_descriptor(v)
        elif isinstance(v, list):
            result[k] = [
                seal_descriptor(item) if isinstance(item, dict) else item
                for item in v
            ]
        else:
            result[k] = v
    return result


def unseal_descriptor(d: dict) -> dict:
    """Return a copy of d with all SENSITIVE_KEYS values unsealed.

    Upgrade-on-read: if a sensitive value is NOT sealed (legacy plaintext), it is
    returned as-is — callers get the raw token without error. Values that ARE sealed
    are decrypted. Nested dicts/lists are recursed into.
    """
    if not isinstance(d, dict):
        return d
    result: dict = {}
    for k, v in d.items():
        if k in SENSITIVE_KEYS and _is_sealable_value(v):
            if is_sealed(v):
                result[k] = unseal(v)
            else:
                # Legacy plaintext — upgrade-on-read: return as-is
                result[k] = v
        elif isinstance(v, dict):
            result[k] = unseal_descriptor(v)
        elif isinstance(v, list):
            result[k] = [
                unseal_descriptor(item) if isinstance(item, dict) else item
                for item in v
            ]
        else:
            result[k] = v
    return result


def redact_descriptor(d: dict) -> dict:
    """Return a copy of d with all SENSITIVE_KEYS values replaced with "***".

    Safe for logging, status endpoints, and any frontend-facing response. Nested
    dicts/lists are recursed into.
    """
    if not isinstance(d, dict):
        return d
    result: dict = {}
    for k, v in d.items():
        if k in SENSITIVE_KEYS and v:
            result[k] = "***"
        elif isinstance(v, dict):
            result[k] = redact_descriptor(v)
        elif isinstance(v, list):
            result[k] = [
                redact_descriptor(item) if isinstance(item, dict) else item
                for item in v
            ]
        else:
            result[k] = v
    return result
