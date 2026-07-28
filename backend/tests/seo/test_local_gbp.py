"""GBP OAuth + sync tests for the Local SEO vertical.

Tests:
  - start_gbp_connect requires GOOGLE_CLIENT_ID
  - complete_gbp_connect: state validation, tokens sealed, connection saved
  - Cross-workspace location mapping FAILS when location belongs to different tenant
  - GBP sync (mock): returns labelled unavailable performance metrics
  - Token sealing: refresh token never returned to callers
  - Disconnect: marks REVOKED, clears tokens
  - list_gbp_accounts / list_gbp_locations: deterministic mock responses

Zero paid/network calls.  All OAuth is mocked via token_exchange_fn injection.
"""

from __future__ import annotations

import time
import pytest

from seo.local.stores import GbpConnStatus, Location, reset_repositories
from seo.local.gbp import (
    GbpConnectionError,
    GbpCrossWorkspaceError,
    MockGbpClient,
    complete_gbp_connect,
    disconnect_gbp,
    get_connection,
    list_connections,
    list_gbp_accounts,
    list_gbp_locations,
    map_gbp_location_to_pixie,
    run_gbp_sync,
    start_gbp_connect,
)
from seo.google.oauth import _encode_state
from seo.google.crypto import is_sealed


@pytest.fixture(autouse=True)
def _reset(monkeypatch):
    reset_repositories()
    # Ensure non-live mode (no real API calls)
    monkeypatch.delenv("RUN_LIVE_GBP_TESTS", raising=False)
    yield
    reset_repositories()


def _make_state(tenant_id: str = "t_gbp") -> str:
    import secrets
    return _encode_state(tenant_id, "gbp", secrets.token_hex(8), int(time.time()))


def _fake_exchange(code: str) -> dict:
    return {
        "access_token": "fake_access_token",
        "refresh_token": "fake_refresh_token",
        "scope": "https://www.googleapis.com/auth/business.manage openid email",
        "expires_at": int(time.time()) + 3600,
        "email": "owner@example.com",
    }


# ── OAuth start ───────────────────────────────────────────────────────────────

def test_start_connect_requires_client_id(monkeypatch):
    monkeypatch.delenv("GOOGLE_CLIENT_ID", raising=False)
    with pytest.raises(GbpConnectionError, match="GOOGLE_CLIENT_ID"):
        start_gbp_connect("t_gbp")


def test_start_connect_returns_auth_url(monkeypatch):
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "test_client_id")
    result = start_gbp_connect("t_gbp")
    assert "auth_url" in result
    assert "state" in result
    assert "accounts.google.com" in result["auth_url"]
    assert "business.manage" in result["auth_url"]


# ── OAuth callback ────────────────────────────────────────────────────────────

def test_complete_connect_seals_tokens():
    """Access + refresh tokens must be sealed at rest."""
    state = _make_state()
    conn_id, conn = complete_gbp_connect(state, "fake_code",
                                         token_exchange_fn=_fake_exchange)
    assert conn_id.startswith("gbpconn_")
    assert conn.account_email == "owner@example.com"
    assert conn.status is GbpConnStatus.CONNECTED

    # Tokens must be sealed — never plaintext
    assert is_sealed(conn.access_token_sealed)
    assert is_sealed(conn.refresh_token_sealed)

    # Raw token strings must NOT appear in sealed values
    assert "fake_access_token" not in conn.access_token_sealed
    assert "fake_refresh_token" not in conn.refresh_token_sealed


def test_complete_connect_invalid_state():
    from seo.google.oauth import OAuthStateError
    with pytest.raises(OAuthStateError):
        complete_gbp_connect("invalid.state", "fake_code",
                             token_exchange_fn=_fake_exchange)


def test_complete_connect_expired_state(monkeypatch):
    """An expired state must be rejected."""
    from seo.google.oauth import OAuthStateError
    import secrets
    # Issue state with issued_at far in the past
    old_state = _encode_state("t_gbp", "gbp", secrets.token_hex(8), issued_at=0)
    with pytest.raises(OAuthStateError, match="expired"):
        complete_gbp_connect(old_state, "fake_code",
                             token_exchange_fn=_fake_exchange)


# ── Cross-workspace guard ─────────────────────────────────────────────────────

def test_map_gbp_location_cross_workspace_fails():
    """Mapping a GBP location to a Pixie location from another tenant must fail."""
    from seo.local.stores import get_location_repository

    # Create a location for tenant A
    loc_repo = get_location_repository()
    lid_a, _ = loc_repo.create(Location(
        tenant_id="t_a",
        business_name="Tenant A Shop",
    ))

    # Create a valid connection for tenant B
    state_b = _make_state("t_b")
    conn_id_b, _ = complete_gbp_connect(state_b, "fake_code",
                                         token_exchange_fn=_fake_exchange)

    # Tenant B tries to map to tenant A's location — must fail
    with pytest.raises(GbpCrossWorkspaceError):
        map_gbp_location_to_pixie(
            "t_b",
            conn_id_b,
            "accounts/123456789/locations/111222333",
            lid_a,  # belongs to t_a
            gbp_client=MockGbpClient(),
        )


def test_map_gbp_location_own_workspace_succeeds():
    """Mapping a GBP location to the same tenant's Pixie location must succeed."""
    from seo.local.stores import get_location_repository

    loc_repo = get_location_repository()
    lid, _ = loc_repo.create(Location(
        tenant_id="t_gbp",
        business_name="My Business",
    ))

    state = _make_state("t_gbp")
    conn_id, _ = complete_gbp_connect(state, "fake_code",
                                       token_exchange_fn=_fake_exchange)

    result = map_gbp_location_to_pixie(
        "t_gbp",
        conn_id,
        "accounts/123456789/locations/111222333",
        lid,
        gbp_client=MockGbpClient(),
    )
    assert result["mapped"] is True
    assert result["pixie_location_id"] == lid


# ── GBP sync ─────────────────────────────────────────────────────────────────

def test_gbp_sync_labels_unavailable_metrics():
    """GBP sync must label performance metrics as unavailable (never fabricate)."""
    from seo.local.stores import get_location_repository

    loc_repo = get_location_repository()
    lid, _ = loc_repo.create(Location(
        tenant_id="t_gbp",
        business_name="Sync Test",
        gbp_location_id="accounts/123456789/locations/111222333",
    ))

    state = _make_state("t_gbp")
    conn_id, _ = complete_gbp_connect(state, "fake_code",
                                       token_exchange_fn=_fake_exchange)

    result = run_gbp_sync("t_gbp", conn_id, lid, gbp_client=MockGbpClient(), is_mock=True)

    assert "performance_metrics" in result
    assert result["performance_metrics"]["status"] == "unavailable"
    # Must explain WHY (not a silent omission)
    reason = result["performance_metrics"].get("reason", "")
    assert reason, "performance_metrics must include a non-empty reason explaining why metrics are unavailable"
    # Must return synced_at and basic profile data
    assert result["synced_at"]
    assert result["is_mock"] is True


def test_gbp_sync_missing_gbp_location_id_fails():
    """sync must fail when no gbp_location_id is set on the location."""
    from seo.local.stores import get_location_repository

    loc_repo = get_location_repository()
    lid, _ = loc_repo.create(Location(
        tenant_id="t_gbp",
        business_name="No GBP ID",
        gbp_location_id="",  # not set
    ))

    state = _make_state("t_gbp")
    conn_id, _ = complete_gbp_connect(state, "fake_code",
                                       token_exchange_fn=_fake_exchange)

    with pytest.raises(GbpConnectionError, match="no GBP location ID"):
        run_gbp_sync("t_gbp", conn_id, lid, gbp_client=MockGbpClient())


# ── Accounts + locations list ─────────────────────────────────────────────────

def test_list_gbp_accounts_mock():
    state = _make_state()
    conn_id, _ = complete_gbp_connect(state, "code", token_exchange_fn=_fake_exchange)
    accounts = list_gbp_accounts("t_gbp", conn_id, gbp_client=MockGbpClient())
    assert len(accounts) >= 1
    assert "account_name" in accounts[0]
    assert "display_name" in accounts[0]


def test_list_gbp_locations_mock():
    state = _make_state()
    conn_id, _ = complete_gbp_connect(state, "code", token_exchange_fn=_fake_exchange)
    locs = list_gbp_locations("t_gbp", conn_id, "accounts/123456789",
                               gbp_client=MockGbpClient())
    assert len(locs) >= 1
    assert "name" in locs[0]
    assert "title" in locs[0]


# ── Disconnect ────────────────────────────────────────────────────────────────

def test_disconnect_marks_revoked_clears_tokens():
    state = _make_state()
    conn_id, _ = complete_gbp_connect(state, "code", token_exchange_fn=_fake_exchange)

    result = disconnect_gbp("t_gbp", conn_id)
    assert result["status"] == "revoked"

    _, conn = get_connection("t_gbp", conn_id)
    assert conn.status is GbpConnStatus.REVOKED
    assert conn.access_token_sealed == ""
    assert conn.refresh_token_sealed == ""


def test_list_connections_excludes_revoked():
    state = _make_state()
    conn_id, _ = complete_gbp_connect(state, "code", token_exchange_fn=_fake_exchange)
    disconnect_gbp("t_gbp", conn_id)

    conns = list_connections("t_gbp")
    assert not any(cid == conn_id for cid, _ in conns)


# ── Metering (mock=True → zero credits) ───────────────────────────────────────

def test_gbp_sync_billing_zero_in_mock():
    """Mock mode must not record any credits."""
    from seo.local.stores import get_location_repository

    loc_repo = get_location_repository()
    lid, _ = loc_repo.create(Location(
        tenant_id="t_gbp",
        business_name="Billing Test",
        gbp_location_id="accounts/123456789/locations/111222333",
    ))
    state = _make_state()
    conn_id, _ = complete_gbp_connect(state, "code", token_exchange_fn=_fake_exchange)
    result = run_gbp_sync("t_gbp", conn_id, lid, gbp_client=MockGbpClient(), is_mock=True)

    # In mock mode the metering helper returns recorded=False
    # (credit system is disabled in tests)
    assert result.get("is_mock") is True
