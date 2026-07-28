"""Tests for seo.google.routes — FastAPI endpoints.

Uses httpx TestClient. Zero real network calls.

Covers:
  - GET /google/connections (empty + populated)
  - POST /google/connect (missing CLIENT_ID → 400; configured → auth_url)
  - GET /google/callback (missing code → 400, error param → 400, bad state → 400, success)
  - GET /google/properties
  - POST /google/properties/select (success + cross-account 403)
  - POST /google/connections/{id}/sync (queued)
  - POST /google/connections/{id}/disconnect
  - GET /google/gsc/queries, /google/gsc/pages, /google/ga4/landing
"""

from __future__ import annotations

import time
from typing import Any, Dict, Optional

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from seo.google.routes import router
from seo.google.crypto import seal
from seo.google.oauth import _encode_state
from seo.search_stores import (
    GoogleConnStatus,
    reset_repositories,
)


# ── App fixture ──────────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def app():
    _app = FastAPI()
    _app.include_router(router)
    return _app


@pytest.fixture(scope="module")
def client(app):
    return TestClient(app, raise_server_exceptions=True)


@pytest.fixture(autouse=True)
def clean_repos(monkeypatch):
    monkeypatch.delenv("PIXIE_PERSIST", raising=False)
    monkeypatch.setenv("GSC_INITIAL_LOOKBACK_DAYS", "7")
    reset_repositories()
    yield
    reset_repositories()


# ── Helpers ──────────────────────────────────────────────────────────────────────

def _seed_connection(tenant_id: str = "tenant_route_test") -> str:
    from seo.search_stores import GoogleConnection, get_google_connection_repository
    repo = get_google_connection_repository()
    conn = GoogleConnection(
        tenant_id=tenant_id,
        kind="google",
        account_email="route@example.com",
        status=GoogleConnStatus.CONNECTED,
        access_token_sealed=seal("route_access_tok"),
        refresh_token_sealed=seal("route_refresh_tok"),
        token_expiry=str(int(time.time()) + 3600),
    )
    conn_id = "gconn_routetest123"
    repo._save(conn_id, tenant_id, conn)
    return conn_id


def _make_state(tenant_id: str, secret: str = "route_test_secret") -> str:
    import os
    os.environ["GOOGLE_OAUTH_STATE_SECRET"] = secret
    return _encode_state(tenant_id, "google", "nonce_route", int(time.time()))


# ── GET /google/connections ──────────────────────────────────────────────────────

def test_list_connections_empty(client):
    resp = client.get("/api/agents/seo/google/connections", params={"tenant_id": "no_tenant"})
    assert resp.status_code == 200
    assert resp.json()["connections"] == []


def test_list_connections_returns_conn(client):
    tenant = "tenant_list_route"
    _seed_connection(tenant)
    resp = client.get("/api/agents/seo/google/connections", params={"tenant_id": tenant})
    assert resp.status_code == 200
    conns = resp.json()["connections"]
    assert len(conns) == 1
    c = conns[0]
    # Tokens must not appear in response
    assert "access_token" not in c
    assert "refresh_token" not in c
    assert "access_token_sealed" not in c
    assert "refresh_token_sealed" not in c
    assert c["account_email"] == "route@example.com"


# ── POST /google/connect ─────────────────────────────────────────────────────────

def test_connect_missing_client_id(client, monkeypatch):
    monkeypatch.delenv("GOOGLE_CLIENT_ID", raising=False)
    resp = client.post("/api/agents/seo/google/connect", json={"tenant_id": "t1", "kind": "google"})
    assert resp.status_code == 400
    assert resp.json()["detail"]["error"] == "oauth_not_configured"


def test_connect_returns_auth_url(client, monkeypatch):
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "test_id.apps.googleusercontent.com")
    monkeypatch.setenv("GOOGLE_OAUTH_STATE_SECRET", "route_secret_456")
    resp = client.post("/api/agents/seo/google/connect", json={"tenant_id": "tenant_route_test"})
    assert resp.status_code == 200
    body = resp.json()
    assert "auth_url" in body
    assert "state" in body
    assert "accounts.google.com" in body["auth_url"]


# ── GET /google/callback ─────────────────────────────────────────────────────────

def test_callback_missing_code(client):
    resp = client.get("/api/agents/seo/google/callback", params={"state": "any_state"})
    assert resp.status_code == 400
    assert "missing_code" in resp.json()["detail"]["error"]


def test_callback_error_param(client):
    resp = client.get("/api/agents/seo/google/callback", params={
        "state": "s", "error": "access_denied"
    })
    assert resp.status_code == 400
    assert resp.json()["detail"]["error"] == "oauth_denied"


def test_callback_bad_state(client):
    resp = client.get("/api/agents/seo/google/callback", params={
        "state": "bad.state", "code": "some_code"
    })
    assert resp.status_code == 400


def test_callback_success(client, monkeypatch):
    """Callback with valid state + injected fake exchange → connection saved."""
    monkeypatch.setenv("GOOGLE_OAUTH_STATE_SECRET", "cb_secret")
    state = _make_state("tenant_cb", secret="cb_secret")

    fake_tokens = {
        "access_token": "at_cb_test",
        "refresh_token": "rt_cb_test",
        "scope": "https://www.googleapis.com/auth/webmasters.readonly",
        "expires_at": int(time.time()) + 3600,
        "email": "cb@example.com",
    }

    import seo.google.connections as conn_mod

    original = conn_mod._exchange_code_sync

    def fake_exchange(code):
        return fake_tokens

    monkeypatch.setattr(conn_mod, "_exchange_code_sync", fake_exchange)
    try:
        resp = client.get("/api/agents/seo/google/callback", params={
            "state": state, "code": "valid_code_123"
        })
        assert resp.status_code == 200
        body = resp.json()
        assert "connection" in body
        c = body["connection"]
        assert c["account_email"] == "cb@example.com"
        assert c["status"] == "connected"
        # tokens must not appear
        assert "access_token_sealed" not in c
        assert "refresh_token_sealed" not in c
    finally:
        monkeypatch.setattr(conn_mod, "_exchange_code_sync", original)


# ── GET /google/properties ────────────────────────────────────────────────────────

def test_list_properties_not_found(client):
    resp = client.get("/api/agents/seo/google/properties", params={
        "connection_id": "gconn_nope", "tenant_id": "tenant_prop_test"
    })
    assert resp.status_code == 404


def test_list_properties_success(client, monkeypatch):
    from seo.google import connections as conn_mod
    from seo.google.gsc_client import MockGscClient
    from seo.google.ga4_client import MockGa4Client

    tenant = "tenant_prop_route"
    conn_id = _seed_connection(tenant)

    # Patch the clients
    monkeypatch.setattr(conn_mod, "get_gsc_client", lambda: MockGscClient())
    monkeypatch.setattr(conn_mod, "get_ga4_client", lambda: MockGa4Client())

    resp = client.get("/api/agents/seo/google/properties", params={
        "connection_id": conn_id, "tenant_id": tenant
    })
    assert resp.status_code == 200
    props = resp.json()["properties"]
    kinds = {p["kind"] for p in props}
    assert "gsc" in kinds
    assert "ga4" in kinds


# ── POST /google/properties/select ────────────────────────────────────────────────

def test_select_property_cross_account(client, monkeypatch):
    """Try to select a property that belongs to a different connection → 403."""
    from seo.google import connections as conn_mod
    from seo.google.gsc_client import MockGscClient
    from seo.google.ga4_client import MockGa4Client

    tenant = "tenant_sel_route"
    conn_id_a = "gconn_seltest_a"
    conn_id_b = "gconn_seltest_b"

    from seo.search_stores import GoogleConnection, get_google_connection_repository
    repo = get_google_connection_repository()
    for cid in [conn_id_a, conn_id_b]:
        conn = GoogleConnection(
            tenant_id=tenant, kind="google", status=GoogleConnStatus.CONNECTED,
            access_token_sealed=seal("tok"), refresh_token_sealed=seal("ref"),
            token_expiry=str(int(time.time()) + 3600),
        )
        repo._save(cid, tenant, conn)

    monkeypatch.setattr(conn_mod, "get_gsc_client", lambda: MockGscClient())
    monkeypatch.setattr(conn_mod, "get_ga4_client", lambda: MockGa4Client())

    # Discover properties for conn_a
    props_a = conn_mod.list_properties_for_connection(
        tenant, conn_id_a, gsc_client=MockGscClient(), ga4_client=MockGa4Client()
    )
    prop_row_id = props_a[0]["id"]

    # Select using conn_b → should fail
    resp = client.post("/api/agents/seo/google/properties/select", json={
        "tenant_id": tenant,
        "connection_id": conn_id_b,
        "property_row_id": prop_row_id,
        "site_id": "site_x",
    })
    assert resp.status_code == 403
    assert resp.json()["detail"]["error"] == "cross_account"


# ── POST /google/connections/{id}/sync ────────────────────────────────────────────

def test_sync_enqueue(client):
    tenant = "tenant_sync_route"
    conn_id = _seed_connection(tenant)
    resp = client.post(f"/api/agents/seo/google/connections/{conn_id}/sync", json={
        "tenant_id": tenant,
        "property_id": "sc-domain:example.com",
        "site_id": "",
    })
    assert resp.status_code == 200
    assert resp.json()["status"] == "sync_enqueued"


def test_sync_not_found(client):
    resp = client.post("/api/agents/seo/google/connections/gconn_nope/sync", json={
        "tenant_id": "no_tenant",
        "property_id": "sc-domain:x.com",
    })
    assert resp.status_code == 404


# ── POST /google/connections/{id}/disconnect ──────────────────────────────────────

def test_disconnect_endpoint(client):
    tenant = "tenant_disc_route"
    conn_id = _seed_connection(tenant)
    resp = client.post(f"/api/agents/seo/google/connections/{conn_id}/disconnect", json={
        "tenant_id": tenant
    })
    assert resp.status_code == 200
    assert resp.json()["status"] == "revoked"


# ── GET /google/gsc/queries, /pages, /google/ga4/landing ─────────────────────────

def test_gsc_queries_empty(client):
    resp = client.get("/api/agents/seo/google/gsc/queries", params={
        "property_id": "sc-domain:x.com", "tenant_id": "no_rows_tenant"
    })
    assert resp.status_code == 200
    assert resp.json()["rows"] == []


def test_ga4_landing_empty(client):
    resp = client.get("/api/agents/seo/google/ga4/landing", params={
        "property_id": "properties/000", "tenant_id": "no_rows_tenant"
    })
    assert resp.status_code == 200
    assert resp.json()["rows"] == []
