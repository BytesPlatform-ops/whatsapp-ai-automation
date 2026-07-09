"""Record contracts for the durable AI Receptionist.

Every record is tenant-scoped and tolerant of extra keys (Pydantic v2,
`extra="ignore"`) so the model/brain adding a field never breaks parsing.
Status/priority fields are plain strings with documented allowed values (kept
loose on purpose — the same tolerance the rest of the backend uses) with a
handful of enums where a fixed vocabulary is genuinely useful.

Table/store names live in `stores.py`; these are the shapes stored in each
row's `data` blob (see `persistence.envelope`).
"""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, ConfigDict, Field

from .ids import new_id, now_iso


# ── shared vocab ──────────────────────────────────────────────────────────────

class Channel(str, Enum):
    WEB_CHAT = "web_chat"
    GMAIL = "gmail"
    EMAIL = "email"
    WHATSAPP = "whatsapp"
    INSTAGRAM = "instagram"
    FACEBOOK = "facebook"
    SMS = "sms"
    VOICE = "voice"
    MANUAL = "manual"
    API = "api"
    CAMPAIGN = "campaign"


# The 17 receptionist intents/actions (superset of receptionist/schemas.ActionType,
# adding faq / campaign_reply / unsubscribe / fallback which the old parser lacked).
class Intent(str, Enum):
    BOOKING = "booking"
    LEAD = "lead"
    ESCALATION = "escalation"
    QUOTE = "quote"
    CALL_ROUTING = "call_routing"
    VOICEMAIL = "voicemail"
    WAITLIST = "waitlist"
    REMINDER = "reminder"
    PAYMENT_LINK = "payment_link"
    STATUS_LOOKUP = "status_lookup"
    FAQ = "faq"
    INTAKE = "intake"
    COMPLAINT = "complaint"
    FOLLOW_UP = "follow_up"
    CAMPAIGN_REPLY = "campaign_reply"
    UNSUBSCRIBE = "unsubscribe"
    FALLBACK = "fallback"


class _Base(BaseModel):
    model_config = ConfigDict(extra="ignore", use_enum_values=True)


# ── conversation + message + action log ───────────────────────────────────────

class Conversation(_Base):
    id: str = Field(default_factory=lambda: new_id("conv"))
    tenant_id: str
    contact_id: str | None = None
    channel: str = Channel.WEB_CHAT.value
    subject: str = ""
    status: str = "open"  # open | closed | escalated
    last_intent: str = "unknown"
    last_action: str = "none"
    sentiment: str = "neutral"  # positive | neutral | negative
    summary: str = ""
    message_count: int = 0
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)


class Message(_Base):
    id: str = Field(default_factory=lambda: new_id("msg"))
    tenant_id: str
    conversation_id: str
    role: str = "customer"  # customer | assistant | system
    text: str = ""
    channel: str = Channel.WEB_CHAT.value
    intent: str = "unknown"
    action: str = "none"
    confidence: float = 0.0
    degraded: bool = False
    created_at: str = Field(default_factory=now_iso)


class ActionRecord(_Base):
    id: str = Field(default_factory=lambda: new_id("act"))
    tenant_id: str
    conversation_id: str = ""
    intent: str = "unknown"
    action: str = "none"
    status: str = "executed"  # executed | pending | failed | noop | blocked
    record_type: str = ""      # e.g. booking | quote | ticket
    record_id: str = ""
    detail: str = ""
    degraded: bool = False
    created_at: str = Field(default_factory=now_iso)


# ── CRM ───────────────────────────────────────────────────────────────────────

class Contact(_Base):
    id: str = Field(default_factory=lambda: new_id("ctc"))
    tenant_id: str
    name: str | None = None
    email: str | None = None
    phone: str | None = None
    company: str | None = None
    company_id: str | None = None
    service_interest: str = ""
    budget: str = ""
    urgency: str = "normal"  # low | normal | high | emergency
    notes: str = ""
    source: str = Channel.MANUAL.value
    intent: str = "unknown"
    status: str = "new"  # new | qualified | follow_up_needed | converted | lost
    score: int = 0
    tags: list[str] = Field(default_factory=list)
    last_message_summary: str = ""
    last_contact_at: str = Field(default_factory=now_iso)
    consent: bool = False
    activity: list[dict] = Field(default_factory=list)
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)


class Company(_Base):
    id: str = Field(default_factory=lambda: new_id("cmp"))
    tenant_id: str
    name: str
    domain: str = ""
    industry: str = ""
    size: str = ""
    notes: str = ""
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)


# ── booking / quote / callback / voicemail / waitlist / payment ───────────────

class Booking(_Base):
    id: str = Field(default_factory=lambda: new_id("bkg"))
    tenant_id: str
    contact_id: str | None = None
    conversation_id: str = ""
    name: str | None = None
    phone: str | None = None
    email: str | None = None
    service_type: str = ""
    date: str = ""
    time: str = ""
    timezone: str = "UTC"
    notes: str = ""
    status: str = "pending"  # pending | confirmed | cancelled | completed
    calendar_event_id: str = ""
    calendar_html_link: str = ""
    source: str = Channel.WEB_CHAT.value
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)


class Quote(_Base):
    id: str = Field(default_factory=lambda: new_id("qte"))
    tenant_id: str
    contact_id: str | None = None
    conversation_id: str = ""
    name: str | None = None
    email: str | None = None
    phone: str | None = None
    service: str = ""
    scope: str = ""
    quantity: str = ""
    location: str = ""
    timeline: str = ""
    budget: str = ""
    notes: str = ""
    status: str = "new"  # new | preparing | sent | accepted | declined | closed
    estimated_min: float | None = None
    estimated_max: float | None = None
    currency: str = "USD"
    source: str = Channel.WEB_CHAT.value
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)


class Callback(_Base):
    id: str = Field(default_factory=lambda: new_id("cbk"))
    tenant_id: str
    contact_id: str | None = None
    conversation_id: str = ""
    name: str | None = None
    phone: str | None = None
    preferred_time: str = ""
    reason: str = ""
    status: str = "pending"  # pending | scheduled | completed | failed
    provider: str = ""
    source: str = Channel.WEB_CHAT.value
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)


class Voicemail(_Base):
    id: str = Field(default_factory=lambda: new_id("vmail"))
    tenant_id: str
    contact_id: str | None = None
    conversation_id: str = ""
    name: str | None = None
    phone: str | None = None
    transcript: str = ""
    urgency: str = "normal"
    status: str = "new"  # new | reviewed | actioned
    source: str = Channel.VOICE.value
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)


class WaitlistEntry(_Base):
    id: str = Field(default_factory=lambda: new_id("wlist"))
    tenant_id: str
    contact_id: str | None = None
    conversation_id: str = ""
    name: str | None = None
    phone: str | None = None
    email: str | None = None
    service: str = ""
    requested_date: str = ""
    requested_time: str = ""
    location: str = ""
    notes: str = ""
    status: str = "waiting"  # waiting | notified | converted | expired
    source: str = Channel.WEB_CHAT.value
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)


class PaymentRequest(_Base):
    id: str = Field(default_factory=lambda: new_id("pay"))
    tenant_id: str
    contact_id: str | None = None
    conversation_id: str = ""
    name: str | None = None
    email: str | None = None
    amount: float | None = None
    currency: str = "USD"
    description: str = ""
    status: str = "pending"  # pending | link_created | paid | cancelled | failed
    payment_link: str = ""
    provider: str = ""
    provider_ref: str = ""
    source: str = Channel.WEB_CHAT.value
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)


# ── tickets / escalations ─────────────────────────────────────────────────────

class Ticket(_Base):
    id: str = Field(default_factory=lambda: new_id("tkt"))
    tenant_id: str
    contact_id: str | None = None
    conversation_id: str = ""
    kind: str = "support"  # support | complaint
    subject: str = ""
    body: str = ""
    priority: str = "normal"  # low | normal | high | urgent
    sentiment: str = "neutral"
    status: str = "open"  # open | in_progress | resolved | closed
    assigned_to: str = ""
    context: list[dict] = Field(default_factory=list)
    source: str = Channel.WEB_CHAT.value
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)


class Escalation(_Base):
    id: str = Field(default_factory=lambda: new_id("esc"))
    tenant_id: str
    contact_id: str | None = None
    conversation_id: str = ""
    reason: str = ""
    priority: str = "high"  # low | normal | high | urgent
    status: str = "open"  # open | assigned | resolved
    context: str = ""
    notified: list[str] = Field(default_factory=list)  # channels notified: email/slack/webhook
    source: str = Channel.WEB_CHAT.value
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)


# ── tasks / reminders / follow-ups ────────────────────────────────────────────

class Task(_Base):
    id: str = Field(default_factory=lambda: new_id("task"))
    tenant_id: str
    contact_id: str | None = None
    conversation_id: str = ""
    kind: str = "follow_up"  # follow_up | callback | generic
    title: str = ""
    related_type: str = ""
    related_id: str = ""
    owner: str = ""
    status: str = "open"  # open | in_progress | done | cancelled
    due_at: str = ""
    notes: str = ""
    source: str = Channel.WEB_CHAT.value
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)


class Reminder(_Base):
    id: str = Field(default_factory=lambda: new_id("rem"))
    tenant_id: str
    contact_id: str | None = None
    conversation_id: str = ""
    title: str = ""
    remind_at: str = ""
    channel: str = Channel.EMAIL.value
    related_type: str = ""
    related_id: str = ""
    status: str = "scheduled"  # scheduled | sent | cancelled
    source: str = Channel.WEB_CHAT.value
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)


# ── opt-out / business profile / knowledge / campaign replies ─────────────────

class OptOut(_Base):
    id: str = Field(default_factory=lambda: new_id("opt"))
    tenant_id: str
    contact_id: str | None = None
    email: str | None = None
    phone: str | None = None
    channel: str | None = None  # None = all channels
    scope: str = "marketing"  # marketing | all
    reason: str = "reply_stop"
    source: str = Channel.WEB_CHAT.value
    created_at: str = Field(default_factory=now_iso)


class BusinessProfile(_Base):
    # id == tenant_id (one profile per tenant)
    tenant_id: str
    business_name: str = ""
    industry: str = ""
    hours: str = ""
    services: list[str] = Field(default_factory=list)
    pricing_notes: str = ""
    location: str = ""
    address: str = ""
    phone: str = ""
    email: str = ""
    website: str = ""
    policies: str = ""
    process: str = ""
    tone: str = "friendly, professional"
    escalation_rules: str = ""
    custom_instructions: str = ""
    faqs: list[dict] = Field(default_factory=list)  # [{q, a}]
    updated_at: str = Field(default_factory=now_iso)


class KnowledgeItem(_Base):
    id: str = Field(default_factory=lambda: new_id("kb"))
    tenant_id: str
    title: str = ""
    content: str = ""
    category: str = "general"
    tags: list[str] = Field(default_factory=list)
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)


class CampaignReply(_Base):
    id: str = Field(default_factory=lambda: new_id("crep"))
    tenant_id: str
    campaign_id: str = ""
    contact_id: str | None = None
    from_email: str | None = None
    from_phone: str | None = None
    channel: str = Channel.EMAIL.value
    text: str = ""
    classification: str = "other"  # interested | not_interested | question | complaint | unsubscribe | booking_request | quote_request | other
    action_taken: str = "none"
    action_record_id: str = ""
    status: str = "new"  # new | handled
    created_at: str = Field(default_factory=now_iso)
