"""Server-side provider-credential store — secrets NEVER leave here.

Higgsfield credentials are the SDK's ``key:secret`` string, supplied per mode:

* **client_own_account (BYOK)** — the customer pastes their own key/secret at
  ``/provider/connect``; we keep it here, process-local and tenant-scoped, and use
  it to bill THEIR Higgsfield account. Retrieved with :func:`get_tenant_credential`
  (per-tenant ONLY — it never falls back to the Pixie env key).
* **pixie_managed** — no client key is stored; the router uses the global env
  credential (``config.higgsfield_credential()``) directly.

Secrets are sealed at rest with Fernet (``cryptography`` installed and
``CONTENT_CREATOR_SECRET_KEY`` set) and stored as the SEALED blob only. Storage:

* durable (``PIXIE_PERSIST=file|supabase``) → the sealed value is written to the
  tenant-scoped ``cc_credentials`` table via the persistence seam, so BYOK keys
  survive restarts. Writing an UNSEALED secret to a durable store is refused
  (``CredentialEncryptionRequired``) — we never persist plaintext.
* in-memory (``PIXIE_PERSIST`` unset, dev/test) → process-local dict only; never
  written to disk, never returned to a caller, never logged.

Callers that reach an HTTP response use :func:`masked_hint` — a non-secret
fingerprint — never the raw credential.
"""

from __future__ import annotations

import hashlib
import os
from typing import Dict, Optional

import persistence

from content_creator import config

# tenant_id -> sealed "key:secret". Process-local fallback used ONLY when durable
# persistence is off (dev/test). Never persisted, never serialized, never logged.
_CREDENTIALS: Dict[str, str] = {}


class CredentialEncryptionRequired(RuntimeError):
    """Durable persistence is on but no encryption key/lib is available, so a BYOK
    secret cannot be sealed. We refuse to write plaintext to the database."""


def _cred_id(tenant_id: str) -> str:
    return "cccred_" + hashlib.sha1(tenant_id.encode("utf-8")).hexdigest()[:16]


def _repo():
    """Durable store for sealed BYOK credentials (envelope: data={"sealed": ...})."""
    return persistence.table("cc_credentials")


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
    """Store a per-tenant (client-own) Higgsfield credential (``key:secret``).

    Durable mode persists the SEALED blob only; if the secret can't be sealed
    (no ``cryptography`` / ``CONTENT_CREATOR_SECRET_KEY``) we refuse rather than
    write plaintext to the database."""
    credential = (credential or "").strip()
    if not (tenant_id and credential):
        return
    sealed = _seal(credential)
    if persistence.enabled():
        if not sealed.startswith("enc:"):
            raise CredentialEncryptionRequired(
                "Durable persistence is on but the BYOK credential could not be sealed. "
                "Set CONTENT_CREATOR_SECRET_KEY (and install `cryptography`) to store "
                "client keys, or use pixie_managed / prompt_export mode."
            )
        _repo().upsert(persistence.envelope(_cred_id(tenant_id), tenant_id, {"sealed": sealed}))
    else:
        _CREDENTIALS[tenant_id] = sealed


def clear_credential(tenant_id: str) -> None:
    _CREDENTIALS.pop(tenant_id, None)
    if persistence.enabled():
        _repo().delete(tenant_id, _cred_id(tenant_id))


def _stored_sealed(tenant_id: str) -> str:
    if persistence.enabled():
        row = _repo().get(tenant_id, _cred_id(tenant_id))
        return (row or {}).get("data", {}).get("sealed", "") if row else ""
    return _CREDENTIALS.get(tenant_id, "")


def get_tenant_credential(tenant_id: str) -> str:
    """The tenant's OWN stored credential, or ``""``. Never falls back to env —
    this is the client_own_account (BYOK) source and must stay tenant-isolated."""
    if not tenant_id:
        return ""
    return _unseal(_stored_sealed(tenant_id))


def has_tenant_credential(tenant_id: str) -> bool:
    return bool(tenant_id and _stored_sealed(tenant_id))


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
