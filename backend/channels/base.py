"""The channel adapter contract.

An adapter is the ONLY thing that knows a specific platform. It normalizes inbound
payloads into `InboundMessage`, formats `OutboundMessage` into the platform shape,
and sends — honoring that channel's rules (limits, windows, templates) INSIDE the
adapter, isolated from the router and from services.

Every adapter implements this same interface, so the router treats them uniformly
and a new channel is just one new file.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

from .requirements import evaluate_requirements, support_level_for
from .schemas import (
    Capabilities,
    Channel,
    ChannelConfig,
    ChannelMode,
    ChannelStatus,
    InboundMessage,
    OutboundMessage,
    Requirement,
    SendResult,
    SupportLevel,
)


class ChannelAdapter(ABC):
    """Base interface for every channel. Subclasses set `channel` and override the
    platform-specific bits; sensible defaults cover the rest."""

    channel: Channel
    support_level: SupportLevel = SupportLevel.FUTURE_PLACEHOLDER

    # ── identity / capabilities ──────────────────────────────────────────────
    def capabilities(self) -> Capabilities:
        """What this channel can do. Override per adapter."""
        return Capabilities()

    def requirements(self, config: ChannelConfig) -> list[Requirement]:
        """The specific prerequisites for this channel to go live (isolated here)."""
        reqs, _missing, _met = evaluate_requirements(config)
        return reqs

    def validate_credentials(self, config: ChannelConfig) -> bool:
        """Are this channel's go-live requirements satisfied for the tenant?

        Default delegates to the requirement specs; a live adapter may also ping
        the provider. Never reads secret VALUES here — only presence."""
        _reqs, _missing, met = evaluate_requirements(config)
        return met

    def status(self, config: ChannelConfig) -> ChannelStatus:
        """Computed, UI-facing readiness for a tenant."""
        reqs, missing, met = evaluate_requirements(config)
        live = config.enabled and config.mode == ChannelMode.LIVE and met
        return ChannelStatus(
            channel=self.channel,
            enabled=config.enabled,
            mode=config.mode,
            support_level=self.support_level or support_level_for(self.channel),
            requirements_met=met,
            requirements=reqs,
            missing=missing,
            live=live,
            capabilities=self.capabilities(),
        )

    # ── inbound ──────────────────────────────────────────────────────────────
    @abstractmethod
    def normalize_inbound(self, tenant_id: str, raw: dict) -> InboundMessage:
        """Turn an untrusted raw provider payload into a normalized InboundMessage."""

    def receive(self, tenant_id: str, raw: dict) -> InboundMessage:
        """Webhook/poll entry point — alias of `normalize_inbound` by default."""
        return self.normalize_inbound(tenant_id, raw)

    # ── outbound ─────────────────────────────────────────────────────────────
    @abstractmethod
    def format_outbound(self, msg: OutboundMessage) -> dict:
        """Shape a normalized OutboundMessage into this platform's payload."""

    @abstractmethod
    def send(self, msg: OutboundMessage, config: ChannelConfig) -> SendResult:
        """Send (or, when not live, dry-run) a message. MUST NOT transmit unless
        the config is live AND requirements are met; otherwise return a dry-run
        SendResult with a `preview`. Honor idempotency."""

    def dry_run(self, msg: OutboundMessage, config: ChannelConfig) -> SendResult:
        """Format + validate without sending — the preview the UI shows."""
        return SendResult(
            ok=True,
            channel=self.channel,
            recipient_id=msg.recipient_id,
            dry_run=True,
            sent=False,
            preview=self.format_outbound(msg),
            reason="dry_run",
        )
