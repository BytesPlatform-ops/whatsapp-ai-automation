"""Leads — Pixie's internal CRM (tenant-scoped, in-memory for now).

Leads are INTERNAL data, so the receptionist may create/update a lead BEFORE any
approval — no customer-facing side effect happens by storing a lead. Customer-
facing actions (email/calendar) still go through the approval gate.

    from leads import upsert_lead, get_lead, list_leads

Mirrors the approvals/activity store style: a process-wide singleton keyed by
tenant, swappable for a real DB later without touching callers.
"""

from .schemas import Lead, LeadStatus
from .service import get_lead, get_leads_store, list_leads, upsert_lead

__all__ = [
    "Lead",
    "LeadStatus",
    "upsert_lead",
    "get_lead",
    "list_leads",
    "get_leads_store",
]
