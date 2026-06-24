"""Campaign / outreach HTTP surface (compliance-first, dry-run by default).

All routes are tenant-scoped. A campaign starts as `draft` + `dry_run=True`, must
be submitted → approved (human) before it can run, and `/dry-run` previews exactly
what WOULD be sent with per-target gate results. Nothing here sends a real message.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from . import executor, store
from .schemas import (
    Campaign,
    CampaignChannel,
    CampaignStatus,
    CampaignTarget,
    CampaignType,
    ConsentRecord,
    DoNotContactEntry,
    OptOutEntry,
)

router = APIRouter(prefix="/campaigns", tags=["campaigns"])


def _audit(c: Campaign, to: CampaignStatus, actor: str, reason: str = "") -> None:
    c.audit_log.append({"from": c.status.value, "to": to.value, "actor": actor,
                        "at": datetime.now(timezone.utc).isoformat(), "reason": reason})
    c.status = to


def _require(tenant_id: str, campaign_id: str) -> Campaign:
    c = store.get_campaign(tenant_id, campaign_id)
    if not c:
        raise HTTPException(404, "campaign not found")
    return c


# ── create / read ──────────────────────────────────────────────────────────
class CreateCampaign(BaseModel):
    tenant_id: str
    name: str = Field(..., min_length=1, max_length=120)
    type: CampaignType
    channels: list[CampaignChannel] = Field(..., min_length=1)
    message_template: str = ""
    subject_template: str | None = None
    ai_disclosure: str | None = None


@router.post("")
async def create(body: CreateCampaign) -> dict:
    c = Campaign(tenant_id=body.tenant_id, name=body.name, type=body.type, channels=body.channels,
                 message_template=body.message_template, subject_template=body.subject_template)
    if body.ai_disclosure:
        c.ai_disclosure = body.ai_disclosure
    store.save_campaign(c)
    return c.model_dump(mode="json")


@router.get("")
async def list_all(tenant_id: str) -> dict:
    return {"campaigns": [
        {"id": c.id, "name": c.name, "type": c.type.value, "status": c.status.value,
         "channels": [ch.value for ch in c.channels], "dry_run": c.dry_run}
        for c in store.list_campaigns(tenant_id)
    ]}


# ── consent / opt-out / DNC ─────────────────────────────────────────────────
# NOTE: these LITERAL paths must be declared BEFORE GET "/{campaign_id}" or
# FastAPI matches them as a campaign_id (path params are greedy in order).
@router.post("/consent")
async def add_consent(c: ConsentRecord) -> dict:
    return store.add_consent(c).model_dump(mode="json")


@router.post("/opt-outs")
async def add_opt_out(o: OptOutEntry) -> dict:
    return store.add_opt_out(o).model_dump(mode="json")


@router.get("/opt-outs")
async def list_opt_outs(tenant_id: str) -> dict:
    return {"opt_outs": [o.model_dump(mode="json") for o in store.list_opt_outs(tenant_id)]}


@router.post("/dnc")
async def add_dnc(d: DoNotContactEntry) -> dict:
    return store.add_dnc(d).model_dump(mode="json")


@router.get("/dnc")
async def list_dnc(tenant_id: str) -> dict:
    return {"dnc": [d.model_dump(mode="json") for d in store.list_dnc(tenant_id)]}


@router.get("/{campaign_id}")
async def detail(campaign_id: str, tenant_id: str) -> dict:
    c = _require(tenant_id, campaign_id)
    targets = store.list_targets(tenant_id, campaign_id)
    return {**c.model_dump(mode="json"), "target_count": len(targets)}


# ── targets ──────────────────────────────────────────────────────────────--
class AddTargets(BaseModel):
    tenant_id: str
    targets: list[dict]  # {customer_id?, name?, phone?, email?, timezone?, merge_vars?}


@router.post("/{campaign_id}/targets")
async def add_targets(campaign_id: str, body: AddTargets) -> dict:
    _require(body.tenant_id, campaign_id)
    ts = [CampaignTarget(tenant_id=body.tenant_id, campaign_id=campaign_id,
                         customer_id=t.get("customer_id"), name=t.get("name"),
                         phone=t.get("phone"), email=t.get("email"),
                         timezone=t.get("timezone", "UTC"), merge_vars=t.get("merge_vars", {}))
          for t in body.targets]
    store.add_targets(ts)
    return {"added": len(ts)}


@router.get("/{campaign_id}/targets")
async def get_targets(campaign_id: str, tenant_id: str) -> dict:
    return {"targets": [t.model_dump(mode="json") for t in store.list_targets(tenant_id, campaign_id)]}


# ── lifecycle ────────────────────────────────────────────────────────────--
class Actor(BaseModel):
    tenant_id: str
    actor: str = "owner"


@router.post("/{campaign_id}/submit")
async def submit(campaign_id: str, body: Actor) -> dict:
    c = _require(body.tenant_id, campaign_id)
    if c.status != CampaignStatus.DRAFT:
        raise HTTPException(409, f"can only submit a draft (status={c.status.value})")
    if not store.list_targets(body.tenant_id, campaign_id):
        raise HTTPException(422, "add at least one target before submitting")
    _audit(c, CampaignStatus.PENDING_APPROVAL, body.actor)
    store.save_campaign(c)
    return {"status": c.status.value}


class Approve(BaseModel):
    tenant_id: str
    approved_by: str


@router.post("/{campaign_id}/approve")
async def approve(campaign_id: str, body: Approve) -> dict:
    c = _require(body.tenant_id, campaign_id)
    if c.status != CampaignStatus.PENDING_APPROVAL:
        raise HTTPException(409, f"can only approve a pending campaign (status={c.status.value})")
    _audit(c, CampaignStatus.APPROVED, body.approved_by, "human approval")
    c.approved_by = body.approved_by
    c.approved_at = datetime.now(timezone.utc)
    store.save_campaign(c)
    return {"status": c.status.value, "approved_by": c.approved_by}


@router.post("/{campaign_id}/pause")
async def pause(campaign_id: str, body: Actor) -> dict:
    c = _require(body.tenant_id, campaign_id)
    if c.status not in (CampaignStatus.RUNNING, CampaignStatus.APPROVED):
        raise HTTPException(409, f"cannot pause (status={c.status.value})")
    _audit(c, CampaignStatus.PAUSED, body.actor)
    store.save_campaign(c)
    return {"status": c.status.value}


# ── execution (dry-run preview / gated execute) ─────────────────────────────
@router.post("/{campaign_id}/dry-run")
async def dry_run(campaign_id: str, tenant_id: str) -> dict:
    """Preview what WOULD be sent — runs the gate over every target. Never sends."""
    c = _require(tenant_id, campaign_id)
    return executor.run(c, confirm_live=False)


class Execute(BaseModel):
    tenant_id: str
    confirm_live: bool = False


@router.post("/{campaign_id}/execute")
async def execute(campaign_id: str, body: Execute) -> dict:
    c = _require(body.tenant_id, campaign_id)
    if c.status not in (CampaignStatus.APPROVED, CampaignStatus.RUNNING):
        raise HTTPException(409, f"campaign must be approved/running to execute (status={c.status.value})")
    if c.status == CampaignStatus.APPROVED:
        _audit(c, CampaignStatus.RUNNING, "system", "execute")
        store.save_campaign(c)
    return executor.run(c, confirm_live=body.confirm_live)

