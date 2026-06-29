"""Tenant-scoped persistence seam for the Channels layer.

In-memory and process-local (mirrors the repo's other repository seams), so the
layer is functional today and tenant isolation + idempotency are actually
exercised. A durable implementation (Prisma `Channel*` / Supabase Postgres — see
/prisma/schema.prisma) plugs in behind the SAME method surface later without
touching the router. Stdlib only; secrets live in the token vault, not here.
"""

from __future__ import annotations

import hashlib
from typing import Dict, List, Optional

from .schemas import (
    Channel,
    ChannelConfig,
    InboundMessage,
    OutboundMessage,
    PixieContact,
    SendResult,
)


def _key(tenant_id: str, channel: Channel) -> str:
    return f"{tenant_id}|{channel.value}"


def idempotency_key(msg: OutboundMessage) -> str:
    """Stable key for a logical outbound send (caller-supplied or derived)."""
    if msg.idempotency_key:
        return msg.idempotency_key
    raw = f"{msg.tenant_id}|{msg.channel.value}|{msg.recipient_id}|{msg.text}"
    return "idem_" + hashlib.sha256(raw.encode()).hexdigest()[:16]


class InMemoryChannelStore:
    """Non-durable, tenant-scoped store for configs, message log, consent,
    webhook events and Pixie owner contacts."""

    def __init__(self) -> None:
        self._configs: Dict[str, ChannelConfig] = {}          # tenant|channel -> config
        self._messages: List[dict] = []                       # append-only normalized log
        self._consent: Dict[str, dict] = {}                   # tenant|channel|contact -> consent
        self._webhook_events: List[dict] = []
        self._contacts: Dict[str, PixieContact] = {}          # tenant -> owner contact
        self._sent_idem: set[str] = set()                     # tenant|idem -> already sent

    # ── channel config ───────────────────────────────────────────────────────
    def save_config(self, config: ChannelConfig) -> ChannelConfig:
        self._configs[_key(config.tenant_id, config.channel)] = config
        return config

    def get_config(self, tenant_id: str, channel: Channel) -> Optional[ChannelConfig]:
        return self._configs.get(_key(tenant_id, channel))

    def list_configs(self, tenant_id: str) -> List[ChannelConfig]:
        return [c for c in self._configs.values() if c.tenant_id == tenant_id]

    # ── message log ──────────────────────────────────────────────────────────
    def log_inbound(self, msg: InboundMessage) -> None:
        self._messages.append({"direction": "inbound", **msg.model_dump(mode="json")})

    def log_outbound(self, msg: OutboundMessage, result: SendResult) -> None:
        self._messages.append({
            "direction": "outbound",
            "tenant_id": msg.tenant_id,
            "channel": msg.channel.value,
            "recipient_id": msg.recipient_id,
            "text": msg.text,
            "sent": result.sent,
            "dry_run": result.dry_run,
            "idempotency_key": result.idempotency_key,
        })

    def list_messages(self, tenant_id: str, channel: Optional[Channel] = None, limit: int = 50) -> List[dict]:
        rows = [m for m in self._messages if m.get("tenant_id") == tenant_id]
        if channel is not None:
            rows = [m for m in rows if m.get("channel") == channel.value]
        return rows[-limit:]

    # ── idempotency ──────────────────────────────────────────────────────────
    def already_sent(self, tenant_id: str, idem: str) -> bool:
        return f"{tenant_id}|{idem}" in self._sent_idem

    def mark_sent(self, tenant_id: str, idem: str) -> None:
        self._sent_idem.add(f"{tenant_id}|{idem}")

    # ── consent ──────────────────────────────────────────────────────────────
    def set_consent(self, tenant_id: str, channel: Channel, contact: str, opted_in: bool) -> None:
        self._consent[f"{tenant_id}|{channel.value}|{contact}"] = {"opted_in": opted_in}

    def has_consent(self, tenant_id: str, channel: Channel, contact: str) -> bool:
        rec = self._consent.get(f"{tenant_id}|{channel.value}|{contact}")
        return bool(rec and rec.get("opted_in"))

    # ── webhook events ───────────────────────────────────────────────────────
    def log_webhook_event(self, tenant_id: str, channel: Channel, raw: dict) -> None:
        self._webhook_events.append({"tenant_id": tenant_id, "channel": channel.value, "raw": raw})

    # ── Pixie owner contact ──────────────────────────────────────────────────
    def save_contact(self, contact: PixieContact) -> PixieContact:
        self._contacts[contact.tenant_id] = contact
        return contact

    def get_contact(self, tenant_id: str) -> Optional[PixieContact]:
        return self._contacts.get(tenant_id)


_store: Optional[InMemoryChannelStore] = None


def get_channel_store() -> InMemoryChannelStore:
    global _store
    if _store is None:
        _store = InMemoryChannelStore()
    return _store
