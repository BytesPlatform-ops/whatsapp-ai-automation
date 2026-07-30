"""SMS provider webhook for the AI Receptionist (Parts 4/16).

Inbound (POST /sms/webhook) + delivery status (POST /sms/status). Verifies the
provider signature (Twilio X-Twilio-Signature: base64 HMAC-SHA1 over the request
URL + sorted POST params, keyed by the workspace's auth token), resolves the
workspace SERVER-SIDE from the verified business number (never the body),
deduplicates by message id, and enqueues durable processing — it never runs
conversations inside the request.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import os
from urllib.parse import parse_qsl

from fastapi import APIRouter, Request, Response

log = logging.getLogger("pixie.receptionist.sms_webhook")

sms_webhook_router = APIRouter(prefix="/api/agents/ai-receptionist", tags=["ai-receptionist-sms-webhook"])

_MAX_BODY_BYTES = 512_000


def _dev_skip() -> bool:
    return os.getenv("SMS_WEBHOOK_DEV_SKIP_SIGNATURE", "").strip() == "1"


def _valid_twilio_signature(url: str, params: dict, auth_token: str, header: str) -> bool:
    if not auth_token or not header:
        return False
    data = url + "".join(f"{k}{params[k]}" for k in sorted(params.keys()))
    digest = hmac.new(auth_token.encode("utf-8"), data.encode("utf-8"), hashlib.sha1).digest()
    expected = base64.b64encode(digest).decode("utf-8")
    return hmac.compare_digest(expected, header)


def _parse_form(raw: bytes) -> dict:
    """Parse an application/x-www-form-urlencoded body without python-multipart."""
    try:
        return {k: v for k, v in parse_qsl(raw.decode("utf-8"), keep_blank_values=True)}
    except (ValueError, UnicodeDecodeError):
        return {}


def _auth_token_for(tenant_id: str) -> str:
    from integrations.connections import find_active_connection_unsealed
    conn = find_active_connection_unsealed(tenant_id, "sms_read") \
        or find_active_connection_unsealed(tenant_id, "sms_send")
    return (conn or {}).get("auth_token", "") if conn else ""


@sms_webhook_router.post("/sms/webhook")
async def sms_inbound(request: Request) -> Response:
    raw = await request.body()
    if len(raw) > _MAX_BODY_BYTES:
        return Response(status_code=413, content='{"error":"payload_too_large"}', media_type="application/json")
    params = _parse_form(raw)
    business_number = params.get("To", "")

    from integrations import connections, webhook_events
    tenant_id = connections.find_tenant_by_sms_number(business_number)
    if tenant_id is None:
        return Response(status_code=200, content='{"skipped":"unknown_number"}', media_type="application/json")
    conn = connections.find_active_connection(tenant_id, "sms_read")
    if conn is None or conn.get("status") == "disconnected":
        return Response(status_code=200, content='{"skipped":"disabled"}', media_type="application/json")

    sig = request.headers.get("x-twilio-signature", "")
    if not (_dev_skip() or _valid_twilio_signature(str(request.url), params, _auth_token_for(tenant_id), sig)):
        return Response(status_code=403, content='{"error":"bad_signature"}', media_type="application/json")

    mid = params.get("MessageSid", "") or params.get("SmsSid", "")
    if mid and webhook_events.already_seen("sms", mid):
        return Response(status_code=200, content='{"deduped":true}', media_type="application/json")
    try:
        from receptionist.worker import jobs_store
        jobs_store.enqueue(tenant_id, "sms_inbound", {"sender_number": business_number, "payload": params})
        if mid:
            webhook_events.mark_seen("sms", mid)
    except Exception as exc:  # do not mark seen → retry/poll can recover
        log.warning("sms enqueue failed: %s", type(exc).__name__)
        return Response(status_code=200, content='{"enqueue":"deferred"}', media_type="application/json")
    return Response(status_code=200, content='{"enqueued":true}', media_type="application/json")


@sms_webhook_router.post("/sms/status")
async def sms_status(request: Request) -> Response:
    raw = await request.body()
    if len(raw) > _MAX_BODY_BYTES:
        return Response(status_code=413, content='{"error":"payload_too_large"}', media_type="application/json")
    params = _parse_form(raw)
    # for outbound status callbacks the business number is `From`
    business_number = params.get("From", "") or params.get("To", "")

    from integrations import connections, webhook_events
    tenant_id = connections.find_tenant_by_sms_number(business_number)
    if tenant_id is None:
        return Response(status_code=200, content='{"skipped":"unknown_number"}', media_type="application/json")

    sig = request.headers.get("x-twilio-signature", "")
    if not (_dev_skip() or _valid_twilio_signature(str(request.url), params, _auth_token_for(tenant_id), sig)):
        return Response(status_code=403, content='{"error":"bad_signature"}', media_type="application/json")

    sid = f"{params.get('MessageSid','')}:{params.get('MessageStatus','')}"
    if sid.strip(":") and webhook_events.already_seen("sms", sid):
        return Response(status_code=200, content='{"deduped":true}', media_type="application/json")
    try:
        from receptionist.worker import jobs_store
        jobs_store.enqueue(tenant_id, "sms_status", {"status": params})
        if sid.strip(":"):
            webhook_events.mark_seen("sms", sid)
    except Exception:
        pass
    return Response(status_code=200, content='{"enqueued":true}', media_type="application/json")
