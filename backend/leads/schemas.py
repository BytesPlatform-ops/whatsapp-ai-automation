"""Lead contracts — the internal CRM record."""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


class LeadStatus(str, Enum):
    NEW = "new"
    REPLY_PREPARED = "reply_prepared"
    BOOKING_SUGGESTED = "booking_suggested"
    FOLLOW_UP_NEEDED = "follow_up_needed"
    COMPLAINT = "complaint"


class Lead(BaseModel):
    """One customer/lead, isolated per tenant. Tolerant of extra keys."""

    model_config = ConfigDict(extra="ignore")

    id: str = ""
    tenant_id: str
    name: str | None = None
    email: str | None = None
    phone: str | None = None
    source: str = "manual"  # manual | gmail | website_chat | whatsapp | instagram | facebook
    source_message_id: str | None = None
    intent: str = "unknown"
    status: LeadStatus = LeadStatus.NEW
    last_message_summary: str = ""
    metadata_json: dict = Field(default_factory=dict)
    created_at: str = ""
    updated_at: str = ""
