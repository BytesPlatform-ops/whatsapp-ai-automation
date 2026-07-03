"""Schemas for the AI Receptionist prepare-for-approval flow.

`ReceptionSignal` is the inbound request; `ReceptionistOutput` validates the
model's structured JSON; `RunResponse` is the API envelope. Kept separate from
receptionist/schemas.py (the live-chat contracts) so neither flow disturbs the
other.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class ReceptionSignal(BaseModel):
    """A customer message to prepare a reply for (manual or channel-sourced)."""

    model_config = ConfigDict(extra="ignore")

    tenant_id: str = "demo_tenant"
    user_id: str = "demo_user"
    source: str = "manual"  # manual | gmail | website_chat | whatsapp | instagram | facebook
    from_email: str | None = None
    from_name: str | None = None
    subject: str | None = None
    body: str = Field(..., min_length=1, max_length=8000)
    now: str = ""


class LeadBlock(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: str | None = None
    email: str | None = None
    phone: str | None = None
    source: str = "manual"
    status: str = "new"


class RecommendedAction(BaseModel):
    model_config = ConfigDict(extra="ignore")
    capability: str = "follow_up"
    tool_preference: str = "mock"
    approval_required: bool = True
    description: str = ""
    payload: dict = Field(default_factory=dict)


class BookingBlock(BaseModel):
    model_config = ConfigDict(extra="ignore")
    needed: bool = False
    suggested_slots: list = Field(default_factory=list)
    event_title: str = ""
    event_description: str = ""


class ReceptionistOutput(BaseModel):
    """Validated shape of the model's JSON. Tolerant of extra keys."""

    model_config = ConfigDict(extra="ignore")

    agent_slug: str = "ai-receptionist"
    intent: str = "unknown"
    risk_level: str = "low"
    summary: str = ""
    lead: LeadBlock = Field(default_factory=LeadBlock)
    prepared_reply: str = ""
    internal_notes: str = ""
    recommended_actions: list[RecommendedAction] = Field(default_factory=list)
    booking: BookingBlock = Field(default_factory=BookingBlock)
    user_action: str = "approve"


class RunResponse(BaseModel):
    status: str = "approval_required"
    agent_slug: str = "ai-receptionist"
    intent: str = "unknown"
    lead_id: str = ""
    approval_id: str = ""
    prepared_output: dict = Field(default_factory=dict)
    llm_provider: str = "openai"
    model: str = ""
