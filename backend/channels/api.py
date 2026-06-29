"""Channels JSON API — the FastAPI surface the omni-channel + agent pages drive.

A thin, tenant-scoped HTTP layer over the Wave-1 `ChannelRouter`: read channel
statuses, flip the enable checkbox + settings, dry-run a send, replay an inbound
message, and manage the Pixie owner contact. Everything routes through the router
+ store + vault — this module owns no state of its own.

Secrets NEVER cross this boundary in the clear: the owner-contact value is stored
as a vault ref + masked display, and only the masked value is ever returned.

Mount it with `app.include_router(router)` — prefix `/api/channels`.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from . import (
    Channel,
    ChannelConfig,
    ChannelMode,
    OutboundMessage,
    PixieContact,
)
from .agents import agent_with_statuses, list_agents
from .crypto import get_vault, mask
from .router import get_channel_router
from .schemas import ChannelStatus, NOTIFY_EVENTS, PixieContactType, SendResult
from .store import get_channel_store

router = APIRouter(prefix="/api/channels", tags=["channels"])


def _channel(channel: str) -> Channel:
    """Path/body channel string → Channel enum, or 404 for unknown channels."""
    try:
        return Channel(channel)
    except ValueError:
        raise HTTPException(status_code=404, detail=f"unknown channel: {channel}")


# ── request bodies ────────────────────────────────────────────────────────────
class ConfigBody(BaseModel):
    tenant_id: str
    enabled: bool = False
    mode: ChannelMode = ChannelMode.MOCK
    settings: dict = Field(default_factory=dict)
    credentials_present: dict[str, bool] = Field(default_factory=dict)


class DryRunBody(BaseModel):
    tenant_id: str
    recipient_id: str
    text: str = ""
    meta: dict = Field(default_factory=dict)


class InboundBody(BaseModel):
    tenant_id: str
    raw: dict = Field(default_factory=dict)


class PixieContactBody(BaseModel):
    tenant_id: str
    type: PixieContactType = PixieContactType.EMAIL
    value: str = ""
    preferred_channel: Channel = Channel.EMAIL
    notify_on: list[str] = Field(default_factory=list)


# ── channel status ────────────────────────────────────────────────────────────
@router.get("/status", response_model=list[ChannelStatus])
def all_status(tenant_id: str) -> list[ChannelStatus]:
    return get_channel_router().all_status(tenant_id)


@router.get("/{channel}/status", response_model=ChannelStatus)
def channel_status(channel: str, tenant_id: str) -> ChannelStatus:
    return get_channel_router().status(tenant_id, _channel(channel))


# ── enable checkbox + settings ────────────────────────────────────────────────
@router.post("/{channel}/config", response_model=ChannelStatus)
def save_config(channel: str, body: ConfigBody) -> ChannelStatus:
    ch = _channel(channel)
    rt = get_channel_router()
    rt.save_config(ChannelConfig(
        tenant_id=body.tenant_id,
        channel=ch,
        enabled=body.enabled,
        mode=body.mode,
        settings=body.settings,
        credentials_present=body.credentials_present,
    ))
    return rt.status(body.tenant_id, ch)


# ── dry-run a send (nothing leaves the box) ───────────────────────────────────
@router.post("/{channel}/dry-run", response_model=SendResult)
def dry_run(channel: str, body: DryRunBody) -> SendResult:
    ch = _channel(channel)
    # Preview only — runs the gate + adapter rules but never consumes the
    # idempotency key, so the UI can re-preview the same message freely.
    return get_channel_router().send(OutboundMessage(
        tenant_id=body.tenant_id,
        channel=ch,
        recipient_id=body.recipient_id,
        text=body.text,
        meta=body.meta,
    ), mark_idempotent=False)


# ── replay an inbound message (the "test a message" UI) ───────────────────────
@router.post("/{channel}/inbound")
def inbound(channel: str, body: InboundBody) -> dict:
    ch = _channel(channel)
    out = get_channel_router().route_inbound(ch, body.tenant_id, body.raw)
    return {
        "inbound": out["inbound"],
        "reply": out["reply"],
        "send_result": out["send_result"],
        "handled": out["handled"],
    }


# ── agents ────────────────────────────────────────────────────────────────────
@router.get("/agents")
def agents() -> list[dict]:
    return list_agents()


@router.get("/agents/{name}")
def agent(name: str, tenant_id: str) -> dict:
    out = agent_with_statuses(get_channel_router(), tenant_id, name)
    if out is None:
        raise HTTPException(status_code=404, detail=f"unknown agent: {name}")
    return out


# ── Pixie owner contact (masked only — never the raw value) ───────────────────
def _masked_contact(contact: Optional[PixieContact], tenant_id: str) -> dict:
    """A display-safe view: masked value, verification + notify prefs. No secret."""
    if contact is None:
        return {
            "tenant_id": tenant_id,
            "type": PixieContactType.EMAIL.value,
            "value_masked": "",
            "verified": False,
            "preferred_channel": Channel.EMAIL.value,
            "notify_on": [],
            "exists": False,
            "available_events": list(NOTIFY_EVENTS),
        }
    return {
        "tenant_id": contact.tenant_id,
        "type": contact.type.value,
        "value_masked": contact.value_masked,
        "verified": contact.verified,
        "preferred_channel": contact.preferred_channel.value,
        "notify_on": contact.notify_on,
        "exists": True,
        "available_events": list(NOTIFY_EVENTS),
    }


@router.get("/pixie-contact")
def get_pixie_contact(tenant_id: str) -> dict:
    return _masked_contact(get_channel_store().get_contact(tenant_id), tenant_id)


@router.post("/pixie-contact")
def set_pixie_contact(body: PixieContactBody) -> dict:
    # Store the raw value ONLY in the vault (ref) + keep a masked display.
    ref = get_vault().put(body.tenant_id, "owner_contact", body.value)
    # Only known notify events are accepted.
    notify_on = [e for e in body.notify_on if e in NOTIFY_EVENTS]
    contact = PixieContact(
        tenant_id=body.tenant_id,
        type=body.type,
        value_ref=ref,
        value_masked=mask(body.value),
        verified=False,  # changing the value re-requires verification
        preferred_channel=body.preferred_channel,
        notify_on=notify_on,
    )
    get_channel_store().save_contact(contact)
    return _masked_contact(contact, body.tenant_id)


@router.post("/pixie-contact/verify")
def verify_pixie_contact(tenant_id: str) -> dict:
    store = get_channel_store()
    contact = store.get_contact(tenant_id)
    if contact is None:
        raise HTTPException(status_code=404, detail="no Pixie contact to verify")
    contact.verified = True
    store.save_contact(contact)
    return _masked_contact(contact, tenant_id)
