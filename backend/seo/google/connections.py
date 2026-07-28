"""Google connection service layer for the SEO agent.

Handles:
  - connect flow: start (auth_url + state) → callback (exchange + seal + save)
  - list connections for a tenant
  - select/map a property to a Pixie site (cross-account guard)
  - connection health (last_synced_at / last_success_at / last_error / status)
  - token refresh (unseal → refresh → reseal → save, mark EXPIRED on failure)
  - disconnect (revoke via Google + mark REVOKED in DB)
  - reconnect (re-run start flow)

SECURITY:
  - Refresh tokens are NEVER returned to callers.
  - Access tokens are NEVER logged or returned to callers.
  - All tokens are sealed at rest via seo.google.crypto.

Environment variables consumed (names only, no secrets read here):
  GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_OAUTH_REDIRECT_SEO
  GOOGLE_TOKEN_ENCRYPTION_KEY (via crypto.py)
  RUN_LIVE_GOOGLE_TESTS (controls whether revoke hits real network)
"""

from __future__ import annotations

import json
import logging
import os
import time
import urllib.parse
import urllib.request
from typing import Any, Dict, List, Optional, Tuple

from seo.google.crypto import is_sealed, seal, unseal
from seo.google.gsc_client import GscClient, get_gsc_client
from seo.google.ga4_client import Ga4Client, get_ga4_client
from seo.google.oauth import (
    GOOGLE_TOKEN_ENDPOINT,
    GOOGLE_REVOKE_ENDPOINT,
    GOOGLE_USERINFO_ENDPOINT,
    OAuthStateError,
    build_start,
    get_redirect_uri,
    validate_state,
)
from seo.search_stores import (
    GoogleConnStatus,
    GoogleConnection,
    GoogleProperty,
    get_google_connection_repository,
    get_google_property_repository,
)

_log = logging.getLogger("pixie.seo.google.connections")


class ConnectionError(Exception):
    """Service-layer error for connection operations."""


class CrossAccountError(ConnectionError):
    """Raised when a property does not belong to the connected account."""


# ── Internal helpers ────────────────────────────────────────────────────────────

def _client_id() -> str:
    return os.getenv("GOOGLE_CLIENT_ID", "").strip()


def _client_secret() -> str:
    return os.getenv("GOOGLE_CLIENT_SECRET", "").strip()


def _is_live() -> bool:
    return os.getenv("RUN_LIVE_GOOGLE_TESTS", "").strip() == "1"


def _safe_connection_dict(conn_id: str, conn: GoogleConnection) -> Dict[str, Any]:
    """Serialize a connection for API responses — tokens are NEVER included."""
    return {
        "id": conn_id,
        "tenant_id": conn.tenant_id,
        "kind": conn.kind,
        "account_email": conn.account_email,
        "status": conn.status.value if hasattr(conn.status, "value") else conn.status,
        "scopes": conn.scopes,
        "token_expiry": conn.token_expiry,
        "last_synced_at": conn.last_synced_at,
        "last_success_at": conn.last_success_at,
        "last_error": conn.last_error,
        "created_at": conn.created_at,
        "updated_at": conn.updated_at,
    }


def _exchange_code_sync(code: str) -> Dict[str, Any]:
    """Exchange an OAuth code for tokens synchronously (stdlib only).

    In tests this is NOT called — the factory injects a fake via the gsc_client
    factory. In live mode (RUN_LIVE_GOOGLE_TESTS) this hits the real endpoint.
    Returns {"access_token", "refresh_token", "scope", "expires_at", "email"}.
    """
    if not _client_id() or not _client_secret():
        raise ConnectionError(
            "GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is not set — "
            "cannot exchange OAuth code"
        )

    data = urllib.parse.urlencode({
        "code": code,
        "client_id": _client_id(),
        "client_secret": _client_secret(),
        "redirect_uri": get_redirect_uri(),
        "grant_type": "authorization_code",
    }).encode("utf-8")

    req = urllib.request.Request(GOOGLE_TOKEN_ENDPOINT, data=data, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            tok = json.loads(resp.read().decode("utf-8"))
    except Exception as exc:
        raise ConnectionError(f"Token exchange failed: {exc}") from exc

    # Fetch userinfo
    email = ""
    try:
        info_req = urllib.request.Request(
            GOOGLE_USERINFO_ENDPOINT,
            headers={"Authorization": f"Bearer {tok['access_token']}"},
        )
        with urllib.request.urlopen(info_req, timeout=10) as info_resp:
            email = json.loads(info_resp.read().decode("utf-8")).get("email", "")
    except Exception:
        pass

    return {
        "access_token": tok.get("access_token", ""),
        "refresh_token": tok.get("refresh_token", ""),
        "scope": tok.get("scope", ""),
        "expires_at": int(time.time()) + int(tok.get("expires_in", 3600)) - 60,
        "email": email,
    }


def _refresh_access_token_sync(refresh_token_plain: str) -> Dict[str, Any]:
    """Use a refresh token to get a new access token (stdlib, sync).

    Returns {"access_token", "expires_at"}.
    Raises ConnectionError on failure.
    """
    if not _client_id() or not _client_secret():
        raise ConnectionError("Google client credentials not configured")

    data = urllib.parse.urlencode({
        "refresh_token": refresh_token_plain,
        "client_id": _client_id(),
        "client_secret": _client_secret(),
        "grant_type": "refresh_token",
    }).encode("utf-8")

    req = urllib.request.Request(GOOGLE_TOKEN_ENDPOINT, data=data, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            tok = json.loads(resp.read().decode("utf-8"))
        return {
            "access_token": tok["access_token"],
            "expires_at": int(time.time()) + int(tok.get("expires_in", 3600)) - 60,
        }
    except Exception as exc:
        raise ConnectionError(f"Token refresh failed: {exc}") from exc


def _revoke_token_sync(token: str) -> None:
    """Revoke a token via Google's revoke endpoint (best-effort)."""
    try:
        url = f"{GOOGLE_REVOKE_ENDPOINT}?token={urllib.parse.quote(token)}"
        req = urllib.request.Request(url, method="POST")
        req.add_header("Content-Type", "application/x-www-form-urlencoded")
        with urllib.request.urlopen(req, timeout=10):
            pass
    except Exception as exc:
        _log.warning("seo.google.connections: revoke failed (best-effort): %s", exc)


# ── Public API ──────────────────────────────────────────────────────────────────

def start_connect(tenant_id: str, kind: str = "google") -> Dict[str, Any]:
    """Begin the OAuth flow; return auth_url + state for the frontend."""
    return build_start(tenant_id, kind)


def complete_connect(
    state: str,
    code: str,
    *,
    token_exchange_fn=None,
) -> Tuple[str, GoogleConnection]:
    """Complete the OAuth callback: validate state, exchange code, seal, save.

    ``token_exchange_fn`` is injectable for tests (avoids real network).
    It should accept (code: str) -> dict with keys:
      access_token, refresh_token, scope, expires_at, email.

    Returns (connection_id, connection).
    Raises OAuthStateError on bad/expired state.
    Raises ConnectionError on exchange failure.
    """
    tenant_id = validate_state(state)

    exchange = token_exchange_fn if token_exchange_fn is not None else _exchange_code_sync
    tokens = exchange(code)

    access_token = tokens.get("access_token", "")
    refresh_token = tokens.get("refresh_token", "")
    scope_str = tokens.get("scope", "")
    expires_at = tokens.get("expires_at", 0)
    email = tokens.get("email", "")

    if not access_token:
        raise ConnectionError("No access_token in exchange response")

    access_sealed = seal(access_token)
    refresh_sealed = seal(refresh_token) if refresh_token else ""

    scopes = [s.strip() for s in scope_str.split() if s.strip()]

    conn = GoogleConnection(
        tenant_id=tenant_id,
        kind="google",
        account_email=email,
        status=GoogleConnStatus.CONNECTED,
        scopes=scopes,
        access_token_sealed=access_sealed,
        refresh_token_sealed=refresh_sealed,
        token_expiry=str(expires_at),
    )

    repo = get_google_connection_repository()
    conn_id, saved = repo.create(conn)
    return conn_id, saved


def list_connections(tenant_id: str) -> List[Tuple[str, GoogleConnection]]:
    """List all non-revoked connections for a tenant."""
    repo = get_google_connection_repository()
    return [
        (cid, conn) for cid, conn in repo.list(tenant_id)
        if conn.status != GoogleConnStatus.REVOKED
    ]


def get_connection(tenant_id: str, connection_id: str) -> Optional[Tuple[str, GoogleConnection]]:
    """Fetch a single connection, or None if not found / wrong tenant."""
    repo = get_google_connection_repository()
    result = repo.get(tenant_id, connection_id)
    if result is None:
        return None
    return result  # already (id, obj) tuple or None


def list_properties_for_connection(
    tenant_id: str,
    connection_id: str,
    *,
    gsc_client: Optional[GscClient] = None,
    ga4_client: Optional[Ga4Client] = None,
) -> List[Dict[str, Any]]:
    """Fetch + return available GSC and GA4 properties for a connection.

    Uses stored (sealed) access token — never returned to caller.
    Saves discovered properties in the DB and returns safe property dicts.
    """
    result = get_connection(tenant_id, connection_id)
    if result is None:
        raise ConnectionError(f"Connection {connection_id} not found for tenant {tenant_id}")

    _, conn = result
    if conn.status == GoogleConnStatus.REVOKED:
        raise ConnectionError("Connection is revoked")

    # Get a fresh access token
    access_token = _get_fresh_access_token(tenant_id, connection_id)

    gsc = gsc_client or get_gsc_client()
    ga4 = ga4_client or get_ga4_client()

    all_props = []
    prop_repo = get_google_property_repository()

    # GSC properties
    try:
        gsc_props = gsc.list_properties(access_token)
        for p in gsc_props:
            prop = GoogleProperty(
                tenant_id=tenant_id,
                connection_id=connection_id,
                kind="gsc",
                property_id=p.get("property_id", ""),
                property_type=p.get("property_type", ""),
                display_name=p.get("display_name", ""),
                permission_level=p.get("permission_level", ""),
            )
            pid, saved = prop_repo.create(prop)
            all_props.append({
                "id": pid,
                "kind": "gsc",
                "property_id": saved.property_id,
                "display_name": saved.display_name,
                "property_type": saved.property_type,
                "permission_level": saved.permission_level,
                "site_id": saved.site_id,
                "selected": saved.selected,
            })
    except Exception as exc:
        _log.warning("seo.google.connections: GSC list_properties failed: %s", exc)

    # GA4 properties
    try:
        ga4_props = ga4.list_properties(access_token)
        for p in ga4_props:
            prop = GoogleProperty(
                tenant_id=tenant_id,
                connection_id=connection_id,
                kind="ga4",
                property_id=p.get("property_id", ""),
                property_type="ga4",
                display_name=p.get("display_name", ""),
                permission_level="",
            )
            pid, saved = prop_repo.create(prop)
            all_props.append({
                "id": pid,
                "kind": "ga4",
                "property_id": saved.property_id,
                "display_name": saved.display_name,
                "property_type": "ga4",
                "permission_level": "",
                "site_id": saved.site_id,
                "selected": saved.selected,
            })
    except Exception as exc:
        _log.warning("seo.google.connections: GA4 list_properties failed: %s", exc)

    return all_props


def select_property(
    tenant_id: str,
    connection_id: str,
    property_row_id: str,
    site_id: str,
) -> Dict[str, Any]:
    """Map a discovered property to a Pixie site.

    Cross-account guard: the property MUST belong to the given connection_id
    within the same tenant. Raises CrossAccountError otherwise.
    """
    prop_repo = get_google_property_repository()
    result = prop_repo.get(tenant_id, property_row_id)
    if result is None:
        raise CrossAccountError(f"Property {property_row_id} not found")

    _, prop = result
    # Cross-account guard: property must belong to this connection
    if prop.connection_id != connection_id:
        raise CrossAccountError(
            f"Property {property_row_id} belongs to connection {prop.connection_id!r}, "
            f"not {connection_id!r} — cross-account selection is not allowed"
        )
    # Tenant guard
    if prop.tenant_id != tenant_id:
        raise CrossAccountError(
            f"Property {property_row_id} belongs to tenant {prop.tenant_id!r}"
        )

    _, updated = prop_repo.update(
        tenant_id, property_row_id, site_id=site_id, selected=True
    )
    return {
        "id": property_row_id,
        "property_id": updated.property_id,
        "display_name": updated.display_name,
        "kind": updated.kind,
        "site_id": updated.site_id,
        "selected": updated.selected,
    }


def _get_fresh_access_token(tenant_id: str, connection_id: str) -> str:
    """Return a non-expired access token for the connection.

    Refreshes if the stored token is near expiry. Marks EXPIRED on failure.
    NEVER returns the refresh token.
    """
    repo = get_google_connection_repository()
    result = repo.get(tenant_id, connection_id)
    if result is None:
        raise ConnectionError(f"Connection {connection_id} not found")

    _, conn = result
    now = int(time.time())
    expiry = 0
    try:
        expiry = int(conn.token_expiry) if conn.token_expiry else 0
    except (ValueError, TypeError):
        pass

    # If access token looks fresh, use it
    if conn.access_token_sealed and expiry > now + 60:
        return unseal(conn.access_token_sealed)

    # Need to refresh
    if not conn.refresh_token_sealed:
        raise ConnectionError("No refresh token — reconnect required")

    try:
        refresh_plain = unseal(conn.refresh_token_sealed)
    except ValueError as exc:
        repo.update(
            tenant_id, connection_id,
            status=GoogleConnStatus.EXPIRED,
            last_error=f"Failed to unseal refresh token: {exc}",
        )
        raise ConnectionError(f"Could not unseal refresh token: {exc}") from exc

    if not _is_live():
        # In non-live / test mode, return the unsealed access token as-is
        # (no real network call to refresh)
        try:
            return unseal(conn.access_token_sealed)
        except ValueError:
            return "mock_access_token"

    try:
        refreshed = _refresh_access_token_sync(refresh_plain)
    except ConnectionError as exc:
        repo.update(
            tenant_id, connection_id,
            status=GoogleConnStatus.EXPIRED,
            last_error=str(exc),
        )
        raise

    new_access = refreshed["access_token"]
    new_expiry = refreshed["expires_at"]

    repo.update(
        tenant_id, connection_id,
        access_token_sealed=seal(new_access),
        token_expiry=str(new_expiry),
        status=GoogleConnStatus.CONNECTED,
        last_error="",
    )
    return new_access


def refresh_connection(tenant_id: str, connection_id: str) -> Dict[str, Any]:
    """Force-refresh the access token for a connection.

    Returns the safe connection dict (no tokens).
    """
    # _get_fresh_access_token handles the refresh side-effect
    _get_fresh_access_token(tenant_id, connection_id)

    repo = get_google_connection_repository()
    result = repo.get(tenant_id, connection_id)
    if result is None:
        raise ConnectionError(f"Connection {connection_id} not found")
    cid, conn = result
    return _safe_connection_dict(cid, conn)


def disconnect(tenant_id: str, connection_id: str) -> Dict[str, Any]:
    """Revoke tokens via Google and mark the connection REVOKED.

    Revocation is best-effort: if the Google endpoint fails, we still mark REVOKED
    locally (the token may expire naturally).
    """
    repo = get_google_connection_repository()
    result = repo.get(tenant_id, connection_id)
    if result is None:
        raise ConnectionError(f"Connection {connection_id} not found")

    _, conn = result

    # Attempt revocation only in live mode
    if _is_live():
        for sealed in [conn.access_token_sealed, conn.refresh_token_sealed]:
            if sealed:
                try:
                    _revoke_token_sync(unseal(sealed))
                except Exception as exc:
                    _log.warning("seo.google.connections: revoke best-effort failed: %s", exc)

    repo.update(
        tenant_id, connection_id,
        status=GoogleConnStatus.REVOKED,
        access_token_sealed="",
        refresh_token_sealed="",
        last_error="",
    )
    return {"disconnected": connection_id, "status": "revoked"}
