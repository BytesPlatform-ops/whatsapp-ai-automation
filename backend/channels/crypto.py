"""Token vault — the encryption SEAM for per-tenant channel credentials.

Channel credentials and the PixieContact value are NEVER stored or logged in
plaintext. Callers `put()` a secret and get back an opaque `ref`; only `get(ref)`
(used by an adapter at send time) returns the secret. Everything else passes the
ref around.

Wave 1 ships a deterministic, process-local MOCK vault so the layer runs with no
infra. It is NOT real cryptography — it base64-obfuscates and keeps values in
memory. A real implementation (Fernet via `cryptography`, or a KMS/Supabase Vault)
drops in behind the SAME `put`/`get`/`mask` surface once the dependency is
approved. The mock is clearly labelled so it is never mistaken for secure storage.
"""

from __future__ import annotations

import base64
import hashlib
from typing import Dict, Optional


def mask(value: str) -> str:
    """A display-safe masked form, e.g. 'a***@x.com' / '+1*****89'. Safe to log."""
    if not value:
        return ""
    if "@" in value:  # email
        name, _, domain = value.partition("@")
        head = name[:1]
        return f"{head}***@{domain}"
    if len(value) <= 4:
        return "*" * len(value)
    return value[:2] + "*" * (len(value) - 4) + value[-2:]


class MockTokenVault:
    """Process-local, NOT-SECURE token store. Tenant-scoped refs.

    `put` returns a stable ref derived from (tenant, name) so re-putting the same
    logical secret updates in place. The stored blob is base64 (obfuscation only).
    """

    def __init__(self) -> None:
        self._blobs: Dict[str, bytes] = {}  # ref -> obfuscated bytes

    def _ref(self, tenant_id: str, name: str) -> str:
        digest = hashlib.sha256(f"{tenant_id}|{name}".encode()).hexdigest()[:24]
        return f"vault_{digest}"

    def put(self, tenant_id: str, name: str, secret: str) -> str:
        ref = self._ref(tenant_id, name)
        self._blobs[ref] = base64.b64encode(secret.encode("utf-8"))  # MOCK obfuscation
        return ref

    def get(self, ref: Optional[str]) -> Optional[str]:
        if not ref or ref not in self._blobs:
            return None
        return base64.b64decode(self._blobs[ref]).decode("utf-8")

    def exists(self, ref: Optional[str]) -> bool:
        return bool(ref) and ref in self._blobs

    def __repr__(self) -> str:  # never leak contents in logs/tracebacks
        return f"<MockTokenVault refs={len(self._blobs)}>"


_vault: Optional[MockTokenVault] = None


def get_vault() -> MockTokenVault:
    global _vault
    if _vault is None:
        _vault = MockTokenVault()
    return _vault
