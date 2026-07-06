"""Meta Marketing Agent — analyze performance, prepare content, file approvals.

Reuses the real OpenAI brain (models/), the approvals gate (agent-keyed executor),
the activity log, and the integrations router (connection-driven mock/real). No
public action happens without approval; nothing is published directly by the
agent — it prepares work and the executor runs it via a connector.
"""

from __future__ import annotations

import json

from activity.router import log_activity
from approvals.router import ApprovalItem, create_approval, register_executor_for
from content import get_asset
from integrations import execute_action, resolve_connector
from models import ModelRequest, get_router
from schemas import ModelTier

from . import insights
from .content_items import MetaContentItem, ToolExecution, get_content_store
from .marketing_prompt import CONTENT_PREP_PROMPT, MARKETING_AGENT_META_PROMPT
from .schemas import AnalyzeBody, PreparePostBody, PrepareReplyBody
from .store import get_meta_store

AGENT_SLUG = "marketing-agent"
SUPPORTED_CONTENT_TYPES = {"reel", "post", "photo", "video"}


def _provider_label(mode: str) -> str:
    return "openai" if mode == "openai" else "mock"


async def _llm_json(system: str, user: str, tenant_id: str) -> tuple[dict, str, str]:
    router = get_router()
    model_id = router.model_for(ModelTier.SMALL)
    result = await router.complete(ModelRequest(
        tier=ModelTier.SMALL, task="marketing", system=system, user=user,
        expects_json=True, context={"tenant_id": tenant_id, "agent": AGENT_SLUG},
    ))
    try:
        data = json.loads(result.text)
    except (ValueError, TypeError) as exc:
        raise ValueError(f"Marketing Agent model returned non-JSON output: {exc}") from exc
    return data, _provider_label(router.mode), result.model


async def analyze(body: AnalyzeBody) -> dict:
    """Pull analytics for the selected assets and produce AI insights + recommendations."""
    tenant = body.tenant_id
    if get_meta_store().mode(tenant) is None:
        return {"status": "not_connected",
                "message": "No Meta assets connected. Click Connect Meta (or Use demo data) first."}

    asset_id = body.asset_ids[0] if body.asset_ids else ""
    perf = insights.analytics_summary(tenant, asset_id, body.date_range)
    user_msg = (
        f"Business Meta performance ({body.date_range}). Analyze it and return the required JSON.\n\n"
        f"DATA:\n{json.dumps(perf.get('summary', perf), ensure_ascii=False)[:6000]}"
    )
    analysis, provider, model_id = await _llm_json(MARKETING_AGENT_META_PROMPT, user_msg, tenant)
    log_activity(tenant, "meta_analyzed", title="Pixie analyzed your Meta channels", agent=AGENT_SLUG,
                 created_at=body.now)
    return {
        "status": "analyzed",
        "data_source": perf.get("source"),
        "partial": perf.get("partial", False),
        "llm_provider": provider,
        "model": model_id,
        "analysis": analysis,
        "raw_summary": perf.get("summary"),
    }


def _publish_capability(content_type: str) -> str:
    return "meta_reel_publish" if content_type in ("reel", "video") else "meta_content_publish"


def _media_type(content_type: str) -> str:
    return {"reel": "REELS", "video": "VIDEO", "photo": "IMAGE", "post": "IMAGE"}.get(content_type, "IMAGE")


async def prepare_post(body: PreparePostBody) -> dict:
    """Validate, generate a Meta-ready post, and file an approval.

    Media comes from an uploaded ContentAsset (media_asset_id) so the publish has a
    real, Meta-fetchable URL. Impossible actions are refused up front — no approval
    is created for an unsupported type or a real publish with unreachable media.
    """
    tenant = body.tenant_id
    store = get_meta_store()
    if store.mode(tenant) is None:
        return {"status": "not_connected",
                "message": "No Meta assets connected. Connect Meta (or use demo data) first."}

    if body.content_type not in SUPPORTED_CONTENT_TYPES:
        return {"status": "unsupported_action",
                "message": f"'{body.content_type}' is not supported by the current Meta API/permissions."}

    defaults = store.defaults(tenant)
    asset_id = body.asset_id or (defaults.get("instagram_id") if body.platform == "instagram"
                                 else defaults.get("page_id")) or ""
    if not asset_id:
        return {"status": "missing_asset",
                "message": "Select a Facebook Page or Instagram account first."}

    capability = _publish_capability(body.content_type)
    # "Ready" = a real connection is present and will actually publish. When no
    # connection exists the publish blocks at execute anyway, so we don't pre-refuse
    # for media there — the approval is created and blocks honestly on approve.
    will_be_real = resolve_connector(tenant, capability).status == "ready"

    # Resolve media from an uploaded ContentAsset (preferred) or a raw URL.
    media_asset = get_asset(tenant, body.media_asset_id) if body.media_asset_id else None
    if body.media_asset_id and not media_asset:
        return {"status": "invalid_media", "message": f"Content asset {body.media_asset_id} not found."}
    media_url = media_asset.public_url if media_asset else body.media_url

    # Real publish must have media Meta can actually fetch.
    if will_be_real:
        if not media_asset and not media_url:
            return {"status": "invalid_media",
                    "message": "Upload media before publishing for real (media_asset_id required)."}
        if body.platform == "instagram" and media_asset and not media_asset.meta_reachable():
            return {"status": "invalid_media_url",
                    "message": "Media is not publicly reachable by Meta. Use Supabase storage "
                               "(PIXIE_STORAGE_PROVIDER=supabase), not local, for real publishing."}

    provider_label, model_id, content = "mock", "", {}
    if body.caption:
        content = {"caption": body.caption, "hook": "", "hashtags": [], "script": "", "cta": ""}
    else:
        user_msg = (f"Platform: {body.platform}\nContent type: {body.content_type}\n"
                    f"Idea/topic: {body.idea or 'a strong post for this small business'}\n"
                    "Write the post now.")
        content, provider_label, model_id = await _llm_json(CONTENT_PREP_PROMPT, user_msg, tenant)

    payload = {
        "platform": body.platform, "asset_id": asset_id, "caption": content.get("caption", ""),
        "media_asset_id": body.media_asset_id, "media_url": media_url,
        "media_type": _media_type(body.content_type), "content_type": body.content_type,
        "scheduled_time": body.scheduled_time,
    }
    tool = resolve_connector(tenant, capability).provider
    will_publish_to = asset_id
    for a in store.get_assets(tenant).get("instagram_accounts", []):
        if a["id"] == asset_id:
            will_publish_to = a.get("username", asset_id)

    prepared_output = {
        "platform": body.platform, "content_type": body.content_type,
        "caption": content.get("caption", ""), "hook": content.get("hook", ""),
        "hashtags": content.get("hashtags", []), "script": content.get("script", ""),
        "cta": content.get("cta", ""), "media_url": media_url, "media_asset_id": body.media_asset_id,
        "will_publish_to": will_publish_to,
        "media_reachable": bool(media_asset and media_asset.meta_reachable()),
        "execution_actions": [{"capability": capability, "payload": payload}],
    }
    approval = create_approval(
        tenant, AGENT_SLUG,
        title=f"Publish {body.content_type} to {body.platform}",
        action_type=capability, description=content.get("caption", "")[:140],
        created_at=body.now, risk_level="medium", capability=capability, tool=tool,
        prepared_output=prepared_output, preview=(content.get("caption") or body.idea)[:120],
    )
    return {
        "status": "approval_required", "agent_slug": AGENT_SLUG,
        "approval_id": approval.id, "llm_provider": provider_label, "model": model_id,
        "will_be_real": will_be_real,
        "preview": {
            "platform": body.platform, "content_type": body.content_type,
            "caption": content.get("caption", ""), "media_url": media_url,
            "will_publish_to": will_publish_to,
        },
        "prepared_output": prepared_output,
    }


async def prepare_comment_reply(body: PrepareReplyBody) -> dict:
    """Draft a reply to a comment and file an approval (public → always approved first)."""
    tenant = body.tenant_id
    system = ("You are Pixie Marketing Agent drafting a short, friendly public reply to a "
              "social comment. Return JSON only: {\"reply\": \"...\", \"sentiment\": "
              "\"positive|neutral|negative|question\"}.")
    data, provider, model_id = await _llm_json(system, f"Comment: {body.comment_text}", tenant)
    payload = {"target_id": body.target_id, "text": data.get("reply", "")}
    tool = resolve_connector(tenant, "meta_comment_reply").provider
    prepared_output = {
        "reply": data.get("reply", ""), "sentiment": data.get("sentiment", "neutral"),
        "in_reply_to": body.comment_text,
        "execution_actions": [{"capability": "meta_comment_reply", "payload": payload}],
    }
    approval = create_approval(
        tenant, AGENT_SLUG, title="Reply to a comment", action_type="meta_comment_reply",
        description=data.get("reply", "")[:140], created_at=body.now, risk_level="medium",
        capability="meta_comment_reply", tool=tool, prepared_output=prepared_output,
        preview=data.get("reply", "")[:120],
    )
    return {"status": "approval_required", "agent_slug": AGENT_SLUG, "approval_id": approval.id,
            "llm_provider": provider, "model": model_id, "prepared_output": prepared_output}


def _record_publish(item: ApprovalItem, action: dict, res: dict) -> None:
    """Persist a MetaContentItem + ToolExecution for a publish action."""
    if action.get("capability") not in ("meta_content_publish", "meta_reel_publish"):
        return
    payload = action.get("payload", {})
    ok = res.get("status") == "success"
    real = res.get("mode") == "real" and ok
    status = "published" if real else ("mock_published" if ok else "failed")
    get_content_store().record(
        MetaContentItem(
            tenant_id=item.tenant_id, asset_id=payload.get("asset_id", ""),
            platform=payload.get("platform", ""), content_type=payload.get("content_type", ""),
            media_asset_id=payload.get("media_asset_id", ""), caption=payload.get("caption", ""),
            meta_post_id=res.get("post_id") or res.get("mock_post_id") or "",
            meta_media_id=res.get("media_id", ""), status=status,
        ),
        ToolExecution(
            tenant_id=item.tenant_id, approval_id=item.id, capability=action.get("capability", ""),
            asset_id=payload.get("asset_id", ""), status=res.get("status", ""),
            error=res.get("error", ""), output_payload=res,
        ),
    )


def _execute_marketing(item: ApprovalItem) -> dict:
    """Approvals executor for marketing-agent items — resolve media, publish via a
    connector (mock unless Meta is really connected AND production+real), and record
    a MetaContentItem. Never reports 'published' unless the connector confirmed it."""
    actions = (item.prepared_output or {}).get("execution_actions", [])
    results = []
    any_real = False
    all_ok = True
    blocked_reason = ""
    for action in actions:
        payload = action.get("payload", {})
        # Resolve the media URL from the ContentAsset at execute time.
        if payload.get("media_asset_id") and not payload.get("media_url"):
            asset = get_asset(item.tenant_id, payload["media_asset_id"])
            if asset:
                payload["media_url"] = asset.public_url
        res = execute_action(item.tenant_id, action.get("capability", ""), payload)
        results.append(res)
        _record_publish(item, action, res)
        if res.get("status") in ("blocked", "error"):
            all_ok = False
            blocked_reason = res.get("error") or blocked_reason
        if res.get("mode") == "real" and res.get("status") == "success":
            any_real = True

    # If this approval came from the inbox, reflect the outcome on the inbox item.
    inbox_item_id = (item.prepared_output or {}).get("inbox_item_id")
    is_inbox = any(a.get("capability", "").startswith("meta_comment") or a.get("capability") == "meta_dm_reply"
                   for a in actions)
    if inbox_item_id and results:
        from . import inbox
        inbox.mark_reply_result(item.tenant_id, inbox_item_id, results[0])

    if is_inbox:
        if any_real:
            detail = "Reply posted to Meta."
        elif all_ok:
            detail = "Mock reply completed. Nothing went live on Meta."
        else:
            detail = f"Meta reply blocked. Reason: {blocked_reason or 'see result'}."
    elif any_real:
        detail = "Published to Meta successfully."
    elif all_ok:
        detail = "Mock publish completed. Nothing went live on Meta."
    else:
        detail = f"Meta publishing blocked. Reason: {blocked_reason or 'see result'}."
    return {"ok": all_ok, "mode": "real" if any_real else "mock", "executed": any_real,
            "blocked_reason": blocked_reason, "results": results, "detail": detail}


register_executor_for(AGENT_SLUG, _execute_marketing)
