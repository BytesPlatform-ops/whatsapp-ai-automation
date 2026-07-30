"""HubSpot CRM adapter. Contacts, companies, deals, pipelines/stages, owners,
tasks/notes/activities, custom properties, webhooks + incremental sync."""
from __future__ import annotations
from .base import CRMProviderAdapter
from .mock import MockCRMTransport

_CAPS = ("contacts_read", "contacts_write", "companies_read", "companies_write", "deals_read",
         "deals_write", "pipelines_read", "stages_write", "owners_read", "tasks_read", "tasks_write",
         "notes_read", "notes_write", "activities_read", "custom_fields_read", "custom_fields_write",
         "webhooks", "incremental_sync", "campaign_audience", "booking_activity")


class HubSpotAdapter(CRMProviderAdapter):
    PROVIDER = "hubspot"
    CAP_KEY = "crm_hubspot"
    DEFAULT_CAPS = _CAPS
    OBJECT_MAP = {"contact": "contacts", "company": "companies", "deal": "deals"}

    def _mock_transport(self):
        return MockCRMTransport("hubspot", capabilities=list(_CAPS), account_name="Acme Portal")
