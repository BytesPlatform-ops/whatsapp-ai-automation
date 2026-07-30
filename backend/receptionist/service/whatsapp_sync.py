"""WhatsApp inbound processing + reply orchestration (Wave 12, Parts 5-16).

Routes qualifying WhatsApp messages through the CANONICAL engine
(``engine.run_message``) — same engine, config, knowledge, handoff, actions,
approvals, billing and idempotency as every other channel. No WhatsApp-specific AI
engine. Text + interactive replies enter the engine; media persists safely; the
messaging-window policy decides free-form vs template; opt-out/suppression is
enforced; drafts are durable and reply modes are server-authoritative.
"""

from __future__ import annotations

import os
import re
from typing import Optional

from . import stores
from .ids import new_id, now_iso

REPLY_MODES = ("disabled", "draft_only", "approval_required", "direct_reply")

# Configurable opt-out expressions (extend per supported language).
_OPT_OUT = re.compile(r"^\s*(stop|unsubscribe|cancel|opt[\s-]?out|no more|remove me)\s*$", re.I)


def reply_mode(tenant_id: str) -> str:
    from . import config_repo
    cfg = config_repo.get_active(tenant_id) or {}
    mode = str(cfg.get("whatsapp_reply_mode")
               or os.environ.get("AI_RECEPTIONIST_WHATSAPP_DEFAULT_REPLY_MODE", "")
               or "draft_only").strip()
    if mode == "direct_reply" and os.environ.get("AI_RECEPTIONIST_WHATSAPP_DIRECT_REPLY_ENABLED", "").lower() not in ("1", "true", "yes", "on"):
        return "approval_required"
    return mode if mode in REPLY_MODES else "draft_only"


# ── thread ↔ conversation mapping (Part 8) ────────────────────────────────────

def _thread_key(tenant_id: str, phone_number_id: str, wa_id: str) -> str:
    from ..providers.whatsapp_cloud import normalise_wa_id
    return f"wa::{tenant_id}::{phone_number_id}::{normalise_wa_id(wa_id)}"


def conversation_for(tenant_id: str, phone_number_id: str, wa_id: str) -> Optional[str]:
    rec = stores.wa_thread_map().get(tenant_id, _thread_key(tenant_id, phone_number_id, wa_id))
    return rec.get("conversation_id") if rec else None


def link_thread(tenant_id: str, phone_number_id: str, wa_id: str, conversation_id: str) -> None:
    stores.wa_thread_map().put(tenant_id, {
        "id": _thread_key(tenant_id, phone_number_id, wa_id), "tenant_id": tenant_id,
        "phone_number_id": phone_number_id, "wa_id": wa_id, "conversation_id": conversation_id,
        "updated_at": now_iso()})


# ── drafts (Part 12) ──────────────────────────────────────────────────────────

DRAFT_STATES = ("generated", "pending_approval", "approved", "queued", "sending",
                "provider_pending", "sent", "delivered", "read", "failed",
                "cancelled", "reconciliation_required")


def save_draft(tenant_id: str, draft: dict) -> dict:
    draft.setdefault("id", new_id("wadft"))
    draft.setdefault("created_at", now_iso())
    draft["updated_at"] = now_iso()
    return stores.wa_drafts().put(tenant_id, draft)


def list_drafts(tenant_id: str) -> list[dict]:
    return stores.wa_drafts().list(tenant_id)


def edit_draft(tenant_id: str, draft_id: str, *, text: Optional[str] = None) -> Optional[dict]:
    d = stores.wa_drafts().get(tenant_id, draft_id)
    if d is None:
        return None
    if d.get("status") in ("sent", "sending", "delivered", "read"):
        return {"status": "locked"}
    d.setdefault("edit_history", []).append({"at": now_iso(), "text": d.get("text", "")})
    if text is not None:
        d["text"] = text
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

def parse_inbound(message: dict, contacts: list) -> dict:
    """Normalise one WhatsApp inbound message object into an internal shape."""
    mtype = message.get("type", "unknown")
    wa_id = message.get("from", "")
    profile_name = ""
    for c in contacts or []:
        if c.get("wa_id") == wa_id:
            profile_name = (c.get("profile") or {}).get("name", "")
    text = ""
    selection_id = ""
    if mtype == "text":
        text = (message.get("text") or {}).get("body", "")
    elif mtype == "interactive":
        inter = message.get("interactive") or {}
        if inter.get("type") == "button_reply":
            selection_id = (inter.get("button_reply") or {}).get("id", "")
            text = (inter.get("button_reply") or {}).get("title", "")
        elif inter.get("type") == "list_reply":
            selection_id = (inter.get("list_reply") or {}).get("id", "")
            text = (inter.get("list_reply") or {}).get("title", "")
    return {
        "message_id": message.get("id", ""), "wa_id": wa_id, "profile_name": profile_name,
        "type": mtype, "text": text, "selection_id": selection_id,
        "timestamp": message.get("timestamp", ""),
        "media_id": ((message.get(mtype) or {}).get("id", "") if mtype in ("image", "document", "audio", "video", "sticker") else ""),
    }


def _is_opt_out(text: str) -> bool:
    return bool(_OPT_OUT.match(text or ""))


# ── main inbound flow (Parts 5/9/11/19) ───────────────────────────────────────

def process_message(tenant_id: str, *, phone_number_id: str, message: dict,
                    contacts: Optional[list] = None, now: Optional[str] = None) -> dict:
    """Fetch/parse → window → opt-out → contact/conversation → canonical engine per
    reply mode → durable draft/approval. Idempotent on provider message id."""
    from . import engine, usage, whatsapp_window
    from ..providers.whatsapp_cloud import normalise_wa_id

    parsed = parse_inbound(message, contacts or [])
    mid = parsed["message_id"]
    idem = f"wa:{mid}"
    if stores.message_index().get(tenant_id, f"{tenant_id}::{idem}"):
        return {"status": "duplicate", "message_id": mid}

    wa_id = parsed["wa_id"]
    # record the customer-service window from this verified inbound
    whatsapp_window.record_inbound(tenant_id, phone_number_id=phone_number_id, wa_id=wa_id, ts=None)

    # media: persist safe metadata only, never auto-ingest
    if parsed["type"] in ("image", "document", "audio", "video", "sticker"):
        _persist_media(tenant_id, phone_number_id, parsed)

    # opt-out detection → suppression, stop automated replies
    if _is_opt_out(parsed["text"]):
        _record_opt_out(tenant_id, wa_id)
        _mark_processed(tenant_id, idem, {"status": "opted_out"})
        return {"status": "opted_out", "message_id": mid}

    # only text + interactive enter the engine
    if parsed["type"] not in ("text", "interactive"):
        _mark_processed(tenant_id, idem, {"status": "stored_non_conversational", "type": parsed["type"]})
        return {"status": "stored_non_conversational", "type": parsed["type"], "message_id": mid}

    conv_id = conversation_for(tenant_id, phone_number_id, wa_id)
    mode = reply_mode(tenant_id)

    if mode == "disabled":
        _persist_inbound_only(tenant_id, conv_id, phone_number_id, wa_id, parsed)
        _mark_processed(tenant_id, idem, {"status": "stored_no_ai"})
        return {"status": "stored_no_ai", "message_id": mid}

    out = engine.run_message(
        tenant_id=tenant_id, message=parsed["text"] or parsed["selection_id"], channel="whatsapp",
        conversation_id=conv_id, idempotency_key=idem,
        overrides={"phone": "+" + normalise_wa_id(wa_id), "name": parsed["profile_name"]},
        now=now)
    conv_id = out.get("conversation_id", conv_id)
    if conv_id:
        link_thread(tenant_id, phone_number_id, wa_id, conv_id)
    try:
        usage.increment(tenant_id, "whatsapp_inbound", idempotency_key=f"wain:{mid}")
    except Exception:
        pass

    if out.get("ai_paused"):
        _mark_processed(tenant_id, idem, {"status": "human_owned"})
        return {"status": "human_owned", "conversation_id": conv_id, "message_id": mid}

    # window decides free-form vs template
    win = whatsapp_window.window_state(tenant_id, phone_number_id=phone_number_id, wa_id=wa_id)
    draft = save_draft(tenant_id, {
        "conversation_id": conv_id, "contact_id": out.get("contact_id"),
        "phone_number_id": phone_number_id, "wa_id": wa_id, "message_type": "text",
        "text": out.get("reply", ""), "window_open": win["open"],
        "template_required": win["template_required"],
        "response_plan_version": out.get("response_plan_version", ""),
        "status": "generated", "reply_mode": mode})

    result: dict
    if mode == "draft_only":
        result = {"status": "draft_only", "draft_id": draft["id"], "conversation_id": conv_id,
                  "template_required": win["template_required"]}
    else:  # approval_required or direct_reply → file the send through the registry
        from .registry import execute_action
        action = "whatsapp_send" if win["free_form_allowed"] else "whatsapp_send_template"
        args = {"to": wa_id, "body": draft["text"], "draft_id": draft["id"],
                "phone_number_id": phone_number_id}
        exec_res = execute_action(tenant_id, action, args, conversation_id=conv_id,
                                  idempotency_key=f"wasend:{draft['id']}")
        draft["status"] = "pending_approval"
        draft["approval_id"] = exec_res.get("record_id", "")
        save_draft(tenant_id, draft)
        result = {"status": "approval_required", "draft_id": draft["id"],
                  "approval_id": exec_res.get("record_id", ""), "conversation_id": conv_id,
                  "template_required": win["template_required"]}

    _mark_processed(tenant_id, idem, result)
    return {**result, "message_id": mid}


# ── delivery/read status (Part 17) ────────────────────────────────────────────

def process_status(tenant_id: str, status: dict) -> dict:
    """Amend an existing outbound draft with a provider delivery/read/failed status.
    Monotonic; duplicate status events are harmless; never creates a new message."""
    mid = status.get("id", "")
    new_status = status.get("status", "")  # sent | delivered | read | failed
    if not mid:
        return {"status": "ignored"}
    rank = {"sent": 1, "delivered": 2, "read": 3, "failed": 3}
    for d in stores.wa_drafts().list(tenant_id):
        if d.get("provider_message_id") == mid:
            cur = rank.get(d.get("status", ""), 0)
            nxt = rank.get(new_status, 0)
            if new_status == "failed":
                d["status"] = "failed"
                d["provider_error"] = (status.get("errors") or [{}])[0].get("title", "failed")
            elif nxt >= cur:
                d["status"] = new_status
            d["updated_at"] = now_iso()
            stores.wa_drafts().put(tenant_id, d)
            return {"status": "updated", "draft_id": d["id"], "new_status": d["status"]}
    return {"status": "no_matching_draft"}


# ── helpers ───────────────────────────────────────────────────────────────────

def _mark_processed(tenant_id: str, idem: str, result: dict) -> None:
    stores.message_index().put(tenant_id, {"id": f"{tenant_id}::{idem}", "tenant_id": tenant_id,
                                           "dedup_key": idem, "result": result})


def _persist_inbound_only(tenant_id, conv_id, phone_number_id, wa_id, parsed):
    from .schemas import Conversation, Message
    if not conv_id:
        conv = stores.conversations().put(tenant_id, Conversation(tenant_id=tenant_id, channel="whatsapp").model_dump())
        conv_id = conv["id"]
        link_thread(tenant_id, phone_number_id, wa_id, conv_id)
    stores.messages().put(tenant_id, Message(tenant_id=tenant_id, conversation_id=conv_id, role="customer",
                                             text=parsed["text"], channel="whatsapp", intent="unknown").model_dump())


def _persist_media(tenant_id, phone_number_id, parsed):
    stores.wa_media().put(tenant_id, {
        "id": new_id("wamedia"), "tenant_id": tenant_id, "phone_number_id": phone_number_id,
        "wa_id": parsed["wa_id"], "media_id": parsed["media_id"], "media_type": parsed["type"],
        "message_id": parsed["message_id"], "status": "metadata_stored",
        "analysis": "transcription_not_configured" if parsed["type"] == "audio" else "",
        "created_at": now_iso()})


def _record_opt_out(tenant_id: str, wa_id: str):
    from .schemas import OptOut
    from ..providers.whatsapp_cloud import normalise_wa_id
    phone = "+" + normalise_wa_id(wa_id)
    stores.optouts().put(tenant_id, OptOut(tenant_id=tenant_id, phone=phone, channel="whatsapp",
                                           reason="reply_stop", source="whatsapp", scope="all").model_dump())
    # cancel pending reminders/follow-ups for this contact where resolvable
    for r in stores.reminders().list(tenant_id):
        if r.get("status") == "scheduled":
            c = stores.contacts().get(tenant_id, r.get("contact_id") or "")
            if c and normalise_wa_id(c.get("phone", "")) == normalise_wa_id(wa_id):
                r["status"] = "cancelled"
                stores.reminders().put(tenant_id, r)


def is_suppressed(tenant_id: str, wa_id: str) -> bool:
    from ..providers.whatsapp_cloud import normalise_wa_id
    n = normalise_wa_id(wa_id)
    for row in stores.optouts().list(tenant_id):
        if normalise_wa_id(row.get("phone", "")) == n:
            return True
    for row in stores.suppression().list(tenant_id):
        if normalise_wa_id(row.get("phone", "")) == n:
            return True
    return False
