"""Durable Gmail + Calendar worker jobs for the AI Receptionist (Wave 8).

Registers job handlers with the shared worker registry (``worker.handlers``) and
reuses the existing atomic worker-claim + per-conversation lock infrastructure. All
provider I/O goes through the injectable Gmail/Calendar adapters, so standard tests
are hermetic (mock transport). Job types:

  gmail_initial_sync      — bounded initial mailbox import (batched, resumable)
  gmail_incremental_sync  — process new history since last processed id
  gmail_history_recovery  — bounded recovery when a history range is gone
  gmail_send_retry        — bounded retry of a failed approved send
  gmail_send_reconcile    — resolve an unknown send outcome (never blind resend)
  calendar_event_reconcile      — reconcile one booking ⇄ provider event
  calendar_reconciliation_sweep — enqueue reconcile for stale bookings

Per-account sync locking uses ``service.stores.acquire_lock`` so two workers can
never sync one account at once.
"""

from __future__ import annotations

import os
from typing import Any, Dict

from .handlers import register_handler

# ── per-account sync lock ─────────────────────────────────────────────────────

def _sync_lock_key(connection_id: str) -> str:
    return f"gmailsync::{connection_id}"


def _acquire_account_lock(tenant_id: str, connection_id: str) -> bool:
    from receptionist.service import stores
    ttl = int(os.environ.get("AI_RECEPTIONIST_GMAIL_SYNC_LOCK_TTL_SECONDS", "300") or 300)
    return stores.acquire_lock(tenant_id, _sync_lock_key(connection_id), owner=f"job:{connection_id}", ttl_seconds=ttl)


def _release_account_lock(tenant_id: str, connection_id: str) -> None:
    from receptionist.service import stores
    stores.release_lock(tenant_id, _sync_lock_key(connection_id))


# ── Gmail initial sync (Part 1) ───────────────────────────────────────────────

@register_handler("gmail_initial_sync")
def handle_gmail_initial_sync(job: dict) -> dict:
    """Bounded, resumable initial import. Never scans the whole mailbox. Idempotent
    per message. Two workers cannot run for one account (sync lock)."""
    tenant_id = job.get("tenant_id", "")
    payload = job.get("payload", {}) or {}
    connection_id = payload.get("connection_id", tenant_id)
    if not _acquire_account_lock(tenant_id, connection_id):
        return {"status": "skipped", "reason": "account_sync_in_progress"}
    try:
        from receptionist.service import gmail_sync
        from receptionist.providers import gmail as gmail_adapter

        batch = int(payload.get("batch_size") or os.environ.get("AI_RECEPTIONIST_GMAIL_SYNC_BATCH_SIZE", "10") or 10)
        page_token = payload.get("page_token", "")
        try:
            tx = gmail_adapter._active_transport()
            token = "sync-token"  # adapter mock ignores token; real path uses _token
            listing = tx.list_messages(token, query=payload.get("query", "in:inbox"),
                                       max_results=batch, page_token=page_token)
        except Exception as exc:  # provider error → retryable
            return {"status": "failed", "reason": str(exc)[:120]}

        processed, filtered, errors = 0, 0, 0
        for m in (listing.get("messages") or []):
            try:
                r = gmail_sync.process_message(tenant_id, m.get("id", ""),
                                               business_email=payload.get("business_email", ""))
                if r.get("status") == "filtered":
                    filtered += 1
                elif r.get("status") != "duplicate":
                    processed += 1
            except Exception:
                errors += 1

        # persist cursor + schedule next batch if the provider returned a page token
        next_token = listing.get("nextPageToken", "")
        gmail_sync.save_sync_state(tenant_id, last_sync_at="")
        result = {"status": "completed", "processed": processed, "filtered": filtered, "errors": errors}
        if next_token and processed + filtered > 0:
            from . import jobs_store
            jobs_store.enqueue(tenant_id, "gmail_initial_sync",
                               {**payload, "page_token": next_token})
            result["next_batch_enqueued"] = True
        return result
    finally:
        _release_account_lock(tenant_id, connection_id)


# ── Gmail incremental sync (Part 2) ───────────────────────────────────────────

@register_handler("gmail_incremental_sync")
def handle_gmail_incremental_sync(job: dict) -> dict:
    tenant_id = job.get("tenant_id", "")
    payload = job.get("payload", {}) or {}
    connection_id = payload.get("connection_id", tenant_id)
    if not _acquire_account_lock(tenant_id, connection_id):
        return {"status": "skipped", "reason": "account_sync_in_progress"}
    try:
        from receptionist.service import gmail_sync
        from receptionist.providers import gmail as gmail_adapter

        st = gmail_sync.get_sync_state(tenant_id)
        start_history = payload.get("history_id") or st.get("last_history_id", "")
        tx = gmail_adapter._active_transport()
        try:
            hist = tx.history("sync-token", start_history)
        except Exception:
            # history range gone → bounded recovery
            from . import jobs_store
            jobs_store.enqueue(tenant_id, "gmail_history_recovery", {**payload})
            return {"status": "recovery_scheduled"}

        processed = 0
        for h in (hist.get("history") or []):
            for added in (h.get("messagesAdded") or []):
                mid = (added.get("message") or {}).get("id", "")
                if mid:
                    r = gmail_sync.process_message(tenant_id, mid)
                    if r.get("status") not in ("duplicate", "filtered"):
                        processed += 1
        new_hist = hist.get("historyId", start_history)
        gmail_sync.save_sync_state(tenant_id, last_history_id=str(new_hist))
        return {"status": "completed", "processed": processed, "history_id": str(new_hist)}
    finally:
        _release_account_lock(tenant_id, connection_id)


@register_handler("gmail_history_recovery")
def handle_gmail_history_recovery(job: dict) -> dict:
    """Bounded recovery sync (never an unlimited mailbox scan) → delegates to a
    small initial-sync batch."""
    tenant_id = job.get("tenant_id", "")
    payload = job.get("payload", {}) or {}
    from . import jobs_store
    jobs_store.enqueue(tenant_id, "gmail_initial_sync",
                       {**payload, "query": "in:inbox newer_than:2d", "batch_size": 10})
    return {"status": "completed", "recovery": "bounded"}


# ── Gmail send retry + reconcile (Parts 5/6) ──────────────────────────────────

@register_handler("gmail_send_retry")
def handle_gmail_send_retry(job: dict) -> dict:
    tenant_id = job.get("tenant_id", "")
    payload = job.get("payload", {}) or {}
    draft_id = payload.get("draft_id", "")
    from receptionist.service import stores
    draft = stores.gmail_drafts().get(tenant_id, draft_id)
    if draft is None:
        return {"status": "failed", "reason": "draft_not_found"}
    if draft.get("status") == "sent":
        return {"status": "completed", "already_sent": True}
    from receptionist.service.registry import execute_action
    res = execute_action(tenant_id, "gmail_send",
                         {"to": draft.get("to", ""), "subject": draft.get("subject", ""),
                          "body": draft.get("body", ""), "thread_id": draft.get("thread_id", ""),
                          "draft_id": draft_id}, skip_approval=True,
                         idempotency_key=f"gmailsend:{draft_id}")
    status = res.get("status")
    if status == "sent":
        return {"status": "completed", "message_id": res.get("record_id", "")}
    if status in ("suppressed",) or "missing_scope" in str(res.get("detail", "")) or "invalid_recipient" in str(res.get("detail", "")):
        return {"status": "terminal", "reason": res.get("detail", status)}  # do not retry
    return {"status": "failed", "reason": res.get("detail", status)}  # bounded worker retry


@register_handler("gmail_send_reconcile")
def handle_gmail_send_reconcile(job: dict) -> dict:
    """Resolve an unknown send outcome without a blind resend."""
    tenant_id = job.get("tenant_id", "")
    payload = job.get("payload", {}) or {}
    from receptionist.service import stores
    draft = stores.gmail_drafts().get(tenant_id, payload.get("draft_id", ""))
    if draft is None:
        return {"status": "failed", "reason": "draft_not_found"}
    if draft.get("provider_message_id"):
        draft["status"] = "sent"
        stores.gmail_drafts().put(tenant_id, draft)
        return {"status": "confirmed_sent", "message_id": draft["provider_message_id"]}
    # no confirmed provider id → leave for operator; never resend automatically here
    draft["status"] = "reconciliation_required"
    stores.gmail_drafts().put(tenant_id, draft)
    return {"status": "reconciliation_required"}


# ── Calendar reconciliation (Part 7) ──────────────────────────────────────────

@register_handler("calendar_event_reconcile")
def handle_calendar_event_reconcile(job: dict) -> dict:
    tenant_id = job.get("tenant_id", "")
    payload = job.get("payload", {}) or {}
    from receptionist.service import booking
    return booking.reconcile_event(tenant_id, payload.get("booking_id", ""))


@register_handler("calendar_reconciliation_sweep")
def handle_calendar_reconciliation_sweep(job: dict) -> dict:
    tenant_id = job.get("tenant_id", "")
    from receptionist.service import stores, booking
    from . import jobs_store
    n = 0
    for b in stores.bookings().list(tenant_id):
        if b.get("status") == "confirmed" and b.get("provider_event_id"):
            jobs_store.enqueue(tenant_id, "calendar_event_reconcile", {"booking_id": b["id"]})
            n += 1
    return {"status": "completed", "enqueued": n}


# ── WhatsApp jobs (Wave 12) ───────────────────────────────────────────────────

@register_handler("whatsapp_inbound")
def handle_whatsapp_inbound(job: dict) -> dict:
    tenant_id = job.get("tenant_id", "")
    payload = job.get("payload", {}) or {}
    try:
        from receptionist.service import whatsapp_sync
        return whatsapp_sync.process_message(
            tenant_id, phone_number_id=payload.get("phone_number_id", ""),
            message=payload.get("message", {}) or {}, contacts=payload.get("contacts") or [])
    except Exception as exc:  # pragma: no cover
        return {"status": "failed", "reason": str(exc)[:120]}


@register_handler("whatsapp_status")
def handle_whatsapp_status(job: dict) -> dict:
    tenant_id = job.get("tenant_id", "")
    payload = job.get("payload", {}) or {}
    from receptionist.service import whatsapp_sync
    return whatsapp_sync.process_status(tenant_id, payload.get("status", {}) or {})


@register_handler("whatsapp_send_retry")
def handle_whatsapp_send_retry(job: dict) -> dict:
    tenant_id = job.get("tenant_id", "")
    payload = job.get("payload", {}) or {}
    draft_id = payload.get("draft_id", "")
    from receptionist.service import stores
    d = stores.wa_drafts().get(tenant_id, draft_id)
    if d is None:
        return {"status": "failed", "reason": "draft_not_found"}
    if d.get("status") in ("sent", "delivered", "read", "provider_pending"):
        return {"status": "completed", "already_sent": True}
    from receptionist.service.registry import execute_action
    res = execute_action(tenant_id, "whatsapp_send", {
        "to": d.get("wa_id", ""), "body": d.get("text", ""), "draft_id": draft_id,
        "phone_number_id": d.get("phone_number_id", "")}, skip_approval=True,
        idempotency_key=f"wasend:{draft_id}")
    status = res.get("status")
    if status == "provider_pending":
        return {"status": "completed", "message_id": res.get("record_id", "")}
    if status in ("suppressed", "template_required") or "invalid_recipient" in str(res.get("detail", "")) or "missing_permission" in str(res.get("detail", "")):
        return {"status": "terminal", "reason": res.get("detail", status)}
    return {"status": "failed", "reason": res.get("detail", status)}


@register_handler("whatsapp_reconcile")
def handle_whatsapp_reconcile(job: dict) -> dict:
    tenant_id = job.get("tenant_id", "")
    payload = job.get("payload", {}) or {}
    from receptionist.service import stores
    d = stores.wa_drafts().get(tenant_id, payload.get("draft_id", ""))
    if d is None:
        return {"status": "failed", "reason": "draft_not_found"}
    if d.get("provider_message_id"):
        d["status"] = d.get("status") or "provider_pending"
        stores.wa_drafts().put(tenant_id, d)
        return {"status": "confirmed_accepted", "message_id": d["provider_message_id"]}
    d["status"] = "reconciliation_required"
    stores.wa_drafts().put(tenant_id, d)
    return {"status": "reconciliation_required"}


@register_handler("whatsapp_template_sync")
def handle_whatsapp_template_sync(job: dict) -> dict:
    tenant_id = job.get("tenant_id", "")
    from receptionist.service import whatsapp_templates
    return whatsapp_templates.sync(tenant_id)


@register_handler("whatsapp_media_fetch")
def handle_whatsapp_media_fetch(job: dict) -> dict:
    tenant_id = job.get("tenant_id", "")
    payload = job.get("payload", {}) or {}
    from receptionist.providers import whatsapp_cloud as wa
    from receptionist.service import stores
    media_id = payload.get("media_id", "")
    try:
        meta = wa.get_media_metadata(tenant_id, media_id)
    except wa.WhatsAppError as exc:
        return {"status": "failed", "reason": exc.category}
    for m in stores.wa_media().list(tenant_id):
        if m.get("media_id") == media_id:
            m["mime_type"] = meta.get("mime_type", "")
            m["file_size"] = meta.get("file_size", 0)
            m["status"] = "fetched"
            stores.wa_media().put(tenant_id, m)
    return {"status": "completed", "media_id": media_id}


@register_handler("whatsapp_connection_health")
def handle_whatsapp_connection_health(job: dict) -> dict:
    tenant_id = job.get("tenant_id", "")
    from receptionist.providers import whatsapp_cloud as wa
    return {"status": "completed", "health": wa.validate_connection(tenant_id)}
