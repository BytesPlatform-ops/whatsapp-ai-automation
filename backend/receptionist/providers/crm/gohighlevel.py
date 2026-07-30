"""GoHighLevel CRM adapter. Location/sub-account context; contacts, opportunities,
pipelines/stages, tasks, notes, owners, custom fields, webhooks."""
from __future__ import annotations
from .base import CRMProviderAdapter
from .mock import MockCRMTransport

_CAPS = ("contacts_read", "contacts_write", "deals_read", "deals_write", "pipelines_read",
         "stages_write", "owners_read", "tasks_read", "tasks_write", "notes_read", "notes_write",
         "custom_fields_read", "webhooks", "incremental_sync", "campaign_audience")


class GoHighLevelAdapter(CRMProviderAdapter):
    PROVIDER = "gohighlevel"
    CAP_KEY = "crm_gohighlevel"
    DEFAULT_CAPS = _CAPS
    OBJECT_MAP = {"contact": "contacts", "deal": "opportunities", "task": "tasks", "note": "notes"}

    def _mock_transport(self):
        return MockCRMTransport("gohighlevel", capabilities=list(_CAPS), account_name="Acme Location")
