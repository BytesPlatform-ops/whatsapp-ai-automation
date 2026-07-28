"""Google Business Profile (GBP) OAuth + sync for the Local SEO vertical.

Mirrors the pattern in seo/google/connections.py:
  - Reuses seo.google.crypto (seal/unseal) for token storage.
  - Reuses seo.google.oauth (signed HMAC state, validate_state) for CSRF safety.
  - MockGbpClient (deterministic, zero network) / HttpGbpClient (live only).
  - Factory get_gbp_client() — returns Mock unless RUN_LIVE_GBP_TESTS=1 + key set.

GBP-specific env vars:
  GBP_OAUTH_REDIRECT       — callback redirect URI (default localhost dev URL)
  GBP_SCOPES               — space-sep override (default: business.manage)
  RUN_LIVE_GBP_TESTS       — "1" to allow HttpGbpClient in tests

Security:
  - Refresh tokens are NEVER returned to callers.
  - Access tokens are NEVER logged or returned.
  - All tokens are sealed at rest via seo.google.crypto.
  - Cross-workspace location mapping is blocked.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import time
import urllib.parse
import urllib.request
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional, Tuple

from seo.google.crypto import is_sealed, seal, unseal
from seo.google.oauth import (
    OAuthStateError,
    _encode_state,
    validate_state,
    GOOGLE_TOKEN_ENDPOINT,
    GOOGLE_REVOKE_ENDPOINT,
    GOOGLE_USERINFO_ENDPOINT,
)
from seo.metering_search import record_gbp_sync, LIMIT_GBP_CONNECTIONS, enforce_seo_limit
from seo.local.stores import (
    GbpConnection,
    GbpConnStatus,
    _now,
    _uid,
    get_gbp_connection_repository,
    get_location_repository,
)

_log = logging.getLogger("pixie.seo.local.gbp")

# GBP-specific OAuth scopes
GBP_SCOPES = [
    "https://www.googleapis.com/auth/business.manage",
    "https://www.googleapis.com/auth/userinfo.email",
    "openid",
]

GBP_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"

_GBP_STATE_KIND = "gbp"


class GbpError(Exception):
    """Raised by GbpClient implementations on API/quota errors."""
    def __init__(self, message: str, status_code: int = 0, reason: str = ""):
        super().__init__(message)
        self.status_code = status_code
        self.reason = reason


class GbpConnectionError(Exception):
    """Service-layer error for GBP connection operations."""


class GbpCrossWorkspaceError(GbpConnectionError):
    """Raised when a GBP location belongs to a different workspace."""


# ── Provider abstraction ───────────────────────────────────────────────────────

class GbpClient(ABC):
    """Minimal GBP surface needed by the sync engine."""

    @abstractmethod
    def list_accounts(self, access_token: str) -> List[Dict[str, Any]]:
        """Return a list of GBP account descriptors.
        Each dict has: account_name (str), account_number (str), display_name (str).
        """

    @abstractmethod
    def list_locations(
        self, access_token: str, account_name: str
    ) -> List[Dict[str, Any]]:
        """Return a list of GBP location descriptors for an account.
        Each dict has: name (str), title (str), phoneNumbers (dict), etc.
        """

    @abstractmethod
    def get_location(
        self, access_token: str, location_name: str
    ) -> Dict[str, Any]:
        """Fetch a single location's full profile."""

    @abstractmethod
    def list_reviews(
        self,
        access_token: str,
        location_name: str,
        page_token: str = "",
        page_size: int = 50,
    ) -> Dict[str, Any]:
        """Fetch reviews for a location.
        Returns: {reviews: [...], nextPageToken: str|""}
        """


# ── Mock implementation ────────────────────────────────────────────────────────

_MOCK_ACCOUNTS = [
    {
        "account_name": "accounts/123456789",
        "account_number": "123456789",
        "display_name": "Acme Local Business",
        "type": "LOCATION_GROUP",
    }
]

_MOCK_LOCATIONS = [
    {
        "name": "accounts/123456789/locations/111222333",
        "title": "Acme Plumbing — Downtown",
        "phoneNumbers": {"primaryPhone": "+15551234567"},
        "websiteUri": "https://acmeplumbing.example.com",
        "storefrontAddress": {
            "addressLines": ["123 Main St"],
            "locality": "Springfield",
            "administrativeArea": "IL",
            "postalCode": "62701",
            "regionCode": "US",
        },
        "primaryCategory": {"displayName": "Plumber"},
        "regularHours": {},
        "rating": 4.5,
        "reviewCount": 48,
        "metadata": {"newReviewUri": "https://g.page/r/acme/review"},
    },
    {
        "name": "accounts/123456789/locations/444555666",
        "title": "Acme Plumbing — North Side",
        "phoneNumbers": {"primaryPhone": "+15557654321"},
        "websiteUri": "https://acmeplumbing.example.com/north",
        "storefrontAddress": {
            "addressLines": ["456 Oak Ave"],
            "locality": "Springfield",
            "administrativeArea": "IL",
            "postalCode": "62704",
            "regionCode": "US",
        },
        "primaryCategory": {"displayName": "Plumber"},
        "regularHours": {},
        "rating": 4.2,
        "reviewCount": 21,
        "metadata": {"newReviewUri": "https://g.page/r/acme-north/review"},
    },
]


def _mock_review(seed: str, location_name: str) -> Dict[str, Any]:
    h = int(hashlib.md5(seed.encode("utf-8")).hexdigest(), 16)
    rating = (h % 5) + 1
    names = ["Alice Smith", "Bob Jones", "Carol White", "Dave Brown", "Eve Davis"]
    texts = [
        "Great service! Very professional.",
        "Good experience overall.",
        "Quick response and fair pricing.",
        "Would recommend to friends.",
        "Excellent workmanship.",
    ]
    return {
        "reviewId": f"rev_{h % 10000:04d}",
        "reviewer": {
            "displayName": names[h % len(names)],
            "profilePhotoUrl": "",
        },
        "starRating": ["ONE", "TWO", "THREE", "FOUR", "FIVE"][rating - 1],
        "comment": texts[h % len(texts)],
        "createTime": "2026-01-15T10:00:00Z",
        "updateTime": "2026-01-15T10:00:00Z",
        "reviewReply": None,
        "name": f"{location_name}/reviews/rev_{h % 10000:04d}",
    }


class MockGbpClient(GbpClient):
    """Deterministic, hermetic mock — zero network calls."""

    def list_accounts(self, access_token: str) -> List[Dict[str, Any]]:
        return list(_MOCK_ACCOUNTS)

    def list_locations(
        self, access_token: str, account_name: str
    ) -> List[Dict[str, Any]]:
        return list(_MOCK_LOCATIONS)

    def get_location(
        self, access_token: str, location_name: str
    ) -> Dict[str, Any]:
        for loc in _MOCK_LOCATIONS:
            if loc["name"] == location_name:
                return dict(loc)
        # Return first as fallback
        return dict(_MOCK_LOCATIONS[0])

    def list_reviews(
        self,
        access_token: str,
        location_name: str,
        page_token: str = "",
        page_size: int = 50,
    ) -> Dict[str, Any]:
        reviews = [_mock_review(f"{location_name}:{i}", location_name) for i in range(5)]
        return {"reviews": reviews, "nextPageToken": ""}


# ── Real (HTTP) implementation ─────────────────────────────────────────────────

class HttpGbpClient(GbpClient):
    """Real GBP API client (only used when RUN_LIVE_GBP_TESTS=1)."""

    _BASE = "https://mybusinessbusinessinformation.googleapis.com/v1"
    _REVIEWS_BASE = "https://mybusiness.googleapis.com/v4"

    def _get(self, access_token: str, url: str) -> Dict[str, Any]:
        req = urllib.request.Request(
            url,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception as exc:
            code = getattr(exc, "code", 0) or 0
            raise GbpError(str(exc), status_code=code) from exc

    def list_accounts(self, access_token: str) -> List[Dict[str, Any]]:
        data = self._get(
            access_token,
            "https://mybusinessaccountmanagement.googleapis.com/v1/accounts",
        )
        out = []
        for acct in data.get("accounts", []):
            out.append({
                "account_name": acct.get("name", ""),
                "account_number": acct.get("accountNumber", ""),
                "display_name": acct.get("accountName", ""),
                "type": acct.get("type", ""),
            })
        return out

    def list_locations(
        self, access_token: str, account_name: str
    ) -> List[Dict[str, Any]]:
        url = f"{self._BASE}/{account_name}/locations?readMask=name,title,phoneNumbers,websiteUri,storefrontAddress,primaryCategory,regularHours,metadata"
        data = self._get(access_token, url)
        return data.get("locations", [])

    def get_location(
        self, access_token: str, location_name: str
    ) -> Dict[str, Any]:
        url = f"{self._BASE}/{location_name}"
        return self._get(access_token, url)

    def list_reviews(
        self,
        access_token: str,
        location_name: str,
        page_token: str = "",
        page_size: int = 50,
    ) -> Dict[str, Any]:
        url = f"{self._REVIEWS_BASE}/{location_name}/reviews?pageSize={page_size}"
        if page_token:
            url += f"&pageToken={urllib.parse.quote(page_token)}"
        return self._get(access_token, url)


# ── Factory ────────────────────────────────────────────────────────────────────

def get_gbp_client() -> GbpClient:
    """Return the appropriate GBP client.

    Returns MockGbpClient unless BOTH:
      - RUN_LIVE_GBP_TESTS=1 is set, AND
      - GOOGLE_CLIENT_ID is present.
    """
    if (
        os.getenv("RUN_LIVE_GBP_TESTS", "").strip() == "1"
        and os.getenv("GOOGLE_CLIENT_ID", "").strip()
    ):
        _log.info("seo.local.gbp: using HttpGbpClient (live mode)")
        return HttpGbpClient()
    return MockGbpClient()


# ── Internal helpers ───────────────────────────────────────────────────────────

def _client_id() -> str:
    return os.getenv("GOOGLE_CLIENT_ID", "").strip()


def _client_secret() -> str:
    return os.getenv("GOOGLE_CLIENT_SECRET", "").strip()


def _is_live() -> bool:
    return os.getenv("RUN_LIVE_GBP_TESTS", "").strip() == "1"


def _gbp_redirect_uri() -> str:
    return os.getenv(
        "GBP_OAUTH_REDIRECT",
        "http://localhost:8000/api/agents/seo/gbp/callback",
    ).strip()


def _gbp_scopes() -> List[str]:
    raw = os.getenv("GBP_SCOPES", "").strip()
    if raw:
        return [s.strip() for s in raw.split() if s.strip()]
    return GBP_SCOPES


def _safe_connection_dict(conn_id: str, conn: GbpConnection) -> Dict[str, Any]:
    """Serialize a GbpConnection for API responses — tokens are NEVER included."""
    return {
        "id": conn_id,
        "tenant_id": conn.tenant_id,
        "kind": conn.kind,
        "account_email": conn.account_email,
        "gbp_account_name": conn.gbp_account_name,
        "status": conn.status.value if hasattr(conn.status, "value") else conn.status,
        "scopes": conn.scopes,
        "token_expiry": conn.token_expiry,
        "last_synced_at": conn.last_synced_at,
        "last_success_at": conn.last_success_at,
        "last_error": conn.last_error,
        "created_at": conn.created_at,
        "updated_at": conn.updated_at,
    }


def _exchange_code_gbp(code: str) -> Dict[str, Any]:
    """Exchange an OAuth code for GBP tokens (stdlib, sync, live only)."""
    if not _client_id() or not _client_secret():
        raise GbpConnectionError(
            "GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set — "
            "cannot exchange OAuth code"
        )

    data = urllib.parse.urlencode({
        "code": code,
        "client_id": _client_id(),
        "client_secret": _client_secret(),
        "redirect_uri": _gbp_redirect_uri(),
        "grant_type": "authorization_code",
    }).encode("utf-8")

    req = urllib.request.Request(GOOGLE_TOKEN_ENDPOINT, data=data, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            tok = json.loads(resp.read().decode("utf-8"))
    except Exception as exc:
        raise GbpConnectionError(f"GBP token exchange failed: {exc}") from exc

    email = ""
    try:
        info_req = urllib.request.Request(
            GOOGLE_USERINFO_ENDPOINT,
            headers={"Authorization": f"Bearer {tok['access_token']}"},
        )
        with urllib.request.urlopen(info_req, timeout=10) as resp:
            email = json.loads(resp.read().decode("utf-8")).get("email", "")
    except Exception:
        pass

    return {
        "access_token": tok.get("access_token", ""),
        "refresh_token": tok.get("refresh_token", ""),
        "scope": tok.get("scope", ""),
        "expires_at": int(time.time()) + int(tok.get("expires_in", 3600)) - 60,
        "email": email,
    }


def _refresh_gbp_token(refresh_plain: str) -> Dict[str, Any]:
    data = urllib.parse.urlencode({
        "refresh_token": refresh_plain,
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
        raise GbpConnectionError(f"GBP token refresh failed: {exc}") from exc


def _revoke_token(token: str) -> None:
    try:
        url = f"{GOOGLE_REVOKE_ENDPOINT}?token={urllib.parse.quote(token)}"
        req = urllib.request.Request(url, method="POST")
        req.add_header("Content-Type", "application/x-www-form-urlencoded")
        with urllib.request.urlopen(req, timeout=10):
            pass
    except Exception as exc:
        _log.warning("seo.local.gbp: revoke best-effort failed: %s", exc)


def _get_fresh_access_token(tenant_id: str, connection_id: str) -> str:
    """Return a non-expired access token for the GBP connection.

    Refreshes if near expiry; marks EXPIRED on failure.  Never returns the
    refresh token.
    """
    repo = get_gbp_connection_repository()
    result = repo.get(tenant_id, connection_id)
    if result is None:
        raise GbpConnectionError(f"GBP connection {connection_id} not found")

    _, conn = result
    now = int(time.time())
    expiry = 0
    try:
        expiry = int(conn.token_expiry) if conn.token_expiry else 0
    except (ValueError, TypeError):
        pass

    if conn.access_token_sealed and expiry > now + 60:
        return unseal(conn.access_token_sealed)

    if not conn.refresh_token_sealed:
        raise GbpConnectionError("No GBP refresh token — reconnect required")

    try:
        refresh_plain = unseal(conn.refresh_token_sealed)
    except ValueError as exc:
        repo.update(
            tenant_id, connection_id,
            status=GbpConnStatus.EXPIRED,
            last_error=f"Failed to unseal refresh token: {exc}",
        )
        raise GbpConnectionError(f"Could not unseal GBP refresh token: {exc}") from exc

    if not _is_live():
        try:
            return unseal(conn.access_token_sealed)
        except ValueError:
            return "mock_gbp_access_token"

    try:
        refreshed = _refresh_gbp_token(refresh_plain)
    except GbpConnectionError as exc:
        repo.update(
            tenant_id, connection_id,
            status=GbpConnStatus.EXPIRED,
            last_error=str(exc),
        )
        raise

    repo.update(
        tenant_id, connection_id,
        access_token_sealed=seal(refreshed["access_token"]),
        token_expiry=str(refreshed["expires_at"]),
        status=GbpConnStatus.CONNECTED,
        last_error="",
    )
    return refreshed["access_token"]


# ── Public API ─────────────────────────────────────────────────────────────────

def start_gbp_connect(tenant_id: str) -> Dict[str, Any]:
    """Begin GBP OAuth flow.  Returns auth_url + state for the frontend."""
    client_id = _client_id()
    if not client_id:
        raise GbpConnectionError("GOOGLE_CLIENT_ID is not set — GBP OAuth cannot be initiated")

    import secrets as _secrets
    nonce = _secrets.token_hex(16)
    issued_at = int(time.time())
    state = _encode_state(tenant_id, _GBP_STATE_KIND, nonce, issued_at)

    redirect_uri = _gbp_redirect_uri()
    scopes = _gbp_scopes()

    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": " ".join(scopes),
        "access_type": "offline",
        "prompt": "consent",
        "include_granted_scopes": "true",
        "state": state,
    }
    auth_url = GBP_AUTH_ENDPOINT + "?" + urllib.parse.urlencode(params)
    return {"auth_url": auth_url, "state": state}


def complete_gbp_connect(
    state: str,
    code: str,
    *,
    token_exchange_fn=None,
) -> Tuple[str, GbpConnection]:
    """Complete GBP OAuth callback: validate state, exchange code, seal, save.

    Raises OAuthStateError on bad/expired state.
    Raises GbpConnectionError on exchange failure.
    Raises SeoLimitExceeded when LIMIT_GBP_CONNECTIONS is hit.
    """
    tenant_id = validate_state(state)

    # Plan limit check
    repo = get_gbp_connection_repository()
    existing = [
        (cid, c) for cid, c in repo.list(tenant_id)
        if c.status != GbpConnStatus.REVOKED
    ]
    enforce_seo_limit(tenant_id, LIMIT_GBP_CONNECTIONS, len(existing))

    exchange = token_exchange_fn if token_exchange_fn is not None else _exchange_code_gbp
    tokens = exchange(code)

    access_token = tokens.get("access_token", "")
    refresh_token = tokens.get("refresh_token", "")
    scope_str = tokens.get("scope", "")
    expires_at = tokens.get("expires_at", 0)
    email = tokens.get("email", "")

    if not access_token:
        raise GbpConnectionError("No access_token in GBP exchange response")

    access_sealed = seal(access_token)
    refresh_sealed = seal(refresh_token) if refresh_token else ""
    scopes = [s.strip() for s in scope_str.split() if s.strip()]

    conn = GbpConnection(
        tenant_id=tenant_id,
        kind="gbp",
        account_email=email,
        status=GbpConnStatus.CONNECTED,
        scopes=scopes,
        access_token_sealed=access_sealed,
        refresh_token_sealed=refresh_sealed,
        token_expiry=str(expires_at),
    )
    conn_id, saved = repo.create(conn)
    return conn_id, saved


def list_gbp_accounts(
    tenant_id: str,
    connection_id: str,
    *,
    gbp_client: Optional[GbpClient] = None,
) -> List[Dict[str, Any]]:
    """List GBP accounts accessible via the connection."""
    access_token = _get_fresh_access_token(tenant_id, connection_id)
    client = gbp_client or get_gbp_client()
    return client.list_accounts(access_token)


def list_gbp_locations(
    tenant_id: str,
    connection_id: str,
    account_name: str,
    *,
    gbp_client: Optional[GbpClient] = None,
) -> List[Dict[str, Any]]:
    """List GBP locations for a given account."""
    access_token = _get_fresh_access_token(tenant_id, connection_id)
    client = gbp_client or get_gbp_client()
    return client.list_locations(access_token, account_name)


def map_gbp_location_to_pixie(
    tenant_id: str,
    connection_id: str,
    gbp_location_name: str,
    pixie_location_id: str,
    *,
    gbp_client: Optional[GbpClient] = None,
) -> Dict[str, Any]:
    """Verify ownership and link a GBP location to a Pixie location.

    Cross-workspace guard: the Pixie location MUST belong to this tenant.
    Raises GbpCrossWorkspaceError if the location_id belongs to another tenant.
    """
    loc_repo = get_location_repository()
    loc_result = loc_repo.get(tenant_id, pixie_location_id)
    if loc_result is None:
        raise GbpCrossWorkspaceError(
            f"Location {pixie_location_id!r} not found for tenant {tenant_id!r} — "
            "cross-workspace mapping is not allowed"
        )
    _, loc = loc_result
    if loc.tenant_id != tenant_id:
        raise GbpCrossWorkspaceError(
            f"Location {pixie_location_id!r} belongs to tenant {loc.tenant_id!r}"
        )

    # Fetch the GBP location to confirm we have access
    access_token = _get_fresh_access_token(tenant_id, connection_id)
    client = gbp_client or get_gbp_client()
    gbp_loc = client.get_location(access_token, gbp_location_name)

    # Update the Pixie location with the GBP location name
    loc_repo.update(tenant_id, pixie_location_id, gbp_location_id=gbp_location_name)

    # Update the connection with the linked account name
    account_name = "/".join(gbp_location_name.split("/")[:2])  # accounts/XXXXXXXX
    get_gbp_connection_repository().update(
        tenant_id, connection_id, gbp_account_name=account_name
    )

    return {
        "pixie_location_id": pixie_location_id,
        "gbp_location_name": gbp_location_name,
        "gbp_title": gbp_loc.get("title", ""),
        "mapped": True,
    }


def run_gbp_sync(
    tenant_id: str,
    connection_id: str,
    location_id: str,
    *,
    gbp_client: Optional[GbpClient] = None,
    is_mock: bool = True,
) -> Dict[str, Any]:
    """Sync GBP profile data for a location.

    Fetches: business name, categories, hours, phone, address, rating,
    review count.  Performance metrics (impressions, searches) are labelled
    as unavailable when the GBP API does not expose them via Business
    Information API (they were deprecated from basic queries — we note this
    honestly and never fabricate numbers).

    Meters record_gbp_sync.  Returns a summary dict.
    """
    loc_repo = get_location_repository()
    loc_result = loc_repo.get(tenant_id, location_id)
    if loc_result is None:
        raise GbpConnectionError(f"Location {location_id!r} not found")
    _, loc = loc_result

    gbp_location_name = loc.gbp_location_id
    if not gbp_location_name:
        raise GbpConnectionError(
            f"Location {location_id!r} has no GBP location ID — "
            "run map_gbp_location_to_pixie first"
        )

    access_token = _get_fresh_access_token(tenant_id, connection_id)
    client = gbp_client or get_gbp_client()

    try:
        gbp_data = client.get_location(access_token, gbp_location_name)
    except GbpError as exc:
        get_gbp_connection_repository().update(
            tenant_id, connection_id,
            status=GbpConnStatus.ERROR,
            last_error=str(exc),
        )
        raise GbpConnectionError(f"GBP sync failed: {exc}") from exc

    # Map GBP fields to our Location record (incremental update)
    address = gbp_data.get("storefrontAddress", {})
    address_lines = address.get("addressLines", [])
    phone_numbers = gbp_data.get("phoneNumbers", {})
    primary_phone = phone_numbers.get("primaryPhone", "")
    category = gbp_data.get("primaryCategory", {})
    primary_category = category.get("displayName", "")
    additional_cats = [
        c.get("displayName", "")
        for c in gbp_data.get("additionalCategories", [])
        if c.get("displayName")
    ]

    update_fields: Dict[str, Any] = {}
    if gbp_data.get("title"):
        update_fields["business_name"] = gbp_data["title"]
    if address_lines:
        update_fields["address_line1"] = address_lines[0]
    if len(address_lines) > 1:
        update_fields["address_line2"] = address_lines[1]
    if address.get("locality"):
        update_fields["city"] = address["locality"]
    if address.get("administrativeArea"):
        update_fields["region"] = address["administrativeArea"]
    if address.get("postalCode"):
        update_fields["postal_code"] = address["postalCode"]
    if address.get("regionCode"):
        update_fields["country"] = address["regionCode"]
    if primary_phone:
        update_fields["phone"] = primary_phone
    if gbp_data.get("websiteUri"):
        update_fields["website_url"] = gbp_data["websiteUri"]
    if primary_category:
        update_fields["primary_category"] = primary_category
    if additional_cats:
        update_fields["secondary_categories"] = additional_cats
    if gbp_data.get("regularHours"):
        update_fields["hours"] = gbp_data["regularHours"]

    if update_fields:
        loc_repo.update(tenant_id, location_id, **update_fields)

    ts = _now()
    get_gbp_connection_repository().update(
        tenant_id, connection_id,
        status=GbpConnStatus.CONNECTED,
        last_synced_at=ts,
        last_success_at=ts,
        last_error="",
    )

    job_id = _uid("gbpsync_")
    record_gbp_sync(tenant_id, job_id=job_id, is_mock=is_mock)

    # Performance metrics note: GBP Business Information API does not return
    # impression/search-count data.  The Insights API (deprecated 2022) had
    # that data; the replacement (Business Profile Performance API) requires
    # separate calls and credentials.  We label this honestly.
    return {
        "location_id": location_id,
        "gbp_location_name": gbp_location_name,
        "synced_at": ts,
        "fields_updated": list(update_fields.keys()),
        "rating": gbp_data.get("rating"),
        "review_count": gbp_data.get("reviewCount"),
        "performance_metrics": {
            "status": "unavailable",
            "reason": (
                "GBP Business Information API does not expose impression/search metrics. "
                "Use Business Profile Performance API separately if required."
            ),
        },
        "metered": True,
        "is_mock": is_mock,
    }


def disconnect_gbp(tenant_id: str, connection_id: str) -> Dict[str, Any]:
    """Revoke GBP tokens and mark the connection REVOKED."""
    repo = get_gbp_connection_repository()
    result = repo.get(tenant_id, connection_id)
    if result is None:
        raise GbpConnectionError(f"GBP connection {connection_id} not found")

    _, conn = result

    if _is_live():
        for sealed in [conn.access_token_sealed, conn.refresh_token_sealed]:
            if sealed:
                try:
                    _revoke_token(unseal(sealed))
                except Exception as exc:
                    _log.warning("seo.local.gbp: revoke best-effort failed: %s", exc)

    repo.update(
        tenant_id, connection_id,
        status=GbpConnStatus.REVOKED,
        access_token_sealed="",
        refresh_token_sealed="",
        last_error="",
    )
    return {"disconnected": connection_id, "status": "revoked"}


def list_connections(tenant_id: str) -> List[Tuple[str, GbpConnection]]:
    """List non-revoked GBP connections for a tenant."""
    repo = get_gbp_connection_repository()
    return [
        (cid, c) for cid, c in repo.list(tenant_id)
        if c.status != GbpConnStatus.REVOKED
    ]


def get_connection(
    tenant_id: str, connection_id: str
) -> Optional[Tuple[str, GbpConnection]]:
    return get_gbp_connection_repository().get(tenant_id, connection_id)


def refresh_connection(tenant_id: str, connection_id: str) -> Dict[str, Any]:
    """Force-refresh the GBP access token.  Returns the safe connection dict."""
    _get_fresh_access_token(tenant_id, connection_id)
    result = get_gbp_connection_repository().get(tenant_id, connection_id)
    if result is None:
        raise GbpConnectionError(f"GBP connection {connection_id} not found")
    cid, conn = result
    return _safe_connection_dict(cid, conn)
