"""Salesforce CRM adapter. Leads, contacts, accounts, opportunities, tasks,
notes/activities, users/owners, custom fields, change tracking, webhooks."""
from __future__ import annotations
from .base import CRMProviderAdapter
from .mock import MockCRMTransport

_CAPS = ("contacts_read", "contacts_write", "companies_read", "companies_write", "leads_read",
         "leads_write", "deals_read", "deals_write", "pipelines_read", "stages_write", "owners_read",
         "tasks_read", "tasks_write", "notes_read", "notes_write", "activities_read", "activities_write",
         "custom_fields_read", "custom_fields_write", "webhooks", "incremental_sync", "archive_delete",
         "campaign_audience", "booking_activity")


class SalesforceAdapter(CRMProviderAdapter):
    PROVIDER = "salesforce"
    CAP_KEY = "crm_salesforce"
    DEFAULT_CAPS = _CAPS
    OBJECT_MAP = {"contact": "Contact", "company": "Account", "lead": "Lead", "deal": "Opportunity"}

    def _mock_transport(self):
        return MockCRMTransport("salesforce", capabilities=list(_CAPS), account_name="Acme Org")
