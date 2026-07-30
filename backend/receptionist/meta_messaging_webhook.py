"""Shared Meta Messaging webhook for the AI Receptionist (Instagram + Messenger).

ONE signed webhook for both channels. Verification challenge (GET) + signed inbound
(POST), reusing the Meta X-Hub-Signature-256 HMAC verification and the durable
webhook-event dedup already used by the WhatsApp/Meta webhooks. Resolves the
workspace SERVER-SIDE from the verified asset id (Instagram account id / Page id) —
never from the body — deduplicates messages and statuses separately, and enqueues
durable processing; it never runs conversations inside the request.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os

from fastapi import APIRouter, Request, Response
from fastapi.responses import PlainTextResponse

log = logging.getLogger("pixie.receptionist.meta_messaging_webhook")

meta_messaging_webhook_router = APIRouter(prefix="/api/agents/ai-receptionist",
                                          tags=["ai-receptionist-meta-messaging-webhook"])

_MAX_BODY_BYTES = 1_000_000


def _app_secret() -> str:
    return os.getenv("META_APP_SECRET", "") or os.getenv("AI_RECEPTIONIST_META_APP_SECRET", "")


def _verify_token() -> str:
    return os.getenv("META_WEBHOOK_VERIFY_TOKEN", "") or os.getenv("AI_RECEPTIONIST_META_VERIFY_TOKEN", "")


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


@meta_messaging_webhook_router.get("/meta-messaging/webhook")
def meta_verify(request: Request):
    """Meta verification challenge: echo hub.challenge when mode+token match."""
    p = request.query_params
    if p.get("hub.mode") == "subscribe" and _verify_token() and p.get("hub.verify_token") == _verify_token():
        return PlainTextResponse(p.get("hub.challenge", ""))
    return Response(status_code=403, content="forbidden")


@meta_messaging_webhook_router.post("/meta-messaging/webhook")
async def meta_receive(request: Request) -> Response:
    raw = await request.body()
    if len(raw) > _MAX_BODY_BYTES:
        return Response(status_code=413, content='{"error":"payload_too_large"}', media_type="application/json")

    sig = request.headers.get("x-hub-signature-256", "")
    if not (_valid_signature(raw, sig) or _dev_skip_sig()):
        return Response(status_code=403, content='{"error":"bad_signature"}', media_type="application/json")

    try:
        body = json.loads(raw or b"{}")
    except (ValueError, TypeError):
        return Response(status_code=400, content='{"error":"malformed"}', media_type="application/json")

    outcome = _dispatch(body)
    return Response(status_code=200, content=json.dumps(outcome), media_type="application/json")


def _resolve(obj: str, asset_id: str):
    """(channel, tenant_id, read_cap) from the verified object + asset id."""
    from integrations import connections
    if obj == "instagram":
        return "instagram", connections.find_tenant_by_instagram_account_id(asset_id), "instagram_read"
    if obj == "page":
        return "messenger", connections.find_tenant_by_page_id(asset_id), "messenger_read"
    return "", None, ""


def _dispatch(body: dict) -> dict:
    from integrations import connections, webhook_events
    from receptionist.worker import jobs_store
    obj = body.get("object", "")
    enqueued, skipped = 0, 0
    for entry in (body.get("entry") or []):
        asset_id = str(entry.get("id") or "")
        channel, tenant_id, read_cap = _resolve(obj, asset_id)
        if not channel or tenant_id is None:
            skipped += 1
            continue  # unknown object/asset → ignore
        conn = connections.find_active_connection(tenant_id, read_cap)
        if conn is None or conn.get("status") == "disconnected":
            skipped += 1
            continue

        for ev in (entry.get("messaging") or []):
            # delivery / read statuses do not create customer messages
            if ev.get("delivery") or ev.get("read"):
                st = ev.get("delivery") or {}
                kind = "delivered"
                if ev.get("read"):
                    st = ev.get("read") or {}
                    kind = "read"
                sid = f"{channel}:{asset_id}:{kind}:{st.get('watermark') or ','.join(st.get('mids', []))}"
                if webhook_events.already_seen(f"meta:{channel}", sid):
                    continue
                try:
                    jobs_store.enqueue(tenant_id, f"{channel}_status",
                                       {"channel": channel, "status": {**st, "status": kind}})
                    webhook_events.mark_seen(f"meta:{channel}", sid)
                    enqueued += 1
                except Exception:
                    pass
                continue

            # inbound customer message / postback / quick reply
            mid = (ev.get("message") or {}).get("mid", "") or (ev.get("postback") or {}).get("mid", "")
            dedup = mid or f"{channel}:{asset_id}:{(ev.get('sender') or {}).get('id','')}:{ev.get('timestamp','')}"
            if webhook_events.already_seen(f"meta:{channel}", dedup):
                continue
            try:
                jobs_store.enqueue(tenant_id, f"{channel}_inbound",
                                   {"channel": channel, "asset_id": asset_id, "event": ev})
                webhook_events.mark_seen(f"meta:{channel}", dedup)
                enqueued += 1
            except Exception as exc:  # do not mark seen → retry/poll can recover
                log.warning("meta %s enqueue failed: %s", channel, type(exc).__name__)
    return {"enqueued": enqueued, "skipped": skipped}
