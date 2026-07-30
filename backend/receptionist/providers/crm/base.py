"""Generic CRM provider adapter for the AI Receptionist marketplace (Wave 18).

ONE typed, replaceable interface (:class:`CRMProviderAdapter`) that every provider
(GoHighLevel, HubSpot, Salesforce, Pipedrive, Zoho) implements behind its own typed
adapter + injectable transport. Provider-specific object names / API versions stay
inside each adapter; the canonical sync layer only ever sees NORMALISED records.

Reuses the existing encrypted connection store (one capability key per provider,
e.g. ``crm_hubspot``). Credentials are unsealed only inside the adapter and never
logged. Hermetic by default: each provider ships a mock transport; live HTTP is a
separate transport that is NOT wired in this phase (external writes disabled).
"""

from __future__ import annotations

import os
from typing import Optional

# Canonical object types the marketplace maps into Pixie entities.
OBJECT_TYPES = ("contact", "company", "lead", "deal", "pipeline", "stage", "owner",
                "task", "note", "activity")

# Capability vocabulary (Part 6) — a provider/account may support any subset.
CAPABILITIES = (
    "contacts_read", "contacts_write", "companies_read", "companies_write",
    "leads_read", "leads_write", "deals_read", "deals_write", "pipelines_read",
    "stages_write", "owners_read", "tasks_read", "tasks_write", "notes_read",
    "notes_write", "activities_read", "activities_write", "custom_fields_read",
    "custom_fields_write", "webhooks", "incremental_sync", "archive_delete",
    "campaign_audience", "booking_activity",
)


class CRMError(Exception):
    """Typed, non-leaky failure. ``category`` is a fixed-vocabulary string."""

    CATEGORIES = {
        "not_connected", "credentials_invalid", "token_expired", "permission_missing",
        "unsupported_capability", "rate_limit", "quota", "not_found", "conflict",
        "invalid_record", "provider_error", "unknown_result", "account_ownership_failed",
    }

    def __init__(self, category: str, detail: str = "", *, retryable: bool = False) -> None:
        super().__init__(category)
        self.category = category if category in self.CATEGORIES else "provider_error"
        self.detail = detail
        self.retryable = retryable or category in ("rate_limit", "provider_error", "token_expired")


def batch_size(kind: str = "import") -> int:
    key = ("AI_RECEPTIONIST_CRM_INITIAL_IMPORT_BATCH_SIZE" if kind == "import"
           else "AI_RECEPTIONIST_CRM_INCREMENTAL_BATCH_SIZE")
    try:
        return int(os.environ.get(key, "") or (100 if kind == "import" else 50))
    except ValueError:
        return 100 if kind == "import" else 50


class CRMTransport:
    """Abstract provider transport. Real impls call the provider REST API; the
    per-provider mock returns fixtures. All methods return raw provider dicts which
    the adapter normalises."""

    def get_account(self, creds: dict) -> dict: raise NotImplementedError
    def discover_capabilities(self, creds: dict) -> dict: raise NotImplementedError
    def list_objects(self, creds: dict, object_type: str, cursor: str) -> dict: raise NotImplementedError
    def get_object(self, creds: dict, object_type: str, record_id: str) -> dict: raise NotImplementedError
    def create_object(self, creds: dict, object_type: str, payload: dict) -> dict: raise NotImplementedError
    def update_object(self, creds: dict, object_type: str, record_id: str, payload: dict) -> dict: raise NotImplementedError
    def list_custom_fields(self, creds: dict, object_type: str) -> dict: raise NotImplementedError
    def list_pipelines(self, creds: dict) -> dict: raise NotImplementedError
    def fetch_changes(self, creds: dict, cursor: str) -> dict: raise NotImplementedError
    def register_webhook(self, creds: dict, url: str, secret: str) -> dict: raise NotImplementedError


class CRMProviderAdapter:
    """Base adapter. Subclasses set ``PROVIDER``, ``CAP_KEY``, ``DEFAULT_CAPS`` and a
    ``_mock_transport()``; the shared normalisation lives here."""

    PROVIDER = "generic"
    CAP_KEY = "crm_generic"
    DEFAULT_CAPS: tuple = ()
    # provider object name → canonical object type (subclasses override)
    OBJECT_MAP: dict = {}

    def __init__(self, transport: Optional[CRMTransport] = None) -> None:
        self._transport = transport

    # ── injectable transport ──────────────────────────────────────────────────
    def transport(self) -> CRMTransport:
        return self._transport if self._transport is not None else self._mock_transport()

    def _mock_transport(self) -> CRMTransport:  # pragma: no cover - overridden
        raise NotImplementedError

    # ── connection + credentials ──────────────────────────────────────────────
    def _connection(self, tenant_id: str) -> dict:
        from integrations.connections import find_active_connection_unsealed
        conn = find_active_connection_unsealed(tenant_id, self.CAP_KEY)
        if conn is None:
            raise CRMError("not_connected", f"no {self.PROVIDER} connection")
        if conn.get("status") == "disconnected":
            raise CRMError("not_connected", "connection disconnected")
        if conn.get("status") == "needs_reconnect":
            raise CRMError("credentials_invalid", "connection needs reconnect")
        return conn

    def _creds(self, conn: dict) -> dict:
        tok = conn.get("access_token") or conn.get("api_key", "")
        if not tok:
            raise CRMError("credentials_invalid", "no credentials — reconnect")
        return {"access_token": conn.get("access_token", ""), "api_key": conn.get("api_key", ""),
                "account_id": conn.get("account_id", ""), "base_url": conn.get("base_url", "")}

    def _require(self, conn: dict, capability: str) -> None:
        caps = set((conn.get("capabilities") or self.DEFAULT_CAPS))
        if capability not in caps:
            raise CRMError("unsupported_capability", f"{self.PROVIDER} missing {capability}")

    # ── normalisation ─────────────────────────────────────────────────────────
    def normalise_record(self, object_type: str, raw: dict) -> dict:
        """Provider-neutral normalised record. Raw provider fields live under
        ``custom_fields``; internal secrets are never mapped."""
        return {
            "provider": self.PROVIDER, "object_type": object_type,
            "record_id": str(raw.get("id", "") or raw.get("record_id", "")),
            "version": str(raw.get("version", "") or raw.get("updatedAt", "") or raw.get("modified_time", "")),
            "owner_id": str(raw.get("owner_id", "") or raw.get("ownerId", "")),
            "pipeline_id": str(raw.get("pipeline_id", "") or raw.get("pipelineId", "")),
            "stage_id": str(raw.get("stage_id", "") or raw.get("stageId", "")),
            "fields": {k: raw.get(k) for k in ("name", "first_name", "last_name", "email", "phone",
                                               "company", "title", "value", "currency", "status",
                                               "source", "due_date", "body") if k in raw},
            "custom_fields": raw.get("custom_fields") or raw.get("customFields") or {},
            "created_at": str(raw.get("created_at", "") or raw.get("createdAt", "")),
            "updated_at": str(raw.get("updated_at", "") or raw.get("updatedAt", "")),
            "archived": bool(raw.get("archived") or raw.get("deleted")),
        }

    # ── public API ────────────────────────────────────────────────────────────
    def validate_connection(self, tenant_id: str) -> dict:
        from integrations.connections import find_active_connection_unsealed
        conn = find_active_connection_unsealed(tenant_id, self.CAP_KEY)
        if conn is None:
            return {"connected": False, "provider": self.PROVIDER, "state": "not_connected"}
        if conn.get("status") == "needs_reconnect":
            return {"connected": True, "provider": self.PROVIDER, "state": "reconnect_required"}
        creds_ok = bool(conn.get("access_token") or conn.get("api_key"))
        caps = set(conn.get("capabilities") or [])
        read_ok = any(c.endswith("_read") for c in caps)
        write_ok = any(c.endswith("_write") for c in caps) and bool(conn.get("write_enabled", False))
        state = ("credentials_invalid" if not creds_ok
                 else "permission_missing" if not read_ok
                 else "sync_paused" if conn.get("sync_paused")
                 else "connected")
        return {"connected": True, "provider": self.PROVIDER, "account_id": conn.get("account_id", ""),
                "account_name": conn.get("account_name", ""), "read": read_ok, "write": write_ok,
                "webhook": "webhooks" in caps, "objects": conn.get("objects") or [],
                "sync_direction": conn.get("sync_direction", "import_only"),
                "last_sync_at": conn.get("last_sync_at", ""), "last_error": conn.get("last_error", ""),
                "state": state}

    def get_account(self, tenant_id: str) -> dict:
        conn = self._connection(tenant_id)
        a = self.transport().get_account(self._creds(conn))
        return {"account_id": str(a.get("id", "")), "name": a.get("name", ""), "provider": self.PROVIDER}

    def get_capabilities(self, tenant_id: str) -> list[str]:
        conn = self._connection(tenant_id)
        raw = self.transport().discover_capabilities(self._creds(conn))
        return [c for c in (raw.get("capabilities") or self.DEFAULT_CAPS) if c in CAPABILITIES]

    def list_records(self, tenant_id: str, object_type: str, *, cursor: str = "") -> dict:
        conn = self._connection(tenant_id)
        self._require(conn, f"{_read_cap(object_type)}")
        res = self.transport().list_objects(self._creds(conn), object_type, cursor)
        return {"records": [self.normalise_record(object_type, r) for r in (res.get("data") or [])],
                "next_cursor": res.get("next_cursor", ""), "has_more": bool(res.get("has_more"))}

    def get_record(self, tenant_id: str, object_type: str, record_id: str) -> dict:
        conn = self._connection(tenant_id)
        return self.normalise_record(object_type, self.transport().get_object(self._creds(conn), object_type, record_id))

    def create_record(self, tenant_id: str, object_type: str, payload: dict) -> dict:
        conn = self._connection(tenant_id)
        self._require(conn, f"{_write_cap(object_type)}")
        if not conn.get("write_enabled", False):
            raise CRMError("permission_missing", "external writes are disabled")
        return self.normalise_record(object_type, self.transport().create_object(self._creds(conn), object_type, payload))

    def update_record(self, tenant_id: str, object_type: str, record_id: str, payload: dict) -> dict:
        conn = self._connection(tenant_id)
        self._require(conn, f"{_write_cap(object_type)}")
        if not conn.get("write_enabled", False):
            raise CRMError("permission_missing", "external writes are disabled")
        return self.normalise_record(object_type, self.transport().update_object(self._creds(conn), object_type, record_id, payload))

    def list_custom_fields(self, tenant_id: str, object_type: str) -> list[dict]:
        conn = self._connection(tenant_id)
        res = self.transport().list_custom_fields(self._creds(conn), object_type)
        return [{"field_id": str(f.get("id", "")), "name": f.get("name", ""), "type": f.get("type", "text")}
                for f in (res.get("data") or [])]

    def list_pipelines(self, tenant_id: str) -> list[dict]:
        conn = self._connection(tenant_id)
        res = self.transport().list_pipelines(self._creds(conn))
        return [{"pipeline_id": str(p.get("id", "")), "name": p.get("name", ""),
                 "stages": [{"stage_id": str(s.get("id", "")), "name": s.get("name", "")}
                            for s in (p.get("stages") or [])]}
                for p in (res.get("data") or [])]

    def fetch_incremental_changes(self, tenant_id: str, cursor: str) -> dict:
        conn = self._connection(tenant_id)
        self._require(conn, "incremental_sync")
        res = self.transport().fetch_changes(self._creds(conn), cursor)
        return {"records": [self.normalise_record(r.get("object_type", "contact"), r) for r in (res.get("data") or [])],
                "next_cursor": res.get("next_cursor", cursor), "has_more": bool(res.get("has_more"))}

    def register_webhook(self, tenant_id: str, url: str, secret: str) -> dict:
        conn = self._connection(tenant_id)
        self._require(conn, "webhooks")
        return {"ok": bool(self.transport().register_webhook(self._creds(conn), url, secret).get("ok", True))}

    def reconcile_record(self, tenant_id: str, object_type: str, record_id: str) -> dict:
        try:
            return {"status": "found", "record": self.get_record(tenant_id, object_type, record_id)}
        except CRMError as exc:
            return {"status": "unknown", "reason": exc.category}

    def health_check(self, tenant_id: str) -> dict:
        return self.validate_connection(tenant_id)


def _read_cap(object_type: str) -> str:
    return {"contact": "contacts_read", "company": "companies_read", "lead": "leads_read",
            "deal": "deals_read", "pipeline": "pipelines_read", "stage": "pipelines_read",
            "owner": "owners_read", "task": "tasks_read", "note": "notes_read",
            "activity": "activities_read"}.get(object_type, "contacts_read")


def _write_cap(object_type: str) -> str:
    return {"contact": "contacts_write", "company": "companies_write", "lead": "leads_write",
            "deal": "deals_write", "stage": "stages_write", "task": "tasks_write",
            "note": "notes_write", "activity": "activities_write"}.get(object_type, "contacts_write")
