"""Connection registry — which tenants have which real tools connected.

Holds OAuth connection descriptors (Google/Meta tokens) keyed by
(tenant_id, capability). Persisted through the shared persistence layer, so in
`PIXIE_PERSIST=supabase` mode tokens live in Postgres (pixie_kv, service-role
only — never exposed to the frontend) and survive across instances; in `file`
mode they survive a restart; in tests they stay in-memory. `find_active_connection`
returns None until a real connection is registered, so real mode fails closed.

Backward compatible: register_connection / find_active_connection / clear_connections
keep their original signatures (used by tests + the integration router).

Token sealing
-------------
Sensitive fields (access_token, refresh_token, user_token, page_access_token, …)
are sealed via `token_crypto.seal_descriptor` before being stored or persisted.
Callers that need the plaintext token for a real API call must use
`find_active_connection_unsealed`. `find_active_connection` returns the stored
(sealed) descriptor — suitable for status checks, capability listings, and any
code path that doesn't need the raw token. Status/health paths must never
unseal descriptors.
"""

from __future__ import annotations

from typing import Optional

import persistence
from integrations.token_crypto import seal_descriptor, unseal_descriptor

_KV_NAME = "integrations_connections"

# (tenant_id, capability) -> connection descriptor (sensitive fields sealed at rest)
_CONNECTIONS: dict[tuple[str, str], dict] = {}


def _load() -> None:
    for row in persistence.load(_KV_NAME, []) or []:
        try:
            _CONNECTIONS[(row["tenant_id"], row["capability"])] = row["descriptor"]
        except (KeyError, TypeError):
            continue  # a corrupt row must never crash boot
    # Note: descriptors stay sealed at rest on load. They are unsealed on demand
    # by find_active_connection_unsealed. Legacy plaintext fields are sealed on the
    # next register_connection call (upgrade-on-write, not bulk-rewrite on load).


def persist() -> None:
    """Persist the current connections through the backend (memory/file/supabase)."""
    persistence.save(_KV_NAME, [
        {"tenant_id": t, "capability": c, "descriptor": d}
        for (t, c), d in _CONNECTIONS.items()
    ])


def register_connection(tenant_id: str, capability: str, descriptor: Optional[dict] = None) -> None:
    """Store a connection descriptor, sealing sensitive fields before persisting."""
    raw = descriptor or {"status": "active"}
    _CONNECTIONS[(tenant_id, capability)] = seal_descriptor(raw)
    persist()


def register_many(tenant_id: str, capabilities: list[str], descriptor: dict) -> None:
    """Register one connection (e.g. a Google account) for several capabilities.

    The descriptor is sealed once and the same sealed copy is stored for every
    capability, so the plaintext token is not kept in memory longer than necessary.
    """
    sealed = seal_descriptor(descriptor)
    for cap in capabilities:
        _CONNECTIONS[(tenant_id, cap)] = sealed
    persist()


def find_active_connection(tenant_id: str, capability: str) -> Optional[dict]:
    """Return the stored (sealed) descriptor for status checks.

    Does NOT unseal sensitive fields — use find_active_connection_unsealed for
    code paths that need the real token value.
    """
    return _CONNECTIONS.get((tenant_id, capability))


def find_active_connection_unsealed(tenant_id: str, capability: str) -> Optional[dict]:
    """Return the descriptor with sensitive fields unsealed (plaintext tokens).

    Use this wherever the caller needs a real access_token / refresh_token /
    page_access_token for an API call. Implements upgrade-on-read for legacy
    plaintext descriptors stored before sealing was introduced.
    """
    descriptor = _CONNECTIONS.get((tenant_id, capability))
    if descriptor is None:
        return None
    return unseal_descriptor(descriptor)


def disconnect(tenant_id: str, capabilities: Optional[list[str]] = None) -> None:
    """Remove a tenant's connections (all, or a specific set of capabilities)."""
    for (t, c) in list(_CONNECTIONS.keys()):
        if t == tenant_id and (capabilities is None or c in capabilities):
            del _CONNECTIONS[(t, c)]
    persist()


def connected_capabilities(tenant_id: str) -> list[str]:
    """Return the list of capability names for a tenant. Never exposes tokens."""
    return [c for (t, c) in _CONNECTIONS if t == tenant_id]


def clear_connections() -> None:
    _CONNECTIONS.clear()
    persist()


_load()
