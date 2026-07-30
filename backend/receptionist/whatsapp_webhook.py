"""WhatsApp Cloud API webhook for the AI Receptionist (Wave 12, Part 4).

Verification challenge (GET) + signed inbound (POST). Reuses the Meta
X-Hub-Signature-256 HMAC verification and the durable webhook-event dedup. Resolves
the workspace SERVER-SIDE from the verified phone_number_id (never from the body),
deduplicates by message/status id, and enqueues durable processing — it never
processes conversations inside the request.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os

from fastapi import APIRouter, Request, Response
from fastapi.responses import PlainTextResponse

log = logging.getLogger("pixie.receptionist.whatsapp_webhook")

whatsapp_webhook_router = APIRouter(prefix="/api/agents/ai-receptionist", tags=["ai-receptionist-whatsapp-webhook"])

_MAX_BODY_BYTES = 512_000
_PROVIDER = "whatsapp"


def _app_secret() -> str:
    return os.getenv("META_APP_SECRET", "") or os.getenv("AI_RECEPTIONIST_WHATSAPP_APP_SECRET", "")


def _verify_token() -> str:
    return os.getenv("META_WEBHOOK_VERIFY_TOKEN", "") or os.getenv("AI_RECEPTIONIST_WHATSAPP_VERIFY_TOKEN", "")


def _dev_skip_sig() -> bool:
    return not _app_secret() and os.getenv("META_WEBHOOK_DEV_SKIP_SIGNATURE", "").strip() == "1"


def _valid_signature(raw: bytes, header: str) -> bool:
    secret = _app_secret()
    if not secret:
        return False
    if not header or not header.startswith("sha256="):
        return False
    provided = header[len("sha256="):]
    expected = hmac.new(secret.encode("utf-8"), raw, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, provided)


@whatsapp_webhook_router.get("/whatsapp/webhook")
def whatsapp_verify(request: Request):
    """Meta verification challenge: echo hub.challenge when mode+token match."""
    p = request.query_params
    if p.get("hub.mode") == "subscribe" and _verify_token() and p.get("hub.verify_token") == _verify_token():
        return PlainTextResponse(p.get("hub.challenge", ""))
    return Response(status_code=403, content="forbidden")


@whatsapp_webhook_router.post("/whatsapp/webhook")
async def whatsapp_receive(request: Request) -> Response:
    raw = await request.body()
    if len(raw) > _MAX_BODY_BYTES:
        return Response(status_code=413, content='{"error":"payload_too_large"}', media_type="application/json")

    sig = request.headers.get("x-hub-signature-256", "")
    if not (_valid_signature(raw, sig) or _dev_skip_sig()):
        # fail closed in production (secret present but signature invalid/missing)
        return Response(status_code=403, content='{"error":"bad_signature"}', media_type="application/json")

    try:
        body = json.loads(raw or b"{}")
    except (ValueError, TypeError):
        return Response(status_code=400, content='{"error":"malformed"}', media_type="application/json")

    outcome = _dispatch(body)
    return Response(status_code=200, content=json.dumps(outcome), media_type="application/json")


def _dispatch(body: dict) -> dict:
    from integrations import connections, webhook_events
    enqueued, skipped = 0, 0
    for entry in (body.get("entry") or []):
        for change in (entry.get("changes") or []):
            value = change.get("value") or {}
            meta = value.get("metadata") or {}
            phone_number_id = str(meta.get("phone_number_id") or "")
            tenant_id = connections.find_tenant_by_wa_phone_number_id(phone_number_id)
            if tenant_id is None:
                skipped += 1
                continue  # unknown phone number → ignore
            conn = connections.find_active_connection(tenant_id, "whatsapp_read")
            if conn is None or conn.get("status") == "disconnected":
                skipped += 1
                continue

            # inbound customer messages
            for msg in (value.get("messages") or []):
                ev_id = msg.get("id", "")
                if ev_id and webhook_events.already_seen(_PROVIDER, ev_id):
                    continue
                try:
                    from receptionist.worker import jobs_store
                    jobs_store.enqueue(tenant_id, "whatsapp_inbound", {
                        "phone_number_id": phone_number_id, "message": msg,
                        "contacts": value.get("contacts") or []})
                    if ev_id:
                        webhook_events.mark_seen(_PROVIDER, ev_id)
                    enqueued += 1
                except Exception as exc:  # do not mark seen → ret/poll can recover
                    log.warning("whatsapp enqueue failed: %s", type(exc).__name__)

            # delivery/read/failed statuses — handled separately, cheap
            for status in (value.get("statuses") or []):
                sid = f"{status.get('id','')}:{status.get('status','')}"
                if sid and webhook_events.already_seen(_PROVIDER, sid):
                    continue
                try:
                    from receptionist.worker import jobs_store
                    jobs_store.enqueue(tenant_id, "whatsapp_status", {"status": status})
                    if sid:
                        webhook_events.mark_seen(_PROVIDER, sid)
                    enqueued += 1
                except Exception:
                    pass
    return {"enqueued": enqueued, "skipped": skipped}
