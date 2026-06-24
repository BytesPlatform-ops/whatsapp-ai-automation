"""Receptionist schemas — the contracts for the AI receptionist module.

Separate from the website-builder `schemas/` package. The model emits a natural
reply plus exactly one [ACTION] block; `action_parser` turns that block into an
`Action`, and the engine returns a `ReceptionReply`.
"""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


class Channel(str, Enum):
    VOICE = "voice"
    CHAT = "chat"
    SMS = "sms"
    WHATSAPP = "whatsapp"
    SOCIAL = "social"


class ActionType(str, Enum):
    """The 17 real action types from the runtime prompt's [ACTION] block, plus
    `none` when there's nothing for the backend to do."""

    BOOKING = "booking"
    RESCHEDULE = "reschedule"
    CANCEL = "cancel"
    QUOTE = "quote"
    LEAD = "lead"
    ESCALATION = "escalation"
    MESSAGE = "message"
    CALL_ROUTING = "call_routing"
    VOICEMAIL = "voicemail"
    WAITLIST = "waitlist"
    REMINDER = "reminder"
    INTAKE = "intake"
    STATUS_CHECK = "status_check"
    PAYMENT_LINK = "payment_link"
    COMPLAINT = "complaint"
    FOLLOW_UP = "follow_up"
    SPAM = "spam"
    NONE = "none"


class Urgency(str, Enum):
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    EMERGENCY = "emergency"
    UNKNOWN = "unknown"


class Action(BaseModel):
    """The parsed [ACTION] block — what the backend should actually DO.

    String fields are None when the model wrote 'unknown' or '-'. `type=none`
    means no backend action. Tolerant of extra keys so a model that adds a field
    never breaks parsing.
    """

    model_config = ConfigDict(extra="ignore")

    type: ActionType = ActionType.NONE
    name: str | None = None
    contact: str | None = None
    datetime: str | None = Field(default=None, description="ISO timestamp for booking/reschedule/follow-up/reminder.")
    department_or_staff: str | None = None
    urgency: Urgency = Urgency.UNKNOWN
    details: str | None = None
    quote_total: str | None = None
    needs_human: bool = False


class HistoryTurn(BaseModel):
    model_config = ConfigDict(extra="ignore")

    role: str  # "customer" | "receptionist"
    content: str


class ReceptionRequest(BaseModel):
    """A normalized inbound message from any channel."""

    model_config = ConfigDict(extra="forbid")

    tenant_id: str = Field(..., description="Which business this receptionist serves (isolation key).")
    channel: Channel = Channel.CHAT
    customer_id: str | None = Field(default=None, description="Stable id of the caller/chatter if known.")
    message: str = Field(..., min_length=1, max_length=8000, description="Untrusted customer text.")
    history: list[HistoryTurn] = Field(default_factory=list)


class ReceptionReply(BaseModel):
    """What the engine returns: the customer-facing text + the internal action."""

    model_config = ConfigDict(extra="forbid")

    reply_text: str
    action: Action
