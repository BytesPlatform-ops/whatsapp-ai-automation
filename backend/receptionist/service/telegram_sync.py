"""Telegram inbound processing + reply orchestration (Bot + Business).

Routes qualifying Telegram updates — standard Bot and Telegram Business — through
the CANONICAL engine (``engine.run_message``). No Telegram-specific AI engine.
Handles commands, callback queries (repository-backed opaque ids; never tenant data
in callback_data), edited/deleted messages (history amend + tombstone), media
(safe metadata), and durable drafts. Modes stay distinct; reply modes are
server-authoritative and per-mode.
"""

from __future__ import annotations

import os
import re
from typing import Optional

from . import stores
from .ids import new_id, now_iso

REPLY_MODES = ("disabled", "draft_only", "approval_required", "direct_reply")
MODES = ("bot", "business")

_OPT_OUT = re.compile(r"^\s*/?(stop|unsubscribe|optout|opt[\s-]?out)\s*$", re.I)
_OPT_IN = re.compile(r"^\s*/(start|resume)\s*$", re.I)

DRAFT_STATES = ("generated", "pending_approval", "approved", "queued", "sending",
                "provider_pending", "sent", "edited", "failed", "cancelled",
                "blocked_by_policy", "reconciliation_required")

_MEDIA_KEYS = ("photo", "document", "audio", "voice", "video", "sticker", "animation")
CALLBACK_TTL_SECONDS = 3600


def reply_mode(tenant_id: str, mode: str = "bot") -> str:
    from . import telegram_policy
    return telegram_policy.reply_mode(tenant_id, mode)


# ── thread ↔ conversation + initiation (Parts 6/9) ────────────────────────────

def _thread_key(tenant_id: str, mode: str, chat_id: str) -> str:
    return f"tg::{tenant_id}::{mode}::{chat_id}"


def conversation_for(tenant_id: str, mode: str, chat_id: str) -> Optional[str]:
    rec = stores.tg_thread_map().get(tenant_id, _thread_key(tenant_id, mode, chat_id))
    return rec.get("conversation_id") if rec else None


def has_seen_inbound(tenant_id: str, chat_id: str) -> bool:
    for mode in MODES:
        if stores.tg_thread_map().get(tenant_id, _thread_key(tenant_id, mode, chat_id)) is not None:
            return True
    return False


def _mark_initiated(tenant_id: str, mode: str, chat_id: str, *, username: str = "") -> None:
    key = _thread_key(tenant_id, mode, chat_id)
    rec = stores.tg_thread_map().get(tenant_id, key) or {"id": key, "tenant_id": tenant_id,
                                                         "mode": mode, "chat_id": chat_id}
    rec["initiated"] = True
    if username:
        rec["username"] = username
    rec["updated_at"] = now_iso()
    stores.tg_thread_map().put(tenant_id, rec)


def link_thread(tenant_id: str, mode: str, chat_id: str, conversation_id: str) -> None:
    key = _thread_key(tenant_id, mode, chat_id)
    rec = stores.tg_thread_map().get(tenant_id, key) or {"id": key, "tenant_id": tenant_id,
                                                         "mode": mode, "chat_id": chat_id}
    rec["conversation_id"] = conversation_id
    rec["initiated"] = True
    rec["updated_at"] = now_iso()
    stores.tg_thread_map().put(tenant_id, rec)


def map_identity(tenant_id: str, mode: str, chat_id: str, user_id: str,
                 *, contact_id: str = "", username: str = "") -> None:
    rid = f"tgid::{tenant_id}::{mode}::{user_id or chat_id}"
    existing = stores.tg_identity_map().get(tenant_id, rid) or {}
    stores.tg_identity_map().put(tenant_id, {
        "id": rid, "tenant_id": tenant_id, "mode": mode, "chat_id": chat_id, "user_id": user_id,
        "contact_id": contact_id or existing.get("contact_id", ""),
        "username": username or existing.get("username", ""), "source": "telegram",
        "updated_at": now_iso()})


# ── callbacks (Part 15: repository-backed opaque ids, never tenant data) ───────

def create_callback(tenant_id: str, *, conversation_id: str, action: str, option_id: str = "",
                    contact_id: str = "", now: Optional[str] = None) -> str:
    token = new_id("tgcb")
    stores.tg_callbacks().put(tenant_id, {
        "id": token, "tenant_id": tenant_id, "conversation_id": conversation_id, "action": action,
        "option_id": option_id, "contact_id": contact_id, "used": False,
        "created_at": now or now_iso()})
    return token


def resolve_callback(tenant_id: str, token: str, *, now_epoch: Optional[int] = None) -> dict:
    rec = stores.tg_callbacks().get(tenant_id, token)
    if rec is None:
        return {"status": "unknown"}
    if rec.get("used"):
        return {"status": "already_used", "record": rec}
    return {"status": "ok", "record": rec}


def consume_callback(tenant_id: str, token: str) -> None:
    rec = stores.tg_callbacks().get(tenant_id, token)
    if rec is not None:
        rec["used"] = True
        rec["used_at"] = now_iso()
        stores.tg_callbacks().put(tenant_id, rec)


# ── drafts (Part 13) ──────────────────────────────────────────────────────────

def save_draft(tenant_id: str, draft: dict) -> dict:
    draft.setdefault("id", new_id("tgdft"))
    draft.setdefault("created_at", now_iso())
    draft["updated_at"] = now_iso()
    return stores.tg_drafts().put(tenant_id, draft)


def list_drafts(tenant_id: str, *, mode: str = "") -> list[dict]:
    rows = stores.tg_drafts().list(tenant_id)
    return [d for d in rows if not mode or d.get("mode") == mode]


def edit_draft(tenant_id: str, draft_id: str, *, text: Optional[str] = None) -> Optional[dict]:
    d = stores.tg_drafts().get(tenant_id, draft_id)
    if d is None:
        return None
    if d.get("status") in ("sent", "sending", "provider_pending"):
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

def parse_message(message: dict) -> dict:
    chat = message.get("chat") or {}
    frm = message.get("from") or {}
    mtype = "text" if message.get("text") else "unknown"
    media_id = ""
    for k in _MEDIA_KEYS:
        if message.get(k):
            mtype = k
            val = message[k]
            if k == "photo" and isinstance(val, list) and val:
                media_id = val[-1].get("file_id", "")
            elif isinstance(val, dict):
                media_id = val.get("file_id", "")
            break
    return {
        "message_id": str(message.get("message_id", "")),
        "chat_id": str(chat.get("id", "")), "chat_type": chat.get("type", "private"),
        "user_id": str(frm.get("id", "")), "username": frm.get("username", ""),
        "is_bot": bool(frm.get("is_bot")), "text": message.get("text", "") or "",
        "type": mtype, "media_id": media_id,
        "reply_to": str((message.get("reply_to_message") or {}).get("message_id", "")),
        "business_connection_id": message.get("business_connection_id", ""),
    }


def _is_opt_out(text: str) -> bool: return bool(_OPT_OUT.match(text or ""))
def _is_opt_in(text: str) -> bool: return bool(_OPT_IN.match(text or ""))


# ── main inbound flow (standard + business) ───────────────────────────────────

def process_message(tenant_id: str, *, mode: str, message: dict, now: Optional[str] = None) -> dict:
    from . import engine, usage
    parsed = parse_message(message)
    mid = parsed["message_id"]
    idem = f"tg:{mode}:{parsed['chat_id']}:{mid}"
    if mid and stores.message_index().get(tenant_id, f"{tenant_id}::{idem}"):
        return {"status": "duplicate", "message_id": mid}

    # messages from other bots never create customer conversations
    if parsed["is_bot"]:
        return {"status": "bot_ignored", "message_id": mid}
    # only private chats in this phase
    if parsed["chat_type"] not in ("private", ""):
        _mark_processed(tenant_id, idem, {"status": "non_private_ignored"})
        return {"status": "non_private_ignored", "message_id": mid}

    _mark_initiated(tenant_id, mode, parsed["chat_id"], username=parsed["username"])
    text = parsed["text"].strip()

    if parsed["type"] in _MEDIA_KEYS:
        _persist_media(tenant_id, mode, parsed)

    if _is_opt_out(text):
        _record_opt_out(tenant_id, parsed["user_id"] or parsed["chat_id"])
        _mark_processed(tenant_id, idem, {"status": "opted_out"})
        return {"status": "opted_out", "message_id": mid}
    if _is_opt_in(text):
        _record_opt_in(tenant_id, parsed["user_id"] or parsed["chat_id"])

    engine_text = text or ("[media message]" if parsed["type"] in _MEDIA_KEYS else "")
    if not engine_text:
        _mark_processed(tenant_id, idem, {"status": "stored_non_conversational", "type": parsed["type"]})
        return {"status": "stored_non_conversational", "type": parsed["type"], "message_id": mid}

    conv_id = conversation_for(tenant_id, mode, parsed["chat_id"])
    rmode = reply_mode(tenant_id, mode)
    if rmode == "disabled":
        _persist_inbound_only(tenant_id, mode, parsed, conv_id)
        _mark_processed(tenant_id, idem, {"status": "stored_no_ai"})
        return {"status": "stored_no_ai", "message_id": mid}

    out = engine.run_message(
        tenant_id=tenant_id, message=engine_text, channel="telegram", conversation_id=conv_id,
        idempotency_key=idem, overrides={"name": parsed["username"]}, now=now)
    conv_id = out.get("conversation_id", conv_id)
    if conv_id:
        link_thread(tenant_id, mode, parsed["chat_id"], conv_id)
        map_identity(tenant_id, mode, parsed["chat_id"], parsed["user_id"],
                     contact_id=out.get("contact_id", ""), username=parsed["username"])
    try:
        metric = "telegram_business_inbound" if mode == "business" else "telegram_inbound"
        usage.increment(tenant_id, metric, idempotency_key=f"tgin:{idem}")
    except Exception:
        pass

    if out.get("ai_paused"):
        _mark_processed(tenant_id, idem, {"status": "human_owned"})
        return {"status": "human_owned", "conversation_id": conv_id, "message_id": mid}

    draft = save_draft(tenant_id, {
        "mode": mode, "conversation_id": conv_id, "contact_id": out.get("contact_id"),
        "chat_id": parsed["chat_id"], "user_id": parsed["user_id"],
        "business_connection_id": parsed["business_connection_id"], "reply_to": mid,
        "text": out.get("reply", ""), "response_plan_version": out.get("response_plan_version", ""),
        "status": "generated", "reply_mode": rmode})

    if rmode == "draft_only":
        result = {"status": "draft_only", "draft_id": draft["id"], "conversation_id": conv_id}
    else:
        from .registry import execute_action
        action = "telegram_business_send" if mode == "business" else "telegram_send"
        exec_res = execute_action(tenant_id, action, {
            "chat_id": parsed["chat_id"], "user_id": parsed["user_id"], "body": draft["text"],
            "draft_id": draft["id"], "business_connection_id": parsed["business_connection_id"]},
            conversation_id=conv_id, idempotency_key=f"tgsend:{draft['id']}")
        draft["status"] = "pending_approval"
        draft["approval_id"] = exec_res.get("record_id", "")
        save_draft(tenant_id, draft)
        result = {"status": "approval_required", "draft_id": draft["id"],
                  "approval_id": exec_res.get("record_id", ""), "conversation_id": conv_id}

    _mark_processed(tenant_id, idem, result)
    return {**result, "message_id": mid}


# ── callback query (Part 15) ──────────────────────────────────────────────────

def process_callback(tenant_id: str, callback_query: dict, *, now: Optional[str] = None) -> dict:
    cb_id = callback_query.get("id", "")
    token = callback_query.get("data", "")
    idem = f"tgcb:{cb_id}"
    if cb_id and stores.message_index().get(tenant_id, f"{tenant_id}::{idem}"):
        return {"status": "duplicate"}
    res = resolve_callback(tenant_id, token)
    if res["status"] == "unknown":
        _mark_processed(tenant_id, idem, {"status": "unknown_callback"})
        return {"status": "unknown_callback", "callback_query_id": cb_id, "refresh": True}
    if res["status"] == "already_used":
        _mark_processed(tenant_id, idem, {"status": "expired_callback"})
        return {"status": "expired_callback", "callback_query_id": cb_id, "refresh": True}
    rec = res["record"]
    consume_callback(tenant_id, token)
    from . import engine, usage
    out = engine.run_message(
        tenant_id=tenant_id, message=rec.get("option_id", "") or rec.get("action", ""),
        channel="telegram", conversation_id=rec.get("conversation_id"),
        idempotency_key=idem, now=now)
    try:
        usage.increment(tenant_id, "telegram_callbacks", idempotency_key=idem)
    except Exception:
        pass
    _mark_processed(tenant_id, idem, {"status": "processed", "conversation_id": rec.get("conversation_id")})
    return {"status": "processed", "callback_query_id": cb_id, "conversation_id": rec.get("conversation_id"),
            "reply": out.get("reply", "")}


# ── edited / deleted (Part 16) ────────────────────────────────────────────────

def process_edited(tenant_id: str, mode: str, message: dict) -> dict:
    parsed = parse_message(message)
    stores.tg_edits().put(tenant_id, {
        "id": new_id("tgedit"), "tenant_id": tenant_id, "mode": mode, "chat_id": parsed["chat_id"],
        "message_id": parsed["message_id"], "kind": "edited_inbound", "text": parsed["text"],
        "created_at": now_iso()})
    return {"status": "edit_recorded", "message_id": parsed["message_id"]}


def process_deleted(tenant_id: str, mode: str, chat_id: str, message_ids: list) -> dict:
    for m in message_ids or []:
        stores.tg_edits().put(tenant_id, {
            "id": new_id("tgtomb"), "tenant_id": tenant_id, "mode": mode, "chat_id": str(chat_id),
            "message_id": str(m), "kind": "deleted_tombstone", "created_at": now_iso()})
    return {"status": "tombstoned", "count": len(message_ids or [])}


# ── business connection updates (Part 7) ──────────────────────────────────────

def process_business_connection(tenant_id: str, bc: dict) -> dict:
    from integrations import connections
    bcid = bc.get("id", "")
    rights = bc.get("rights") or {}
    can_reply = bool(rights.get("can_reply", bc.get("can_reply", True)))
    is_enabled = bool(bc.get("is_enabled", True))
    stores.tg_business().put(tenant_id, {
        "id": f"tgbc::{tenant_id}::{bcid}", "tenant_id": tenant_id, "business_connection_id": bcid,
        "user_id": str((bc.get("user") or {}).get("id", "")), "can_reply": can_reply,
        "is_enabled": is_enabled, "updated_at": now_iso()})
    # mirror onto the connection descriptor so the adapter/policy see current rights
    base = connections.find_active_connection_unsealed(tenant_id, "telegram_read") \
        or connections.find_active_connection_unsealed(tenant_id, "telegram_send")
    if base is not None:
        base = dict(base)
        base.update({"business_connection_id": bcid, "business_user_id": str((bc.get("user") or {}).get("id", "")),
                     "business_can_reply": can_reply, "business_paused": not is_enabled,
                     "business_enabled": True})
        connections.register_many(tenant_id, ["telegram_read", "telegram_send"], base)
    return {"status": "business_connection_updated", "business_connection_id": bcid,
            "enabled": is_enabled, "can_reply": can_reply}


# ── helpers ───────────────────────────────────────────────────────────────────

def _mark_processed(tenant_id: str, idem: str, result: dict) -> None:
    stores.message_index().put(tenant_id, {"id": f"{tenant_id}::{idem}", "tenant_id": tenant_id,
                                           "dedup_key": idem, "result": result})


def _persist_inbound_only(tenant_id, mode, parsed, conv_id):
    from .schemas import Conversation, Message
    if not conv_id:
        conv = stores.conversations().put(tenant_id, Conversation(tenant_id=tenant_id, channel="telegram").model_dump())
        conv_id = conv["id"]
        link_thread(tenant_id, mode, parsed["chat_id"], conv_id)
    stores.messages().put(tenant_id, Message(tenant_id=tenant_id, conversation_id=conv_id, role="customer",
                                             text=parsed["text"], channel="telegram", intent="unknown").model_dump())


def _persist_media(tenant_id, mode, parsed):
    stores.tg_media().put(tenant_id, {
        "id": new_id("tgmedia"), "tenant_id": tenant_id, "mode": mode, "chat_id": parsed["chat_id"],
        "file_id": parsed["media_id"], "media_type": parsed["type"], "message_id": parsed["message_id"],
        "status": "metadata_stored",
        "analysis": "transcription_not_configured" if parsed["type"] == "voice" else "",
        "created_at": now_iso()})


def _record_opt_out(tenant_id: str, user_ref: str):
    from .schemas import OptOut
    stores.optouts().put(tenant_id, OptOut(tenant_id=tenant_id, phone=f"telegram:{user_ref}",
                                           channel="telegram", reason="reply_stop", source="telegram",
                                           scope="channel").model_dump())
    for r in stores.reminders().list(tenant_id):
        if r.get("status") == "scheduled" and r.get("channel") == "telegram":
            r["status"] = "cancelled"
            stores.reminders().put(tenant_id, r)


def _record_opt_in(tenant_id: str, user_ref: str):
    tag = f"telegram:{user_ref}"
    for row in stores.optouts().list(tenant_id):
        if row.get("channel") == "telegram" and row.get("phone", "") == tag:
            row["status"] = "revoked"
            row["revoked_at"] = now_iso()
            stores.optouts().put(tenant_id, row)


def record_terminal_suppression(tenant_id: str, user_ref: str, *, reason: str):
    """Bot-blocked / forbidden-chat → terminal channel suppression."""
    from .schemas import OptOut
    stores.suppression().put(tenant_id, OptOut(tenant_id=tenant_id, phone=f"telegram:{user_ref}",
                                               channel="telegram", reason=reason, source="provider",
                                               scope="channel").model_dump())


def is_suppressed(tenant_id: str, user_ref: str) -> bool:
    tag = f"telegram:{user_ref}"
    for row in stores.optouts().list(tenant_id):
        if row.get("status") == "revoked":
            continue
        if row.get("phone", "") == tag and (row.get("channel") in ("telegram", None) or row.get("scope") == "all"):
            return True
    for row in stores.suppression().list(tenant_id):
        if row.get("phone", "") == tag:
            return True
    return False
