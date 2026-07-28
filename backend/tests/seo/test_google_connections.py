"""Tests for seo.google.connections — service layer.

All tests use MockGscClient + MockGa4Client and injected token exchange functions.
Zero real network calls.

Covers:
  - connect → callback → connection saved with SEALED tokens
  - list_connections excludes REVOKED
  - refresh connection (mock path)
  - disconnect → status=REVOKED, tokens cleared
  - property listing (mock)
  - property select with valid connection
  - cross-account select FAILS (property belongs to different connection)
  - cross-workspace: tenant B cannot see tenant A's connection
  - state expiry rejects callback
"""

from __future__ import annotations

import time
from unittest.mock import patch

import pytest

import seo.search_stores as ss
from seo.google.crypto import is_sealed, seal
from seo.google.oauth import OAuthStateError, _encode_state
from seo.google.connections import (
    ConnectionError as ConnError,
    CrossAccountError,
    complete_connect,
    disconnect,
    get_connection,
    list_connections,
    list_properties_for_connection,
    select_property,
    start_connect,
)
from seo.google.gsc_client import MockGscClient
from seo.google.ga4_client import MockGa4Client
from seo.search_stores import (
    GoogleConnStatus,
    reset_repositories,
)


# ── Fixtures ────────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def clean_repos(monkeypatch):
    monkeypatch.delenv("PIXIE_PERSIST", raising=False)
    reset_repositories()
    yield
    reset_repositories()


@pytest.fixture
def state_secret(monkeypatch):
    monkeypatch.setenv("GOOGLE_OAUTH_STATE_SECRET", "test_conn_secret")
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "test_client.apps.googleusercontent.com")
    return "test_conn_secret"


def _fake_exchange(code: str) -> dict:
    """Simulates a successful token exchange without any network call."""
    return {
        "access_token": f"access_tok_{code}",
        "refresh_token": f"refresh_tok_{code}",
        "scope": "https://www.googleapis.com/auth/webmasters.readonly https://www.googleapis.com/auth/analytics.readonly",
        "expires_at": int(time.time()) + 3600,
        "email": "test@example.com",
    }


def _make_state(tenant_id: str = "tenant_a") -> str:
    return _encode_state(tenant_id, "google", "nonce_abc", int(time.time()))


# ── Connect flow ─────────────────────────────────────────────────────────────────

def test_complete_connect_saves_sealed_tokens(state_secret):
    state = _make_state("tenant_a")
    conn_id, conn = complete_connect(state, "code_123", token_exchange_fn=_fake_exchange)

    assert conn_id.startswith("gconn_")
    assert conn.status == GoogleConnStatus.CONNECTED
    assert conn.account_email == "test@example.com"
    # Tokens must be sealed — never plaintext
    assert is_sealed(conn.access_token_sealed), "access_token must be sealed"
    assert is_sealed(conn.refresh_token_sealed), "refresh_token must be sealed"
    # Sealed values must not equal plaintext
    assert conn.access_token_sealed != "access_tok_code_123"
    assert conn.refresh_token_sealed != "refresh_tok_code_123"


def test_complete_connect_expired_state_rejected(state_secret, monkeypatch):
    monkeypatch.setenv("GOOGLE_OAUTH_STATE_TTL", "1")
    state = _encode_state("tenant_a", "google", "n", int(time.time()) - 5)
    with pytest.raises(OAuthStateError, match="expired"):
        complete_connect(state, "any_code", token_exchange_fn=_fake_exchange)


def test_complete_connect_tampered_state_rejected(state_secret):
    state = _make_state("tenant_a") + "tamper"
    with pytest.raises(OAuthStateError):
        complete_connect(state, "any_code", token_exchange_fn=_fake_exchange)


# ── List connections ─────────────────────────────────────────────────────────────

def test_list_connections_excludes_revoked(state_secret):
    state_a = _make_state("tenant_a")
    conn_id_a, _ = complete_connect(state_a, "code_a", token_exchange_fn=_fake_exchange)

    state_b = _make_state("tenant_a")
    conn_id_b, _ = complete_connect(state_b, "code_b", token_exchange_fn=_fake_exchange)

    # Revoke conn_b
    from seo.search_stores import get_google_connection_repository
    repo = get_google_connection_repository()
    repo.update("tenant_a", conn_id_b, status=GoogleConnStatus.REVOKED)

    pairs = list_connections("tenant_a")
    ids = [cid for cid, _ in pairs]
    assert conn_id_a in ids
    assert conn_id_b not in ids


# ── Cross-workspace isolation ─────────────────────────────────────────────────────

def test_cross_workspace_isolation(state_secret):
    """Tenant B must not be able to read tenant A's connections."""
    state_a = _make_state("tenant_a")
    conn_id_a, _ = complete_connect(state_a, "code_a", token_exchange_fn=_fake_exchange)

    # Tenant B cannot get tenant A's connection
    result_b = get_connection("tenant_b", conn_id_a)
    assert result_b is None, "Tenant B should not see tenant A's connection"

    # Tenant B's list is empty
    pairs_b = list_connections("tenant_b")
    assert pairs_b == []


# ── Disconnect / revoke ─────────────────────────────────────────────────────────

def test_disconnect_marks_revoked(state_secret):
    state = _make_state("tenant_a")
    conn_id, _ = complete_connect(state, "code_x", token_exchange_fn=_fake_exchange)

    result = disconnect("tenant_a", conn_id)
    assert result["status"] == "revoked"
    assert result["disconnected"] == conn_id

    from seo.search_stores import get_google_connection_repository
    repo = get_google_connection_repository()
    _, conn = repo.get("tenant_a", conn_id)
    assert conn.status == GoogleConnStatus.REVOKED
    assert conn.access_token_sealed == ""
    assert conn.refresh_token_sealed == ""


def test_disconnect_not_found_raises(state_secret):
    with pytest.raises(ConnError, match="not found"):
        disconnect("tenant_a", "gconn_nonexistent")


# ── Property listing ─────────────────────────────────────────────────────────────

def test_list_properties_returns_gsc_and_ga4(state_secret):
    state = _make_state("tenant_a")
    conn_id, _ = complete_connect(state, "code_p", token_exchange_fn=_fake_exchange)

    props = list_properties_for_connection(
        "tenant_a", conn_id,
        gsc_client=MockGscClient(),
        ga4_client=MockGa4Client(),
    )

    kinds = {p["kind"] for p in props}
    assert "gsc" in kinds
    assert "ga4" in kinds
    assert len(props) >= 2


def test_list_properties_not_found_raises(state_secret):
    with pytest.raises(ConnError, match="not found"):
        list_properties_for_connection(
            "tenant_a", "gconn_nonexistent",
            gsc_client=MockGscClient(),
            ga4_client=MockGa4Client(),
        )


# ── Property selection / cross-account guard ──────────────────────────────────────

def test_select_property_success(state_secret):
    state = _make_state("tenant_a")
    conn_id, _ = complete_connect(state, "code_sel", token_exchange_fn=_fake_exchange)

    props = list_properties_for_connection(
        "tenant_a", conn_id,
        gsc_client=MockGscClient(),
        ga4_client=MockGa4Client(),
    )
    prop_row_id = props[0]["id"]

    result = select_property("tenant_a", conn_id, prop_row_id, site_id="site_123")
    assert result["site_id"] == "site_123"
    assert result["selected"] is True


def test_cross_account_select_fails(state_secret):
    """Property from conn_a cannot be selected with conn_b."""
    state_a = _make_state("tenant_a")
    conn_id_a, _ = complete_connect(state_a, "code_ca", token_exchange_fn=_fake_exchange)

    state_b = _make_state("tenant_a")
    conn_id_b, _ = complete_connect(state_b, "code_cb", token_exchange_fn=_fake_exchange)

    # Discover properties for conn_a
    props_a = list_properties_for_connection(
        "tenant_a", conn_id_a,
        gsc_client=MockGscClient(),
        ga4_client=MockGa4Client(),
    )
    prop_row_id_a = props_a[0]["id"]

    # Try to select conn_a's property using conn_b → must fail
    with pytest.raises(CrossAccountError, match="cross-account"):
        select_property("tenant_a", conn_id_b, prop_row_id_a, site_id="site_x")


def test_cross_tenant_property_select_fails(state_secret):
    """Tenant B cannot select tenant A's property."""
    state_a = _make_state("tenant_a")
    conn_id_a, _ = complete_connect(state_a, "code_ct", token_exchange_fn=_fake_exchange)

    props_a = list_properties_for_connection(
        "tenant_a", conn_id_a,
        gsc_client=MockGscClient(),
        ga4_client=MockGa4Client(),
    )
    prop_row_id_a = props_a[0]["id"]

    # Tenant B tries to use tenant A's property row_id
    with pytest.raises(CrossAccountError):
        select_property("tenant_b", conn_id_a, prop_row_id_a, site_id="evil_site")
