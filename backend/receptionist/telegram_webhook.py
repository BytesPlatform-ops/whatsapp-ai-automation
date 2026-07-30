"""Telegram Bot API webhook for the AI Receptionist (Parts 4/5).

ONE secure endpoint for both standard-Bot and Telegram-Business updates. The opaque
``webhook_id`` path segment resolves the workspace SERVER-SIDE (never from the
payload); the ``X-Telegram-Bot-Api-Secret-Token`` header authenticates (constant-
time). Update-id and message-id are deduplicated separately; classified standard vs
business; enqueued to the durable worker. Full AI processing never runs in-request.
"""

from __future__ import annotations

import hmac
import json
import logging
import os

from fastapi import APIRouter, Request, Response

log = logging.getLogger("pixie.receptionist.telegram_webhook")

telegram_webhook_router = APIRouter(prefix="/api/agents/ai-receptionist", tags=["ai-receptionist-telegram-webhook"])

_MAX_BODY_BYTES = 1_000_000


def _dev_skip() -> bool:
    return os.getenv("TELEGRAM_WEBHOOK_DEV_SKIP_SECRET", "").strip() == "1"


def _secret_for(tenant_id: str) -> str:
    from integrations.connections import find_active_connection_unsealed
    conn = find_active_connection_unsealed(tenant_id, "telegram_read") \
        or find_active_connection_unsealed(tenant_id, "telegram_send")
    return (conn or {}).get("webhook_secret", "") if conn else ""


@telegram_webhook_router.post("/telegram/webhook/{webhook_id}")
async def telegram_receive(webhook_id: str, request: Request) -> Response:
    raw = await request.body()
    if len(raw) > _MAX_BODY_BYTES:
        return Response(status_code=413, content='{"error":"payload_too_large"}', media_type="application/json")

    from integrations import connections
    tenant_id = connections.find_tenant_by_telegram_webhook_id(webhook_id)
    if tenant_id is None:
        return Response(status_code=200, content='{"skipped":"unknown_bot"}', media_type="application/json")
    conn = connections.find_active_connection(tenant_id, "telegram_read")
    if conn is None or conn.get("status") == "disconnected":
        return Response(status_code=200, content='{"skipped":"disabled"}', media_type="application/json")

    provided = request.headers.get("x-telegram-bot-api-secret-token", "")
    expected = _secret_for(tenant_id)
    if not (_dev_skip() or (expected and hmac.compare_digest(expected, provided))):
        return Response(status_code=403, content='{"error":"bad_secret"}', media_type="application/json")

    try:
        update = json.loads(raw or b"{}")
    except (ValueError, TypeError):
        return Response(status_code=400, content='{"error":"malformed"}', media_type="application/json")

    outcome = _dispatch(tenant_id, update)
    return Response(status_code=200, content=json.dumps(outcome), media_type="application/json")


def _dispatch(tenant_id: str, update: dict) -> dict:
    from integrations import webhook_events
    from receptionist.worker import jobs_store

    update_id = str(update.get("update_id", ""))
    if update_id and webhook_events.already_seen("telegram", f"upd:{update_id}"):
        return {"deduped": True}

    def enqueue(job: str, payload: dict, dedup: str) -> dict:
        if dedup and webhook_events.already_seen("telegram", dedup):
            return {"deduped": True}
        try:
            jobs_store.enqueue(tenant_id, job, payload)
            if dedup:
                webhook_events.mark_seen("telegram", dedup)
            if update_id:
                webhook_events.mark_seen("telegram", f"upd:{update_id}")
            return {"enqueued": True, "job": job}
        except Exception as exc:  # do not mark seen → retry/poll can recover
            log.warning("telegram enqueue failed: %s", type(exc).__name__)
            return {"enqueue": "deferred"}

    # business connection lifecycle
    if update.get("business_connection"):
        return enqueue("telegram_business_connection",
                       {"business_connection": update["business_connection"]},
                       f"bc:{update['business_connection'].get('id','')}:{update_id}")
    if update.get("business_message"):
        m = update["business_message"]
        return enqueue("telegram_business_inbound", {"mode": "business", "message": m},
                       f"msg:business:{m.get('message_id','')}")
    if update.get("edited_business_message"):
        m = update["edited_business_message"]
        return enqueue("telegram_edited", {"mode": "business", "message": m},
                       f"edit:business:{m.get('message_id','')}:{update_id}")
    if update.get("deleted_business_messages"):
        d = update["deleted_business_messages"]
        return enqueue("telegram_deleted",
                       {"mode": "business", "chat_id": str((d.get("chat") or {}).get("id", "")),
                        "message_ids": d.get("message_ids", [])}, f"del:business:{update_id}")

    # standard updates
    if update.get("callback_query"):
        cq = update["callback_query"]
        return enqueue("telegram_callback", {"callback_query": cq}, f"cb:{cq.get('id','')}")
    if update.get("edited_message"):
        m = update["edited_message"]
        return enqueue("telegram_edited", {"mode": "bot", "message": m},
                       f"edit:bot:{m.get('message_id','')}:{update_id}")
    if update.get("message"):
        m = update["message"]
        return enqueue("telegram_inbound", {"mode": "bot", "message": m},
                       f"msg:bot:{m.get('message_id','')}")

    return {"ignored": "unsupported_update"}
