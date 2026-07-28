"""Tests for seo.google.oauth — signed, expiring OAuth state.

All tests are hermetic — no Google network calls.

Covers:
  - State roundtrip: encode → validate → returns correct tenant_id
  - Tampered state is rejected (HMAC mismatch)
  - Expired state is rejected
  - State with future issued_at is rejected (clock-skew)
  - Missing state raises OAuthStateError
  - Malformed state (no dot separator) raises
  - build_start raises when GOOGLE_CLIENT_ID is absent
  - build_start returns auth_url + state when CLIENT_ID is set
"""

from __future__ import annotations

import base64
import json
import time

import pytest

from seo.google.oauth import OAuthStateError, _encode_state, build_start, validate_state


# ── Roundtrip ───────────────────────────────────────────────────────────────────

def test_state_roundtrip(monkeypatch):
    monkeypatch.setenv("GOOGLE_OAUTH_STATE_SECRET", "test_secret_for_unit_tests_only")
    state = _encode_state("tenant_abc", "google", "nonce123", int(time.time()))
    tenant = validate_state(state)
    assert tenant == "tenant_abc"


def test_state_roundtrip_different_tenants(monkeypatch):
    monkeypatch.setenv("GOOGLE_OAUTH_STATE_SECRET", "test_secret_xyz")
    for t in ["tenant_1", "tenant_2", "demo_tenant"]:
        state = _encode_state(t, "gsc", "n", int(time.time()))
        assert validate_state(state) == t


# ── Tamper detection ─────────────────────────────────────────────────────────────

def test_tampered_signature_rejected(monkeypatch):
    monkeypatch.setenv("GOOGLE_OAUTH_STATE_SECRET", "secret_x")
    state = _encode_state("tenant_abc", "google", "n", int(time.time()))
    # Flip a char in the signature
    parts = state.split(".")
    bad_sig = parts[1][:-1] + ("A" if parts[1][-1] != "A" else "B")
    tampered = parts[0] + "." + bad_sig
    with pytest.raises(OAuthStateError, match="signature mismatch"):
        validate_state(tampered)


def test_tampered_body_rejected(monkeypatch):
    monkeypatch.setenv("GOOGLE_OAUTH_STATE_SECRET", "secret_y")
    state = _encode_state("tenant_abc", "google", "n", int(time.time()))
    parts = state.split(".")
    # Modify the body (different tenant)
    evil_body = json.dumps({"ver": "v1", "t": "evil_tenant", "k": "google", "n": "n", "iat": int(time.time())})
    evil_b64 = base64.urlsafe_b64encode(evil_body.encode()).decode().rstrip("=")
    tampered = evil_b64 + "." + parts[1]
    with pytest.raises(OAuthStateError, match="signature mismatch"):
        validate_state(tampered)


# ── Expiry ───────────────────────────────────────────────────────────────────────

def test_expired_state_rejected(monkeypatch):
    monkeypatch.setenv("GOOGLE_OAUTH_STATE_SECRET", "secret_ttl")
    monkeypatch.setenv("GOOGLE_OAUTH_STATE_TTL", "1")  # 1 second TTL
    state = _encode_state("tenant_abc", "google", "n", int(time.time()) - 5)
    with pytest.raises(OAuthStateError, match="expired"):
        validate_state(state)


def test_future_iat_rejected(monkeypatch):
    monkeypatch.setenv("GOOGLE_OAUTH_STATE_SECRET", "secret_future")
    state = _encode_state("tenant_abc", "google", "n", int(time.time()) + 300)
    with pytest.raises(OAuthStateError, match="future"):
        validate_state(state)


# ── Edge cases ───────────────────────────────────────────────────────────────────

def test_empty_state_raises():
    with pytest.raises(OAuthStateError, match="Missing"):
        validate_state("")


def test_malformed_state_no_dot():
    with pytest.raises(OAuthStateError, match="Malformed"):
        validate_state("nodotinhere")


def test_malformed_state_too_many_dots(monkeypatch):
    monkeypatch.setenv("GOOGLE_OAUTH_STATE_SECRET", "s")
    with pytest.raises(OAuthStateError, match="Malformed"):
        validate_state("a.b.c")


# ── build_start ─────────────────────────────────────────────────────────────────

def test_build_start_requires_client_id(monkeypatch):
    monkeypatch.delenv("GOOGLE_CLIENT_ID", raising=False)
    with pytest.raises(OAuthStateError, match="GOOGLE_CLIENT_ID"):
        build_start("tenant_abc")


def test_build_start_returns_url_and_state(monkeypatch):
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "test_client_id.apps.googleusercontent.com")
    monkeypatch.setenv("GOOGLE_OAUTH_STATE_SECRET", "secret_build")
    result = build_start("tenant_abc", "google")
    assert "auth_url" in result
    assert "state" in result
    assert "accounts.google.com" in result["auth_url"]
    assert "webmasters.readonly" in result["auth_url"]
    assert "analytics.readonly" in result["auth_url"]
    # State must be a valid signed state
    tenant = validate_state(result["state"])
    assert tenant == "tenant_abc"
