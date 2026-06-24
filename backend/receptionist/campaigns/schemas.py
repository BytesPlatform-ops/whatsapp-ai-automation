"""Campaign / outreach schemas — warm re-engagement of EXISTING customers.

Compliance-first: every campaign is dry_run by default and must be human-approved
before it can run. Models mirror the rest of the backend (Pydantic v2, str enums,
tenant_id on everything).
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class CampaignChannel(str, Enum):
    WHATSAPP = "whatsapp"
    SMS = "sms"
    EMAIL = "email"
    VOICE = "voice"


class CampaignType(str, Enum):
    APPOINTMENT_REMINDER = "appointment_reminder"
    MISSED_CALL_CALLBACK = "missed_call_callback"
    WIN_BACK = "win_back"
    REVIEW_REQUEST = "review_request"
    OFFER_PROMO = "offer_promo"
    PAYMENT_RENEWAL_REMINDER = "payment_renewal_reminder"
    QUOTE_FOLLOW_UP = "quote_follow_up"


class CampaignStatus(str, Enum):
    DRAFT = "draft"
    PENDING_APPROVAL = "pending_approval"
    APPROVED = "approved"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


# Campaign types that are marketing (need explicit marketing consent) vs transactional.
MARKETING_TYPES = {CampaignType.WIN_BACK, CampaignType.REVIEW_REQUEST, CampaignType.OFFER_PROMO}


class Campaign(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    tenant_id: str
    name: str = Field(..., min_length=1, max_length=120)
    type: CampaignType
    status: CampaignStatus = CampaignStatus.DRAFT
    channels: list[CampaignChannel] = Field(default_factory=list, description="Ordered: first is primary, rest fallback.")
    message_template: str = Field("", description="Body with {{merge_vars}}.")
    subject_template: str | None = None

    dry_run: bool = True  # load-bearing default — never sends until a human flips this
    ai_disclosure: str = "This is an automated message from the business."
    quiet_hours_start: int = Field(8, ge=0, le=23)
    quiet_hours_end: int = Field(21, ge=1, le=24)
    voice_hours_start: int = Field(10, ge=0, le=23)
    voice_hours_end: int = Field(19, ge=1, le=24)
    frequency_cap_per_window: int = Field(1, ge=1)
    frequency_window_days: int = Field(7, ge=1)

    created_by: str = "owner"
    approved_by: str | None = None
    approved_at: datetime | None = None
    created_at: datetime = Field(default_factory=_utcnow)
    audit_log: list[dict] = Field(default_factory=list)

    @property
    def requires_marketing_consent(self) -> bool:
        return self.type in MARKETING_TYPES


class CampaignTarget(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    tenant_id: str
    campaign_id: str
    customer_id: str | None = None
    name: str | None = None
    phone: str | None = None
    email: str | None = None
    timezone: str = "UTC"
    merge_vars: dict[str, str] = Field(default_factory=dict)
    last_contacted_at: datetime | None = None
    send_status: str = "pending"  # pending | skipped | would_send | sent | failed


class ConsentRecord(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    tenant_id: str
    customer_id: str | None = None
    phone: str | None = None
    email: str | None = None
    channel: CampaignChannel
    consent_type: str = "transactional"  # transactional | marketing | voice
    granted: bool = True
    source: str = "onboarding_form"
    created_at: datetime = Field(default_factory=_utcnow)


class OptOutEntry(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    tenant_id: str
    customer_id: str | None = None
    phone: str | None = None
    email: str | None = None
    channel: CampaignChannel | None = None  # None = all channels
    scope: str = "marketing"  # marketing | all
    source: str = "reply_stop"
    created_at: datetime = Field(default_factory=_utcnow)


class DoNotContactEntry(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    tenant_id: str
    phone: str | None = None
    email: str | None = None
    reason: str = "manual"  # complaint | legal | regulator_list | manual
    created_at: datetime = Field(default_factory=_utcnow)


class GateCheck(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str
    passed: bool
    detail: str = ""


class GateResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    target_id: str
    allowed: bool
    checks: list[GateCheck] = Field(default_factory=list)
    blocked_by: str | None = None
    resolved_channel: CampaignChannel | None = None
    would_send_preview: dict | None = None
