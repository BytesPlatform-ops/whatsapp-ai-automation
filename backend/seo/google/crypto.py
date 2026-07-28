"""Token sealing for Google OAuth tokens stored in the SEO search-intelligence layer.

seal(plaintext) -> str
unseal(sealed) -> str
is_sealed(value) -> bool

When GOOGLE_TOKEN_ENCRYPTION_KEY is present (base64-encoded 32-byte key):
  - Uses Fernet symmetric encryption from the ``cryptography`` library.
  - Sealed values are prefixed with "fer:".

When the key is absent (dev / test environments):
  - Falls back to a clearly-labelled reversible base64 obfuscation prefixed with "obf:".
  - Logs a WARNING once so developers know they are in insecure mode.
  - Sealed values can never equal plaintext (the "obf:" prefix guarantees this).

The sealed value is always a str and is safe to store in Supabase JSONB fields.

IMPORTANT: refresh tokens must NEVER be returned to callers (enforced in connections.py
and routes.py — this module only handles sealing/unsealing mechanics).
"""

from __future__ import annotations

import base64
import logging
import os

_log = logging.getLogger("pixie.seo.google.crypto")

_FERNET_PREFIX = "fer:"
_OBF_PREFIX = "obf:"
_WARNED = False  # log the no-key warning only once per process


def require_encryption() -> bool:
    """True when real authenticated encryption is REQUIRED (production).

    Set SEO_REQUIRE_TOKEN_ENCRYPTION=1 in production. When required and no valid
    Fernet key is available, seal() fails closed (raises) instead of silently
    obfuscating, and assert_token_encryption_ready() fails at startup. Dev/tests
    leave it unset → the labelled obfuscation fallback remains available."""
    return os.getenv("SEO_REQUIRE_TOKEN_ENCRYPTION", "").strip().lower() in ("1", "true", "yes", "on")


# ── Helpers ────────────────────────────────────────────────────────────────────

def _fernet_instance():
    """Return a Fernet object if GOOGLE_TOKEN_ENCRYPTION_KEY is valid, else None."""
    key_raw = os.getenv("GOOGLE_TOKEN_ENCRYPTION_KEY", "").strip()
    if not key_raw:
        return None
    try:
        from cryptography.fernet import Fernet, InvalidToken  # noqa: F401
        # Fernet requires a URL-safe base64-encoded 32-byte key
        return Fernet(key_raw.encode("utf-8"))
    except Exception as exc:
        _log.warning("seo.google.crypto: GOOGLE_TOKEN_ENCRYPTION_KEY invalid (%s); falling back to obfuscation", exc)
        return None


def _warn_no_key() -> None:
    global _WARNED
    if not _WARNED:
        _log.warning(
            "seo.google.crypto: GOOGLE_TOKEN_ENCRYPTION_KEY is not set — "
            "Google tokens will be obfuscated (NOT encrypted). "
            "Set a 32-byte Fernet key for production."
        )
        _WARNED = True


# ── Public API ─────────────────────────────────────────────────────────────────

def seal(plaintext: str) -> str:
    """Seal (encrypt or obfuscate) a plaintext token.

    Always returns a str that is distinct from the plaintext (the prefix ensures
    this even for an empty string).
    """
    if not isinstance(plaintext, str):
        plaintext = str(plaintext)

    f = _fernet_instance()
    if f is not None:
        try:
            ciphertext = f.encrypt(plaintext.encode("utf-8")).decode("utf-8")
            return _FERNET_PREFIX + ciphertext
        except Exception as exc:
            _log.error("seo.google.crypto: Fernet seal failed: %s", exc)
            raise

    # No usable Fernet key. In production (SEO_REQUIRE_TOKEN_ENCRYPTION=1) this is
    # fatal — fail closed rather than store an insecurely-obfuscated token.
    if require_encryption():
        raise RuntimeError(
            "seo.google.crypto: token encryption is REQUIRED "
            "(SEO_REQUIRE_TOKEN_ENCRYPTION=1) but no valid GOOGLE_TOKEN_ENCRYPTION_KEY "
            "is configured (or the 'cryptography' package is missing) — refusing to "
            "store an unencrypted token."
        )

    # Fallback: obfuscation only (NOT secure — dev/test only)
    _warn_no_key()
    obf = base64.urlsafe_b64encode(plaintext.encode("utf-8")).decode("utf-8")
    return _OBF_PREFIX + obf


# ── Startup / health ───────────────────────────────────────────────────────────

def encryption_status() -> dict:
    """Non-secret status for health/observability (never exposes the key)."""
    active = _fernet_instance() is not None
    return {
        "required": require_encryption(),
        "active": active,
        "mode": "fernet" if active else ("insecure_obfuscation" if not require_encryption() else "unavailable"),
    }


def assert_token_encryption_ready() -> None:
    """Call at application startup. Raises when encryption is required but a valid
    Fernet key / the cryptography package is unavailable, so a misconfigured
    production deploy fails fast instead of silently degrading to obfuscation."""
    if require_encryption() and _fernet_instance() is None:
        raise RuntimeError(
            "seo.google.crypto: SEO_REQUIRE_TOKEN_ENCRYPTION=1 but Google token "
            "encryption is not available — set a valid GOOGLE_TOKEN_ENCRYPTION_KEY "
            "(URL-safe base64 32-byte Fernet key) and ensure 'cryptography' is installed."
        )


def unseal(sealed: str) -> str:
    """Unseal a previously sealed token.

    Raises ValueError if the sealed value cannot be decoded.
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
                "seo.google.crypto: token was sealed with Fernet but "
                "GOOGLE_TOKEN_ENCRYPTION_KEY is not set — cannot unseal"
            )
        try:
            from cryptography.fernet import InvalidToken
            payload = sealed[len(_FERNET_PREFIX):]
            return f.decrypt(payload.encode("utf-8")).decode("utf-8")
        except Exception as exc:
            raise ValueError(f"seo.google.crypto: Fernet unseal failed: {exc}") from exc

    if sealed.startswith(_OBF_PREFIX):
        try:
            payload = sealed[len(_OBF_PREFIX):]
            return base64.urlsafe_b64decode(payload.encode("utf-8")).decode("utf-8")
        except Exception as exc:
            raise ValueError(f"seo.google.crypto: obfuscation unseal failed: {exc}") from exc

    # Unknown prefix — might be an unsealed plaintext stored by a bug; refuse.
    raise ValueError(
        "seo.google.crypto: value is not sealed (missing fer:/obf: prefix) — "
        "cowardly refusing to return potentially plaintext token"
    )


def is_sealed(value: str) -> bool:
    """Return True if value looks like a sealed token (has a known prefix)."""
    if not value:
        return False
    return value.startswith(_FERNET_PREFIX) or value.startswith(_OBF_PREFIX)
