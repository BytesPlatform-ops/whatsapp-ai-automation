"""AI Receptionist console API — the durable, product-wired HTTP surface.

Mounted under the SAME prefix as the older agent slice
(`/api/agents/ai-receptionist`) but on disjoint paths, so the existing
`/run` + `/run-from-gmail` (approval flow) and `/api/integrations/status` keep
working untouched. This router adds the brain entry point (`/message`),
conversations, CRM, bookings, quotes, tasks, reminders, tickets, escalations,
payments, campaigns, business profile + knowledge base, analytics, health,
capabilities, and the aggregated integrations panel.

Tenant is now SERVER-DERIVED via `resolve_tenant` (from `.context`). In
production (PIXIE_INTERNAL_API_SECRET set) the Next.js proxy is the only
trusted caller and tenant comes exclusively from the `X-Pixie-Tenant` header —
body/query `tenant_id` is ignored to prevent spoofing. In dev/test (secret
unset) `resolve_tenant` falls back to header → query → body → "demo_tenant".
"""

from __future__ import annotations

import os
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel

import persistence
from integrations import integration_status
from models import get_router
from runtime.mode import mode_banner
from schemas import ModelTier

from . import providers
from .context import WebhookVerificationError, resolve_tenant, verify_stripe_signature
from .service import analytics, business_profile as bp, engine, stores
from .service.handlers import registered_intents
from .service.ids import now_iso
from .service.schemas import (
    Booking, Escalation, Intent, PaymentRequest, Quote, Reminder, Task, Ticket,
)

AGENT_SLUG = "ai-receptionist"

console_router = APIRouter(prefix="/api/agents/ai-receptionist", tags=["ai-receptionist-console"])


# ── helpers ───────────────────────────────────────────────────────────────────

def _require(store, tenant_id: str, record_id: str, label: str) -> dict:
    rec = store.get(tenant_id, record_id)
    if rec is None:
        raise HTTPException(status_code=404, detail=f"{label} not found")
    return rec


def _patch(store, tenant_id: str, record_id: str, patch: dict, label: str,
           locked: tuple[str, ...] = ("id", "tenant_id", "created_at")) -> dict:
    rec = _require(store, tenant_id, record_id, label)
    for key, val in (patch or {}).items():
        if key in locked or val is None:
            continue
        rec[key] = val
    return store.put(tenant_id, rec)


# ── brain / core ──────────────────────────────────────────────────────────────

class MessageBody(BaseModel):
    tenant_id: str = "demo_tenant"
    message: str
    channel: str = "web_chat"
    conversation_id: Optional[str] = None
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    company: Optional[str] = None
    campaign_id: str = ""
    now: str = ""


def _run_body(tenant_id: str, body: MessageBody) -> dict:
    overrides = {"name": body.name, "email": body.email,
                 "phone": body.phone, "company": body.company}
    return engine.run_message(
        tenant_id=tenant_id, message=body.message, channel=body.channel,
        conversation_id=body.conversation_id, overrides={k: v for k, v in overrides.items() if v},
        campaign_id=body.campaign_id, now=body.now or now_iso(),
    )


@console_router.post("/message")
def run_message(body: MessageBody, tenant_id: str = Depends(resolve_tenant)) -> dict:
    """Run the receptionist brain on a customer message (the live console)."""
    if not body.message.strip():
        raise HTTPException(status_code=422, detail="message is required")
    return _run_body(tenant_id, body)


@console_router.get("/health")
def health() -> dict:
    r = get_router()
    return {
        "status": "ok",
        "agent_slug": AGENT_SLUG,
        "llm_provider": "openai" if r.mode == "openai" else "mock",
        "model": r.model_for(ModelTier.SMALL),
        "handlers": len(registered_intents()),
        "persistence": persistence.status(),
        "mode": mode_banner(),
    }


@console_router.get("/capabilities")
def capabilities() -> dict:
    return {
        "intents": [i.value for i in Intent],
        "handlers": registered_intents(),
        "actions_supported": len(registered_intents()),
        "provider_capabilities": providers.RECEPTIONIST_CAPABILITIES,
    }


# ── conversations ─────────────────────────────────────────────────────────────

@console_router.get("/conversations")
def list_conversations(tenant_id: str = Depends(resolve_tenant)) -> dict:
    return {"conversations": stores.conversations().list(tenant_id)}


@console_router.get("/conversations/{conversation_id}")
def get_conversation(conversation_id: str, tenant_id: str = Depends(resolve_tenant)) -> dict:
    conv = _require(stores.conversations(), tenant_id, conversation_id, "conversation")
    msgs = [m for m in stores.messages().list(tenant_id, newest_first=False)
            if m.get("conversation_id") == conversation_id]
    acts = [a for a in stores.actions().list(tenant_id)
            if a.get("conversation_id") == conversation_id]
    return {"conversation": conv, "messages": msgs, "actions": acts}


@console_router.post("/conversations/{conversation_id}/messages")
def add_conversation_message(
    conversation_id: str,
    body: MessageBody,
    tenant_id: str = Depends(resolve_tenant),
) -> dict:
    body.conversation_id = conversation_id
    return _run_body(tenant_id, body)


class EscalateBody(BaseModel):
    tenant_id: str = "demo_tenant"
    reason: str = ""
    now: str = ""


@console_router.post("/conversations/{conversation_id}/escalate")
def escalate_conversation(
    conversation_id: str,
    body: EscalateBody,
    tenant_id: str = Depends(resolve_tenant),
) -> dict:
    conv = _require(stores.conversations(), tenant_id=tenant_id,
                    record_id=conversation_id, label="conversation")
    esc = Escalation(
        tenant_id=tenant_id, contact_id=conv.get("contact_id"),
        conversation_id=conversation_id, reason=body.reason or "Manual escalation",
        source=conv.get("channel", "web_chat"),
    ).model_dump()
    notified: list[str] = []
    try:
        note = providers.notify_team(tenant_id=tenant_id,
                                     subject=f"[Escalation] {esc['reason'][:80]}",
                                     body=f"Conversation {conversation_id} escalated.",
                                     event="escalation.created")
        if note.status == "success":
            notified.append("email")
        providers.emit_webhook(event="escalation.created", payload=esc)
    except Exception:
        pass
    esc["notified"] = notified
    stores.escalations().put(tenant_id, esc)
    conv["status"] = "escalated"
    stores.conversations().put(tenant_id, conv)
    return {"escalation": esc}


# ── CRM / leads ───────────────────────────────────────────────────────────────

@console_router.get("/leads")
def list_leads(
    tenant_id: str = Depends(resolve_tenant),
    status: Optional[str] = Query(None),
) -> dict:
    rows = stores.contacts().list(tenant_id)
    if status:
        rows = [r for r in rows if r.get("status") == status]
    return {"leads": rows}


@console_router.get("/leads/{lead_id}")
def get_lead(lead_id: str, tenant_id: str = Depends(resolve_tenant)) -> dict:
    return {"lead": _require(stores.contacts(), tenant_id, lead_id, "lead")}


class LeadPatch(BaseModel):
    tenant_id: str = "demo_tenant"
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    company: Optional[str] = None
    service_interest: Optional[str] = None
    budget: Optional[str] = None
    status: Optional[str] = None
    score: Optional[int] = None
    notes: Optional[str] = None
    tags: Optional[list[str]] = None


@console_router.patch("/leads/{lead_id}")
def update_lead(
    lead_id: str,
    body: LeadPatch,
    tenant_id: str = Depends(resolve_tenant),
) -> dict:
    patch = body.model_dump(exclude={"tenant_id"}, exclude_none=True)
    return {"lead": _patch(stores.contacts(), tenant_id, lead_id, patch, "lead")}


class FollowUpBody(BaseModel):
    tenant_id: str = "demo_tenant"
    title: str = ""
    due_at: str = ""
    owner: str = ""


@console_router.post("/leads/{lead_id}/follow-up")
def lead_follow_up(
    lead_id: str,
    body: FollowUpBody,
    tenant_id: str = Depends(resolve_tenant),
) -> dict:
    lead = _require(stores.contacts(), tenant_id, lead_id, "lead")
    task = Task(
        tenant_id=tenant_id, contact_id=lead_id, kind="follow_up",
        title=body.title or f"Follow up with {lead.get('name') or lead.get('email') or 'lead'}",
        related_type="contact", related_id=lead_id, owner=body.owner,
        due_at=body.due_at, status="open",
    ).model_dump()
    stores.tasks().put(tenant_id, task)
    lead["status"] = "follow_up_needed"
    stores.contacts().put(tenant_id, lead)
    return {"task": task}


# ── bookings ──────────────────────────────────────────────────────────────────

@console_router.get("/bookings")
def list_bookings(tenant_id: str = Depends(resolve_tenant)) -> dict:
    return {"bookings": stores.bookings().list(tenant_id)}


class BookingCreate(BaseModel):
    tenant_id: str = "demo_tenant"
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    service_type: str = ""
    date: str = ""
    time: str = ""
    timezone: str = "UTC"
    notes: str = ""


@console_router.post("/bookings")
def create_booking(
    body: BookingCreate,
    tenant_id: str = Depends(resolve_tenant),
) -> dict:
    booking = Booking(**body.model_dump(exclude={"tenant_id"}), tenant_id=tenant_id, source="manual").model_dump()
    stores.bookings().put(tenant_id, booking)
    return {"booking": booking}


class BookingPatch(BaseModel):
    tenant_id: str = "demo_tenant"
    date: Optional[str] = None
    time: Optional[str] = None
    service_type: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None


@console_router.patch("/bookings/{booking_id}")
def update_booking(
    booking_id: str,
    body: BookingPatch,
    tenant_id: str = Depends(resolve_tenant),
) -> dict:
    patch = body.model_dump(exclude={"tenant_id"}, exclude_none=True)
    return {"booking": _patch(stores.bookings(), tenant_id, booking_id, patch, "booking")}


class TenantBody(BaseModel):
    tenant_id: str = "demo_tenant"


@console_router.post("/bookings/{booking_id}/confirm")
def confirm_booking(
    booking_id: str,
    body: TenantBody,
    tenant_id: str = Depends(resolve_tenant),
) -> dict:
    booking = _require(stores.bookings(), tenant_id, booking_id, "booking")
    booking["status"] = "confirmed"
    stores.bookings().put(tenant_id, booking)
    return {"booking": booking}


@console_router.post("/bookings/{booking_id}/cancel")
def cancel_booking(
    booking_id: str,
    body: TenantBody,
    tenant_id: str = Depends(resolve_tenant),
) -> dict:
    booking = _require(stores.bookings(), tenant_id, booking_id, "booking")
    booking["status"] = "cancelled"
    stores.bookings().put(tenant_id, booking)
    return {"booking": booking}


# ── quotes ────────────────────────────────────────────────────────────────────

@console_router.get("/quotes")
def list_quotes(tenant_id: str = Depends(resolve_tenant)) -> dict:
    return {"quotes": stores.quotes().list(tenant_id)}


class QuoteCreate(BaseModel):
    tenant_id: str = "demo_tenant"
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    service: str = ""
    scope: str = ""
    quantity: str = ""
    location: str = ""
    timeline: str = ""
    budget: str = ""
    notes: str = ""


@console_router.post("/quotes")
def create_quote(
    body: QuoteCreate,
    tenant_id: str = Depends(resolve_tenant),
) -> dict:
    quote = Quote(**body.model_dump(exclude={"tenant_id"}), tenant_id=tenant_id, source="manual").model_dump()
    stores.quotes().put(tenant_id, quote)
    return {"quote": quote}


class QuotePatch(BaseModel):
    tenant_id: str = "demo_tenant"
    status: Optional[str] = None
    estimated_min: Optional[float] = None
    estimated_max: Optional[float] = None
    notes: Optional[str] = None


@console_router.patch("/quotes/{quote_id}")
def update_quote(
    quote_id: str,
    body: QuotePatch,
    tenant_id: str = Depends(resolve_tenant),
) -> dict:
    patch = body.model_dump(exclude={"tenant_id"}, exclude_none=True)
    return {"quote": _patch(stores.quotes(), tenant_id, quote_id, patch, "quote")}


# ── tasks + reminders ─────────────────────────────────────────────────────────

@console_router.get("/tasks")
def list_tasks(
    tenant_id: str = Depends(resolve_tenant),
    status: Optional[str] = Query(None),
) -> dict:
    rows = stores.tasks().list(tenant_id)
    if status:
        rows = [r for r in rows if r.get("status") == status]
    return {"tasks": rows}


class TaskCreateBody(BaseModel):
    tenant_id: str = "demo_tenant"
    kind: str = "follow_up"
    title: str = ""
    due_at: str = ""
    owner: str = ""
    related_type: str = ""
    related_id: str = ""
    contact_id: Optional[str] = None
    notes: str = ""


@console_router.post("/tasks")
def create_task(
    body: TaskCreateBody,
    tenant_id: str = Depends(resolve_tenant),
) -> dict:
    task = Task(**body.model_dump(exclude={"tenant_id"}), tenant_id=tenant_id, source="manual").model_dump()
    stores.tasks().put(tenant_id, task)
    return {"task": task}


class TaskPatch(BaseModel):
    tenant_id: str = "demo_tenant"
    status: Optional[str] = None
    title: Optional[str] = None
    due_at: Optional[str] = None
    owner: Optional[str] = None
    notes: Optional[str] = None


@console_router.patch("/tasks/{task_id}")
def update_task(
    task_id: str,
    body: TaskPatch,
    tenant_id: str = Depends(resolve_tenant),
) -> dict:
    patch = body.model_dump(exclude={"tenant_id"}, exclude_none=True)
    return {"task": _patch(stores.tasks(), tenant_id, task_id, patch, "task")}


@console_router.post("/tasks/{task_id}/complete")
def complete_task(
    task_id: str,
    body: TenantBody,
    tenant_id: str = Depends(resolve_tenant),
) -> dict:
    task = _require(stores.tasks(), tenant_id, task_id, "task")
    task["status"] = "done"
    stores.tasks().put(tenant_id, task)
    return {"task": task}


@console_router.get("/reminders")
def list_reminders(tenant_id: str = Depends(resolve_tenant)) -> dict:
    return {"reminders": stores.reminders().list(tenant_id)}


# ── tickets + escalations ─────────────────────────────────────────────────────

@console_router.get("/tickets")
def list_tickets(tenant_id: str = Depends(resolve_tenant)) -> dict:
    return {"tickets": stores.tickets().list(tenant_id)}


class TicketCreate(BaseModel):
    tenant_id: str = "demo_tenant"
    kind: str = "support"
    subject: str = ""
    body: str = ""
    priority: str = "normal"
    contact_id: Optional[str] = None


@console_router.post("/tickets")
def create_ticket(
    payload: TicketCreate,
    tenant_id: str = Depends(resolve_tenant),
) -> dict:
    ticket = Ticket(
        tenant_id=tenant_id, kind=payload.kind, subject=payload.subject,
        body=payload.body, priority=payload.priority, contact_id=payload.contact_id,
        source="manual",
    ).model_dump()
    stores.tickets().put(tenant_id, ticket)
    return {"ticket": ticket}


class TicketPatch(BaseModel):
    tenant_id: str = "demo_tenant"
    status: Optional[str] = None
    priority: Optional[str] = None
    assigned_to: Optional[str] = None


@console_router.patch("/tickets/{ticket_id}")
def update_ticket(
    ticket_id: str,
    body: TicketPatch,
    tenant_id: str = Depends(resolve_tenant),
) -> dict:
    patch = body.model_dump(exclude={"tenant_id"}, exclude_none=True)
    return {"ticket": _patch(stores.tickets(), tenant_id, ticket_id, patch, "ticket")}


@console_router.get("/escalations")
def list_escalations(tenant_id: str = Depends(resolve_tenant)) -> dict:
    return {"escalations": stores.escalations().list(tenant_id)}


class EscalationPatch(BaseModel):
    tenant_id: str = "demo_tenant"
    status: Optional[str] = None
    priority: Optional[str] = None


@console_router.patch("/escalations/{escalation_id}")
def update_escalation(
    escalation_id: str,
    body: EscalationPatch,
    tenant_id: str = Depends(resolve_tenant),
) -> dict:
    patch = body.model_dump(exclude={"tenant_id"}, exclude_none=True)
    return {"escalation": _patch(stores.escalations(), tenant_id, escalation_id, patch, "escalation")}


# ── payments ──────────────────────────────────────────────────────────────────

@console_router.get("/payments")
def list_payments(tenant_id: str = Depends(resolve_tenant)) -> dict:
    return {"payments": stores.payments().list(tenant_id)}


class PaymentLinkBody(BaseModel):
    tenant_id: str = "demo_tenant"
    amount: float
    currency: str = "USD"
    description: str = ""
    email: Optional[str] = None
    contact_id: Optional[str] = None


@console_router.post("/payments/create-link")
def create_payment_link(
    body: PaymentLinkBody,
    tenant_id: str = Depends(resolve_tenant),
) -> dict:
    payment = PaymentRequest(
        tenant_id=tenant_id, contact_id=body.contact_id, amount=body.amount,
        currency=body.currency, description=body.description, email=body.email,
        source="manual",
    ).model_dump()
    result = providers.create_payment_link(
        amount=body.amount, currency=body.currency,
        description=body.description or "Payment", customer_email=body.email or "")
    if result.status == "success":
        payment["status"] = "link_created"
        payment["payment_link"] = result.data.get("payment_link", "")
        payment["provider"] = "stripe"
        payment["provider_ref"] = result.data.get("provider_ref", "")
    elif result.status in ("pending", "disabled"):
        payment["status"] = "pending"
    else:
        payment["status"] = "failed"
    stores.payments().put(tenant_id, payment)
    try:
        providers.emit_webhook(event="payment.created", payload=payment)
    except Exception:
        pass
    return {"payment": payment, "provider": result.to_dict()}


@console_router.post("/payments/webhook")
async def payment_webhook(request: Request) -> dict:
    """Stripe webhook: verify signature then mark the matching payment paid on
    checkout.session.completed. Tenant comes from Stripe-signed metadata (not
    resolve_tenant — Stripe is the caller, not the proxy)."""
    raw = await request.body()
    sig_header = request.headers.get("stripe-signature", "")
    secret = os.getenv("STRIPE_WEBHOOK_SECRET", "").strip()
    try:
        verify_stripe_signature(raw, sig_header, secret)
    except WebhookVerificationError as exc:
        raise HTTPException(status_code=400, detail="invalid signature") from exc

    import json as _json
    try:
        event = _json.loads(raw)
    except Exception:
        raise HTTPException(status_code=400, detail="invalid JSON")

    if event.get("type") != "checkout.session.completed":
        return {"received": True, "handled": False}
    session = (event.get("data") or {}).get("object") or {}
    ref = session.get("id", "")
    tenant_id = (session.get("metadata") or {}).get("tenant_id", "")
    updated = 0
    tenants = [tenant_id] if tenant_id else []
    for t in tenants:
        for p in stores.payments().query(t, provider_ref=ref):
            if p.get("status") == "paid":
                continue  # idempotency: skip already-paid records
            p["status"] = "paid"
            stores.payments().put(t, p)
            updated += 1
    return {"received": True, "handled": True, "updated": updated}


# ── campaigns (reuse the existing campaigns module for CRUD) ──────────────────

@console_router.get("/campaigns")
def list_campaigns(tenant_id: str = Depends(resolve_tenant)) -> dict:
    try:
        from .campaigns import store as cstore
        rows = [{"id": c.id, "name": c.name, "type": c.type.value, "status": c.status.value,
                 "channels": [ch.value for ch in c.channels], "dry_run": c.dry_run}
                for c in cstore.list_campaigns(tenant_id)]
    except Exception:
        rows = []
    return {"campaigns": rows}


@console_router.get("/campaigns/{campaign_id}/replies")
def campaign_replies(campaign_id: str, tenant_id: str = Depends(resolve_tenant)) -> dict:
    return {"replies": stores.campaign_replies().query(tenant_id, campaign_id=campaign_id)}


class CampaignReplyIngest(BaseModel):
    tenant_id: str = "demo_tenant"
    campaign_id: str = ""
    message: str
    email: Optional[str] = None
    phone: Optional[str] = None
    channel: str = "campaign"


@console_router.post("/campaigns/replies/ingest")
def ingest_campaign_reply(
    body: CampaignReplyIngest,
    tenant_id: str = Depends(resolve_tenant),
) -> dict:
    """Ingest a reply to a campaign — classified + routed through the brain
    (channel=campaign → campaign_reply handler, which respects unsubscribe)."""
    return engine.run_message(
        tenant_id=tenant_id, message=body.message, channel="campaign",
        overrides={k: v for k, v in {"email": body.email, "phone": body.phone}.items() if v},
        campaign_id=body.campaign_id,
    )


class CampaignSend(BaseModel):
    tenant_id: str = "demo_tenant"
    confirm_live: bool = False


@console_router.post("/campaigns/{campaign_id}/send")
def send_campaign(
    campaign_id: str,
    body: CampaignSend,
    tenant_id: str = Depends(resolve_tenant),
) -> dict:
    """Delegates to the existing compliance-gated campaign executor (dry-run
    unless confirm_live). Never sends unless the campaign is approved + live."""
    try:
        from .campaigns import executor as cexec
        from .campaigns import store as cstore

        campaign = cstore.get_campaign(tenant_id, campaign_id)
        if campaign is None:
            raise HTTPException(status_code=404, detail="campaign not found")
        return cexec.run(campaign, confirm_live=body.confirm_live)
    except HTTPException:
        raise
    except Exception as exc:
        return {"status": "pending", "detail": f"campaign send unavailable: {exc}"}


# ── opt-outs / callbacks / voicemails / waitlist (read surfaces for the UI) ────

@console_router.get("/opt-outs")
def list_opt_outs(tenant_id: str = Depends(resolve_tenant)) -> dict:
    return {"opt_outs": stores.optouts().list(tenant_id)}


@console_router.get("/callbacks")
def list_callbacks(tenant_id: str = Depends(resolve_tenant)) -> dict:
    return {"callbacks": stores.callbacks().list(tenant_id)}


@console_router.get("/voicemails")
def list_voicemails(tenant_id: str = Depends(resolve_tenant)) -> dict:
    return {"voicemails": stores.voicemails().list(tenant_id)}


@console_router.get("/waitlist")
def list_waitlist(tenant_id: str = Depends(resolve_tenant)) -> dict:
    return {"waitlist": stores.waitlist().list(tenant_id)}


# ── business profile + knowledge base ─────────────────────────────────────────

@console_router.get("/business-profile")
def get_business_profile(tenant_id: str = Depends(resolve_tenant)) -> dict:
    return {"profile": bp.get_profile(tenant_id), "configured": bp.profile_is_configured(tenant_id)}


class ProfilePatch(BaseModel):
    tenant_id: str = "demo_tenant"
    business_name: Optional[str] = None
    industry: Optional[str] = None
    hours: Optional[str] = None
    services: Optional[list[str]] = None
    pricing_notes: Optional[str] = None
    location: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    policies: Optional[str] = None
    process: Optional[str] = None
    tone: Optional[str] = None
    escalation_rules: Optional[str] = None
    custom_instructions: Optional[str] = None
    faqs: Optional[list[dict]] = None


@console_router.patch("/business-profile")
def update_business_profile(
    body: ProfilePatch,
    tenant_id: str = Depends(resolve_tenant),
) -> dict:
    patch = body.model_dump(exclude={"tenant_id"}, exclude_none=True)
    return {"profile": bp.save_profile(tenant_id, patch)}


@console_router.get("/knowledge")
def list_knowledge(tenant_id: str = Depends(resolve_tenant)) -> dict:
    return {"items": bp.list_knowledge(tenant_id)}


class KnowledgeCreate(BaseModel):
    tenant_id: str = "demo_tenant"
    title: str = ""
    content: str = ""
    category: str = "general"
    tags: list[str] = []


@console_router.post("/knowledge")
def create_knowledge(
    body: KnowledgeCreate,
    tenant_id: str = Depends(resolve_tenant),
) -> dict:
    return {"item": bp.create_knowledge(tenant_id, title=body.title, content=body.content,
                                        category=body.category, tags=body.tags)}


class KnowledgePatch(BaseModel):
    tenant_id: str = "demo_tenant"
    title: Optional[str] = None
    content: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[list[str]] = None


@console_router.patch("/knowledge/{item_id}")
def update_knowledge(
    item_id: str,
    body: KnowledgePatch,
    tenant_id: str = Depends(resolve_tenant),
) -> dict:
    patch = body.model_dump(exclude={"tenant_id"}, exclude_none=True)
    item = bp.update_knowledge(tenant_id, item_id, patch)
    if item is None:
        raise HTTPException(status_code=404, detail="knowledge item not found")
    return {"item": item}


@console_router.delete("/knowledge/{item_id}")
def delete_knowledge(
    item_id: str,
    tenant_id: str = Depends(resolve_tenant),
) -> dict:
    return {"deleted": bp.delete_knowledge(tenant_id, item_id)}


# ── analytics + integrations ──────────────────────────────────────────────────

@console_router.get("/overview")
def overview(tenant_id: str = Depends(resolve_tenant)) -> dict:
    return analytics.overview(tenant_id)


@console_router.get("/integrations/status")
def integrations_status(tenant_id: str = Depends(resolve_tenant)) -> dict:
    r = get_router()
    provider = "openai" if r.mode == "openai" else "mock"
    model_id = r.model_for(ModelTier.SMALL)
    return {
        "llm": {
            "provider": provider, "model": model_id,
            "status": "connected" if provider == "openai" else "mock",
            "note": "Deterministic mock provider (no key needed)." if provider == "mock" else "",
        },
        "core_capabilities": integration_status(tenant_id, AGENT_SLUG),
        "receptionist_providers": providers.all_status(),
        "persistence": persistence.status(),
        "mode": mode_banner(),
    }


class IntegrationTest(BaseModel):
    tenant_id: str = "demo_tenant"
    capability: str


@console_router.post("/integrations/test")
def integrations_test(
    body: IntegrationTest,
    tenant_id: str = Depends(resolve_tenant),
) -> dict:
    cap = body.capability
    if cap == "webhooks":
        return {"capability": cap, "result": providers.emit_webhook(
            event="test.ping", payload={"tenant_id": tenant_id, "ping": True}).to_dict()}
    prov = providers.get_provider(cap)
    if prov is not None:
        return {"capability": cap, "status": prov.status(), "note": "status check only (no live send)"}
    # core capability handled by the integrations layer
    core = {c["capability"]: c for c in integration_status(tenant_id, AGENT_SLUG)}
    if cap in core:
        return {"capability": cap, "status": core[cap], "note": "status check only"}
    raise HTTPException(status_code=404, detail=f"unknown capability: {cap}")
