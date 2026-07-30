"""CRM marketplace provider registry (Wave 18).

Resolves a provider id to its typed adapter and exposes the marketplace catalog.
Adapters are constructed per-call so an injected transport can be supplied in tests
(``set_transport``); by default each adapter uses its own hermetic mock.
"""

from __future__ import annotations

from typing import Optional

from .base import CRMProviderAdapter, CRMError, CRMTransport, CAPABILITIES, OBJECT_TYPES
from .gohighlevel import GoHighLevelAdapter
from .hubspot import HubSpotAdapter
from .salesforce import SalesforceAdapter
from .pipedrive import PipedriveAdapter
from .zoho import ZohoAdapter

_ADAPTERS = {
    "gohighlevel": GoHighLevelAdapter,
    "hubspot": HubSpotAdapter,
    "salesforce": SalesforceAdapter,
    "pipedrive": PipedriveAdapter,
    "zoho": ZohoAdapter,
}

PROVIDERS = tuple(_ADAPTERS.keys())

# Per-test transport override, keyed by provider.
_transports: dict = {}


def set_transport(provider: str, transport: Optional[CRMTransport]) -> None:
    if transport is None:
        _transports.pop(provider, None)
    else:
        _transports[provider] = transport


def clear_transports() -> None:
    _transports.clear()


def get_adapter(provider: str) -> CRMProviderAdapter:
    cls = _ADAPTERS.get(provider)
    if cls is None:
        raise CRMError("provider_error", f"unknown provider {provider}")
    return cls(transport=_transports.get(provider))


def cap_key(provider: str) -> str:
    return get_adapter(provider).CAP_KEY


# ── marketplace catalog (Part 3) ──────────────────────────────────────────────

_CATALOG_META = {
    "gohighlevel": {"name": "GoHighLevel", "auth": "oauth", "label": "stable",
                    "objects": ["contact", "deal", "task", "note"]},
    "hubspot": {"name": "HubSpot", "auth": "oauth", "label": "stable",
                "objects": ["contact", "company", "deal", "task", "note"]},
    "salesforce": {"name": "Salesforce", "auth": "oauth", "label": "stable",
                   "objects": ["lead", "contact", "company", "deal", "task", "note"]},
    "pipedrive": {"name": "Pipedrive", "auth": "oauth", "label": "stable",
                  "objects": ["contact", "company", "lead", "deal", "activity", "note"]},
    "zoho": {"name": "Zoho CRM", "auth": "oauth", "label": "stable",
             "objects": ["lead", "contact", "company", "deal", "task", "note"]},
}


def catalog() -> list[dict]:
    out = []
    for pid in PROVIDERS:
        meta = _CATALOG_META[pid]
        caps = list(_ADAPTERS[pid].DEFAULT_CAPS)
        out.append({
            "provider": pid, "name": meta["name"], "auth_type": meta["auth"], "label": meta["label"],
            "supported_objects": meta["objects"], "webhook_support": "webhooks" in caps,
            "incremental_sync": "incremental_sync" in caps, "custom_fields": "custom_fields_read" in caps,
            "campaign_audience": "campaign_audience" in caps, "booking_activity": "booking_activity" in caps,
            "sync_directions": ["import_only", "export_only", "bidirectional", "disabled"],
        })
    return out
