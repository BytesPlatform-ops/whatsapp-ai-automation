"""Pipedrive CRM adapter. Persons, organisations, leads, deals, pipelines/stages,
activities, notes, owners/users, custom fields, webhooks + incremental sync."""
from __future__ import annotations
from .base import CRMProviderAdapter
from .mock import MockCRMTransport

_CAPS = ("contacts_read", "contacts_write", "companies_read", "companies_write", "leads_read",
         "leads_write", "deals_read", "deals_write", "pipelines_read", "stages_write", "owners_read",
         "activities_read", "activities_write", "notes_read", "notes_write", "custom_fields_read",
         "webhooks", "incremental_sync", "campaign_audience")


class PipedriveAdapter(CRMProviderAdapter):
    PROVIDER = "pipedrive"
    CAP_KEY = "crm_pipedrive"
    DEFAULT_CAPS = _CAPS
    OBJECT_MAP = {"contact": "persons", "company": "organizations", "lead": "leads", "deal": "deals"}

    def _mock_transport(self):
        return MockCRMTransport("pipedrive", capabilities=list(_CAPS), account_name="Acme Company")
