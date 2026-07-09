"""Server-side provider-credential store — secrets NEVER leave here.

Higgsfield credentials are the SDK's ``key:secret`` string, supplied per mode:

* **client_own_account (BYOK)** — the customer pastes their own key/secret at
  ``/provider/connect``; we keep it here, process-local and tenant-scoped, and use
  it to bill THEIR Higgsfield account. Retrieved with :func:`get_tenant_credential`
  (per-tenant ONLY — it never falls back to the Pixie env key).
* **pixie_managed** — no client key is stored; the router uses the global env
  credential (``config.higgsfield_credential()``) directly.

Secrets are sealed at rest with Fernet WHEN available (``cryptography`` installed
and ``CONTENT_CREATOR_SECRET_KEY`` set); otherwise they live only in process
memory (never written to disk, never returned to a caller, never logged). Callers
that reach an HTTP response use :func:`masked_hint` — a non-secret fingerprint.
"""

from __future__ import annotations

import os
from typing import Dict, Optional

from content_creator import config

# tenant_id -> sealed "key:secret". Process-local; not persisted, never serialized.
_CREDENTIALS: Dict[str, str] = {}


# --------------------------------------------------------------------------- #
# Optional encryption-at-rest (inert without cryptography + a key)
# --------------------------------------------------------------------------- #
def _fernet():
    key = os.getenv("CONTENT_CREATOR_SECRET_KEY", "").strip()
    if not key:
        return None
    try:
        from cryptography.fernet import Fernet

        return Fernet(key.encode("utf-8"))
    except Exception:
        return None  # missing lib / bad key → fall back to in-memory (never crash)


def _seal(raw: str) -> str:
    f = _fernet()
    if not f or not raw:
        return raw
    try:
        return "enc:" + f.encrypt(raw.encode("utf-8")).decode("utf-8")
    except Exception:
        return raw


def _unseal(stored: str) -> str:
    if not stored or not stored.startswith("enc:"):
        return stored
    f = _fernet()
    if not f:
        return ""  # sealed but no key available now → refuse rather than leak/guess
    try:
        return f.decrypt(stored[4:].encode("utf-8")).decode("utf-8")
    except Exception:
        return ""


# --------------------------------------------------------------------------- #
# API
# --------------------------------------------------------------------------- #
def set_credential(tenant_id: str, credential: str) -> None:
    """Store a per-tenant (client-own) Higgsfield credential (``key:secret``)."""
    credential = (credential or "").strip()
    if tenant_id and credential:
        _CREDENTIALS[tenant_id] = _seal(credential)


def clear_credential(tenant_id: str) -> None:
    _CREDENTIALS.pop(tenant_id, None)


def get_tenant_credential(tenant_id: str) -> str:
    """The tenant's OWN stored credential, or ``""``. Never falls back to env —
    this is the client_own_account (BYOK) source and must stay tenant-isolated."""
    if not tenant_id:
        return ""
    return _unseal(_CREDENTIALS.get(tenant_id, ""))


def has_tenant_credential(tenant_id: str) -> bool:
    return bool(tenant_id and _CREDENTIALS.get(tenant_id))


def get_credential(tenant_id: str = "") -> str:
    """Generic resolver: per-tenant credential if present, else the Pixie env key.
    (Used by the mock-friendly base factory; the router resolves per-mode explicitly.)"""
    tenant = get_tenant_credential(tenant_id)
    if tenant:
        return tenant
    return config.higgsfield_credential()


def masked_hint(credential: str) -> str:
    """Non-secret fingerprint of a credential, safe to return/store. ``""`` stays ``""``."""
    credential = (credential or "").strip()
    if not credential:
        return ""
    key = credential.split(":", 1)[0]
    tail = key[-4:] if len(key) >= 4 else key
    return "hf_…" + tail
