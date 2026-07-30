"""CRM marketplace connection lifecycle + capability discovery (Parts 3-6/14).

Reuses the existing encrypted connection store (one capability key per provider,
``crm_<provider>``) and OAuth-state signing pattern. Defaults are safe: after
connecting, sync is import-only, external writes are OFF, bidirectional is OFF and
sync is paused until the operator configures objects. Credentials are sealed at
rest and unsealed only inside the adapter.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
from typing import Optional

from .ids import new_id, now_iso


def marketplace_enabled() -> bool:
    return os.environ.get("AI_RECEPTIONIST_CRM_MARKETPLACE_ENABLED", "").strip().lower() in ("1", "true", "yes", "on")


def external_write_enabled() -> bool:
    return os.environ.get("AI_RECEPTIONIST_CRM_EXTERNAL_WRITE_ENABLED", "").strip().lower() in ("1", "true", "yes", "on")


def bidirectional_enabled() -> bool:
    return os.environ.get("AI_RECEPTIONIST_CRM_BIDIRECTIONAL_ENABLED", "").strip().lower() in ("1", "true", "yes", "on")


def destructive_sync_enabled() -> bool:
    return os.environ.get("AI_RECEPTIONIST_CRM_DESTRUCTIVE_SYNC_ENABLED", "").strip().lower() in ("1", "true", "yes", "on")


def policy_version() -> str:
    return os.environ.get("AI_RECEPTIONIST_CRM_POLICY_VERSION", "crm-policy-1") or "crm-policy-1"


def _state_secret() -> str:
    return (os.environ.get("AI_RECEPTIONIST_CRM_STATE_SECRET", "")
            or os.environ.get("AI_RECEPTIONIST_GOOGLE_STATE_SECRET", "") or "dev-crm-state-secret")


def _audit(tenant_id: str, provider: str, action: str, detail: Optional[dict] = None) -> None:
    from . import stores
    stores.crm_audit().put(tenant_id, {
        "id": new_id("crmaud"), "tenant_id": tenant_id, "provider": provider, "action": action,
        "detail": detail or {}, "created_at": now_iso()})


# ── OAuth state (signed, expiring, single-use) ────────────────────────────────

def oauth_start(tenant_id: str, provider: str) -> dict:
    payload = {"t": tenant_id, "p": provider, "n": new_id("st")}
    raw = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode()
    sig = hmac.new(_state_secret().encode(), raw.encode(), hashlib.sha256).hexdigest()
    return {"state": f"{raw}.{sig}", "provider": provider}


def verify_oauth_state(state: str) -> Optional[dict]:
    try:
        raw, sig = state.rsplit(".", 1)
    except ValueError:
        return None
    expected = hmac.new(_state_secret().encode(), raw.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, sig):
        return None
    # single-use enforcement via the durable webhook-event dedup store
    from integrations import webhook_events
    try:
        payload = json.loads(base64.urlsafe_b64decode(raw.encode()).decode())
    except (ValueError, TypeError):
        return None
    nonce = payload.get("n", "")
    if nonce and webhook_events.already_seen("crm_oauth", nonce):
        return None
    if nonce:
        webhook_events.mark_seen("crm_oauth", nonce)
    return {"tenant_id": payload.get("t", ""), "provider": payload.get("p", "")}


# ── connection lifecycle ──────────────────────────────────────────────────────

def _base(tenant_id: str, provider: str) -> dict:
    from integrations import connections
    from ..providers.crm import cap_key
    return dict(connections.find_active_connection_unsealed(tenant_id, cap_key(provider)) or {"status": "active"})


def _save(tenant_id: str, provider: str, descriptor: dict) -> None:
    from integrations import connections
    from ..providers.crm import cap_key
    connections.register_many(tenant_id, [cap_key(provider)], descriptor)


def connect(tenant_id: str, provider: str, *, access_token: str = "", refresh_token: str = "",
            api_key: str = "", account_id: str = "", base_url: str = "") -> dict:
    """Validate account ownership, persist sealed credentials, discover capabilities.
    Safe defaults: import-only, writes OFF, sync paused."""
    from ..providers.crm import get_adapter, CRMError
    if provider not in _known_providers():
        return {"status": "failed", "reason": "unknown_provider"}
    base = _base(tenant_id, provider)
    base.update({"provider": provider, "status": "active", "access_token": access_token,
                 "refresh_token": refresh_token, "api_key": api_key, "account_id": account_id,
                 "base_url": base_url, "write_enabled": False, "sync_direction": "import_only",
                 "sync_paused": True, "objects": base.get("objects") or []})
    _save(tenant_id, provider, base)
    adapter = get_adapter(provider)
    try:
        acct = adapter.get_account(tenant_id)
        caps = adapter.get_capabilities(tenant_id)
    except CRMError as exc:
        return {"status": "failed", "reason": exc.category}
    base = _base(tenant_id, provider)
    base.update({"account_id": acct.get("account_id", account_id), "account_name": acct.get("name", ""),
                 "capabilities": caps, "connected_at": now_iso()})
    _save(tenant_id, provider, base)
    from . import stores
    stores.crm_capabilities().put(tenant_id, {
        "id": f"crmcap::{tenant_id}::{provider}", "tenant_id": tenant_id, "provider": provider,
        "capabilities": caps, "discovered_at": now_iso()})
    _audit(tenant_id, provider, "connected", {"account": acct.get("account_id", "")})
    return {"status": "connected", "account_id": acct.get("account_id", ""), "capabilities": caps}


def discover_capabilities(tenant_id: str, provider: str) -> dict:
    from ..providers.crm import get_adapter, CRMError
    try:
        caps = get_adapter(provider).get_capabilities(tenant_id)
    except CRMError as exc:
        return {"status": "failed", "reason": exc.category}
    base = _base(tenant_id, provider)
    base["capabilities"] = caps
    _save(tenant_id, provider, base)
    return {"status": "ok", "capabilities": caps}


def set_objects(tenant_id: str, provider: str, objects: list) -> dict:
    base = _base(tenant_id, provider)
    base["objects"] = objects
    base["sync_paused"] = False
    _save(tenant_id, provider, base)
    _audit(tenant_id, provider, "objects_configured", {"objects": objects})
    return {"status": "ok", "objects": objects}


def set_sync_direction(tenant_id: str, provider: str, direction: str) -> dict:
    if direction not in ("disabled", "import_only", "export_only", "bidirectional"):
        return {"status": "failed", "reason": "invalid_direction"}
    if direction in ("export_only", "bidirectional") and not bidirectional_enabled():
        return {"status": "blocked", "reason": "bidirectional_disabled"}
    base = _base(tenant_id, provider)
    base["sync_direction"] = direction
    base["write_enabled"] = direction in ("export_only", "bidirectional") and external_write_enabled()
    _save(tenant_id, provider, base)
    _audit(tenant_id, provider, "sync_direction_changed", {"direction": direction})
    return {"status": "ok", "direction": direction, "write_enabled": base["write_enabled"]}


def pause(tenant_id: str, provider: str) -> dict:
    base = _base(tenant_id, provider); base["sync_paused"] = True; _save(tenant_id, provider, base)
    _audit(tenant_id, provider, "paused")
    return {"status": "paused"}


def resume(tenant_id: str, provider: str) -> dict:
    base = _base(tenant_id, provider); base["sync_paused"] = False; _save(tenant_id, provider, base)
    _audit(tenant_id, provider, "resumed")
    return {"status": "resumed"}


def disconnect(tenant_id: str, provider: str) -> dict:
    """Stop future sync without deleting historical mappings."""
    from integrations import connections
    from ..providers.crm import cap_key
    connections.disconnect(tenant_id, [cap_key(provider)])
    _audit(tenant_id, provider, "disconnected")
    return {"status": "disconnected"}


def status(tenant_id: str, provider: str) -> dict:
    from ..providers.crm import get_adapter
    return get_adapter(provider).validate_connection(tenant_id)


def list_connections(tenant_id: str) -> list[dict]:
    out = []
    for provider in _known_providers():
        v = status(tenant_id, provider)
        if v.get("connected"):
            out.append(v)
    return out


def find_tenant_by_crm_account(provider: str, account_id: str):
    """Resolve the workspace that owns a CRM account (server-side, for webhooks)."""
    from integrations import connections
    from ..providers.crm import cap_key
    key = cap_key(provider)
    for (t, c), descriptor in connections._CONNECTIONS.items():  # noqa: SLF001 (module-internal, read-only)
        if c != key:
            continue
        d = connections.unseal_descriptor(descriptor)
        if str(d.get("account_id", "")) == str(account_id):
            return t
    return None


def _known_providers():
    from ..providers.crm import PROVIDERS
    return PROVIDERS
