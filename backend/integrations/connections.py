"""Connection registry — which tenants have which real tools connected.

Holds OAuth connection descriptors (Google/Meta tokens) keyed by
(tenant_id, capability). Persisted through the shared persistence layer, so in
`PIXIE_PERSIST=supabase` mode tokens live in Postgres (pixie_kv, service-role
only — never exposed to the frontend) and survive across instances; in `file`
mode they survive a restart; in tests they stay in-memory. `find_active_connection`
returns None until a real connection is registered, so real mode fails closed.

Backward compatible: register_connection / find_active_connection / clear_connections
keep their original signatures (used by tests + the integration router).
"""

from __future__ import annotations

from typing import Optional

import persistence

_KV_NAME = "integrations_connections"

# (tenant_id, capability) -> connection descriptor (may hold tokens)
_CONNECTIONS: dict[tuple[str, str], dict] = {}


def _load() -> None:
    for row in persistence.load(_KV_NAME, []) or []:
        try:
            _CONNECTIONS[(row["tenant_id"], row["capability"])] = row["descriptor"]
        except (KeyError, TypeError):
            continue  # a corrupt row must never crash boot


def persist() -> None:
    """Persist the current connections through the backend (memory/file/supabase)."""
    persistence.save(_KV_NAME, [
        {"tenant_id": t, "capability": c, "descriptor": d}
        for (t, c), d in _CONNECTIONS.items()
    ])


def register_connection(tenant_id: str, capability: str, descriptor: Optional[dict] = None) -> None:
    _CONNECTIONS[(tenant_id, capability)] = descriptor or {"status": "active"}
    persist()


def register_many(tenant_id: str, capabilities: list[str], descriptor: dict) -> None:
    """Register one connection (e.g. a Google account) for several capabilities."""
    for cap in capabilities:
        _CONNECTIONS[(tenant_id, cap)] = descriptor
    persist()


def find_active_connection(tenant_id: str, capability: str) -> Optional[dict]:
    return _CONNECTIONS.get((tenant_id, capability))


def disconnect(tenant_id: str, capabilities: Optional[list[str]] = None) -> None:
    """Remove a tenant's connections (all, or a specific set of capabilities)."""
    for (t, c) in list(_CONNECTIONS.keys()):
        if t == tenant_id and (capabilities is None or c in capabilities):
            del _CONNECTIONS[(t, c)]
    persist()


def connected_capabilities(tenant_id: str) -> list[str]:
    return [c for (t, c) in _CONNECTIONS if t == tenant_id]


def clear_connections() -> None:
    _CONNECTIONS.clear()
    persist()


_load()
