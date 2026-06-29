"""Channels schemas — the ONE normalized message shape, both directions.

Services only ever see `InboundMessage` / `OutboundMessage`; everything platform-
specific is hidden inside an adapter. Inbound payloads are UNTRUSTED, so inbound
models are tolerant of extra keys and keep the original `raw` for the adapter.

Also defines `ChannelConfig` (the per-tenant enable checkbox + requirement state)
and `PixieContact` (where Pixie proactively notifies the business owner).
"""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


# ── channel identity ─────────────────────────────────────────────────────────
class Channel(str, Enum):
    """Every surface Pixie can talk over. Add a channel here + one adapter file."""

    WEB_CHAT = "web_chat"
    WHATSAPP = "whatsapp"
    TELEGRAM = "telegram"
    SMS = "sms"
    EMAIL = "email"
    INSTAGRAM_DM = "instagram_dm"
    FACEBOOK_MESSENGER = "facebook_messenger"
    VOICE = "voice"
    GENERIC_WEBHOOK = "generic_webhook"


class SupportLevel(str, Enum):
    """How fully a channel is wired. Drives the UI badge + go-live gating."""

    FULL_API = "full_api"
    PARTIAL_API = "partial_api"
    MANUAL_EXPORT = "manual_export"
    REMINDER_ONLY = "reminder_only"
    FUTURE_PLACEHOLDER = "future_placeholder"


class ChannelMode(str, Enum):
    """A channel runs in MOCK (deterministic, keyless) or LIVE (real provider)."""

    MOCK = "mock"
    LIVE = "live"


# ── message parts ────────────────────────────────────────────────────────────
class MediaItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    type: str = Field(default="image", description="image | video | audio | file | sticker | location")
    url: str = ""
    mime: str | None = None
    caption: str = ""


class Button(BaseModel):
    """A quick-reply / action button (adapters drop these if unsupported)."""

    model_config = ConfigDict(extra="ignore")

    label: str
    value: str = ""
    kind: str = Field(default="reply", description="reply | url | call | postback")


# ── the normalized messages ──────────────────────────────────────────────────
class InboundMessage(BaseModel):
    """A normalized inbound message from ANY platform. `raw` keeps the original
    provider payload for the adapter; everything above the adapter uses the
    normalized fields only. Untrusted content — treat `text`/`media` as hostile."""

    model_config = ConfigDict(extra="ignore")

    tenant_id: str = Field(..., description="Isolation key — which business this is for.")
    channel: Channel
    sender_id: str = Field(default="", description="Stable id of the person who messaged us.")
    thread_id: str = Field(default="", description="Conversation/thread id on the platform.")
    text: str = Field(default="", max_length=16000, description="Untrusted inbound text.")
    media: list[MediaItem] = Field(default_factory=list)
    timestamp: str = Field(default="", description="ISO timestamp from the platform, if any.")
    message_id: str = Field(default="", description="Platform message id (for dedup/idempotency).")
    raw: dict = Field(default_factory=dict, description="Original provider payload (adapter-only).")


class OutboundMessage(BaseModel):
    """A normalized outbound message a service hands to the router. The service
    never sets the channel mechanics — only WHAT to say and to WHOM."""

    model_config = ConfigDict(extra="ignore")

    tenant_id: str = Field(..., description="Isolation key.")
    channel: Channel
    recipient_id: str = Field(..., description="Who to send to (platform-specific id).")
    thread_id: str = Field(default="", description="Reply within this thread when supported.")
    text: str = Field(default="", description="The message body.")
    media: list[MediaItem] = Field(default_factory=list)
    buttons: list[Button] = Field(default_factory=list)
    meta: dict = Field(default_factory=dict, description="Optional hints (template name, etc.).")
    idempotency_key: str | None = Field(default=None, description="Set to dedupe retries; auto-derived if absent.")


# ── capabilities + status ────────────────────────────────────────────────────
class Capabilities(BaseModel):
    """What a channel can do — services/UI read this instead of hardcoding."""

    model_config = ConfigDict(extra="ignore")

    inbound: bool = True
    outbound: bool = True
    supports_media: bool = False
    supports_buttons: bool = False
    supports_proactive: bool = Field(default=False, description="Can send unprompted (outside a session window).")
    max_text_len: int = 4096
    notes: str = ""


class Requirement(BaseModel):
    """One specific prerequisite for a channel to go live (your add-on table)."""

    model_config = ConfigDict(extra="ignore")

    key: str
    label: str
    met: bool = False
    hint: str = ""


# ── per-tenant config (the enable CHECKBOX) ──────────────────────────────────
class ChannelConfig(BaseModel):
    """Per-tenant configuration for one channel. `enabled` is the user checkbox;
    a channel only goes LIVE when `enabled` AND `requirements_met`."""

    model_config = ConfigDict(extra="ignore")

    tenant_id: str
    channel: Channel
    enabled: bool = Field(default=False, description="The checkbox — user turns this channel on/off.")
    mode: ChannelMode = ChannelMode.MOCK
    credentials_ref: str | None = Field(default=None, description="Opaque ref into the token vault — NEVER plaintext.")
    credentials_present: dict[str, bool] = Field(default_factory=dict, description="Which cred keys exist (booleans only).")
    support_level: SupportLevel = SupportLevel.FUTURE_PLACEHOLDER
    requirements_met: bool = False
    missing: list[str] = Field(default_factory=list, description="What's still needed before it can go live.")
    settings: dict = Field(default_factory=dict, description="Non-secret channel settings (from address, phone id, …).")

    def is_live(self) -> bool:
        """LIVE only when enabled, mode=live, and every requirement satisfied."""
        return self.enabled and self.mode == ChannelMode.LIVE and self.requirements_met


class ChannelStatus(BaseModel):
    """The computed, UI-facing readiness of a channel for a tenant."""

    model_config = ConfigDict(extra="ignore")

    channel: Channel
    enabled: bool
    mode: ChannelMode
    support_level: SupportLevel
    requirements_met: bool
    requirements: list[Requirement] = Field(default_factory=list)
    missing: list[str] = Field(default_factory=list)
    live: bool = Field(default=False, description="enabled AND live mode AND requirements_met.")
    capabilities: Capabilities = Field(default_factory=Capabilities)
    last_error: str = ""


# ── send result ──────────────────────────────────────────────────────────────
class SendResult(BaseModel):
    """The outcome of a send. In mock/dry-run, `sent` is False and `preview` shows
    exactly what WOULD have gone out. Nothing leaves the box unless `sent` is True."""

    model_config = ConfigDict(extra="ignore")

    ok: bool = True
    channel: Channel
    recipient_id: str = ""
    dry_run: bool = True
    sent: bool = False
    idempotency_key: str = ""
    duplicate: bool = Field(default=False, description="True if this idempotency key already sent.")
    preview: dict = Field(default_factory=dict, description="The formatted, channel-shaped payload.")
    reason: str = Field(default="", description="Why it was dry-run / blocked / failed.")


# ── Pixie outbound owner contact ─────────────────────────────────────────────
class PixieContactType(str, Enum):
    EMAIL = "email"
    PHONE = "phone"
    WHATSAPP = "whatsapp"
    TELEGRAM = "telegram"
    OTHER = "other"


#: Owner-notification events Pixie can proactively reach out about.
NOTIFY_EVENTS: tuple[str, ...] = (
    "new_lead", "booking", "approval_needed", "daily_summary", "payment", "error",
)


class PixieContact(BaseModel):
    """Where Pixie can proactively message/notify the business OWNER (separate from
    talking to customers): confirmations, alerts, approvals, daily summaries."""

    model_config = ConfigDict(extra="ignore")

    tenant_id: str
    type: PixieContactType = PixieContactType.EMAIL
    value_ref: str | None = Field(default=None, description="Token-vault ref to the address/phone — NEVER plaintext in logs.")
    value_masked: str = Field(default="", description="Display-safe masked value, e.g. 'a***@x.com'.")
    verified: bool = Field(default=False, description="Confirm via a verification message before sending real notifications.")
    preferred_channel: Channel = Channel.EMAIL
    notify_on: list[str] = Field(default_factory=list, description=f"Subset of {NOTIFY_EVENTS}.")
