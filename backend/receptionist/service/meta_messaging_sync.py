"""Meta messaging inbound processing + reply orchestration (Instagram + Messenger).

Routes qualifying Instagram DMs and Messenger messages/postbacks/quick-replies
through the CANONICAL engine (``engine.run_message``) — same engine, config,
knowledge, handoff, actions, approvals, billing and idempotency as every other
channel. No channel-specific AI engine. Media persists safely; the provider policy
service decides free-form vs tag/blocked; opt-out/suppression is enforced; drafts
are durable and reply modes are server-authoritative and per-channel.
"""

from __future__ import annotations

import os
import re
from typing import Optional

from . import stores
from .ids import new_id, now_iso

REPLY_MODES = ("disabled", "draft_only", "approval_required", "direct_reply")
CHANNELS = ("instagram", "messenger")

_OPT_OUT = re.compile(r"^\s*(stop|unsubscribe|cancel|opt[\s-]?out|no more|remove me)\s*$", re.I)

DRAFT_STATES = ("generated", "pending_approval", "approved", "queued", "sending",
                "provider_pending", "sent", "delivered", "read", "failed",
                "cancelled", "blocked_by_policy", "reconciliation_required")


def _default_mode_env(channel: str) -> str:
    key = ("AI_RECEPTIONIST_INSTAGRAM_DEFAULT_REPLY_MODE" if channel == "instagram"
           else "AI_RECEPTIONIST_MESSENGER_DEFAULT_REPLY_MODE")
    return os.environ.get(key, "") or ""


def _direct_reply_enabled(channel: str) -> bool:
    key = ("AI_RECEPTIONIST_INSTAGRAM_DIRECT_REPLY_ENABLED" if channel == "instagram"
           else "AI_RECEPTIONIST_MESSENGER_DIRECT_REPLY_ENABLED")
    return os.environ.get(key, "").strip().lower() in ("1", "true", "yes", "on")


def reply_mode(tenant_id: str, channel: str) -> str:
    from . import config_repo
    cfg = config_repo.get_active(tenant_id) or {}
    field = f"{channel}_reply_mode"
    mode = str(cfg.get(field) or _default_mode_env(channel) or "draft_only").strip()
    if mode == "direct_reply" and not _direct_reply_enabled(channel):
        return "approval_required"
    return mode if mode in REPLY_MODES else "draft_only"


# ── identity + thread mapping (Parts 9/10) ────────────────────────────────────

def _thread_key(tenant_id: str, channel: str, asset_id: str, sender_id: str) -> str:
    from ..providers.meta_messaging_common import normalise_psid
    return f"meta::{tenant_id}::{channel}::{asset_id}::{normalise_psid(sender_id)}"


def conversation_for(tenant_id: str, channel: str, asset_id: str, sender_id: str) -> Optional[str]:
    rec = stores.meta_thread_map().get(tenant_id, _thread_key(tenant_id, channel, asset_id, sender_id))
    return rec.get("conversation_id") if rec else None


def link_thread(tenant_id: str, channel: str, asset_id: str, sender_id: str, conversation_id: str) -> None:
    stores.meta_thread_map().put(tenant_id, {
        "id": _thread_key(tenant_id, channel, asset_id, sender_id), "tenant_id": tenant_id,
        "channel": channel, "asset_id": asset_id, "sender_id": sender_id,
        "conversation_id": conversation_id, "updated_at": now_iso()})


def map_identity(tenant_id: str, channel: str, asset_id: str, sender_id: str,
                 *, contact_id: str = "", profile_name: str = "") -> None:
    """Provider-scoped identity → contact. Tenant + asset scoped; never merges
    across assets by display name alone."""
    rid = _thread_key(tenant_id, channel, asset_id, sender_id).replace("meta::", "metaid::")
    existing = stores.meta_identity_map().get(tenant_id, rid) or {}
    stores.meta_identity_map().put(tenant_id, {
        "id": rid, "tenant_id": tenant_id, "channel": channel, "asset_id": asset_id,
        "sender_id": sender_id, "contact_id": contact_id or existing.get("contact_id", ""),
        "profile_name": profile_name or existing.get("profile_name", ""),
        "source": channel, "updated_at": now_iso()})


# ── drafts (Part 14) ──────────────────────────────────────────────────────────

def save_draft(tenant_id: str, draft: dict) -> dict:
    draft.setdefault("id", new_id("metadft"))
    draft.setdefault("created_at", now_iso())
    draft["updated_at"] = now_iso()
    return stores.meta_drafts().put(tenant_id, draft)


def list_drafts(tenant_id: str, *, channel: str = "") -> list[dict]:
    rows = stores.meta_drafts().list(tenant_id)
    return [d for d in rows if not channel or d.get("channel") == channel]


def edit_draft(tenant_id: str, draft_id: str, *, text: Optional[str] = None) -> Optional[dict]:
    d = stores.meta_drafts().get(tenant_id, draft_id)
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


# ── inbound parsing (Parts 6/7) ───────────────────────────────────────────────

_MEDIA_TYPES = {"image", "video", "audio", "file", "story_mention", "share", "sticker"}


def parse_inbound(channel: str, event: dict) -> dict:
    """Normalise one Instagram/Messenger messaging event into an internal shape."""
    sender = (event.get("sender") or {}).get("id", "")
    message = event.get("message") or {}
    postback = event.get("postback") or {}
    is_echo = bool(message.get("is_echo"))
    text = message.get("text", "") or ""
    selection_id = ""
    mtype = "text" if text else "unknown"
    story_context = ""
    referral = (event.get("referral") or postback.get("referral") or {}).get("ref", "")

    if message.get("quick_reply"):
        selection_id = (message.get("quick_reply") or {}).get("payload", "")
        mtype = "quick_reply"
    elif postback:
        selection_id = postback.get("payload", "")
        text = postback.get("title", "") or text
        mtype = "postback"
    elif message.get("attachments"):
        att = (message.get("attachments") or [{}])[0]
        atype = att.get("type", "")
        if atype == "story_mention" or (att.get("payload") or {}).get("story"):
            mtype = "story_mention"
            story_context = (att.get("payload") or {}).get("url", "") or "story"
        else:
            mtype = atype or "file"

    media_id = ""
    media_url = ""
    if message.get("attachments"):
        payload = (message["attachments"][0] or {}).get("payload") or {}
        media_id = payload.get("id", "") or payload.get("attachment_id", "")
        media_url = payload.get("url", "")

    return {
        "channel": channel, "message_id": message.get("mid", "") or postback.get("mid", ""),
        "sender_id": sender, "recipient_id": (event.get("recipient") or {}).get("id", ""),
        "type": mtype, "text": text, "selection_id": selection_id, "is_echo": is_echo,
        "story_context": story_context, "referral": referral,
        "media_id": media_id, "media_url": media_url,
        "timestamp": str(event.get("timestamp", "")),
    }


def _is_opt_out(text: str) -> bool:
    return bool(_OPT_OUT.match(text or ""))


# ── main inbound flow (Parts 5/9/11/19) ───────────────────────────────────────

def process_message(tenant_id: str, *, channel: str, asset_id: str, event: dict,
                    now: Optional[str] = None) -> dict:
    """Parse → echo-drop → window → opt-out → media → contact/conversation →
    canonical engine per reply mode → durable draft/approval. Idempotent on
    provider message id."""
    from . import engine, usage

    parsed = parse_inbound(channel, event)
    mid = parsed["message_id"]
    idem = f"{channel}:{mid}"

    # Page/echo messages are not customer messages
    if parsed["is_echo"]:
        return {"status": "echo_ignored", "message_id": mid}

    if mid and stores.message_index().get(tenant_id, f"{tenant_id}::{idem}"):
        return {"status": "duplicate", "message_id": mid}

    sender = parsed["sender_id"]
    meta_messaging_policy_record(tenant_id, channel, asset_id, sender)

    if parsed["type"] in _MEDIA_TYPES and parsed["type"] not in ("text", "postback", "quick_reply"):
        _persist_media(tenant_id, channel, asset_id, parsed)

    if _is_opt_out(parsed["text"]):
        _record_opt_out(tenant_id, channel, sender)
        _mark_processed(tenant_id, idem, {"status": "opted_out"})
        return {"status": "opted_out", "message_id": mid}

    # only text / postback / quick_reply / story replies with text enter the engine
    engine_text = parsed["text"] or parsed["selection_id"]
    if parsed["type"] not in ("text", "postback", "quick_reply", "story_mention") or not engine_text:
        _mark_processed(tenant_id, idem, {"status": "stored_non_conversational", "type": parsed["type"]})
        return {"status": "stored_non_conversational", "type": parsed["type"], "message_id": mid}

    conv_id = conversation_for(tenant_id, channel, asset_id, sender)
    mode = reply_mode(tenant_id, channel)

    if mode == "disabled":
        _persist_inbound_only(tenant_id, channel, asset_id, sender, conv_id, parsed)
        _mark_processed(tenant_id, idem, {"status": "stored_no_ai"})
        return {"status": "stored_no_ai", "message_id": mid}

    overrides = {"name": ""}
    if parsed["story_context"]:
        overrides["story_context"] = parsed["story_context"]
    out = engine.run_message(
        tenant_id=tenant_id, message=engine_text, channel=channel,
        conversation_id=conv_id, idempotency_key=idem, overrides=overrides, now=now)
    conv_id = out.get("conversation_id", conv_id)
    if conv_id:
        link_thread(tenant_id, channel, asset_id, sender, conv_id)
        map_identity(tenant_id, channel, asset_id, sender, contact_id=out.get("contact_id", ""))
    try:
        usage.increment(tenant_id, f"{channel}_inbound", idempotency_key=f"{channel}in:{mid}")
    except Exception:
        pass

    if out.get("ai_paused"):
        _mark_processed(tenant_id, idem, {"status": "human_owned"})
        return {"status": "human_owned", "conversation_id": conv_id, "message_id": mid}

    decision = meta_messaging_policy_eval(tenant_id, channel, asset_id, sender)
    draft = save_draft(tenant_id, {
        "channel": channel, "asset_id": asset_id, "conversation_id": conv_id,
        "contact_id": out.get("contact_id"), "sender_id": sender, "message_type": "text",
        "text": out.get("reply", ""), "window_open": decision["open"],
        "tag_required": decision.get("tag_required", False),
        "policy_version": decision.get("policy_version", ""),
        "response_plan_version": out.get("response_plan_version", ""),
        "status": "generated", "reply_mode": mode})

    if mode == "draft_only":
        result = {"status": "draft_only", "draft_id": draft["id"], "conversation_id": conv_id,
                  "policy": decision}
    else:  # approval_required or direct_reply → file the send through the registry
        from .registry import execute_action
        action = f"{channel}_send"
        args = {"to": sender, "body": draft["text"], "draft_id": draft["id"], "asset_id": asset_id}
        exec_res = execute_action(tenant_id, action, args, conversation_id=conv_id,
                                  idempotency_key=f"{channel}send:{draft['id']}")
        draft["status"] = "pending_approval"
        draft["approval_id"] = exec_res.get("record_id", "")
        save_draft(tenant_id, draft)
        result = {"status": "approval_required", "draft_id": draft["id"],
                  "approval_id": exec_res.get("record_id", ""), "conversation_id": conv_id,
                  "policy": decision}

    _mark_processed(tenant_id, idem, result)
    return {**result, "message_id": mid}


# ── delivery/read/failed status (Part 17) ─────────────────────────────────────

def process_status(tenant_id: str, channel: str, status: dict) -> dict:
    """Amend an existing outbound draft with a provider delivery/read/failed status.
    Monotonic; duplicate status events are harmless; never creates a new message."""
    mids = status.get("mids") or ([status.get("mid")] if status.get("mid") else [])
    new_status = status.get("status", "")  # delivered | read | failed
    watermark = status.get("watermark", "")
    if not mids and not watermark:
        return {"status": "ignored"}
    rank = {"provider_pending": 0, "sent": 1, "delivered": 2, "read": 3, "failed": 3}
    updated = 0
    for d in stores.meta_drafts().list(tenant_id):
        if d.get("channel") != channel:
            continue
        pmid = d.get("provider_message_id", "")
        match = (pmid and pmid in mids)
        if not match:
            continue
        cur = rank.get(d.get("status", ""), 0)
        nxt = rank.get(new_status, 0)
        if new_status == "failed":
            d["status"] = "failed"
            d["provider_error"] = (status.get("errors") or [{}])[0].get("title", "failed") if status.get("errors") else "failed"
        elif nxt >= cur:
            d["status"] = new_status
        d["updated_at"] = now_iso()
        stores.meta_drafts().put(tenant_id, d)
        stores.meta_statuses().put(tenant_id, {
            "id": new_id("metastat"), "tenant_id": tenant_id, "channel": channel,
            "provider_message_id": pmid, "status": new_status or "read",
            "created_at": now_iso()})
        updated += 1
    return {"status": "updated" if updated else "no_matching_draft", "updated": updated}


# ── policy helpers (thin wrappers so callers don't import the policy directly) ──

def meta_messaging_policy_record(tenant_id, channel, asset_id, sender):
    from . import meta_messaging_policy
    meta_messaging_policy.record_inbound(tenant_id, channel=channel, asset_id=asset_id, sender_id=sender)


def meta_messaging_policy_eval(tenant_id, channel, asset_id, sender):
    from . import meta_messaging_policy
    return meta_messaging_policy.window_state(tenant_id, channel=channel, asset_id=asset_id, sender_id=sender)


# ── helpers ───────────────────────────────────────────────────────────────────

def _mark_processed(tenant_id: str, idem: str, result: dict) -> None:
    stores.message_index().put(tenant_id, {"id": f"{tenant_id}::{idem}", "tenant_id": tenant_id,
                                           "dedup_key": idem, "result": result})


def _persist_inbound_only(tenant_id, channel, asset_id, sender, conv_id, parsed):
    from .schemas import Conversation, Message
    if not conv_id:
        conv = stores.conversations().put(tenant_id, Conversation(tenant_id=tenant_id, channel=channel).model_dump())
        conv_id = conv["id"]
        link_thread(tenant_id, channel, asset_id, sender, conv_id)
    stores.messages().put(tenant_id, Message(tenant_id=tenant_id, conversation_id=conv_id, role="customer",
                                             text=parsed["text"], channel=channel, intent="unknown").model_dump())


def _persist_media(tenant_id, channel, asset_id, parsed):
    stores.meta_media().put(tenant_id, {
        "id": new_id("metamedia"), "tenant_id": tenant_id, "channel": channel,
        "asset_id": asset_id, "sender_id": parsed["sender_id"], "media_id": parsed["media_id"],
        "media_url": parsed["media_url"], "media_type": parsed["type"],
        "message_id": parsed["message_id"], "status": "metadata_stored",
        "story_context": parsed.get("story_context", ""), "created_at": now_iso()})


def _record_opt_out(tenant_id: str, channel: str, sender: str):
    from .schemas import OptOut
    stores.optouts().put(tenant_id, OptOut(tenant_id=tenant_id, phone=f"{channel}:{sender}",
                                           channel=channel, reason="reply_stop", source=channel,
                                           scope="channel").model_dump())
    # cancel pending reminders/follow-ups for this contact where resolvable
    for r in stores.reminders().list(tenant_id):
        if r.get("status") == "scheduled" and r.get("channel") == channel:
            r["status"] = "cancelled"
            stores.reminders().put(tenant_id, r)


def is_suppressed(tenant_id: str, channel: str, sender: str) -> bool:
    from ..providers.meta_messaging_common import normalise_psid
    n = normalise_psid(sender)
    tag = f"{channel}:{n}"
    for row in stores.optouts().list(tenant_id):
        p = row.get("phone", "")
        scope = row.get("scope", "")
        # channel-scoped opt-out matches only same channel; global opt-out always matches
        if p == tag:
            return True
        if scope == "all" and normalise_psid(p.split(":")[-1]) == n:
            return True
    for row in stores.suppression().list(tenant_id):
        if row.get("phone", "") == tag:
            return True
    return False
