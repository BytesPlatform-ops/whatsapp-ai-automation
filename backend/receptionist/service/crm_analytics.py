"""CRM analytics from persisted data only (Part 39). Never fabricates progress."""

from __future__ import annotations

from . import stores


def rollup(tenant_id: str, provider: str = "") -> dict:
    def _p(items):
        return [i for i in items if not provider or i.get("provider") == provider]

    results = _p(stores.crm_sync_results().list(tenant_id))
    conflicts = _p(stores.crm_conflicts().list(tenant_id))
    outbound = _p(stores.crm_outbound().list(tenant_id))
    mappings = _p(stores.crm_mappings().list(tenant_id))

    def count(items, key, *vals):
        return sum(1 for i in items if i.get(key) in vals)

    return {
        "connected_crms": len(stores.crm_capabilities().list(tenant_id)),
        "records_imported": count(results, "outcome", "imported", "mapped"),
        "conflicts": count(results, "outcome", "conflict") + len([c for c in conflicts if c.get("state") == "open"]),
        "auto_resolved_conflicts": count(conflicts, "state", "auto_resolved"),
        "manual_resolutions": count(conflicts, "state", "pixie_selected", "external_selected", "merged", "ignored"),
        "failed_records": count(results, "outcome", "invalid_identity"),
        "outbound_writes": count(outbound, "state", "written", "provider_confirmed"),
        "stored_mappings": len(mappings),
        "open_conflicts": len([c for c in conflicts if c.get("state") == "open"]),
    }
