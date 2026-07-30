"""Zoho CRM adapter. Leads, contacts, accounts, deals, tasks/activities, notes,
users/owners, module/layout fields, notifications + incremental sync."""
from __future__ import annotations
from .base import CRMProviderAdapter
from .mock import MockCRMTransport

_CAPS = ("contacts_read", "contacts_write", "companies_read", "companies_write", "leads_read",
         "leads_write", "deals_read", "deals_write", "pipelines_read", "stages_write", "owners_read",
         "tasks_read", "tasks_write", "notes_read", "notes_write", "activities_read",
         "custom_fields_read", "webhooks", "incremental_sync", "campaign_audience")


class ZohoAdapter(CRMProviderAdapter):
    PROVIDER = "zoho"
    CAP_KEY = "crm_zoho"
    DEFAULT_CAPS = _CAPS
    OBJECT_MAP = {"contact": "Contacts", "company": "Accounts", "lead": "Leads", "deal": "Deals"}

    def _mock_transport(self):
        return MockCRMTransport("zoho", capabilities=list(_CAPS), account_name="Acme Zoho Org")
