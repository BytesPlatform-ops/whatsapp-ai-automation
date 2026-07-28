"""Signed, expiring OAuth state for Google Search Console + GA4 flows.

The state token is an HMAC-signed compact string that encodes:
  tenant_id, kind (gsc|ga4|google), a random nonce, and issued_at.

This prevents CSRF (only a holder of the server secret can forge a valid state),
expiry (default 600 seconds), and replay (nonce + issued_at bound).

Uses ONLY stdlib: hmac, hashlib, base64, secrets, time, json, os.
No Google network calls are made in this module.

Environment variables consumed:
  GOOGLE_OAUTH_STATE_SECRET  — HMAC key (any non-empty string; auto-generated
                               ephemeral key if absent, logged as a warning).
  GOOGLE_OAUTH_STATE_TTL     — seconds until state expires (default 600).
  GOOGLE_CLIENT_ID           — passed through to build_auth_url; must be set in prod.
  GOOGLE_CLIENT_SECRET       — used in exchange_code (HttpGscClient / real path only).
  GOOGLE_OAUTH_REDIRECT_SEO  — callback redirect URI for SEO flows.

Scopes requested:
  webmasters.readonly — Search Console
  analytics.readonly  — GA4
  userinfo.email      — learn the connected account email
  openid              — OIDC token for identity
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import secrets
import time
import urllib.parse

_log = logging.getLogger("pixie.seo.google.oauth")

_EPHEMERAL_SECRET: str = secrets.token_hex(32)
_WARNED_NO_SECRET = False

# Minimum scopes for GSC + GA4 + identity.
SCOPES = [
    "https://www.googleapis.com/auth/webmasters.readonly",
    "https://www.googleapis.com/auth/analytics.readonly",
    "https://www.googleapis.com/auth/userinfo.email",
    "openid",
]

GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
GOOGLE_REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke"
GOOGLE_USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v2/userinfo"

_STATE_VERSION = "v1"
_DEFAULT_TTL = 600  # seconds


# ── Internal helpers ────────────────────────────────────────────────────────────

def _secret() -> bytes:
    global _WARNED_NO_SECRET
    raw = os.getenv("GOOGLE_OAUTH_STATE_SECRET", "").strip()
    if not raw:
        if not _WARNED_NO_SECRET:
            _log.warning(
                "seo.google.oauth: GOOGLE_OAUTH_STATE_SECRET not set; "
                "using ephemeral HMAC key (restarts will invalidate outstanding OAuth states)"
            )
            _WARNED_NO_SECRET = True
        return _EPHEMERAL_SECRET.encode("utf-8")
    return raw.encode("utf-8")


def _ttl() -> int:
    try:
        return int(os.getenv("GOOGLE_OAUTH_STATE_TTL", str(_DEFAULT_TTL)))
    except (ValueError, TypeError):
        return _DEFAULT_TTL


def _sign(payload: str) -> str:
    """HMAC-SHA256 over payload; returns URL-safe base64."""
    mac = hmac.new(_secret(), payload.encode("utf-8"), hashlib.sha256)
    return base64.urlsafe_b64encode(mac.digest()).decode("utf-8").rstrip("=")


def _encode_state(tenant_id: str, kind: str, nonce: str, issued_at: int) -> str:
    """Build and sign the state string."""
    body = json.dumps({
        "ver": _STATE_VERSION,
        "t": tenant_id,
        "k": kind,
        "n": nonce,
        "iat": issued_at,
    }, separators=(",", ":"))
    body_b64 = base64.urlsafe_b64encode(body.encode("utf-8")).decode("utf-8").rstrip("=")
    sig = _sign(body_b64)
    return f"{body_b64}.{sig}"


class OAuthStateError(ValueError):
    """Raised when a state token is tampered, expired, or malformed."""


# ── Public API ──────────────────────────────────────────────────────────────────

def build_start(tenant_id: str, kind: str = "google") -> dict:
    """Generate a Google OAuth start payload.

    Returns:
        {
            "auth_url": "https://accounts.google.com/...",
            "state": "<signed-state-token>",
        }

    Raises OAuthStateError if GOOGLE_CLIENT_ID is not configured.
    """
    client_id = os.getenv("GOOGLE_CLIENT_ID", "").strip()
    if not client_id:
        raise OAuthStateError(
            "GOOGLE_CLIENT_ID is not set — Google OAuth cannot be initiated"
        )

    nonce = secrets.token_hex(16)
    issued_at = int(time.time())
    state = _encode_state(tenant_id, kind, nonce, issued_at)

    redirect_uri = os.getenv(
        "GOOGLE_OAUTH_REDIRECT_SEO",
        "http://localhost:8000/api/agents/seo/google/callback",
    ).strip()

    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "access_type": "offline",
        "prompt": "consent",
        "include_granted_scopes": "true",
        "state": state,
    }
    auth_url = GOOGLE_AUTH_ENDPOINT + "?" + urllib.parse.urlencode(params)
    return {"auth_url": auth_url, "state": state}


def validate_state(state: str) -> str:
    """Validate the state token returned by Google's callback.

    Returns the tenant_id extracted from the token.

    Raises OAuthStateError on:
      - Malformed / missing state
      - HMAC mismatch (tampered)
      - Token expired (beyond TTL)
    """
    if not state:
        raise OAuthStateError("Missing OAuth state parameter")

    parts = state.split(".")
    if len(parts) != 2:
        raise OAuthStateError("Malformed OAuth state: expected body.signature")

    body_b64, sig_received = parts

    # Constant-time MAC comparison to prevent timing attacks
    sig_expected = _sign(body_b64)
    if not hmac.compare_digest(sig_expected, sig_received):
        raise OAuthStateError("OAuth state signature mismatch — possible CSRF attempt")

    # Decode payload
    try:
        # Add back stripped padding
        padded = body_b64 + "=" * (-len(body_b64) % 4)
        body = json.loads(base64.urlsafe_b64decode(padded).decode("utf-8"))
    except Exception as exc:
        raise OAuthStateError(f"OAuth state payload decode failed: {exc}") from exc

    # Version check
    if body.get("ver") != _STATE_VERSION:
        raise OAuthStateError(f"OAuth state version mismatch: {body.get('ver')!r}")

    # Expiry check
    issued_at = body.get("iat", 0)
    age = int(time.time()) - issued_at
    if age > _ttl():
        raise OAuthStateError(f"OAuth state expired (age={age}s, ttl={_ttl()}s)")
    if age < 0:
        raise OAuthStateError("OAuth state issued in the future — clock skew or replay")

    tenant_id = body.get("t", "").strip()
    if not tenant_id:
        raise OAuthStateError("OAuth state missing tenant_id")

    return tenant_id


def get_redirect_uri() -> str:
    """The redirect_uri we send to Google (must match Console registration)."""
    return os.getenv(
        "GOOGLE_OAUTH_REDIRECT_SEO",
        "http://localhost:8000/api/agents/seo/google/callback",
    ).strip()
