"""Meta Marketing Agent + analytics HTTP surface.

  POST /api/agents/marketing/meta/analyze                 analyze connected assets (AI)
  POST /api/agents/marketing/meta/prepare-post            draft a post/reel → approval
  POST /api/agents/marketing/meta/comments/prepare-reply  draft a comment reply → approval
  GET  /api/meta/analytics/summary                        organic + ads summary
  GET  /api/meta/ads/insights                             read-only ads summary
  GET  /api/meta/webhooks                                 webhook verification challenge
  POST /api/meta/webhooks                                 log inbound events (HMAC-verified)

Security posture for POST /api/meta/webhooks:
  - Raw bytes are read before any JSON parsing.
  - Payload is rejected with 413 when it exceeds MAX_PAYLOAD_BYTES (1 MiB).
  - X-Hub-Signature-256 MUST match SHA-256 HMAC(raw, META_APP_SECRET) via
    hmac.compare_digest (constant-time).  Missing or invalid → 403.
  - When META_APP_SECRET is unset the handler fails closed in production posture
    unless META_WEBHOOK_DEV_SKIP_SIGNATURE=1 is explicitly set.
  - Event ids (derived from entry[].id + entry[].time) are deduped via
    integrations.webhook_events.already_seen / mark_seen.
  - Tenant/workspace is resolved from the Facebook page/account id in the
    connections registry.  Unknown page/account → 404 (or silent ignore).
  - The request body tenant_id is NEVER trusted.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import os

from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse, PlainTextResponse

from activity.router import log_activity

from pydantic import BaseModel

from . import inbox as inbox_svc
from . import insights
from . import marketing_agent as agent
from .content_items import get_content_store
from .schemas import AnalyzeBody, PreparePostBody, PrepareReplyBody

_log = logging.getLogger("pixie.meta.webhook")

# 1 MiB — consistent with Meta's own documented payload upper bound.
MAX_PAYLOAD_BYTES = 1 * 1024 * 1024


def _meta_app_secret() -> str:
    return os.getenv("META_APP_SECRET", "").strip()


def _dev_skip_signature() -> bool:
    """Allow tests / local dev to bypass signature verification.

    Requires META_WEBHOOK_DEV_SKIP_SIGNATURE=1 AND META_APP_SECRET to be
    absent (if the secret is configured, skip is never permitted).
    """
    if _meta_app_secret():
        return False
    return os.getenv("META_WEBHOOK_DEV_SKIP_SIGNATURE", "").strip() == "1"


def _verify_hub_signature(raw: bytes, signature_header: str) -> bool:
    """Return True when the X-Hub-Signature-256 header is valid.

    Uses constant-time comparison (hmac.compare_digest).  Returns False (not
    raises) so the caller can log a sanitised message before returning 403.
    """
    secret = _meta_app_secret()
    if not secret:
        return False
    if not signature_header:
        return False
    # Meta format:  "sha256=<hex_digest>"
    if not signature_header.startswith("sha256="):
        return False
    provided = signature_header[len("sha256="):]
    if not provided:
        return False
    expected = hmac.new(secret.encode("utf-8"), raw, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, provided)


def _resolve_tenant_from_body(body: dict) -> str | None:
    """Best-effort: derive a workspace tenant from the page/account id in the
    event body using the connections registry.

    NEVER trusts a tenant_id field from the request body directly.  Returns
    None when the page/account is not found in the registry.
    """
    try:
        from integrations.connections import find_active_connection
        entries = body.get("entry", [])
        for entry in entries:
            page_id = str(entry.get("id", ""))
            if not page_id:
                continue
            # The Meta connector stores connections under the meta_asset_read cap.
            conn = find_active_connection(page_id, "meta_asset_read")
            if conn is not None:
                return page_id
    except Exception:
        pass
    return None

agent_router = APIRouter(prefix="/api/agents/marketing/meta", tags=["marketing-agent"])
meta_data_router = APIRouter(prefix="/api/meta", tags=["meta"])


@agent_router.post("/analyze")
async def analyze(body: AnalyzeBody) -> dict:
    return await agent.analyze(body)


@agent_router.post("/prepare-post")
async def prepare_post(body: PreparePostBody) -> dict:
    return await agent.prepare_post(body)


@agent_router.post("/comments/prepare-reply")
async def prepare_reply(body: PrepareReplyBody) -> dict:
    return await agent.prepare_comment_reply(body)


@meta_data_router.get("/analytics/summary")
def analytics_summary(tenant_id: str = Query(...), asset_id: str = Query(default=""),
                      range: str = Query(default="last_30_days")) -> dict:
    return insights.analytics_summary(tenant_id, asset_id, range)


class ItemBody(BaseModel):
    tenant_id: str = "demo_tenant"
    item_id: str
    reply: str = ""
    now: str = ""


@meta_data_router.get("/comments")
def list_comments(tenant_id: str = Query(...), asset_id: str = Query(default="")) -> dict:
    items = inbox_svc.list_inbox(tenant_id, "comment")
    if asset_id:
        items = [i for i in items if i.asset_id == asset_id]
    return {"comments": [i.model_dump() for i in items]}


@meta_data_router.get("/inbox")
def list_inbox(tenant_id: str = Query(...), type: str = Query(default="")) -> dict:
    return {"inbox": [i.model_dump() for i in inbox_svc.list_inbox(tenant_id, type)]}


@meta_data_router.get("/permissions")
def permissions(tenant_id: str = Query(...)) -> dict:
    return inbox_svc.permissions(tenant_id)


@agent_router.post("/comments/analyze")
async def analyze_comment(body: ItemBody) -> dict:
    return await inbox_svc.analyze(body.tenant_id, body.item_id)


@agent_router.post("/inbox/analyze")
async def analyze_inbox(body: ItemBody) -> dict:
    return await inbox_svc.analyze(body.tenant_id, body.item_id)


@agent_router.post("/inbox/prepare-reply")
def inbox_prepare_reply(body: ItemBody) -> dict:
    return inbox_svc.prepare_reply(body.tenant_id, body.item_id, body.reply, body.now)


@agent_router.post("/inbox/hide")
def inbox_hide(body: ItemBody) -> dict:
    return inbox_svc.prepare_hide(body.tenant_id, body.item_id, body.now)


@agent_router.post("/inbox/route")
def inbox_route(body: ItemBody) -> dict:
    return inbox_svc.route_to_receptionist(body.tenant_id, body.item_id, body.now)


@meta_data_router.get("/content")
def published_content(tenant_id: str = Query(...)) -> dict:
    """Published/prepared Meta content history (survives restart when persistence is on)."""
    store = get_content_store()
    return {
        "content": [i.model_dump() for i in store.list_content(tenant_id)],
        "executions": [e.model_dump() for e in store.list_execs(tenant_id)],
    }


@meta_data_router.get("/ads/insights")
def ads_insights(tenant_id: str = Query(...), ad_account_id: str = Query(default=""),
                 range: str = Query(default="last_30_days")) -> dict:
    return insights.ads_insights(tenant_id, ad_account_id, range)


@meta_data_router.get("/webhooks")
def webhook_verify(request: Request):
    """Meta webhook verification handshake.

    Returns hub.challenge only when hub.mode == 'subscribe' AND
    hub.verify_token matches META_WEBHOOK_VERIFY_TOKEN (which must be non-empty).
    """
    params = request.query_params
    verify_token = os.getenv("META_WEBHOOK_VERIFY_TOKEN", "").strip()
    if (
        params.get("hub.mode") == "subscribe"
        and verify_token
        and params.get("hub.verify_token") == verify_token
    ):
        return PlainTextResponse(params.get("hub.challenge", ""))
    return PlainTextResponse("verification failed", status_code=403)


@meta_data_router.post("/webhooks")
async def webhook_receive(request: Request):
    """Inbound Meta events — HMAC-verified, deduplicated, tenant-resolved.

    Steps:
      1. Read raw bytes; reject > 1 MiB with 413.
      2. Verify X-Hub-Signature-256 (HMAC-SHA256, constant-time); reject 403 on
         missing/invalid.  Fail closed when META_APP_SECRET is unset unless the
         explicit dev-bypass env is set.
      3. Parse JSON; derive event id per entry; drop replays (already_seen).
      4. Resolve workspace tenant from page/account id in connections registry.
      5. Log activity safely (no token/PII in log lines).
    """
    import json as _json
    from integrations import webhook_events

    # 1. Size limit — read raw body first
    raw = await request.body()
    if len(raw) > MAX_PAYLOAD_BYTES:
        _log.warning("meta.webhook: payload size %d exceeds limit — rejected", len(raw))
        return JSONResponse(
            {"error": "payload too large"},
            status_code=413,
        )

    # 2. Signature verification
    sig_header = request.headers.get("x-hub-signature-256", "")
    secret_configured = bool(_meta_app_secret())

    if not secret_configured and not _dev_skip_signature():
        # Production posture: fail closed when secret is not configured.
        _log.warning(
            "meta.webhook: META_APP_SECRET is not configured and dev bypass is not set "
            "— rejecting request"
        )
        return JSONResponse({"error": "webhook signature verification unavailable"}, status_code=403)

    if secret_configured and not _verify_hub_signature(raw, sig_header):
        _log.warning(
            "meta.webhook: signature verification failed "
            "(header present=%s, length=%d)",
            bool(sig_header),
            len(raw),
        )
        return JSONResponse({"error": "invalid signature"}, status_code=403)

    # 3. Parse body
    try:
        body = _json.loads(raw)
    except Exception:
        body = {}

    obj = body.get("object", "unknown")

    # Dedup + activity log per entry
    entries = body.get("entry", [])
    processed = 0
    skipped = 0
    for entry in entries:
        entry_id = str(entry.get("id", ""))
        entry_time = str(entry.get("time", ""))
        # Prefer a message-level id when present (Messenger / IGDMs)
        msg_id = ""
        for messaging in entry.get("messaging", []):
            msg_id = messaging.get("message", {}).get("mid", "")
            if msg_id:
                break
        if not msg_id:
            for change in entry.get("changes", []):
                msg_id = change.get("value", {}).get("message_id", "")
                if msg_id:
                    break

        # Compose a stable event id
        event_id = msg_id or f"{entry_id}:{entry_time}"

        if event_id and webhook_events.already_seen("meta", event_id):
            skipped += 1
            continue

        # Resolve tenant (never from body tenant_id)
        tenant = _resolve_tenant_from_body({"entry": [entry]}) or "system"

        # Log safely — no tokens, no PII values
        log_activity(
            tenant,
            "meta_webhook",
            title=f"Meta webhook: {obj} (entry {entry_id or 'unknown'})",
            agent="marketing-agent",
        )

        if event_id:
            webhook_events.mark_seen("meta", event_id)
        processed += 1

    if not entries:
        # Body with no entries (e.g. test ping from Meta's dashboard)
        log_activity("system", "meta_webhook", title=f"Meta webhook: {obj}", agent="marketing-agent")

    _log.debug(
        "meta.webhook: object=%s entries=%d processed=%d skipped=%d",
        obj,
        len(entries),
        processed,
        skipped,
    )
    return {"ok": True, "received": obj, "processed": processed, "skipped": skipped}
