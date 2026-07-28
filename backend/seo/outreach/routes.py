"""SEO Outreach API routes.

Prefix: /api/agents/seo  (shared with seo.agent_routes)
Tag:    seo-outreach

All endpoints are tenant-scoped. Tenant resolution follows the same
precedence as the rest of the SEO agent:
  1. X-Pixie-Tenant header (trusted proxy) — always wins.
  2. Strict mode + no header → HTTP 400.
  3. Dev/test → body tenant_id / query tenant_id / "demo_tenant".

Campaign IDs are resolved against the caller's tenant only (no ID-guessing
across tenants — the repo layer enforces this via get(tenant_id, id)).

To include in app.py (WITHOUT editing that file):
    from seo.outreach.routes import router as outreach_router
    app.include_router(outreach_router)
"""

from __future__ import annotations

import os
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, field_validator

from ..tenant import effective_tenant, resolve_tenant, resolve_tenant_header
from ..url_guard import UrlRejected
from . import campaigns as camp_svc
from . import contacts as cont_svc
from . import drafts as draft_svc
from . import followups as fu_svc
from . import link_tracking as lt_svc
from .stores import (
    CampaignStatus,
    CampaignType,
    DraftStatus,
    PlacementOutcome,
    SuppressionReason,
)

router = APIRouter(prefix="/api/agents/seo", tags=["seo-outreach"])

# ── Guards ────────────────────────────────────────────────────────────────────

def _outreach_enabled() -> bool:
    return os.getenv("SEO_OUTREACH_ENABLED", "1").strip().lower() in ("1", "true", "yes", "on")


def _require_outreach() -> None:
    if not _outreach_enabled():
        raise HTTPException(status_code=503, detail={"error": "seo_outreach_disabled"})


# ── Request bodies ────────────────────────────────────────────────────────────

class AddContactBody(BaseModel):
    tenant_id: Optional[str] = None
    domain: str
    website: str = ""
    name: str = ""
    role: str = ""
    email: str = ""
    source: str = "manual"
    tags: List[str] = []
    notes: str = ""
    consent_notes: str = ""

    @field_validator("email")
    @classmethod
    def email_no_header_injection(cls, v: str) -> str:
        return v.replace("\r", "").replace("\n", "").strip()


class UpdateContactBody(BaseModel):
    tenant_id: Optional[str] = None
    domain: Optional[str] = None
    name: Optional[str] = None
    role: Optional[str] = None
    email: Optional[str] = None
    tags: Optional[List[str]] = None
    notes: Optional[str] = None
    consent_notes: Optional[str] = None
    do_not_contact: Optional[bool] = None


class SuppressBody(BaseModel):
    tenant_id: Optional[str] = None
    email: str
    reason: str = "manual"
    notes: str = ""


class ImportContactsBody(BaseModel):
    tenant_id: Optional[str] = None
    csv_text: str
    source: str = "csv"


class CreateCampaignBody(BaseModel):
    tenant_id: Optional[str] = None
    name: str = ""
    site_id: str = ""
    opportunity_id: str = ""
    contact_ids: List[str] = []
    sender_identity: str = ""
    template: str = ""
    personalisation: Dict[str, Any] = {}
    campaign_type: str = CampaignType.LINK_GAP.value
    followup_sequence: List[Dict[str, Any]] = []


class UpdateCampaignBody(BaseModel):
    tenant_id: Optional[str] = None
    name: Optional[str] = None
    sender_identity: Optional[str] = None
    template: Optional[str] = None
    personalisation: Optional[Dict[str, Any]] = None
    followup_sequence: Optional[List[Dict[str, Any]]] = None


class TransitionBody(BaseModel):
    tenant_id: Optional[str] = None
    new_status: str
    actor: str = ""
    notes: str = ""


class ApproveCampaignBody(BaseModel):
    tenant_id: Optional[str] = None
    approved_by: str
    notes: str = ""


class AttachContactsBody(BaseModel):
    tenant_id: Optional[str] = None
    contact_ids: List[str]


class GenerateDraftBody(BaseModel):
    tenant_id: Optional[str] = None
    campaign_id: str
    contact_id: str
    evidence: Dict[str, Any] = {}
    client_page: str = ""
    brand_tone: str = "professional"
    is_mock: bool = True


class EditDraftBody(BaseModel):
    tenant_id: Optional[str] = None
    subject: Optional[str] = None
    body: Optional[str] = None
    evidence: Optional[Dict[str, Any]] = None


class ApproveDraftBody(BaseModel):
    tenant_id: Optional[str] = None
    approved_by: str


class SendBody(BaseModel):
    tenant_id: Optional[str] = None
    campaign_id: str
    contact_id: str
    sequence_index: int = 0
    is_mock: bool = True


class ScheduleFollowupsBody(BaseModel):
    tenant_id: Optional[str] = None
    campaign_id: str
    contact_ids: Optional[List[str]] = None


class RunFollowupsBody(BaseModel):
    tenant_id: Optional[str] = None
    is_mock: bool = True


class AddPlacementBody(BaseModel):
    tenant_id: Optional[str] = None
    campaign_id: str
    contact_id: str
    outcome: str = PlacementOutcome.PENDING.value
    target_url: str = ""
    source_url: str = ""
    anchor: str = ""
    rel: str = ""


class UpdatePlacementBody(BaseModel):
    tenant_id: Optional[str] = None
    outcome: Optional[str] = None
    target_url: Optional[str] = None
    source_url: Optional[str] = None
    anchor: Optional[str] = None
    rel: Optional[str] = None


class VerifyPlacementBody(BaseModel):
    tenant_id: Optional[str] = None
    is_mock: bool = True


# ── Contacts ─────────────────────────────────────────────────────────────────

@router.post("/outreach/contacts")
def add_contact(
    body: AddContactBody,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
):
    _require_outreach()
    tenant = effective_tenant(_header_tenant, body.tenant_id)
    try:
        cid, contact = cont_svc.add_contact(
            tenant,
            domain=body.domain,
            website=body.website,
            name=body.name,
            role=body.role,
            email=body.email,
            source=body.source,
            tags=body.tags,
            notes=body.notes,
            consent_notes=body.consent_notes,
        )
        return {"id": cid, "contact": _contact_dict(cid, contact)}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={"error": str(exc)})


@router.get("/outreach/contacts")
def list_contacts(tenant: str = Depends(resolve_tenant)):
    _require_outreach()
    pairs = cont_svc.list_contacts(tenant)
    return {"contacts": [{"id": cid, "contact": _contact_dict(cid, c)} for cid, c in pairs]}


@router.get("/outreach/contacts/{contact_id}")
def get_contact(
    contact_id: str,
    tenant: str = Depends(resolve_tenant),
):
    _require_outreach()
    result = cont_svc.get_contact(tenant, contact_id)
    if not result:
        raise HTTPException(status_code=404, detail={"error": "contact_not_found"})
    cid, c = result
    return {"id": cid, "contact": _contact_dict(cid, c)}


@router.patch("/outreach/contacts/{contact_id}")
def update_contact(
    contact_id: str,
    body: UpdateContactBody,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
):
    _require_outreach()
    tenant = effective_tenant(_header_tenant, body.tenant_id)
    fields = body.model_dump(exclude_none=True)
    fields.pop("tenant_id", None)
    try:
        result = cont_svc.update_contact(tenant, contact_id, **fields)
        if not result:
            raise HTTPException(status_code=404, detail={"error": "contact_not_found"})
        cid, c = result
        return {"id": cid, "contact": _contact_dict(cid, c)}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={"error": str(exc)})


@router.delete("/outreach/contacts/{contact_id}")
def delete_contact(
    contact_id: str,
    tenant: str = Depends(resolve_tenant),
):
    _require_outreach()
    deleted = cont_svc.delete_contact(tenant, contact_id)
    return {"deleted": deleted}


@router.post("/outreach/contacts/import")
def import_contacts(
    body: ImportContactsBody,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
):
    _require_outreach()
    tenant = effective_tenant(_header_tenant, body.tenant_id)
    result = cont_svc.import_contacts_csv(tenant, body.csv_text, source=body.source)
    return result


@router.get("/outreach/contacts/export/csv")
def export_contacts(tenant: str = Depends(resolve_tenant)):
    _require_outreach()
    from fastapi.responses import Response
    csv_text = cont_svc.export_contacts_csv(tenant)
    return Response(content=csv_text, media_type="text/csv",
                    headers={"Content-Disposition": "attachment; filename=outreach_contacts.csv"})


@router.post("/outreach/suppress")
def suppress(
    body: SuppressBody,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
):
    _require_outreach()
    tenant = effective_tenant(_header_tenant, body.tenant_id)
    try:
        reason = SuppressionReason(body.reason)
    except ValueError:
        reason = SuppressionReason.MANUAL
    sid, entry = cont_svc.suppress_email(tenant, body.email, reason=reason, notes=body.notes)
    return {"id": sid, "suppressed": True, "email": entry.email}


@router.get("/outreach/suppression")
def list_suppression(tenant: str = Depends(resolve_tenant)):
    _require_outreach()
    pairs = cont_svc.list_suppression(tenant)
    return {
        "suppression": [
            {"id": sid, "email": e.email, "domain": e.domain, "reason": e.reason.value if hasattr(e.reason, "value") else str(e.reason)}
            for sid, e in pairs
        ]
    }


# ── Campaigns ─────────────────────────────────────────────────────────────────

@router.post("/outreach/campaigns")
def create_campaign(
    body: CreateCampaignBody,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
):
    _require_outreach()
    tenant = effective_tenant(_header_tenant, body.tenant_id)
    try:
        campaign_type = CampaignType(body.campaign_type)
    except ValueError:
        campaign_type = CampaignType.LINK_GAP
    try:
        cid, campaign = camp_svc.create_campaign(
            tenant,
            name=body.name,
            site_id=body.site_id,
            opportunity_id=body.opportunity_id,
            contact_ids=body.contact_ids,
            sender_identity=body.sender_identity,
            template=body.template,
            personalisation=body.personalisation,
            campaign_type=campaign_type,
            followup_sequence=body.followup_sequence,
        )
        return {"id": cid, "campaign": _campaign_dict(cid, campaign)}
    except Exception as exc:
        raise HTTPException(status_code=400, detail={"error": str(exc)})


@router.get("/outreach/campaigns")
def list_campaigns(
    tenant: str = Depends(resolve_tenant),
    site_id: Optional[str] = Query(default=None),
):
    _require_outreach()
    if site_id:
        pairs = camp_svc.list_campaigns_by_site(tenant, site_id)
    else:
        pairs = camp_svc.list_campaigns(tenant)
    return {"campaigns": [{"id": cid, "campaign": _campaign_dict(cid, c)} for cid, c in pairs]}


@router.get("/outreach/campaigns/{campaign_id}")
def get_campaign(
    campaign_id: str,
    tenant: str = Depends(resolve_tenant),
):
    _require_outreach()
    result = camp_svc.get_campaign(tenant, campaign_id)
    if not result:
        raise HTTPException(status_code=404, detail={"error": "campaign_not_found"})
    cid, c = result
    return {"id": cid, "campaign": _campaign_dict(cid, c)}


@router.patch("/outreach/campaigns/{campaign_id}")
def update_campaign(
    campaign_id: str,
    body: UpdateCampaignBody,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
):
    _require_outreach()
    tenant = effective_tenant(_header_tenant, body.tenant_id)
    fields = body.model_dump(exclude_none=True)
    fields.pop("tenant_id", None)
    result = camp_svc.update_campaign(tenant, campaign_id, **fields)
    if not result:
        raise HTTPException(status_code=404, detail={"error": "campaign_not_found"})
    cid, c = result
    return {"id": cid, "campaign": _campaign_dict(cid, c)}


@router.post("/outreach/campaigns/{campaign_id}/transition")
def transition_campaign(
    campaign_id: str,
    body: TransitionBody,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
):
    _require_outreach()
    tenant = effective_tenant(_header_tenant, body.tenant_id)
    try:
        new_status = CampaignStatus(body.new_status)
        result = camp_svc.transition(tenant, campaign_id, new_status,
                                     actor=body.actor, notes=body.notes)
        if not result:
            raise HTTPException(status_code=404, detail={"error": "campaign_not_found"})
        cid, c = result
        return {"id": cid, "campaign": _campaign_dict(cid, c)}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={"error": str(exc)})


@router.post("/outreach/campaigns/{campaign_id}/approve")
def approve_campaign(
    campaign_id: str,
    body: ApproveCampaignBody,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
):
    _require_outreach()
    tenant = effective_tenant(_header_tenant, body.tenant_id)
    try:
        result = camp_svc.approve_campaign(tenant, campaign_id, approved_by=body.approved_by, notes=body.notes)
        cid, c = result
        return {"id": cid, "campaign": _campaign_dict(cid, c)}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={"error": str(exc)})


@router.post("/outreach/campaigns/{campaign_id}/contacts")
def attach_contacts_to_campaign(
    campaign_id: str,
    body: AttachContactsBody,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
):
    _require_outreach()
    tenant = effective_tenant(_header_tenant, body.tenant_id)
    try:
        result = camp_svc.attach_contacts(tenant, campaign_id, body.contact_ids)
        if not result:
            raise HTTPException(status_code=404, detail={"error": "campaign_not_found"})
        cid, c = result
        return {"id": cid, "campaign": _campaign_dict(cid, c)}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={"error": str(exc)})


@router.delete("/outreach/campaigns/{campaign_id}")
def delete_campaign(
    campaign_id: str,
    tenant: str = Depends(resolve_tenant),
):
    _require_outreach()
    try:
        deleted = camp_svc.delete_campaign(tenant, campaign_id)
        return {"deleted": deleted}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={"error": str(exc)})


# ── Drafts ────────────────────────────────────────────────────────────────────

@router.post("/outreach/drafts/generate")
def generate_draft(
    body: GenerateDraftBody,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
):
    _require_outreach()
    tenant = effective_tenant(_header_tenant, body.tenant_id)
    try:
        did, draft = draft_svc.generate_draft(
            tenant,
            campaign_id=body.campaign_id,
            contact_id=body.contact_id,
            evidence=body.evidence,
            client_page=body.client_page,
            brand_tone=body.brand_tone,
            is_mock=body.is_mock,
        )
        return {"id": did, "draft": _draft_dict(did, draft)}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={"error": str(exc)})


@router.get("/outreach/drafts")
def list_drafts(
    campaign_id: str = Query(...),
    tenant: str = Depends(resolve_tenant),
):
    _require_outreach()
    # Tenant-scoped: only drafts for campaigns owned by this tenant.
    camp_result = camp_svc.get_campaign(tenant, campaign_id)
    if not camp_result:
        raise HTTPException(status_code=404, detail={"error": "campaign_not_found"})
    pairs = draft_svc.list_drafts(tenant, campaign_id)
    return {"drafts": [{"id": did, "draft": _draft_dict(did, d)} for did, d in pairs]}


@router.get("/outreach/drafts/{draft_id}")
def get_draft(
    draft_id: str,
    tenant: str = Depends(resolve_tenant),
):
    _require_outreach()
    result = draft_svc.get_draft(tenant, draft_id)
    if not result:
        raise HTTPException(status_code=404, detail={"error": "draft_not_found"})
    did, d = result
    return {"id": did, "draft": _draft_dict(did, d)}


@router.patch("/outreach/drafts/{draft_id}")
def edit_draft(
    draft_id: str,
    body: EditDraftBody,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
):
    _require_outreach()
    tenant = effective_tenant(_header_tenant, body.tenant_id)
    try:
        result = draft_svc.edit_draft(
            tenant, draft_id,
            subject=body.subject,
            body=body.body,
            evidence=body.evidence,
        )
        if not result:
            raise HTTPException(status_code=404, detail={"error": "draft_not_found"})
        did, d = result
        return {"id": did, "draft": _draft_dict(did, d)}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={"error": str(exc)})


@router.post("/outreach/drafts/{draft_id}/approve")
def approve_draft(
    draft_id: str,
    body: ApproveDraftBody,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
):
    _require_outreach()
    tenant = effective_tenant(_header_tenant, body.tenant_id)
    result = draft_svc.approve_draft(tenant, draft_id, approved_by=body.approved_by)
    if not result:
        raise HTTPException(status_code=404, detail={"error": "draft_not_found"})
    did, d = result
    return {"id": did, "draft": _draft_dict(did, d)}


# ── Send ─────────────────────────────────────────────────────────────────────

@router.post("/outreach/send")
def send_email(
    body: SendBody,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
):
    """Approval-gated send. Blocked unless campaign + draft are approved."""
    _require_outreach()
    tenant = effective_tenant(_header_tenant, body.tenant_id)

    # Cross-tenant campaign check.
    camp_result = camp_svc.get_campaign(tenant, body.campaign_id)
    if not camp_result:
        raise HTTPException(status_code=404, detail={"error": "campaign_not_found"})

    from .sending import send_outreach_email
    result = send_outreach_email(
        tenant,
        campaign_id=body.campaign_id,
        contact_id=body.contact_id,
        sequence_index=body.sequence_index,
        is_mock=body.is_mock,
    )
    if result.get("status") == "blocked":
        raise HTTPException(status_code=403, detail={"error": result.get("reason", "blocked")})
    if result.get("status") == "error":
        raise HTTPException(status_code=400, detail={"error": result.get("reason", "send_error")})
    return result


# ── Follow-ups ────────────────────────────────────────────────────────────────

@router.post("/outreach/followups/schedule")
def schedule_followups(
    body: ScheduleFollowupsBody,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
):
    _require_outreach()
    tenant = effective_tenant(_header_tenant, body.tenant_id)
    try:
        created = fu_svc.schedule_followups(
            tenant, body.campaign_id, contact_ids=body.contact_ids
        )
        return {"scheduled": len(created), "followups": [{"id": fid} for fid, _ in created]}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={"error": str(exc)})


@router.post("/outreach/followups/run")
def run_followups(
    body: RunFollowupsBody,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
):
    _require_outreach()
    tenant = effective_tenant(_header_tenant, body.tenant_id)
    results = fu_svc.run_due_followups(tenant, is_mock=body.is_mock)
    return {"results": results, "processed": len(results)}


@router.get("/outreach/followups")
def list_followups(
    campaign_id: str = Query(...),
    tenant: str = Depends(resolve_tenant),
):
    _require_outreach()
    # Tenant-scoped campaign check.
    camp_result = camp_svc.get_campaign(tenant, campaign_id)
    if not camp_result:
        raise HTTPException(status_code=404, detail={"error": "campaign_not_found"})
    pairs = fu_svc.list_followups(tenant, campaign_id)
    return {
        "followups": [
            {"id": fid, "followup": _followup_dict(fid, fu)}
            for fid, fu in pairs
        ]
    }


@router.post("/outreach/followups/{followup_id}/stop")
def stop_followup(
    followup_id: str,
    tenant: str = Depends(resolve_tenant),
):
    _require_outreach()
    stopped = fu_svc.stop_followup(tenant, followup_id)
    return {"stopped": stopped}


# ── Link placements ───────────────────────────────────────────────────────────

@router.post("/outreach/placements")
def add_placement(
    body: AddPlacementBody,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
):
    _require_outreach()
    tenant = effective_tenant(_header_tenant, body.tenant_id)
    try:
        outcome = PlacementOutcome(body.outcome)
    except ValueError:
        outcome = PlacementOutcome.PENDING
    try:
        pid, placement = lt_svc.add_placement(
            tenant,
            campaign_id=body.campaign_id,
            contact_id=body.contact_id,
            outcome=outcome,
            target_url=body.target_url,
            source_url=body.source_url,
            anchor=body.anchor,
            rel=body.rel,
        )
        return {"id": pid, "placement": _placement_dict(pid, placement)}
    except (ValueError, UrlRejected) as exc:
        raise HTTPException(status_code=400, detail={"error": str(exc)})


@router.get("/outreach/placements")
def list_placements(
    campaign_id: str = Query(...),
    tenant: str = Depends(resolve_tenant),
):
    _require_outreach()
    camp_result = camp_svc.get_campaign(tenant, campaign_id)
    if not camp_result:
        raise HTTPException(status_code=404, detail={"error": "campaign_not_found"})
    pairs = lt_svc.list_placements(tenant, campaign_id)
    return {"placements": [{"id": pid, "placement": _placement_dict(pid, p)} for pid, p in pairs]}


@router.patch("/outreach/placements/{placement_id}")
def update_placement(
    placement_id: str,
    body: UpdatePlacementBody,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
):
    _require_outreach()
    tenant = effective_tenant(_header_tenant, body.tenant_id)
    fields = body.model_dump(exclude_none=True)
    fields.pop("tenant_id", None)
    if "outcome" in fields:
        try:
            fields["outcome"] = PlacementOutcome(fields["outcome"])
        except ValueError:
            fields.pop("outcome")
    result = lt_svc.update_placement(tenant, placement_id, **fields)
    if not result:
        raise HTTPException(status_code=404, detail={"error": "placement_not_found"})
    pid, p = result
    return {"id": pid, "placement": _placement_dict(pid, p)}


@router.post("/outreach/placements/{placement_id}/verify")
def verify_placement(
    placement_id: str,
    body: VerifyPlacementBody,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
):
    _require_outreach()
    tenant = effective_tenant(_header_tenant, body.tenant_id)
    result = lt_svc.verify_placement(tenant, placement_id, is_mock=body.is_mock)
    if result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result)
    return result


# ── Serialisation helpers ─────────────────────────────────────────────────────

def _ev(val) -> str:
    """Enum → value string."""
    return val.value if hasattr(val, "value") else str(val)


def _contact_dict(cid: str, c) -> dict:
    return {
        "id": cid,
        "domain": c.domain,
        "website": c.website,
        "name": c.name,
        "role": c.role,
        "email": c.email,
        "source": c.source,
        "verification_status": _ev(c.verification_status),
        "relationship_status": _ev(c.relationship_status),
        "tags": c.tags,
        "notes": c.notes,
        "last_contacted": c.last_contacted,
        "consent_notes": c.consent_notes,
        "do_not_contact": c.do_not_contact,
        "bounce_status": _ev(c.bounce_status),
        "created_at": c.created_at,
        "updated_at": c.updated_at,
    }


def _campaign_dict(cid: str, c) -> dict:
    return {
        "id": cid,
        "name": c.name,
        "site_id": c.site_id,
        "opportunity_id": c.opportunity_id,
        "contact_ids": c.contact_ids,
        "sender_identity": c.sender_identity,
        "template": c.template,
        "personalisation": c.personalisation,
        "status": _ev(c.status),
        "approval": c.approval,
        "send_schedule": c.send_schedule,
        "followup_sequence": c.followup_sequence,
        "outcome": c.outcome,
        "campaign_type": _ev(c.campaign_type),
        "created_at": c.created_at,
        "updated_at": c.updated_at,
    }


def _draft_dict(did: str, d) -> dict:
    return {
        "id": did,
        "campaign_id": d.campaign_id,
        "contact_id": d.contact_id,
        "subject": d.subject,
        "body": d.body,
        "evidence": d.evidence,
        "version": d.version,
        "status": _ev(d.status),
        "approved": d.approved,
        "approved_by": d.approved_by,
        "approved_at": d.approved_at,
        "generation_model": d.generation_model,
        "created_at": d.created_at,
        "updated_at": d.updated_at,
    }


def _followup_dict(fid: str, fu) -> dict:
    return {
        "id": fid,
        "campaign_id": fu.campaign_id,
        "contact_id": fu.contact_id,
        "sequence_index": fu.sequence_index,
        "scheduled_for": fu.scheduled_for,
        "status": _ev(fu.status),
        "sent_at": fu.sent_at,
        "stop_reason": fu.stop_reason,
        "draft_id": fu.draft_id,
        "created_at": fu.created_at,
        "updated_at": fu.updated_at,
    }


def _placement_dict(pid: str, p) -> dict:
    return {
        "id": pid,
        "campaign_id": p.campaign_id,
        "contact_id": p.contact_id,
        "outcome": _ev(p.outcome),
        "target_url": p.target_url,
        "source_url": p.source_url,
        "anchor": p.anchor,
        "rel": p.rel,
        "first_verified": p.first_verified,
        "last_verified": p.last_verified,
        "last_verified_status": p.last_verified_status,
        "created_at": p.created_at,
        "updated_at": p.updated_at,
    }
