"""CRM provider webhook for the AI Receptionist marketplace (Part 17).

ONE signed endpoint for all five providers. The provider + opaque account ref in the
path resolve the workspace SERVER-SIDE (never the payload); the per-connection secret
authenticates (constant-time). Events are deduplicated and enqueue an object-specific
sync job — full synchronisation never runs in-request. Falls back to bounded polling
where a provider lacks webhook support.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging

from fastapi import APIRouter, Request, Response

log = logging.getLogger("pixie.receptionist.crm_webhook")

crm_webhook_router = APIRouter(prefix="/api/agents/ai-receptionist", tags=["ai-receptionist-crm-webhook"])

_MAX_BODY_BYTES = 512_000


def _connection_secret(tenant_id: str, provider: str) -> str:
    from integrations.connections import find_active_connection_unsealed
    from receptionist.providers.crm import cap_key
    conn = find_active_connection_unsealed(tenant_id, cap_key(provider))
    return (conn or {}).get("webhook_secret", "") if conn else ""


@crm_webhook_router.post("/crm/webhook/{provider}/{account_ref}")
async def crm_webhook(provider: str, account_ref: str, request: Request) -> Response:
    raw = await request.body()
    if len(raw) > _MAX_BODY_BYTES:
        return Response(status_code=413, content='{"error":"payload_too_large"}', media_type="application/json")

    from receptionist.providers.crm import PROVIDERS
    if provider not in PROVIDERS:
        return Response(status_code=200, content='{"skipped":"unknown_provider"}', media_type="application/json")

    from receptionist.service import crm_marketplace
    tenant_id = crm_marketplace.find_tenant_by_crm_account(provider, account_ref)
    if tenant_id is None:
        return Response(status_code=200, content='{"skipped":"unknown_connection"}', media_type="application/json")

    from integrations import connections
    from receptionist.providers.crm import cap_key
    conn = connections.find_active_connection(tenant_id, cap_key(provider))
    if conn is None or conn.get("status") == "disconnected":
        return Response(status_code=200, content='{"skipped":"disabled"}', media_type="application/json")

    secret = _connection_secret(tenant_id, provider)
    provided = request.headers.get("x-crm-signature", "")
    expected = hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest() if secret else ""
    if not (secret and hmac.compare_digest(expected, provided)):
        return Response(status_code=403, content='{"error":"bad_signature"}', media_type="application/json")

    try:
        body = json.loads(raw or b"{}")
    except (ValueError, TypeError):
        return Response(status_code=400, content='{"error":"malformed"}', media_type="application/json")

    event_id = str(body.get("event_id", "") or body.get("id", ""))
    object_type = body.get("object_type", "contact")
    from integrations import webhook_events
    from receptionist.worker import jobs_store
    dedup = f"{provider}:{account_ref}:{event_id}" if event_id else f"{provider}:{account_ref}:{object_type}:{body.get('record_id','')}"
    if webhook_events.already_seen("crm", dedup):
        return Response(status_code=200, content='{"deduped":true}', media_type="application/json")
    try:
        jobs_store.enqueue(tenant_id, "crm_webhook_event", {"provider": provider, "object_type": object_type,
                                                           "record_id": str(body.get("record_id", ""))})
        webhook_events.mark_seen("crm", dedup)
    except Exception as exc:
        log.warning("crm webhook enqueue failed: %s", type(exc).__name__)
        return Response(status_code=200, content='{"enqueue":"deferred"}', media_type="application/json")
    return Response(status_code=200, content='{"enqueued":true}', media_type="application/json")
