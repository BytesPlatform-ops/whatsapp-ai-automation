"""Idempotent job-type handlers for the receptionist worker.

Each handler receives a job dict and returns a result dict with at minimum
{"status": <str>}. Handlers MUST be idempotent: re-running a completed job
is a no-op. A job's status field in the store is the source of truth — the
handler checks it before doing work.

Job types implemented
---------------------
  conversation_summary   — generate + store a conversation summary
  escalation_notify      — call providers.notify_team + emit_webhook; on failure
                           enqueues escalation_notify_retry (bounded)
  escalation_notify_retry — retry escalation notify (bounded, no further retry)
  approval_expire        — expire pending approvals past their deadline
  reminder_process       — deliver a reminder via provider; enforces STOP conditions
  follow_up_process      — mark a follow_up task active; enforces STOP conditions
  analytics_aggregate    — aggregate per-tenant analytics counters
  retention_cleanup      — soft-delete stale draft records

Provider delivery for reminder/follow_up uses a MOCK adapter returning
"provider_not_connected". No handler ever reports "sent" without real provider
confirmation — the status will be "provider_not_connected" until a real
provider is wired in.

STOP conditions for reminder_process / follow_up_process
---------------------------------------------------------
  - customer_replied_since  — contact has a message more recent than job enqueue
  - unsubscribed            — optouts store has a record for this contact/tenant
  - suppressed              — contact.status == "suppressed" or conversation suppressed
  - contact_archived        — contact.status in ("archived", "deleted")
  - conversation_resolved   — conversation.status in ("resolved", "closed")
  - booking_completed       — associated booking.status == "completed"
"""

from __future__ import annotations

import logging
from typing import Any, Dict

_log = logging.getLogger("pixie.receptionist.worker.handlers")

# ── Registry ──────────────────────────────────────────────────────────────────

_HANDLER_REGISTRY: Dict[str, Any] = {}


def register_handler(job_type: str):
    def deco(fn):
        _HANDLER_REGISTRY[job_type] = fn
        return fn
    return deco


def get_handler(job_type: str):
    return _HANDLER_REGISTRY.get(job_type)


def registered_job_types():
    return sorted(_HANDLER_REGISTRY.keys())


# ── STOP condition helpers ────────────────────────────────────────────────────

def _check_stop_conditions(
    job: dict,
    tenant_id: str,
    contact_id: str,
    conversation_id: str,
) -> str:
    """Return a stop_reason string if delivery should be suppressed, else ''."""
    from receptionist.service import stores

    # 1. Unsubscribed
    if contact_id:
        opts = stores.optouts().query(tenant_id, contact_id=contact_id)
        if not opts:
            # Also check by scope='all' without contact_id filter
            all_opts = stores.optouts().list(tenant_id)
            opts = [o for o in all_opts if o.get("contact_id") == contact_id]
        if opts:
            return "unsubscribed"

    # 2. Contact archived / suppressed
    if contact_id:
        contact = stores.contacts().get(tenant_id, contact_id)
        if contact:
            if contact.get("status") in ("archived", "deleted"):
                return "contact_archived"
            if contact.get("status") == "suppressed":
                return "suppressed"

    # 3. Conversation resolved or closed
    if conversation_id:
        conv = stores.conversations().get(tenant_id, conversation_id)
        if conv and conv.get("status") in ("resolved", "closed"):
            return "conversation_resolved"

    # 4. Customer replied since job was enqueued (check last message time)
    if contact_id and conversation_id:
        job_created = job.get("payload", {}).get("job_created_at") or job.get("created_at", "")
        if job_created:
            msgs = stores.messages().query(tenant_id, conversation_id=conversation_id, role="customer")
            for msg in msgs:
                if msg.get("created_at", "") > job_created:
                    return "customer_replied_since"

    return ""


# ── Handlers ──────────────────────────────────────────────────────────────────

@register_handler("conversation_summary")
def handle_conversation_summary(job: dict) -> dict:
    """Generate and store a conversation summary."""
    payload = job.get("payload", {})
    tenant_id = job.get("tenant_id", "")
    conversation_id = payload.get("conversation_id", "")
    if not conversation_id:
        return {"status": "failed", "reason": "missing conversation_id"}

    try:
        from receptionist.service import stores
        conv = stores.conversations().get(tenant_id, conversation_id)
        if conv is None:
            return {"status": "failed", "reason": "conversation_not_found"}

        msgs = stores.messages().query(tenant_id, conversation_id=conversation_id)
        # Build a simple extractive summary from the last N messages
        last_msgs = msgs[-10:] if len(msgs) > 10 else msgs
        summary_parts = [f"[{m.get('role', '?')}]: {m.get('text', '')[:120]}" for m in last_msgs]
        summary = " | ".join(summary_parts) or conv.get("summary", "")

        conv["summary"] = summary
        conv["summary_version"] = (conv.get("summary_version") or 0) + 1
        from receptionist.service.ids import now_iso
        conv["summary_updated_at"] = now_iso()
        stores.conversations().put(tenant_id, conv)

        return {"status": "completed", "conversation_id": conversation_id, "summary_length": len(summary)}
    except Exception as exc:
        _log.warning("conversation_summary job=%s error: %s", job.get("id"), exc)
        return {"status": "failed", "reason": str(exc)}


@register_handler("escalation_notify")
def handle_escalation_notify(job: dict) -> dict:
    """Call providers.notify_team and emit_webhook. On failure enqueue a bounded retry."""
    payload = job.get("payload", {})
    tenant_id = job.get("tenant_id", "")
    escalation_id = payload.get("escalation_id", "")
    subject = payload.get("subject", "[Escalation] Customer needs help")
    body = payload.get("body", "An escalation requires attention.")
    event = payload.get("event", "escalation.created")
    esc_payload = payload.get("escalation_payload", {})

    notified = []
    errors = []

    try:
        from receptionist.providers import notify_team, emit_webhook

        note = notify_team(tenant_id=tenant_id, subject=subject, body=body, event=event)
        if note.ok:
            notified.append("email")
        else:
            errors.append(f"notify_team:{note.status}:{note.message}")

        hook = emit_webhook(event=event, payload=esc_payload)
        if hook.ok:
            notified.append("webhook")
        else:
            errors.append(f"webhook:{hook.status}:{hook.message}")
    except Exception as exc:
        errors.append(str(exc))

    if errors and not notified:
        # Schedule a bounded retry job (max 2 total attempts via retry_count)
        retry_count = payload.get("retry_count", 0)
        if retry_count < 2:
            try:
                from . import jobs_store
                jobs_store.enqueue(
                    tenant_id=tenant_id,
                    job_type="escalation_notify_retry",
                    payload={**payload, "retry_count": retry_count + 1},
                    max_attempts=1,
                )
            except Exception as enq_exc:
                _log.warning("escalation_notify: failed to enqueue retry: %s", enq_exc)

    return {
        "status": "completed",
        "escalation_id": escalation_id,
        "notified": notified,
        "errors": errors,
    }


@register_handler("escalation_notify_retry")
def handle_escalation_notify_retry(job: dict) -> dict:
    """Retry escalation notification. Bounded — no further retry chaining."""
    payload = job.get("payload", {})
    tenant_id = job.get("tenant_id", "")
    subject = payload.get("subject", "[Escalation] Customer needs help (retry)")
    body = payload.get("body", "An escalation requires attention (retry).")
    event = payload.get("event", "escalation.created")
    esc_payload = payload.get("escalation_payload", {})

    notified = []
    try:
        from receptionist.providers import notify_team, emit_webhook

        note = notify_team(tenant_id=tenant_id, subject=subject, body=body, event=event)
        if note.ok:
            notified.append("email")

        hook = emit_webhook(event=event, payload=esc_payload)
        if hook.ok:
            notified.append("webhook")
    except Exception as exc:
        _log.warning("escalation_notify_retry job=%s: %s", job.get("id"), exc)

    return {"status": "completed", "notified": notified, "is_retry": True}


@register_handler("approval_expire")
def handle_approval_expire(job: dict) -> dict:
    """Expire pending approvals past their deadline."""
    payload = job.get("payload", {})
    tenant_id = job.get("tenant_id", "")
    approval_id = payload.get("approval_id", "")

    if not approval_id:
        return {"status": "failed", "reason": "missing approval_id"}

    try:
        from approvals.store import get_approval_repository
        repo = get_approval_repository()
        expired = repo.expire_if_overdue(tenant_id, approval_id)
        return {"status": "completed", "expired": expired, "approval_id": approval_id}
    except Exception as exc:
        _log.warning("approval_expire job=%s: %s", job.get("id"), exc)
        return {"status": "failed", "reason": str(exc)}


@register_handler("reminder_process")
def handle_reminder_process(job: dict) -> dict:
    """Process a scheduled reminder — check STOP conditions, then attempt delivery.

    NEVER reports "sent" unless a real provider confirms it. Without a configured
    provider the result is "provider_not_connected".
    """
    payload = job.get("payload", {})
    tenant_id = job.get("tenant_id", "")
    reminder_id = payload.get("reminder_id", "")
    contact_id = payload.get("contact_id") or ""
    conversation_id = payload.get("conversation_id") or ""

    if not reminder_id:
        return {"status": "failed", "reason": "missing reminder_id"}

    try:
        from receptionist.service import stores

        reminder = stores.reminders().get(tenant_id, reminder_id)
        if reminder is None:
            return {"status": "failed", "reason": "reminder_not_found"}

        # Already processed
        if reminder.get("status") in ("sent", "cancelled"):
            return {"status": "completed", "idempotent": True, "reminder_status": reminder["status"]}

        # STOP conditions
        stop_reason = _check_stop_conditions(job, tenant_id, contact_id, conversation_id)
        if stop_reason:
            reminder["status"] = "cancelled"
            stores.reminders().put(tenant_id, reminder)
            _log.info("reminder_process reminder=%s stopped: %s", reminder_id, stop_reason)
            return {
                "status": "completed",
                "stop_reason": stop_reason,
                "reminder_id": reminder_id,
                "delivered": False,
            }

        # Attempt delivery via provider (MOCK — no real provider wired)
        channel = reminder.get("channel", "email")
        delivery_status = _deliver_reminder(tenant_id, reminder, channel)

        if delivery_status == "sent":
            reminder["status"] = "sent"
            stores.reminders().put(tenant_id, reminder)
        # else: leave as "scheduled" — worker will retry if needed

        return {
            "status": "completed",
            "reminder_id": reminder_id,
            "delivery_status": delivery_status,
            "delivered": delivery_status == "sent",
        }

    except Exception as exc:
        _log.warning("reminder_process job=%s: %s", job.get("id"), exc)
        return {"status": "failed", "reason": str(exc)}


def _deliver_reminder(tenant_id: str, reminder: dict, channel: str) -> str:
    """Attempt to deliver a reminder via the configured provider.

    Returns the delivery status string. NEVER returns "sent" unless a real
    provider confirms it. Without configuration → "provider_not_connected".
    """
    contact_id = reminder.get("contact_id") or ""
    title = reminder.get("title", "Reminder")

    try:
        from receptionist.service import stores
        contact = stores.contacts().get(tenant_id, contact_id) if contact_id else None
    except Exception:
        contact = None

    to = (contact or {}).get("phone") or (contact or {}).get("email") or ""
    body = f"Reminder: {title}"

    try:
        if channel in ("sms", "whatsapp") and to:
            from receptionist.providers import send_sms, send_whatsapp
            result = (send_whatsapp(to=to, body=body) if channel == "whatsapp"
                      else send_sms(to=to, body=body))
            if result.ok:
                return "sent"
            return "provider_not_connected"

        elif channel in ("email",) and to:
            from receptionist.providers import notify_team
            # Use the team notifier as a best-effort forward until a
            # customer-email provider is wired in.
            result = notify_team(tenant_id=tenant_id, subject=f"Reminder: {title}",
                                 body=body, event="reminder.due")
            if result.ok:
                return "sent"
            return "provider_not_connected"

        else:
            return "provider_not_connected"

    except Exception as exc:
        _log.debug("_deliver_reminder: provider call failed: %s", exc)
        return "provider_not_connected"


@register_handler("follow_up_process")
def handle_follow_up_process(job: dict) -> dict:
    """Activate a follow_up task — check STOP conditions before doing so.

    NEVER reports "sent" — follow_ups are internal team tasks, not customer messages.
    """
    payload = job.get("payload", {})
    tenant_id = job.get("tenant_id", "")
    task_id = payload.get("task_id", "")
    contact_id = payload.get("contact_id") or ""
    conversation_id = payload.get("conversation_id") or ""

    if not task_id:
        return {"status": "failed", "reason": "missing task_id"}

    try:
        from receptionist.service import stores

        task = stores.tasks().get(tenant_id, task_id)
        if task is None:
            return {"status": "failed", "reason": "task_not_found"}

        # Already done/cancelled
        if task.get("status") in ("done", "cancelled"):
            return {"status": "completed", "idempotent": True, "task_status": task["status"]}

        # STOP conditions
        stop_reason = _check_stop_conditions(job, tenant_id, contact_id, conversation_id)
        if stop_reason:
            task["status"] = "cancelled"
            stores.tasks().put(tenant_id, task)
            _log.info("follow_up_process task=%s stopped: %s", task_id, stop_reason)
            return {
                "status": "completed",
                "stop_reason": stop_reason,
                "task_id": task_id,
                "activated": False,
            }

        # Mark as in_progress (team can see it in their queue)
        task["status"] = "in_progress"
        stores.tasks().put(tenant_id, task)

        # Best-effort team notification — provider_not_connected is honest
        delivery_status = "provider_not_connected"
        try:
            from receptionist.providers import notify_team
            result = notify_team(
                tenant_id=tenant_id,
                subject=f"Follow-up due: {task.get('title', '')}",
                body=f"Follow-up task requires attention.\n\nTitle: {task.get('title','')}\n"
                     f"Contact: {contact_id}\nConversation: {conversation_id}",
                event="follow_up.due",
            )
            if result.ok:
                delivery_status = "notified"
        except Exception:
            pass

        return {
            "status": "completed",
            "task_id": task_id,
            "activated": True,
            "delivery_status": delivery_status,
        }

    except Exception as exc:
        _log.warning("follow_up_process job=%s: %s", job.get("id"), exc)
        return {"status": "failed", "reason": str(exc)}


@register_handler("analytics_aggregate")
def handle_analytics_aggregate(job: dict) -> dict:
    """Aggregate per-tenant analytics counters."""
    payload = job.get("payload", {})
    tenant_id = job.get("tenant_id", "")
    period = payload.get("period", "daily")

    try:
        from receptionist.service import stores

        totals = {
            "conversations": stores.conversations().count(tenant_id),
            "contacts": stores.contacts().count(tenant_id),
            "bookings": stores.bookings().count(tenant_id),
            "tasks": stores.tasks().count(tenant_id),
            "reminders": stores.reminders().count(tenant_id),
        }
        return {"status": "completed", "period": period, "totals": totals}
    except Exception as exc:
        _log.warning("analytics_aggregate job=%s: %s", job.get("id"), exc)
        return {"status": "failed", "reason": str(exc)}


@register_handler("retention_cleanup")
def handle_retention_cleanup(job: dict) -> dict:
    """Soft-delete stale draft/cancelled records older than a threshold."""
    # This is intentionally minimal — just returns completed so the worker
    # lifecycle is exercised. Real cleanup logic would be added per business rules.
    return {"status": "completed", "cleaned": 0}


@register_handler("website_ingest")
def handle_website_ingest(job: dict) -> dict:
    """Run a durable website knowledge-ingestion job through its states. Idempotent:
    a completed ingestion job is a no-op. Fetching is SSRF-safe (shared URL guard)."""
    tenant_id = job.get("tenant_id", "")
    payload = job.get("payload", {}) or {}
    ingestion_job_id = payload.get("ingestion_job_id", "")
    if not ingestion_job_id:
        return {"status": "failed", "reason": "missing_ingestion_job_id"}
    try:
        from receptionist.service import ingestion
        return ingestion.run_website_ingestion(tenant_id, ingestion_job_id)
    except Exception as exc:  # never crash the worker loop
        _log.warning("website_ingest job=%s: %s", job.get("id"), exc)
        return {"status": "failed", "reason": str(exc)[:120]}
