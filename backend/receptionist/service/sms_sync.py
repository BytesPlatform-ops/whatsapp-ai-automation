"""SMS inbound processing + reply orchestration (Parts 5-16).

Routes qualifying SMS through the CANONICAL engine (``engine.run_message``) — same
engine, config, knowledge, handoff, actions, approvals, billing and idempotency as
every other channel. No SMS-specific AI engine. Multipart messages process once;
MMS media persists safely; the SMS policy service decides consent + quiet hours;
STOP/START/HELP are honoured; drafts are durable, carry a segment estimate, and
reply modes are server-authoritative.
"""

from __future__ import annotations

import re
from typing import Optional

from . import stores
from .ids import new_id, now_iso

REPLY_MODES = ("disabled", "draft_only", "approval_required", "direct_reply")

# Configurable opt-out / opt-in / help commands (Part 10).
_OPT_OUT = re.compile(r"^\s*(stop|stopall|unsubscribe|cancel|end|quit|optout|opt[\s-]?out)\s*[.!]?\s*$", re.I)
_OPT_IN = re.compile(r"^\s*(start|yes|unstop|optin|opt[\s-]?in)\s*[.!]?\s*$", re.I)
_HELP = re.compile(r"^\s*(help|info)\s*[.!]?\s*$", re.I)

DRAFT_STATES = ("generated", "pending_approval", "approved", "delayed_quiet_hours", "queued",
                "sending", "provider_pending", "sent", "delivered", "failed", "cancelled",
                "blocked_consent", "blocked_suppression", "reconciliation_required")


def reply_mode(tenant_id: str) -> str:
    from . import sms_policy
    return sms_policy.reply_mode(tenant_id)


# ── thread ↔ conversation mapping (Part 6) ────────────────────────────────────

def _norm(number: str) -> str:
    from ..providers.sms_adapter import normalise_e164
    return normalise_e164(number)


def _thread_key(tenant_id: str, sender_number: str, customer: str) -> str:
    return f"sms::{tenant_id}::{_norm(sender_number)}::{_norm(customer)}"


def conversation_for(tenant_id: str, sender_number: str, customer: str) -> Optional[str]:
    rec = stores.sms_thread_map().get(tenant_id, _thread_key(tenant_id, sender_number, customer))
    return rec.get("conversation_id") if rec else None


def link_thread(tenant_id: str, sender_number: str, customer: str, conversation_id: str) -> None:
    stores.sms_thread_map().put(tenant_id, {
        "id": _thread_key(tenant_id, sender_number, customer), "tenant_id": tenant_id,
        "sender_number": _norm(sender_number), "customer_number": _norm(customer),
        "conversation_id": conversation_id, "updated_at": now_iso()})


# ── drafts (Part 13) ──────────────────────────────────────────────────────────

def save_draft(tenant_id: str, draft: dict) -> dict:
    draft.setdefault("id", new_id("smsdft"))
    draft.setdefault("created_at", now_iso())
    draft["updated_at"] = now_iso()
    return stores.sms_drafts().put(tenant_id, draft)


def list_drafts(tenant_id: str) -> list[dict]:
    return stores.sms_drafts().list(tenant_id)


def edit_draft(tenant_id: str, draft_id: str, *, text: Optional[str] = None) -> Optional[dict]:
    from . import sms_segments
    d = stores.sms_drafts().get(tenant_id, draft_id)
    if d is None:
        return None
    if d.get("status") in ("sent", "sending", "delivered", "provider_pending"):
        return {"status": "locked"}
    d.setdefault("edit_history", []).append({"at": now_iso(), "text": d.get("text", "")})
    if text is not None:
        d["text"] = text
        seg = sms_segments.analyze(text)
        d["encoding"] = seg["encoding"]
        d["segments"] = seg["segments"]
    invalidated = False
    if d.get("status") == "pending_approval" and d.get("approval_id"):
        _invalidate_approval(tenant_id, d["approval_id"])
        invalidated = True
        d["approval_id"] = ""
    d["status"] = "generated"
    saved = save_draft(tenant_id, d)
    saved["approval_invalidated"] = invalidated
    return saved


def _invalidate_approval(tenant_id: str, approval_id: str) -> None:
    try:
        from approvals.router import get_approvals_store
        store = get_approvals_store()
        item = store.get(tenant_id, approval_id)
        if item is not None and item.status in ("pending", "approved"):
            item.status = "skipped"
            store.save(item)
    except Exception:
        pass


# ── inbound parsing ───────────────────────────────────────────────────────────

def parse_inbound(payload: dict) -> dict:
    """Normalise a provider inbound webhook payload (Twilio-shaped) into an
    internal message shape."""
    num_media = int(payload.get("NumMedia", 0) or 0)
    media = []
    for i in range(num_media):
        media.append({"url": payload.get(f"MediaUrl{i}", ""),
                      "content_type": payload.get(f"MediaContentType{i}", "")})
    return {
        "message_id": payload.get("MessageSid", "") or payload.get("SmsSid", ""),
        "from": payload.get("From", ""), "to": payload.get("To", ""),
        "body": payload.get("Body", "") or "", "num_media": num_media, "media": media,
        "segments": int(payload.get("NumSegments", 0) or 0),
    }


def _is_opt_out(text: str) -> bool: return bool(_OPT_OUT.match(text or ""))
def _is_opt_in(text: str) -> bool: return bool(_OPT_IN.match(text or ""))
def _is_help(text: str) -> bool: return bool(_HELP.match(text or ""))


# ── main inbound flow (Parts 5/7/8/9) ─────────────────────────────────────────

def process_message(tenant_id: str, *, sender_number: str, payload: dict,
                    now: Optional[str] = None) -> dict:
    """Parse → dedup → thread → media → opt-out/in → canonical engine per reply
    mode → durable draft (segment-analysed, quiet-hours-aware). Idempotent on
    provider message id."""
    from . import engine, usage, sms_policy, sms_segments

    parsed = parse_inbound(payload)
    mid = parsed["message_id"]
    idem = f"sms:{mid}"
    if mid and stores.message_index().get(tenant_id, f"{tenant_id}::{idem}"):
        return {"status": "duplicate", "message_id": mid}

    customer = parsed["from"]
    # MMS media: persist safe metadata only, never auto-ingest
    if parsed["num_media"] > 0:
        _persist_media(tenant_id, sender_number, customer, parsed)

    text = parsed["body"].strip()
    if _is_opt_out(text):
        _record_opt_out(tenant_id, customer)
        _mark_processed(tenant_id, idem, {"status": "opted_out"})
        return {"status": "opted_out", "message_id": mid}
    if _is_opt_in(text):
        _record_opt_in(tenant_id, customer)
        _mark_processed(tenant_id, idem, {"status": "opted_in"})
        return {"status": "opted_in", "message_id": mid}

    if not text and parsed["num_media"] == 0:
        _mark_processed(tenant_id, idem, {"status": "empty_ignored"})
        return {"status": "empty_ignored", "message_id": mid}

    conv_id = conversation_for(tenant_id, sender_number, customer)
    mode = reply_mode(tenant_id)
    engine_text = text or "[media message]"

    if mode == "disabled":
        _persist_inbound_only(tenant_id, sender_number, customer, conv_id, engine_text)
        _mark_processed(tenant_id, idem, {"status": "stored_no_ai"})
        return {"status": "stored_no_ai", "message_id": mid}

    out = engine.run_message(
        tenant_id=tenant_id, message=engine_text, channel="sms", conversation_id=conv_id,
        idempotency_key=idem, overrides={"phone": _norm(customer)}, now=now)
    conv_id = out.get("conversation_id", conv_id)
    if conv_id:
        link_thread(tenant_id, sender_number, customer, conv_id)
    try:
        usage.increment(tenant_id, "sms_inbound", idempotency_key=f"smsin:{mid}")
    except Exception:
        pass

    if out.get("ai_paused"):
        _mark_processed(tenant_id, idem, {"status": "human_owned"})
        return {"status": "human_owned", "conversation_id": conv_id, "message_id": mid}

    reply_text = out.get("reply", "")
    seg = sms_segments.analyze(reply_text)
    # customer just texted us → responding to inbound (quiet hours do not block)
    decision = sms_policy.evaluate_send(tenant_id, to_number=customer, purpose="support",
                                        responding_to_inbound=True)
    draft = save_draft(tenant_id, {
        "conversation_id": conv_id, "contact_id": out.get("contact_id"),
        "sender_number": _norm(sender_number), "customer_number": _norm(customer),
        "text": reply_text, "encoding": seg["encoding"], "segments": seg["segments"],
        "consent_decision": decision.get("blocked_reason", "") or "ok",
        "quiet_hours_active": decision.get("quiet_hours_active", False),
        "delayed_until": decision.get("delayed_until", ""),
        "response_plan_version": out.get("response_plan_version", ""),
        "status": "generated", "reply_mode": mode})

    if mode == "draft_only":
        result = {"status": "draft_only", "draft_id": draft["id"], "conversation_id": conv_id,
                  "segments": seg["segments"]}
    else:  # approval_required or direct_reply → file the send through the registry
        from .registry import execute_action
        exec_res = execute_action(tenant_id, "sms_send", {
            "to": customer, "body": reply_text, "draft_id": draft["id"],
            "sender_number": _norm(sender_number), "responding_to_inbound": True},
            conversation_id=conv_id, idempotency_key=f"smssend:{draft['id']}")
        draft["status"] = "pending_approval"
        draft["approval_id"] = exec_res.get("record_id", "")
        save_draft(tenant_id, draft)
        result = {"status": "approval_required", "draft_id": draft["id"],
                  "approval_id": exec_res.get("record_id", ""), "conversation_id": conv_id,
                  "segments": seg["segments"]}

    _mark_processed(tenant_id, idem, result)
    return {**result, "message_id": mid}


# ── delivery status (Part 16) ─────────────────────────────────────────────────

def process_status(tenant_id: str, status: dict) -> dict:
    """Amend an existing outbound draft with a provider delivery status.
    Monotonic; duplicate callbacks are harmless; never creates a new message."""
    mid = status.get("MessageSid", "") or status.get("message_id", "")
    new_status = (status.get("MessageStatus", "") or status.get("status", "")).lower()
    if not mid:
        return {"status": "ignored"}
    rank = {"queued": 1, "accepted": 1, "sent": 2, "delivered": 3,
            "undelivered": 3, "failed": 3}
    for d in stores.sms_drafts().list(tenant_id):
        if d.get("provider_message_id") == mid:
            cur = rank.get(d.get("status", ""), 0)
            nxt = rank.get(new_status, 0)
            if new_status in ("failed", "undelivered"):
                d["status"] = "failed"
                d["provider_error"] = status.get("ErrorCode", "") or new_status
                # invalid-recipient failures suppress the number
                if str(status.get("ErrorCode", "")) in ("21211", "21610"):
                    _record_suppression(tenant_id, d.get("customer_number", ""), reason="invalid_recipient")
            elif new_status == "sent":
                d["status"] = "sent" if nxt >= cur else d.get("status", "sent")
            elif new_status == "delivered":
                d["status"] = "delivered"
            if status.get("NumSegments"):
                d["provider_segments"] = int(status.get("NumSegments") or 0)
            d["updated_at"] = now_iso()
            stores.sms_drafts().put(tenant_id, d)
            stores.sms_statuses().put(tenant_id, {
                "id": new_id("smsstat"), "tenant_id": tenant_id, "provider_message_id": mid,
                "status": new_status, "error_code": status.get("ErrorCode", ""), "created_at": now_iso()})
            return {"status": "updated", "draft_id": d["id"], "new_status": d["status"]}
    return {"status": "no_matching_draft"}


# ── helpers ───────────────────────────────────────────────────────────────────

def _mark_processed(tenant_id: str, idem: str, result: dict) -> None:
    stores.message_index().put(tenant_id, {"id": f"{tenant_id}::{idem}", "tenant_id": tenant_id,
                                           "dedup_key": idem, "result": result})


def _persist_inbound_only(tenant_id, sender_number, customer, conv_id, text):
    from .schemas import Conversation, Message
    if not conv_id:
        conv = stores.conversations().put(tenant_id, Conversation(tenant_id=tenant_id, channel="sms").model_dump())
        conv_id = conv["id"]
        link_thread(tenant_id, sender_number, customer, conv_id)
    stores.messages().put(tenant_id, Message(tenant_id=tenant_id, conversation_id=conv_id, role="customer",
                                             text=text, channel="sms", intent="unknown").model_dump())


def _persist_media(tenant_id, sender_number, customer, parsed):
    for m in parsed["media"]:
        stores.sms_media().put(tenant_id, {
            "id": new_id("smsmedia"), "tenant_id": tenant_id, "sender_number": _norm(sender_number),
            "customer_number": _norm(customer), "media_url": m.get("url", ""),
            "content_type": m.get("content_type", ""), "message_id": parsed["message_id"],
            "status": "metadata_stored", "created_at": now_iso()})


def _record_opt_out(tenant_id: str, customer: str):
    from .schemas import OptOut
    stores.optouts().put(tenant_id, OptOut(tenant_id=tenant_id, phone=_norm(customer), channel="sms",
                                           reason="reply_stop", source="sms", scope="channel").model_dump())
    # cancel pending SMS reminders/follow-ups for this contact
    n = _norm(customer)
    for r in stores.reminders().list(tenant_id):
        if r.get("status") == "scheduled" and r.get("channel") == "sms":
            c = stores.contacts().get(tenant_id, r.get("contact_id") or "")
            if c and _norm(c.get("phone", "")) == n:
                r["status"] = "cancelled"
                stores.reminders().put(tenant_id, r)


def _record_opt_in(tenant_id: str, customer: str):
    """START/YES removes an sms channel opt-out for this number (audited)."""
    n = _norm(customer)
    for row in stores.optouts().list(tenant_id):
        if row.get("channel") == "sms" and _norm(row.get("phone", "")) == n:
            row["status"] = "revoked"
            row["revoked_at"] = now_iso()
            stores.optouts().put(tenant_id, row)


def _record_suppression(tenant_id: str, customer: str, *, reason: str):
    from .schemas import OptOut
    stores.suppression().put(tenant_id, OptOut(tenant_id=tenant_id, phone=_norm(customer), channel="sms",
                                               reason=reason, source="provider", scope="channel").model_dump())


def is_suppressed(tenant_id: str, customer: str) -> bool:
    n = _norm(customer)
    for row in stores.optouts().list(tenant_id):
        if row.get("status") == "revoked":
            continue
        p = row.get("phone", "")
        scope = row.get("scope", "")
        if _norm(p) == n and (row.get("channel") in ("sms", None) or scope == "all"):
            return True
    for row in stores.suppression().list(tenant_id):
        if _norm(row.get("phone", "")) == n:
            return True
    return False
