"""Durable provider-event dedup + one-time signed OAuth state helpers.

Dedup
-----
``already_seen(provider, event_id)`` / ``mark_seen(provider, event_id)`` use
the persistence table ``integrations_webhook_events`` to record processed events
so replayed or redelivered webhooks are silently dropped.  Rows carry a TTL
(unix-epoch ``expires_at``) and already-expired entries are treated as unseen so
the table does not grow forever.  In the memory backend TTL is enforced inline;
in file/supabase backends the row persists but the query skips expired rows.

OAuth state
-----------
``issue_state(payload)`` creates a HMAC-SHA256-signed, expiring, opaque state
token.  ``consume_state(state)`` verifies the signature, checks expiry, and
records the state id in ``integrations_oauth_state_used`` to enforce ONE-TIME
use — a replayed callback is rejected with ``StateConsumedError`` even if the
token has not yet expired.

Secret resolution:
  AI_RECEPTIONIST_GOOGLE_STATE_SECRET → PIXIE_INTERNAL_API_SECRET (fallback)

Constant-time comparisons are used throughout; secrets are NEVER logged.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import time
import uuid
from typing import Any

import persistence

# ── Table names ───────────────────────────────────────────────────────────────
_EVENTS_TABLE = "integrations_webhook_events"
_STATE_USED_TABLE = "integrations_oauth_state_used"

# ── Repo singletons ───────────────────────────────────────────────────────────
# persistence.table() returns a fresh _MemoryRepo on every call in the memory
# backend, so mark_seen and already_seen would operate on different instances.
# Caching one repo per table name means all callers share the same in-process
# store.  File/Supabase backends read shared storage anyway, so caching is safe
# there too (they just won't hit the network on every call).

_REPOS: dict[str, persistence.Repo] = {}


def _repo(name: str) -> persistence.Repo:
    if name not in _REPOS:
        _REPOS[name] = persistence.table(name)
    return _REPOS[name]


def _reset_repos() -> None:
    """For test isolation — clear cached repo instances so each test starts fresh."""
    _REPOS.clear()

# ── Default TTLs ──────────────────────────────────────────────────────────────
_DEFAULT_EVENT_TTL = 86_400      # 24 h — long enough to catch Meta re-deliveries
_DEFAULT_STATE_TTL = 600         # 10 min — shorter window for OAuth round-trips


# ── Errors ────────────────────────────────────────────────────────────────────

class StateTamperedError(ValueError):
    """Raised when the OAuth state HMAC fails verification."""


class StateExpiredError(ValueError):
    """Raised when the OAuth state has passed its expiry time."""


class StateConsumedError(ValueError):
    """Raised when the OAuth state token has already been consumed (replay)."""


# ── Shared secret resolution ──────────────────────────────────────────────────

def _state_secret() -> str:
    """Return the HMAC secret for OAuth state tokens.

    Reads AI_RECEPTIONIST_GOOGLE_STATE_SECRET first; falls back to
    PIXIE_INTERNAL_API_SECRET.  Never logs the value.
    """
    for env in ("AI_RECEPTIONIST_GOOGLE_STATE_SECRET", "PIXIE_INTERNAL_API_SECRET"):
        val = os.getenv(env, "").strip()
        if val:
            return val
    return ""


# ── Dedup helpers ─────────────────────────────────────────────────────────────

def _event_row_id(provider: str, event_id: str) -> str:
    """Stable, URL-safe row id from (provider, event_id)."""
    # sha256 keeps id length bounded even if event_id is long
    raw = f"{provider}:{event_id}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:48]


def already_seen(provider: str, event_id: str) -> bool:
    """Return True if this (provider, event_id) pair has been processed before.

    Expired rows are treated as unseen so old event ids can be re-processed
    after the TTL window (extremely rare in practice — Meta re-delivers within
    seconds, not days).
    """
    repo = _repo(_EVENTS_TABLE)
    row_id = _event_row_id(provider, event_id)
    # Tenant-less events use the provider name as a namespace.
    row = repo.get(provider, row_id)
    if row is None:
        return False
    data = row.get("data") or {}
    expires_at = data.get("expires_at", 0)
    return time.time() < expires_at


def mark_seen(provider: str, event_id: str, ttl_seconds: int = _DEFAULT_EVENT_TTL) -> None:
    """Record that this (provider, event_id) has been processed.

    Overwrites an existing entry so TTL resets on the rare case of a same-id
    legitimate re-delivery after the original TTL expired.
    """
    repo = _repo(_EVENTS_TABLE)
    row_id = _event_row_id(provider, event_id)
    now = time.time()
    repo.upsert(persistence.envelope(
        row_id=row_id,
        tenant_id=provider,   # provider name as namespace
        data={
            "provider": provider,
            "event_id": event_id,
            "expires_at": now + ttl_seconds,
        },
    ))


# ── OAuth state helpers ───────────────────────────────────────────────────────

def _sign(data: str, secret: str) -> str:
    """Return the HMAC-SHA256 hex digest of data under secret."""
    return hmac.new(secret.encode("utf-8"), data.encode("utf-8"), hashlib.sha256).hexdigest()


def issue_state(payload: dict, ttl_seconds: int = _DEFAULT_STATE_TTL) -> str:
    """Create a signed, expiring OAuth state token.

    Format (URL-safe base64 is NOT used — the value is passed as an OAuth
    ``state`` query parameter which is %-encoded by the redirect anyway):

        <state_id>.<expires_at_int>.<payload_json_hex>.<hmac_hex>

    The HMAC covers ``state_id + "." + expires_at + "." + payload_json_hex``
    so tampering with ANY component invalidates the signature.
    Raises ``RuntimeError`` when no secret is configured.
    """
    secret = _state_secret()
    if not secret:
        raise RuntimeError(
            "OAuth state signing secret is not configured.  "
            "Set AI_RECEPTIONIST_GOOGLE_STATE_SECRET (or PIXIE_INTERNAL_API_SECRET "
            "as a fallback) in the backend environment."
        )
    state_id = uuid.uuid4().hex
    expires_at = int(time.time()) + ttl_seconds
    payload_hex = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8").hex()

    signed_data = f"{state_id}.{expires_at}.{payload_hex}"
    sig = _sign(signed_data, secret)
    return f"{state_id}.{expires_at}.{payload_hex}.{sig}"


def consume_state(state: str, _now: float | None = None) -> dict:
    """Verify and consume a state token issued by ``issue_state``.

    Verifies:
      1. Format (4 dot-separated parts)
      2. HMAC signature (constant-time) — raises ``StateTamperedError``
      3. Expiry — raises ``StateExpiredError``
      4. Not already consumed — raises ``StateConsumedError``

    On success, records the state_id in ``integrations_oauth_state_used``
    so the same token cannot be replayed.  Returns the original payload dict.
    Secrets are NEVER logged.
    """
    secret = _state_secret()
    if not secret:
        raise RuntimeError(
            "OAuth state signing secret is not configured — cannot verify state."
        )

    parts = state.split(".")
    if len(parts) != 4:
        raise StateTamperedError("OAuth state token has wrong format")

    state_id, expires_at_str, payload_hex, provided_sig = parts

    # 1. Verify signature — constant-time
    signed_data = f"{state_id}.{expires_at_str}.{payload_hex}"
    expected_sig = _sign(signed_data, secret)
    if not hmac.compare_digest(expected_sig, provided_sig):
        raise StateTamperedError("OAuth state token signature is invalid")

    # 2. Check expiry (after signature so we don't leak timing on bad sigs)
    now = _now if _now is not None else time.time()
    try:
        expires_at = int(expires_at_str)
    except ValueError as exc:
        raise StateTamperedError("OAuth state token has invalid expiry field") from exc
    if now >= expires_at:
        raise StateExpiredError("OAuth state token has expired")

    # 3. One-time check — look up in the used-states table
    used_repo = _repo(_STATE_USED_TABLE)
    existing = used_repo.get("_global", state_id)
    if existing is not None:
        raise StateConsumedError("OAuth state token has already been consumed (replay)")

    # Mark as used BEFORE returning so a concurrent request loses the race
    used_repo.upsert(persistence.envelope(
        row_id=state_id,
        tenant_id="_global",
        data={"state_id": state_id, "consumed_at": now},
    ))

    # 4. Decode payload
    try:
        payload_json = bytes.fromhex(payload_hex).decode("utf-8")
        return json.loads(payload_json)
    except Exception as exc:
        raise StateTamperedError("OAuth state token payload cannot be decoded") from exc
