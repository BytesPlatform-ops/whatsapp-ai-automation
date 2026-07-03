"""Connection registry — which tenants have which real tools connected.

Holds OAuth connection descriptors (Google tokens etc.) keyed by
(tenant_id, capability). Persisted to a gitignored JSON file so a connected
Gmail survives a server restart. `find_active_connection` returns None until a
real connection is registered, so real mode fails closed with 'missing_connection'.

Backward compatible: register_connection / find_active_connection / clear_connections
keep their original signatures (used by tests + the integration router).
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Optional

# (tenant_id, capability) -> connection descriptor (may hold tokens)
_CONNECTIONS: dict[tuple[str, str], dict] = {}

_STORE_PATH = Path(__file__).resolve().parent.parent / ".integrations_store.json"


def _load() -> None:
    if not _STORE_PATH.exists():
        return
    try:
        rows = json.loads(_STORE_PATH.read_text(encoding="utf-8"))
        for row in rows:
            _CONNECTIONS[(row["tenant_id"], row["capability"])] = row["descriptor"]
    except (ValueError, KeyError, OSError):
        pass  # a corrupt store must never crash boot


def persist() -> None:
    """Write the current connections to disk (best-effort)."""
    rows = [
        {"tenant_id": t, "capability": c, "descriptor": d}
        for (t, c), d in _CONNECTIONS.items()
    ]
    try:
        _STORE_PATH.write_text(json.dumps(rows, indent=2), encoding="utf-8")
        os.chmod(_STORE_PATH, 0o600)  # tokens inside — owner-only
    except OSError:
        pass


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
