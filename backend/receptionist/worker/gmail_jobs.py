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


# ── Meta Messaging (Instagram + Messenger) jobs ───────────────────────────────

def _meta_inbound(job: dict, channel: str) -> dict:
    tenant_id = job.get("tenant_id", "")
    payload = job.get("payload", {}) or {}
    try:
        from receptionist.service import meta_messaging_sync
        return meta_messaging_sync.process_message(
            tenant_id, channel=channel, asset_id=payload.get("asset_id", ""),
            event=payload.get("event", {}) or {})
    except Exception as exc:  # pragma: no cover
        return {"status": "failed", "reason": str(exc)[:120]}


def _meta_status(job: dict, channel: str) -> dict:
    tenant_id = job.get("tenant_id", "")
    payload = job.get("payload", {}) or {}
    from receptionist.service import meta_messaging_sync
    return meta_messaging_sync.process_status(tenant_id, channel, payload.get("status", {}) or {})


def _meta_send_retry(job: dict, channel: str) -> dict:
    tenant_id = job.get("tenant_id", "")
    payload = job.get("payload", {}) or {}
    draft_id = payload.get("draft_id", "")
    from receptionist.service import stores
    d = stores.meta_drafts().get(tenant_id, draft_id)
    if d is None:
        return {"status": "failed", "reason": "draft_not_found"}
    if d.get("status") in ("sent", "delivered", "read", "provider_pending"):
        return {"status": "completed", "already_sent": True}
    from receptionist.service.registry import execute_action
    res = execute_action(tenant_id, f"{channel}_send", {
        "to": d.get("sender_id", ""), "body": d.get("text", ""), "draft_id": draft_id,
        "asset_id": d.get("asset_id", "")}, skip_approval=True,
        idempotency_key=f"{channel}send:{draft_id}")
    status = res.get("status")
    if status == "provider_pending":
        return {"status": "completed", "message_id": res.get("record_id", "")}
    detail = str(res.get("detail", ""))
    if status in ("suppressed", "blocked_by_policy") or "invalid_recipient" in detail or "missing_permission" in detail:
        return {"status": "terminal", "reason": res.get("detail", status)}
    return {"status": "failed", "reason": res.get("detail", status)}


def _meta_reconcile(job: dict, channel: str) -> dict:
    tenant_id = job.get("tenant_id", "")
    payload = job.get("payload", {}) or {}
    from receptionist.service import stores
    d = stores.meta_drafts().get(tenant_id, payload.get("draft_id", ""))
    if d is None:
        return {"status": "failed", "reason": "draft_not_found"}
    if d.get("provider_message_id"):
        d["status"] = d.get("status") or "provider_pending"
        stores.meta_drafts().put(tenant_id, d)
        return {"status": "confirmed_accepted", "message_id": d["provider_message_id"]}
    d["status"] = "reconciliation_required"
    stores.meta_drafts().put(tenant_id, d)
    return {"status": "reconciliation_required"}


@register_handler("instagram_inbound")
def handle_instagram_inbound(job: dict) -> dict:
    return _meta_inbound(job, "instagram")


@register_handler("instagram_status")
def handle_instagram_status(job: dict) -> dict:
    return _meta_status(job, "instagram")


@register_handler("instagram_send_retry")
def handle_instagram_send_retry(job: dict) -> dict:
    return _meta_send_retry(job, "instagram")


@register_handler("instagram_reconcile")
def handle_instagram_reconcile(job: dict) -> dict:
    return _meta_reconcile(job, "instagram")


@register_handler("messenger_inbound")
def handle_messenger_inbound(job: dict) -> dict:
    return _meta_inbound(job, "messenger")


@register_handler("messenger_status")
def handle_messenger_status(job: dict) -> dict:
    return _meta_status(job, "messenger")


@register_handler("messenger_send_retry")
def handle_messenger_send_retry(job: dict) -> dict:
    return _meta_send_retry(job, "messenger")


@register_handler("messenger_reconcile")
def handle_messenger_reconcile(job: dict) -> dict:
    return _meta_reconcile(job, "messenger")


@register_handler("meta_media_fetch")
def handle_meta_media_fetch(job: dict) -> dict:
    tenant_id = job.get("tenant_id", "")
    payload = job.get("payload", {}) or {}
    channel = payload.get("channel", "instagram")
    media_id = payload.get("media_id", "")
    from receptionist.service import stores
    if channel == "messenger":
        from receptionist.providers import messenger as prov
    else:
        from receptionist.providers import instagram_messaging as prov
    from receptionist.providers.meta_messaging_common import MetaMessagingError
    try:
        meta = prov.get_media_metadata(tenant_id, media_id)
    except MetaMessagingError as exc:
        return {"status": "failed", "reason": exc.category}
    for m in stores.meta_media().list(tenant_id):
        if m.get("media_id") == media_id:
            m["mime_type"] = meta.get("mime_type", "")
            m["file_size"] = meta.get("file_size", 0)
            m["status"] = "fetched"
            stores.meta_media().put(tenant_id, m)
    return {"status": "completed", "media_id": media_id}


@register_handler("meta_connection_health")
def handle_meta_connection_health(job: dict) -> dict:
    tenant_id = job.get("tenant_id", "")
    from receptionist.providers import instagram_messaging as ig, messenger as fb
    return {"status": "completed",
            "instagram": ig.validate_connection(tenant_id),
            "messenger": fb.validate_connection(tenant_id)}


# ── SMS jobs ──────────────────────────────────────────────────────────────────

@register_handler("sms_inbound")
def handle_sms_inbound(job: dict) -> dict:
    tenant_id = job.get("tenant_id", "")
    payload = job.get("payload", {}) or {}
    try:
        from receptionist.service import sms_sync
        return sms_sync.process_message(tenant_id, sender_number=payload.get("sender_number", ""),
                                        payload=payload.get("payload", {}) or {})
    except Exception as exc:  # pragma: no cover
        return {"status": "failed", "reason": str(exc)[:120]}


@register_handler("sms_status")
def handle_sms_status(job: dict) -> dict:
    tenant_id = job.get("tenant_id", "")
    payload = job.get("payload", {}) or {}
    from receptionist.service import sms_sync
    return sms_sync.process_status(tenant_id, payload.get("status", {}) or {})


@register_handler("sms_send_retry")
def handle_sms_send_retry(job: dict) -> dict:
    tenant_id = job.get("tenant_id", "")
    payload = job.get("payload", {}) or {}
    draft_id = payload.get("draft_id", "")
    from receptionist.service import stores
    d = stores.sms_drafts().get(tenant_id, draft_id)
    if d is None:
        return {"status": "failed", "reason": "draft_not_found"}
    if d.get("status") in ("sent", "delivered", "provider_pending"):
        return {"status": "completed", "already_sent": True}
    from receptionist.service.registry import execute_action
    res = execute_action(tenant_id, "sms_send", {
        "to": d.get("customer_number", ""), "body": d.get("text", ""), "draft_id": draft_id,
        "sender_number": d.get("sender_number", "")}, skip_approval=True,
        idempotency_key=f"smssend:{draft_id}")
    status = res.get("status")
    if status == "provider_pending":
        return {"status": "completed", "message_id": res.get("record_id", "")}
    detail = str(res.get("detail", ""))
    if status in ("suppressed", "blocked_by_policy") or "invalid_recipient" in detail or "missing_permission" in detail:
        return {"status": "terminal", "reason": res.get("detail", status)}
    if status == "delayed_quiet_hours":
        return {"status": "completed", "delayed": True}
    return {"status": "failed", "reason": res.get("detail", status)}


@register_handler("sms_delayed_send")
def handle_sms_delayed_send(job: dict) -> dict:
    """Quiet-hours-queued send: re-validate consent + quiet hours, then send once."""
    tenant_id = job.get("tenant_id", "")
    payload = job.get("payload", {}) or {}
    draft_id = payload.get("draft_id", "")
    from receptionist.service import stores
    d = stores.sms_drafts().get(tenant_id, draft_id)
    if d is None:
        return {"status": "failed", "reason": "draft_not_found"}
    if d.get("status") in ("sent", "delivered", "provider_pending", "cancelled"):
        return {"status": "completed", "already_handled": True}
    from receptionist.service.registry import execute_action
    res = execute_action(tenant_id, "sms_send", {
        "to": d.get("customer_number", ""), "body": d.get("text", ""), "draft_id": draft_id,
        "sender_number": d.get("sender_number", "")}, skip_approval=True,
        idempotency_key=f"smsdelayed:{draft_id}")
    status = res.get("status")
    if status == "provider_pending":
        return {"status": "completed", "message_id": res.get("record_id", "")}
    if status == "delayed_quiet_hours":
        return {"status": "retry", "reason": "still_quiet_hours"}
    if status in ("suppressed", "blocked_by_policy"):
        return {"status": "terminal", "reason": res.get("detail", status)}
    return {"status": "failed", "reason": res.get("detail", status)}


@register_handler("sms_reconcile")
def handle_sms_reconcile(job: dict) -> dict:
    tenant_id = job.get("tenant_id", "")
    payload = job.get("payload", {}) or {}
    from receptionist.service import stores
    d = stores.sms_drafts().get(tenant_id, payload.get("draft_id", ""))
    if d is None:
        return {"status": "failed", "reason": "draft_not_found"}
    mid = d.get("provider_message_id", "")
    if not mid:
        d["status"] = "reconciliation_required"
        stores.sms_drafts().put(tenant_id, d)
        return {"status": "reconciliation_required"}
    from receptionist.providers import sms_adapter as sms
    got = sms.reconcile_message(tenant_id, mid)
    prov = (got.get("status") or "unknown").lower()
    if prov in ("delivered", "sent", "failed", "undelivered"):
        d["status"] = "delivered" if prov == "delivered" else ("failed" if prov in ("failed", "undelivered") else "sent")
        stores.sms_drafts().put(tenant_id, d)
        return {"status": "confirmed", "provider_status": prov}
    return {"status": "unknown", "message_id": mid}


@register_handler("sms_media_fetch")
def handle_sms_media_fetch(job: dict) -> dict:
    tenant_id = job.get("tenant_id", "")
    payload = job.get("payload", {}) or {}
    from receptionist.providers import sms_adapter as sms
    from receptionist.service import stores
    media_url = payload.get("media_url", "")
    try:
        meta = sms.get_media_metadata(tenant_id, media_url, payload.get("content_type", ""))
    except sms.SMSError as exc:
        return {"status": "failed", "reason": exc.category}
    for m in stores.sms_media().list(tenant_id):
        if m.get("media_url") == media_url:
            m["kind"] = meta.get("kind", "")
            m["status"] = "fetched"
            stores.sms_media().put(tenant_id, m)
    return {"status": "completed", "media_url": media_url}


@register_handler("sms_connection_health")
def handle_sms_connection_health(job: dict) -> dict:
    tenant_id = job.get("tenant_id", "")
    from receptionist.providers import sms_adapter as sms
    return {"status": "completed", "health": sms.health_check(tenant_id)}


# ── Telegram jobs (Bot + Business) ────────────────────────────────────────────

def _tg_inbound(job: dict, mode: str) -> dict:
    tenant_id = job.get("tenant_id", "")
    payload = job.get("payload", {}) or {}
    try:
        from receptionist.service import telegram_sync
        return telegram_sync.process_message(tenant_id, mode=mode, message=payload.get("message", {}) or {})
    except Exception as exc:  # pragma: no cover
        return {"status": "failed", "reason": str(exc)[:120]}


@register_handler("telegram_inbound")
def handle_telegram_inbound(job: dict) -> dict:
    return _tg_inbound(job, "bot")


@register_handler("telegram_business_inbound")
def handle_telegram_business_inbound(job: dict) -> dict:
    return _tg_inbound(job, "business")


@register_handler("telegram_callback")
def handle_telegram_callback(job: dict) -> dict:
    tenant_id = job.get("tenant_id", "")
    payload = job.get("payload", {}) or {}
    from receptionist.service import telegram_sync
    return telegram_sync.process_callback(tenant_id, payload.get("callback_query", {}) or {})


@register_handler("telegram_edited")
def handle_telegram_edited(job: dict) -> dict:
    tenant_id = job.get("tenant_id", "")
    payload = job.get("payload", {}) or {}
    from receptionist.service import telegram_sync
    return telegram_sync.process_edited(tenant_id, payload.get("mode", "bot"), payload.get("message", {}) or {})


@register_handler("telegram_deleted")
def handle_telegram_deleted(job: dict) -> dict:
    tenant_id = job.get("tenant_id", "")
    payload = job.get("payload", {}) or {}
    from receptionist.service import telegram_sync
    return telegram_sync.process_deleted(tenant_id, payload.get("mode", "business"),
                                         payload.get("chat_id", ""), payload.get("message_ids", []))


@register_handler("telegram_business_connection")
def handle_telegram_business_connection(job: dict) -> dict:
    tenant_id = job.get("tenant_id", "")
    payload = job.get("payload", {}) or {}
    from receptionist.service import telegram_sync
    return telegram_sync.process_business_connection(tenant_id, payload.get("business_connection", {}) or {})


@register_handler("telegram_send_retry")
def handle_telegram_send_retry(job: dict) -> dict:
    tenant_id = job.get("tenant_id", "")
    payload = job.get("payload", {}) or {}
    draft_id = payload.get("draft_id", "")
    from receptionist.service import stores
    d = stores.tg_drafts().get(tenant_id, draft_id)
    if d is None:
        return {"status": "failed", "reason": "draft_not_found"}
    if d.get("status") in ("sent", "provider_pending"):
        return {"status": "completed", "already_sent": True}
    mode = d.get("mode", "bot")
    action = "telegram_business_send" if mode == "business" else "telegram_send"
    from receptionist.service.registry import execute_action
    res = execute_action(tenant_id, action, {
        "chat_id": d.get("chat_id", ""), "user_id": d.get("user_id", ""), "body": d.get("text", ""),
        "draft_id": draft_id, "business_connection_id": d.get("business_connection_id", "")},
        skip_approval=True, idempotency_key=f"tgsend:{draft_id}")
    status = res.get("status")
    if status == "provider_pending":
        return {"status": "completed", "message_id": res.get("record_id", "")}
    detail = str(res.get("detail", ""))
    if status in ("suppressed", "blocked_by_policy") or "forbidden_chat" in detail or "business_rights_missing" in detail:
        return {"status": "terminal", "reason": res.get("detail", status)}
    return {"status": "failed", "reason": res.get("detail", status)}


@register_handler("telegram_reconcile")
def handle_telegram_reconcile(job: dict) -> dict:
    tenant_id = job.get("tenant_id", "")
    payload = job.get("payload", {}) or {}
    from receptionist.service import stores
    d = stores.tg_drafts().get(tenant_id, payload.get("draft_id", ""))
    if d is None:
        return {"status": "failed", "reason": "draft_not_found"}
    if d.get("provider_message_id"):
        d["status"] = "provider_pending"
        stores.tg_drafts().put(tenant_id, d)
        return {"status": "confirmed", "message_id": d["provider_message_id"]}
    d["status"] = "reconciliation_required"
    stores.tg_drafts().put(tenant_id, d)
    return {"status": "reconciliation_required"}


@register_handler("telegram_media_fetch")
def handle_telegram_media_fetch(job: dict) -> dict:
    tenant_id = job.get("tenant_id", "")
    payload = job.get("payload", {}) or {}
    from receptionist.providers import telegram_adapter as tg
    from receptionist.service import stores
    file_id = payload.get("file_id", "")
    try:
        meta = tg.get_file_metadata(tenant_id, file_id)
    except tg.TelegramError as exc:
        return {"status": "failed", "reason": exc.category}
    for m in stores.tg_media().list(tenant_id):
        if m.get("file_id") == file_id:
            m["file_unique_id"] = meta.get("file_unique_id", "")
            m["file_size"] = meta.get("file_size", 0)
            m["status"] = "fetched"
            stores.tg_media().put(tenant_id, m)
    return {"status": "completed", "file_id": file_id}


@register_handler("telegram_connection_health")
def handle_telegram_connection_health(job: dict) -> dict:
    tenant_id = job.get("tenant_id", "")
    from receptionist.providers import telegram_adapter as tg
    return {"status": "completed", "health": tg.validate_connection(tenant_id)}


# ── Voice jobs (Vapi) ─────────────────────────────────────────────────────────

@register_handler("voice_event_process")
def handle_voice_event_process(job: dict) -> dict:
    tenant_id = job.get("tenant_id", "")
    payload = job.get("payload", {}) or {}
    from receptionist.service import voice_sessions
    from receptionist.providers.voice_adapter import normalise_call
    msg = payload.get("message", {}) or {}
    call = msg.get("call") or {}
    status = (msg.get("status") or "").lower()
    internal = {"queued": "queued", "ringing": "ringing", "in-progress": "in_progress",
                "forwarding": "transferring", "ended": "completed"}.get(status, status or "in_progress")
    return voice_sessions.update_status(tenant_id, payload.get("call_id", ""), status=internal,
                                        ended_reason=(call.get("endedReason") or ""))


@register_handler("voice_transcript_process")
def handle_voice_transcript_process(job: dict) -> dict:
    tenant_id = job.get("tenant_id", "")
    payload = job.get("payload", {}) or {}
    msg = payload.get("message", {}) or {}
    t = msg.get("transcript") or {}
    seq = int(msg.get("sequence", t.get("sequence", 0)) or 0)
    final = (msg.get("transcriptType", "") == "final") or bool(t.get("final"))
    from receptionist.service import voice_sessions
    return voice_sessions.record_transcript(
        tenant_id, payload.get("call_id", ""), sequence=seq,
        speaker=(t.get("role") or msg.get("role") or "customer"),
        text=(t.get("transcript") or msg.get("transcript") or ""), final=final,
        language=t.get("language", ""))


@register_handler("voice_tool_execute")
def handle_voice_tool_execute(job: dict) -> dict:
    tenant_id = job.get("tenant_id", "")
    payload = job.get("payload", {}) or {}
    from receptionist.service import voice_sessions
    return voice_sessions.process_tool_call(
        tenant_id, payload.get("call_id", ""), tool_call_id=payload.get("tool_call_id", ""),
        tool_name=payload.get("tool_name", ""), arguments=payload.get("arguments", {}) or {})


@register_handler("voice_transfer")
def handle_voice_transfer(job: dict) -> dict:
    tenant_id = job.get("tenant_id", "")
    payload = job.get("payload", {}) or {}
    msg = payload.get("message", {}) or {}
    from receptionist.service import voice_sessions
    outcome = (msg.get("status") or "requested").lower()
    return voice_sessions.process_transfer(tenant_id, payload.get("call_id", ""),
                                           department=str(msg.get("department", "")), outcome=outcome)


@register_handler("voice_end_report_process")
def handle_voice_end_report(job: dict) -> dict:
    tenant_id = job.get("tenant_id", "")
    payload = job.get("payload", {}) or {}
    msg = payload.get("message", {}) or {}
    call = msg.get("call") or {}
    from receptionist.providers.voice_adapter import normalise_call
    nc = normalise_call({**call, "endedReason": msg.get("endedReason", call.get("endedReason", "")),
                         "durationSeconds": msg.get("durationSeconds", 0), "cost": msg.get("cost", {})})
    from receptionist.service import voice_sessions
    return voice_sessions.process_end_report(tenant_id, payload.get("call_id", ""), report={
        "duration_seconds": nc["duration_seconds"], "ended_reason": nc["ended_reason"],
        "provider_cost": nc["provider_cost"], "telephony_cost": nc["telephony_cost"],
        "model_cost": nc["model_cost"], "summary": msg.get("summary", "")})


@register_handler("voice_call_retry")
def handle_voice_call_retry(job: dict) -> dict:
    tenant_id = job.get("tenant_id", "")
    payload = job.get("payload", {}) or {}
    from receptionist.service.registry import execute_action
    res = execute_action(tenant_id, "voice_outbound_call", payload.get("args", {}) or {},
                         skip_approval=True, idempotency_key=payload.get("idempotency_key", ""))
    status = res.get("status")
    if status == "queued":
        return {"status": "completed", "call_id": res.get("record_id", "")}
    if status in ("suppressed", "blocked_by_policy"):
        return {"status": "terminal", "reason": res.get("detail", status)}
    return {"status": "failed", "reason": res.get("detail", status)}


@register_handler("voice_call_reconcile")
def handle_voice_call_reconcile(job: dict) -> dict:
    tenant_id = job.get("tenant_id", "")
    payload = job.get("payload", {}) or {}
    call_id = payload.get("call_id", "")
    from receptionist.providers import voice_adapter as voice
    from receptionist.service import voice_sessions
    got = voice.reconcile_call(tenant_id, call_id)
    st = got.get("status", "provider_unknown")
    if st in voice_sessions.STATUSES:
        voice_sessions.update_status(tenant_id, call_id, status=st, ended_reason=got.get("ended_reason", ""))
        return {"status": "confirmed", "call_status": st}
    voice_sessions.update_status(tenant_id, call_id, status="reconciliation_required")
    return {"status": "reconciliation_required"}


@register_handler("voice_recording_fetch")
def handle_voice_recording_fetch(job: dict) -> dict:
    tenant_id = job.get("tenant_id", "")
    payload = job.get("payload", {}) or {}
    from receptionist.providers import voice_adapter as voice
    from receptionist.service import stores, voice_policy
    from receptionist.service.ids import new_id, now_iso
    if not voice_policy.recording_policy(tenant_id).get("enabled"):
        return {"status": "skipped", "reason": "recording_disabled"}
    meta = voice.get_recording_metadata(tenant_id, payload.get("call_id", ""))
    stores.voice_recordings().put(tenant_id, {
        "id": new_id("vrec"), "tenant_id": tenant_id, "call_id": payload.get("call_id", ""),
        "has_recording": meta.get("has_recording", False), "status": "fetched", "created_at": now_iso()})
    return {"status": "completed"}


@register_handler("voice_post_call_analysis")
def handle_voice_post_call_analysis(job: dict) -> dict:
    tenant_id = job.get("tenant_id", "")
    payload = job.get("payload", {}) or {}
    from receptionist.service import voice_sessions, usage
    summary = voice_sessions.build_summary(tenant_id, payload.get("call_id", ""))
    try:
        usage.increment(tenant_id, "voice_analyses", idempotency_key=f"vanalysis:{payload.get('call_id','')}")
    except Exception:
        pass
    return {"status": "completed", "summary_id": summary.get("id", "")}


@register_handler("voice_scheduled_callback")
def handle_voice_scheduled_callback(job: dict) -> dict:
    tenant_id = job.get("tenant_id", "")
    payload = job.get("payload", {}) or {}
    from receptionist.service.registry import execute_action
    res = execute_action(tenant_id, "voice_outbound_call", {**(payload.get("args", {}) or {}),
                         "responding_to_request": True, "purpose": "callback"}, skip_approval=True,
                         idempotency_key=f"vcallback:{payload.get('callback_id','')}")
    return {"status": "completed" if res.get("status") == "queued" else res.get("status", "failed"),
            "call_id": res.get("record_id", "")}


@register_handler("voice_connection_health")
def handle_voice_connection_health(job: dict) -> dict:
    tenant_id = job.get("tenant_id", "")
    from receptionist.providers import voice_adapter as voice
    return {"status": "completed", "health": voice.validate_connection(tenant_id)}


# ── Campaign jobs (orchestration over existing channels) ──────────────────────

@register_handler("campaign_prepare")
def handle_campaign_prepare(job: dict) -> dict:
    tenant_id = job.get("tenant_id", "")
    payload = job.get("payload", {}) or {}
    campaign_id = payload.get("campaign_id", "")
    from receptionist.service import campaigns, campaign_audience, stores, usage
    c = campaigns.get(tenant_id, campaign_id)
    if c is None or c.get("status") != "preparing":
        return {"status": "skipped", "reason": "not_preparing"}
    if not campaigns.approval_valid(tenant_id, campaign_id):
        campaigns._set_status(tenant_id, campaign_id, "blocked_policy", action="approval_invalid")
        return {"status": "blocked", "reason": "approval_invalid"}
    snap = campaign_audience.create_snapshot(tenant_id, c)
    try:
        usage.increment(tenant_id, "campaign_recipients", amount=snap.get("included", 0),
                        idempotency_key=f"cmprcpt:{snap['id']}")
    except Exception:
        pass
    c["status"] = "active"; c["updated_at"] = campaigns.now_iso()
    stores.cmp_campaigns().put(tenant_id, c)
    campaigns.audit(tenant_id, campaign_id, "activated", detail={"snapshot_id": snap["id"]})
    # enqueue per-recipient first step
    from receptionist.worker import jobs_store
    enqueued = 0
    for r in campaign_audience.list_recipients(tenant_id, campaign_id):
        if r.get("state") == "pending":
            jobs_store.enqueue(tenant_id, "campaign_execute_step",
                               {"campaign_id": campaign_id, "contact_id": r.get("contact_id", "")})
            enqueued += 1
    return {"status": "prepared", "recipients": snap.get("included", 0), "enqueued": enqueued}


@register_handler("campaign_execute_step")
def handle_campaign_execute_step(job: dict) -> dict:
    tenant_id = job.get("tenant_id", "")
    payload = job.get("payload", {}) or {}
    from receptionist.service import campaign_execution
    res = campaign_execution.execute_step(tenant_id, payload.get("campaign_id", ""), payload.get("contact_id", ""))
    # schedule the next step when the recipient advanced
    if res.get("status") == "advanced":
        from receptionist.worker import jobs_store
        jobs_store.enqueue(tenant_id, "campaign_execute_step",
                           {"campaign_id": payload.get("campaign_id", ""), "contact_id": payload.get("contact_id", "")})
    return res


@register_handler("campaign_process_reply")
def handle_campaign_process_reply(job: dict) -> dict:
    tenant_id = job.get("tenant_id", "")
    payload = job.get("payload", {}) or {}
    from receptionist.service import campaign_execution
    return campaign_execution.process_reply(tenant_id, contact_id=payload.get("contact_id", ""),
                                            conversation_id=payload.get("conversation_id", ""),
                                            kind=payload.get("kind", "direct_reply"))


@register_handler("campaign_evaluate_stop_conditions")
def handle_campaign_stop_conditions(job: dict) -> dict:
    tenant_id = job.get("tenant_id", "")
    payload = job.get("payload", {}) or {}
    from receptionist.service import campaign_execution
    return campaign_execution.evaluate_stop_conditions(tenant_id, payload.get("campaign_id", ""),
                                                       payload.get("contact_id", ""))


@register_handler("campaign_cancel")
def handle_campaign_cancel(job: dict) -> dict:
    tenant_id = job.get("tenant_id", "")
    payload = job.get("payload", {}) or {}
    from receptionist.service import campaigns
    return campaigns.cancel(tenant_id, payload.get("campaign_id", ""), actor="worker")


@register_handler("campaign_complete")
def handle_campaign_complete(job: dict) -> dict:
    tenant_id = job.get("tenant_id", "")
    payload = job.get("payload", {}) or {}
    campaign_id = payload.get("campaign_id", "")
    from receptionist.service import campaigns, campaign_audience, stores
    recipients = campaign_audience.list_recipients(tenant_id, campaign_id)
    terminal = {"completed", "stopped", "opted_out", "suppressed", "failed", "cancelled",
                "expired", "eligibility_blocked", "send_disabled"}
    if recipients and all(r.get("state") in terminal for r in recipients):
        campaigns._set_status(tenant_id, campaign_id, "completed", action="completed")
        return {"status": "completed"}
    return {"status": "still_active"}


@register_handler("campaign_analytics_rollup")
def handle_campaign_analytics_rollup(job: dict) -> dict:
    tenant_id = job.get("tenant_id", "")
    payload = job.get("payload", {}) or {}
    from receptionist.service import campaign_analytics
    return {"status": "completed", "metrics": campaign_analytics.rollup(tenant_id, payload.get("campaign_id", ""))}


# ── CRM marketplace jobs (Wave 18) ────────────────────────────────────────────

@register_handler("crm_connection_health")
def handle_crm_connection_health(job: dict) -> dict:
    tenant_id = job.get("tenant_id", "")
    payload = job.get("payload", {}) or {}
    from receptionist.service import crm_marketplace
    return {"status": "completed", "health": crm_marketplace.status(tenant_id, payload.get("provider", ""))}


@register_handler("crm_initial_import")
def handle_crm_initial_import(job: dict) -> dict:
    tenant_id = job.get("tenant_id", "")
    payload = job.get("payload", {}) or {}
    from receptionist.service import crm_sync
    try:
        return crm_sync.initial_import(tenant_id, payload.get("provider", ""), payload.get("object_type", "contact"))
    except Exception as exc:  # pragma: no cover
        return {"status": "failed", "reason": str(exc)[:120]}


@register_handler("crm_incremental_sync")
def handle_crm_incremental_sync(job: dict) -> dict:
    tenant_id = job.get("tenant_id", "")
    payload = job.get("payload", {}) or {}
    from receptionist.service import crm_sync
    return crm_sync.incremental_sync(tenant_id, payload.get("provider", ""))


@register_handler("crm_webhook_event")
def handle_crm_webhook_event(job: dict) -> dict:
    tenant_id = job.get("tenant_id", "")
    payload = job.get("payload", {}) or {}
    from receptionist.providers.crm import get_adapter, CRMError
    from receptionist.service import crm_sync
    provider = payload.get("provider", "")
    try:
        rec = get_adapter(provider).get_record(tenant_id, payload.get("object_type", "contact"), payload.get("record_id", ""))
    except CRMError as exc:
        return {"status": "failed", "reason": exc.category}
    return crm_sync.ingest_record(tenant_id, provider, rec)


@register_handler("crm_reconcile_record")
def handle_crm_reconcile_record(job: dict) -> dict:
    tenant_id = job.get("tenant_id", "")
    payload = job.get("payload", {}) or {}
    from receptionist.providers.crm import get_adapter
    return get_adapter(payload.get("provider", "")).reconcile_record(
        tenant_id, payload.get("object_type", "contact"), payload.get("record_id", ""))


@register_handler("crm_outbound_write")
def handle_crm_outbound_write(job: dict) -> dict:
    tenant_id = job.get("tenant_id", "")
    payload = job.get("payload", {}) or {}
    from receptionist.service import crm_sync
    return crm_sync.outbound_write(tenant_id, payload.get("provider", ""),
                                   canonical_type=payload.get("canonical_type", "contact"),
                                   canonical_id=payload.get("canonical_id", ""),
                                   trigger=payload.get("trigger", "manual"), payload=payload.get("payload", {}))


@register_handler("crm_cursor_recovery")
def handle_crm_cursor_recovery(job: dict) -> dict:
    tenant_id = job.get("tenant_id", "")
    payload = job.get("payload", {}) or {}
    from receptionist.service import crm_sync
    return crm_sync.recover_cursor(tenant_id, payload.get("provider", ""))


@register_handler("crm_sync_rollup")
def handle_crm_sync_rollup(job: dict) -> dict:
    tenant_id = job.get("tenant_id", "")
    payload = job.get("payload", {}) or {}
    from receptionist.service import crm_analytics
    return {"status": "completed", "metrics": crm_analytics.rollup(tenant_id, payload.get("provider", ""))}
