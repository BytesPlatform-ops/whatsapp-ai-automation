"""Per-agent requirement registry (Wave 2 — DATA, mock content).

Each Pixie *agent* (receptionist, marketing, seo, omnichannel) talks over some
subset of the channels and has its own prerequisites on top of the per-channel
go-live requirements. This module is pure data + small read-only helpers so the
agent pages can render a readiness checklist by combining:

    agent.prerequisites  (this file — agent-level setup)        +
    channel.ChannelStatus (the router — per-channel go-live)

Nothing here holds secrets, hits the network, or mutates the router; it only
*reads* live statuses through the router passed in.
"""

from __future__ import annotations

from typing import Optional

from .schemas import Channel, ChannelStatus

# ── the agent registry (mock seed content) ───────────────────────────────────
# `channels` are Channel-enum *values* (strings) so the data is JSON-friendly and
# matches the wire shape the pages/JS consume.
AGENTS: dict[str, dict] = {
    "receptionist": {
        "name": "receptionist",
        "display_name": "Receptionist",
        "description": (
            "Answers customers across chat, WhatsApp, SMS, voice and Telegram — "
            "books appointments, qualifies leads, and hands off when needed."
        ),
        "channels": [
            Channel.WEB_CHAT.value,
            Channel.WHATSAPP.value,
            Channel.SMS.value,
            Channel.VOICE.value,
            Channel.TELEGRAM.value,
        ],
        "prerequisites": [
            "Business profile filled (name, hours, services)",
            "At least one channel enabled & ready",
            "Calendar/CRM connected (optional)",
        ],
    },
    "marketing": {
        "name": "marketing",
        "display_name": "Marketing",
        "description": (
            "Plans campaigns and drafts content for email, WhatsApp and SMS — "
            "nothing sends live until you approve it."
        ),
        "channels": [
            Channel.EMAIL.value,
            Channel.WHATSAPP.value,
            Channel.SMS.value,
        ],
        "prerequisites": [
            "Marketing business profile created",
            "Industry preset selected",
            "Content approved before sending",
            "Platform connections for posting",
        ],
    },
    "seo": {
        "name": "seo",
        "display_name": "SEO",
        "description": (
            "Audits a target site, tracks keywords, and emails periodic reports."
        ),
        "channels": [
            Channel.EMAIL.value,
        ],
        "prerequisites": [
            "Target site URL or Pixie page",
            "Target keywords set",
            "Email contact for reports",
        ],
    },
    "omnichannel": {
        "name": "omnichannel",
        "display_name": "Omni-channel Manager",
        "description": (
            "The control tower across every Pixie agent and every channel — "
            "enable channels per tenant and keep the owner notified."
        ),
        "channels": [ch.value for ch in Channel],  # ALL channels
        "prerequisites": [
            "Each agent's prerequisites met",
            "Channels enabled per tenant",
            "Pixie owner contact verified for notifications",
        ],
    },
}


def list_agents() -> list[dict]:
    """Every agent record (display_name, description, channels, prerequisites)."""
    return [dict(a) for a in AGENTS.values()]


def get_agent(name: str) -> Optional[dict]:
    """One agent record by name, or None if unknown."""
    agent = AGENTS.get(name)
    return dict(agent) if agent else None


def _channel_enum(value: str) -> Optional[Channel]:
    try:
        return Channel(value)
    except ValueError:
        return None


def agent_channel_statuses(router, tenant_id: str, name: str) -> list[ChannelStatus]:
    """Live ChannelStatus for each channel the named agent uses (for readiness)."""
    agent = AGENTS.get(name)
    if not agent:
        return []
    statuses: list[ChannelStatus] = []
    for value in agent["channels"]:
        ch = _channel_enum(value)
        if ch is not None:
            statuses.append(router.status(tenant_id, ch))
    return statuses


def agent_with_statuses(router, tenant_id: str, name: str) -> Optional[dict]:
    """The agent record plus a `channel_statuses` list of live ChannelStatus.

    Returns a plain dict (statuses kept as ChannelStatus models so FastAPI
    serializes them) so the agent page can show per-channel readiness."""
    agent = get_agent(name)
    if agent is None:
        return None
    agent["channel_statuses"] = agent_channel_statuses(router, tenant_id, name)
    return agent
