"""Gmail inbound sync + reply orchestration for the AI Receptionist (Wave 7).

Routes qualifying Gmail messages through the CANONICAL engine (``engine.run_message``)
— the same engine, config, knowledge, handoff, actions, approvals, billing and
idempotency as Website Chat. There is NO Gmail-specific AI engine here.

Reply modes (server-authoritative): disabled | draft_only | approval_required |
direct_reply (direct_reply is off by default and still routes sensitive actions
through approval). Inbound filtering keeps auto-replies, bounces, no-reply, list
mail and the business's own messages out of the customer-enquiry path. All provider
calls go through the injectable :mod:`receptionist.providers.gmail` adapter, so
standard tests are hermetic.
"""

from __future__ import annotations

import os
import re
from typing import Optional

from . import stores
from .ids import new_id, now_iso

REPLY_MODES = ("disabled", "draft_only", "approval_required", "direct_reply")


def reply_mode(tenant_id: str) -> str:
    """Server-authoritative reply mode: config override → env default → draft_only."""
    from . import config_repo
    cfg = config_repo.get_active(tenant_id) or {}
    mode = str(cfg.get("gmail_reply_mode") or os.environ.get("AI_RECEPTIONIST_GMAIL_REPLY_MODE", "") or "draft_only").strip()
    if mode == "direct_reply" and os.environ.get("AI_RECEPTIONIST_GMAIL_DIRECT_REPLY_ENABLED", "").lower() not in ("1", "true", "yes", "on"):
        return "approval_required"  # direct reply must be explicitly enabled
    return mode if mode in REPLY_MODES else "draft_only"


# ── inbound filtering (Part 6) ────────────────────────────────────────────────

_AUTO_HEADERS = ("auto-submitted", "x-autoreply", "x-autorespond", "precedence")
_LIST_HEADERS = ("list-id", "list-unsubscribe")


def filter_reason(msg: dict, *, business_email: str = "") -> Optional[str]:
    """Return a durable filter reason if this message must NOT be treated as a
    customer enquiry, else None."""
    labels = set(msg.get("labels") or [])
    if "SPAM" in labels or "TRASH" in labels:
        return "spam_or_trash"
    if "SENT" in labels or "DRAFT" in labels:
        return "own_message"
    frm = (msg.get("from") or "").lower()
    if business_email and business_email.lower() in frm:
        return "own_message"
    if re.search(r"no-?reply|do-?not-?reply|mailer-daemon|postmaster", frm):
        return "no_reply_sender"
    subject = (msg.get("subject") or "").lower()
    if re.search(r"^(auto(matic)?[-\s]?reply|out of office|delivery status notification|undeliverable|mail delivery failed)", subject):
        return "auto_reply_or_bounce"
    # header-based auto-reply / list detection (normalised headers are lower-cased keys)
    raw_headers = {k.lower(): v for k, v in (msg.get("_headers") or {}).items()}
    for h in _AUTO_HEADERS:
        v = raw_headers.get(h, "")
        if v and v.lower() not in ("", "no"):
            if h == "precedence" and v.lower() not in ("bulk", "list", "auto_reply", "junk"):
                continue
            return "auto_header"
    for h in _LIST_HEADERS:
        if raw_headers.get(h):
            return "mailing_list"
    return None


# ── thread ↔ conversation mapping (Part 8) ────────────────────────────────────

def _thread_key(tenant_id: str, thread_id: str) -> str:
    return f"gt::{tenant_id}::{thread_id}"


def conversation_for_thread(tenant_id: str, thread_id: str) -> Optional[str]:
    rec = stores.gmail_thread_map().get(tenant_id, _thread_key(tenant_id, thread_id))
    return rec.get("conversation_id") if rec else None


def link_thread(tenant_id: str, thread_id: str, conversation_id: str) -> None:
    stores.gmail_thread_map().put(tenant_id, {
        "id": _thread_key(tenant_id, thread_id), "tenant_id": tenant_id,
        "thread_id": thread_id, "conversation_id": conversation_id, "updated_at": now_iso(),
    })


# ── sync state (Part 5) ───────────────────────────────────────────────────────

def get_sync_state(tenant_id: str) -> dict:
    return stores.gmail_sync_state().get(tenant_id, tenant_id) or {"tenant_id": tenant_id, "id": tenant_id}


def save_sync_state(tenant_id: str, *, last_history_id: str = "", last_sync_at: str = "") -> dict:
    st = get_sync_state(tenant_id)
    if last_history_id:
        st["last_history_id"] = last_history_id
    st["last_sync_at"] = last_sync_at or now_iso()
    st["id"] = tenant_id
    st["tenant_id"] = tenant_id
    return stores.gmail_sync_state().put(tenant_id, st)


# ── drafts (Part 11) ──────────────────────────────────────────────────────────

DRAFT_STATES = ("generated", "provider_draft_created", "pending_approval", "approved",
                "sending", "sent", "failed", "cancelled")


def save_draft(tenant_id: str, draft: dict) -> dict:
    draft.setdefault("id", new_id("gdft"))
    draft.setdefault("created_at", now_iso())
    draft["updated_at"] = now_iso()
    return stores.gmail_drafts().put(tenant_id, draft)


def list_drafts(tenant_id: str) -> list[dict]:
    return stores.gmail_drafts().list(tenant_id)


def edit_draft(tenant_id: str, draft_id: str, *, subject: Optional[str] = None,
               body: Optional[str] = None) -> Optional[dict]:
    """Edit a draft's subject/body. A sent/sending draft cannot be edited. Editing a
    draft that is pending approval INVALIDATES the approval (the old approved payload
    can no longer send) — the draft returns to 'generated' and must be re-submitted."""
    draft = stores.gmail_drafts().get(tenant_id, draft_id)
    if draft is None:
        return None
    if draft.get("status") in ("sent", "sending"):
        return {"status": "locked", "detail": "sent drafts cannot be edited"}

    # audit the previous content
    draft.setdefault("edit_history", []).append({
        "at": now_iso(), "subject": draft.get("subject", ""), "body": draft.get("body", "")})
    if subject is not None:
        draft["subject"] = subject
    if body is not None:
        draft["body"] = body

    invalidated = False
    if draft.get("status") == "pending_approval" and draft.get("approval_id"):
        _invalidate_approval(tenant_id, draft["approval_id"])
        invalidated = True
        draft["approval_id"] = ""
    draft["status"] = "generated"  # requires a fresh approval before it can send
    saved = save_draft(tenant_id, draft)
    saved["approval_invalidated"] = invalidated
    return saved


def _invalidate_approval(tenant_id: str, approval_id: str) -> None:
    """Mark a pending approval as skipped so its (now-stale) payload cannot execute."""
    try:
        from approvals.router import get_approvals_store
        store = get_approvals_store()
        item = store.get(tenant_id, approval_id)
        if item is not None and item.status in ("pending", "approved"):
            item.status = "skipped"
            store.save(item)
    except Exception:
        pass


# ── the sync-one-message flow (Parts 4/9/10) ──────────────────────────────────

def process_message(tenant_id: str, message_id: str, *, business_email: str = "",
                    now: Optional[str] = None) -> dict:
    """Fetch → filter → resolve thread/conversation → run canonical engine per reply
    mode → persist a draft/approval/send intent. Idempotent on message_id. Hermetic:
    the provider adapter defaults to a mock unless a real transport is installed."""
    from . import engine, usage

    # idempotency: already processed this provider message?
    idem_key = f"gmail:{message_id}"
    if stores.message_index().get(tenant_id, f"{tenant_id}::{idem_key}"):
        return {"status": "duplicate", "message_id": message_id}

    msg = _sync_get_message(tenant_id, message_id)

    reason = filter_reason(msg, business_email=business_email)
    if reason is not None:
        stores.message_index().put(tenant_id, {"id": f"{tenant_id}::{idem_key}", "tenant_id": tenant_id,
                                               "dedup_key": idem_key, "result": {"status": "filtered", "reason": reason}})
        return {"status": "filtered", "reason": reason, "message_id": message_id}

    mode = reply_mode(tenant_id)
    thread_id = msg.get("thread_id", "")
    conv_id = conversation_for_thread(tenant_id, thread_id)

    from ..providers import gmail as gmail_adapter
    body = gmail_adapter.trim_quoted(msg.get("body_text", "")) or msg.get("snippet", "")

    if mode == "disabled":
        # store inbound only, no AI
        _persist_inbound_only(tenant_id, conv_id, thread_id, msg, body)
        _mark_processed(tenant_id, idem_key, {"status": "stored_no_ai"})
        return {"status": "stored_no_ai", "message_id": message_id}

    out = engine.run_message(
        tenant_id=tenant_id, message=body, channel="gmail",
        conversation_id=conv_id, idempotency_key=idem_key,
        overrides={"email": _sender_email(msg.get("from", "")), "name": _sender_name(msg.get("from", ""))},
        now=now,
    )
    conv_id = out.get("conversation_id", conv_id)
    if thread_id and conv_id:
        link_thread(tenant_id, thread_id, conv_id)
    try:
        usage.increment(tenant_id, "gmail_operations", idempotency_key=f"gmailproc:{message_id}")
    except Exception:
        pass

    # Human-owned or paused → do not prepare an automated reply.
    if out.get("ai_paused"):
        _mark_processed(tenant_id, idem_key, {"status": "human_owned"})
        return {"status": "human_owned", "conversation_id": conv_id, "message_id": message_id}

    reply_text = out.get("reply", "")
    draft = save_draft(tenant_id, {
        "conversation_id": conv_id, "contact_id": out.get("contact_id"),
        "thread_id": thread_id, "to": _sender_email(msg.get("from", "")),
        "subject": _reply_subject(msg.get("subject", "")), "body": reply_text,
        "in_reply_to": msg.get("message_id", ""), "references": msg.get("references", ""),
        "response_plan_version": out.get("response_plan_version", ""),
        "status": "generated", "reply_mode": mode,
    })

    result: dict
    if mode == "draft_only":
        result = {"status": "draft_only", "draft_id": draft["id"], "conversation_id": conv_id}
    elif mode in ("approval_required", "direct_reply"):
        # Route the send through the canonical action registry (approval-gated,
        # idempotent, billed). direct_reply still files approval for the actual send
        # in this phase — a real send is never fired from the sync path.
        from .registry import execute_action
        exec_res = execute_action(
            tenant_id, "gmail_send",
            {"to": draft["to"], "subject": draft["subject"], "body": reply_text,
             "thread_id": thread_id, "draft_id": draft["id"]},
            conversation_id=conv_id, idempotency_key=f"gmailsend:{draft['id']}")
        draft["status"] = "pending_approval"
        draft["approval_id"] = exec_res.get("record_id", "")
        save_draft(tenant_id, draft)
        result = {"status": "approval_required", "draft_id": draft["id"],
                  "approval_id": exec_res.get("record_id", ""), "conversation_id": conv_id}
    else:
        result = {"status": "draft_only", "draft_id": draft["id"], "conversation_id": conv_id}

    _mark_processed(tenant_id, idem_key, result)
    return {**result, "message_id": message_id}


# ── helpers ───────────────────────────────────────────────────────────────────

def _sync_get_message(tenant_id: str, message_id: str) -> dict:
    """Synchronous fetch+normalise using the (mock-by-default) adapter transport."""
    from ..providers import gmail as gmail_adapter
    tx = gmail_adapter._active_transport()
    return gmail_adapter.normalise_message(tx.get_message("mock-token", message_id))


def _mark_processed(tenant_id: str, idem_key: str, result: dict) -> None:
    stores.message_index().put(tenant_id, {"id": f"{tenant_id}::{idem_key}", "tenant_id": tenant_id,
                                           "dedup_key": idem_key, "result": result})


def _persist_inbound_only(tenant_id: str, conv_id: Optional[str], thread_id: str, msg: dict, body: str) -> None:
    from .schemas import Conversation, Message
    if not conv_id:
        conv = stores.conversations().put(tenant_id, Conversation(tenant_id=tenant_id, channel="gmail").model_dump())
        conv_id = conv["id"]
        if thread_id:
            link_thread(tenant_id, thread_id, conv_id)
    stores.messages().put(tenant_id, Message(tenant_id=tenant_id, conversation_id=conv_id, role="customer",
                                             text=body, channel="gmail", intent="unknown").model_dump())


def _sender_email(frm: str) -> str:
    m = re.search(r"<([^>]+)>", frm or "")
    return (m.group(1) if m else frm).strip()


def _sender_name(frm: str) -> str:
    return re.sub(r"<[^>]+>", "", frm or "").strip().strip('"')


def _reply_subject(subject: str) -> str:
    s = (subject or "").strip()
    return s if s.lower().startswith("re:") else f"Re: {s}" if s else "Re: your enquiry"
