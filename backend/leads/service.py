"""Lead store + upsert — in-memory, tenant-scoped, process-wide singleton.

`upsert_lead` is the one entry point callers use: it creates a lead the first
time a (tenant, email) is seen and updates it on every subsequent message,
keeping the latest intent/status/summary. Email is the identity key when known;
without an email each call creates a fresh lead (can't safely merge anonymous
contacts). Swappable for Supabase/Postgres later without changing callers.
"""

from __future__ import annotations

import itertools
from datetime import datetime, timezone
from typing import Optional

from .schemas import Lead, LeadStatus


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class _Store:
    def __init__(self) -> None:
        self._by_id: dict[str, dict[str, Lead]] = {}          # tenant -> id -> Lead
        self._email_index: dict[tuple[str, str], str] = {}    # (tenant, email) -> id
        self._seq = itertools.count(1)

    def _find_by_email(self, tenant_id: str, email: Optional[str]) -> Optional[Lead]:
        if not email:
            return None
        lead_id = self._email_index.get((tenant_id, email.lower()))
        if not lead_id:
            return None
        return self._by_id.get(tenant_id, {}).get(lead_id)

    def upsert(self, **fields) -> Lead:
        tenant_id = fields["tenant_id"]
        email = fields.get("email")
        now = fields.pop("now", None) or _now_iso()

        existing = self._find_by_email(tenant_id, email)
        if existing is not None:
            data = existing.model_dump()
            # only overwrite with non-empty incoming values; always refresh dynamics
            for key in ("name", "email", "phone", "source", "source_message_id"):
                val = fields.get(key)
                if val:
                    data[key] = val
            if fields.get("intent"):
                data["intent"] = fields["intent"]
            if fields.get("status"):
                data["status"] = fields["status"]
            if fields.get("last_message_summary"):
                data["last_message_summary"] = fields["last_message_summary"]
            if fields.get("metadata_json"):
                data["metadata_json"] = {**data.get("metadata_json", {}), **fields["metadata_json"]}
            data["updated_at"] = now
            lead = Lead(**data)
            self._by_id[tenant_id][lead.id] = lead
            return lead

        # create
        lead = Lead(**fields)
        lead.id = f"lead_{next(self._seq)}"
        lead.created_at = now
        lead.updated_at = now
        self._by_id.setdefault(tenant_id, {})[lead.id] = lead
        if email:
            self._email_index[(tenant_id, email.lower())] = lead.id
        return lead

    def get(self, tenant_id: str, lead_id: str) -> Optional[Lead]:
        return self._by_id.get(tenant_id, {}).get(lead_id)

    def list(self, tenant_id: str) -> list[Lead]:
        return list(reversed(list(self._by_id.get(tenant_id, {}).values())))


_store: Optional[_Store] = None


def get_leads_store() -> _Store:
    global _store
    if _store is None:
        _store = _Store()
    return _store


def upsert_lead(
    tenant_id: str,
    *,
    name: Optional[str] = None,
    email: Optional[str] = None,
    phone: Optional[str] = None,
    source: str = "manual",
    source_message_id: Optional[str] = None,
    intent: str = "unknown",
    status: LeadStatus | str = LeadStatus.NEW,
    last_message_summary: str = "",
    metadata_json: Optional[dict] = None,
    now: Optional[str] = None,
) -> Lead:
    """Create-or-update a lead by (tenant, email). Internal — no approval needed."""
    return get_leads_store().upsert(
        tenant_id=tenant_id, name=name, email=email, phone=phone, source=source,
        source_message_id=source_message_id, intent=intent, status=status,
        last_message_summary=last_message_summary, metadata_json=metadata_json or {},
        now=now,
    )


def get_lead(tenant_id: str, lead_id: str) -> Optional[Lead]:
    return get_leads_store().get(tenant_id, lead_id)


def list_leads(tenant_id: str) -> list[Lead]:
    return get_leads_store().list(tenant_id)
