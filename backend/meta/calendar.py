"""Content Calendar — a 7-day or 30-day plan grounded in the Brand Brain.

Each item has: date, platform, content type, topic, hook, caption draft, visual
direction, and a status in the approval lifecycle (draft → review → approved →
scheduled → published; or rejected). Generation grounds the plan in the Brand
Brain; the backend owns the dates and the initial "draft" status so nothing is
scheduled or published implicitly.

Persisted per workspace in pixie_kv (no schema change). Generating REPLACES the
current calendar with a fresh plan; individual items are then editable in place.
"""

from __future__ import annotations

import json
import secrets
from datetime import date, datetime, timedelta, timezone

from activity.router import log_activity
from models import ModelRequest, get_router
from schemas import ModelTier

from . import brand_brain
from .kv_store import KVList
from .store import get_meta_store

AGENT_SLUG = "marketing-agent"
_CAL = KVList("meta_calendar")

VALID_STATUSES = {"draft", "review", "approved", "scheduled", "published", "rejected"}
_VALID_PLATFORMS = {"instagram", "facebook"}
_VALID_TYPES = {"reel", "carousel", "image", "story", "post"}
_EDITABLE = {"platform", "content_type", "topic", "hook", "caption", "visual_direction", "date", "status"}

CALENDAR_PROMPT = """
You are Pixie's content planner for a small business. Build a content calendar
grounded in the brand profile. Vary platforms and content types; balance the
brand's best topics, services, and audience pain points.

Return JSON only, no markdown:
{
  "items": [
    {
      "platform": "instagram|facebook",
      "content_type": "reel|carousel|image|story|post",
      "topic": "what it's about",
      "hook": "scroll-stopping first line",
      "caption": "ready-to-post caption draft",
      "visual_direction": "what it should look like"
    }
  ]
}
Return exactly the requested number of items.
""".strip()


def _new_id() -> str:
    return "cal_" + secrets.token_hex(6)


def _offsets(horizon: int) -> tuple[list[int], int]:
    horizon = 30 if int(horizon) >= 14 else 7
    if horizon == 7:
        return list(range(7)), 7
    count = 12
    offs = sorted({round(i * (horizon - 1) / (count - 1)) for i in range(count)})
    return offs, horizon


def _parse_date(s: str) -> date | None:
    try:
        return datetime.strptime((s or "").strip(), "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return None


def _brand_context(tenant_id: str) -> tuple[dict, bool]:
    b = brand_brain.get_brand_brain(tenant_id)
    if b.get("exists"):
        return b.get("analyzed", {}) or {}, True
    return {}, False


async def _llm(analyzed: dict, horizon: int, n: int, tenant_id: str) -> tuple[list[dict], str, str]:
    router = get_router()
    user_msg = ("BRAND PROFILE:\n" + json.dumps(analyzed, ensure_ascii=False)[:3000] +
                f"\n\nBuild a {horizon}-day calendar with exactly {n} posts. Return the JSON now.")
    result = await router.complete(ModelRequest(
        tier=ModelTier.SMALL, task="content_calendar", system=CALENDAR_PROMPT, user=user_msg,
        expects_json=True, context={"tenant_id": tenant_id, "agent": AGENT_SLUG}))
    try:
        data = json.loads(result.text) if result.text else {}
    except (ValueError, TypeError):
        data = {}
    items = data.get("items", []) if isinstance(data, dict) else []
    provider = "openai" if router.mode == "openai" else "mock"
    return (items if isinstance(items, list) else []), provider, result.model


def _fallback_items(analyzed: dict, n: int) -> list[dict]:
    topics = analyzed.get("best_topics") or analyzed.get("content_pillars") or ["your work", "your service"]
    pillars = analyzed.get("content_pillars") or topics
    cta = analyzed.get("cta_style") or "DM us to learn more."
    types = ["reel", "carousel", "image", "post", "reel", "story"]
    out = []
    for i in range(n):
        topic = topics[i % len(topics)]
        pillar = pillars[i % len(pillars)]
        ctype = types[i % len(types)]
        out.append({
            "platform": "instagram" if i % 3 else "facebook",
            "content_type": ctype,
            "topic": f"{pillar}: {topic}",
            "hook": f"{topic.capitalize()} — the part most people skip.",
            "caption": f"{topic.capitalize()} done right. {cta}",
            "visual_direction": "On-brand colors, real photos/clips, minimal text overlay.",
        })
    return out


async def generate_calendar(tenant_id: str, horizon: int = 7, start_date: str = "") -> dict:
    if get_meta_store().mode(tenant_id) is None:
        return {"status": "not_connected",
                "message": "No Meta account connected. Connect Meta (or use demo data) first."}

    offsets, horizon = _offsets(horizon)
    n = len(offsets)
    analyzed, brain_used = _brand_context(tenant_id)

    raw, provider, model_id = await _llm(analyzed, horizon, n, tenant_id)
    ai_generated = bool(raw)
    if not raw:
        raw = _fallback_items(analyzed, n)

    start = _parse_date(start_date) or date.today()
    now_iso = datetime.now(timezone.utc).isoformat()
    items = []
    for i, off in enumerate(offsets):
        r = raw[i % len(raw)] if raw else {}
        platform = r.get("platform") if r.get("platform") in _VALID_PLATFORMS else ("instagram" if i % 3 else "facebook")
        ctype = r.get("content_type") if r.get("content_type") in _VALID_TYPES else "post"
        items.append({
            "id": _new_id(),
            "date": (start + timedelta(days=off)).isoformat(),
            "platform": platform,
            "content_type": ctype,
            "topic": r.get("topic", ""),
            "hook": r.get("hook", ""),
            "caption": r.get("caption", ""),
            "visual_direction": r.get("visual_direction", ""),
            "status": "draft",
            "created_at": now_iso,
        })

    _CAL.replace(tenant_id, items)
    log_activity(tenant_id, "meta_calendar_generated",
                 title=f"Pixie built a {horizon}-day content calendar", agent=AGENT_SLUG)
    return {"status": "generated", "horizon": horizon, "items": items,
            "brand_brain_used": brain_used, "ai_generated": ai_generated,
            "llm_provider": provider, "model": model_id,
            "note": ("Grounded in your Brand Brain." if brain_used
                     else "No Brand Brain yet — build one for a sharper, on-brand plan.")}


def get_calendar(tenant_id: str) -> dict:
    return {"items": _CAL.list(tenant_id)}


def update_item(tenant_id: str, item_id: str, patch: dict) -> dict:
    clean = {k: v for k, v in (patch or {}).items() if k in _EDITABLE}
    if "status" in clean and clean["status"] not in VALID_STATUSES:
        return {"status": "error", "message": f"Invalid status '{clean['status']}'."}
    if "platform" in clean and clean["platform"] not in _VALID_PLATFORMS:
        clean.pop("platform")
    if "content_type" in clean and clean["content_type"] not in _VALID_TYPES:
        clean.pop("content_type")
    updated = _CAL.update(tenant_id, item_id, clean)
    if not updated:
        return {"status": "not_found", "id": item_id}
    return {"status": "ok", "item": updated}


def delete_item(tenant_id: str, item_id: str) -> dict:
    return {"status": "deleted" if _CAL.delete(tenant_id, item_id) else "not_found", "id": item_id}


# ── Approval-workflow actions (Part 5) ────────────────────────────────────────

_REGEN_PROMPT = """
You are Pixie rewriting ONE social post to be stronger and on-brand. Keep the same
topic and platform. Return JSON only:
{"topic":"...","hook":"...","caption":"...","visual_direction":"..."}
""".strip()

_MEDIA_TYPE = {"reel": "REELS", "video": "VIDEO", "story": "STORIES",
               "image": "IMAGE", "carousel": "CAROUSEL", "post": "IMAGE"}


async def regenerate_item(tenant_id: str, item_id: str) -> dict:
    """Rewrite a single calendar item's copy with the model (keeps date + status)."""
    item = _CAL.get(tenant_id, item_id)
    if not item:
        return {"status": "not_found", "id": item_id}
    analyzed, _ = _brand_context(tenant_id)
    router = get_router()
    user_msg = ("BRAND PROFILE:\n" + json.dumps(analyzed, ensure_ascii=False)[:2000] +
                "\n\nPOST TO IMPROVE:\n" + json.dumps(
                    {k: item.get(k) for k in ("platform", "content_type", "topic", "hook", "caption")},
                    ensure_ascii=False) + "\n\nRewrite it. Return the JSON now.")
    result = await router.complete(ModelRequest(
        tier=ModelTier.SMALL, task="content_calendar", system=_REGEN_PROMPT, user=user_msg,
        expects_json=True, context={"tenant_id": tenant_id, "agent": AGENT_SLUG}))
    try:
        data = json.loads(result.text) if result.text else {}
    except (ValueError, TypeError):
        data = {}
    if not isinstance(data, dict) or not data:
        # Deterministic nudge when no model output.
        data = {"hook": f"{(item.get('topic') or 'This').capitalize()} — here’s the part most people miss.",
                "caption": (item.get("caption") or "") + " (refined)"}
    patch = {k: data[k] for k in ("topic", "hook", "caption", "visual_direction") if data.get(k)}
    updated = _CAL.update(tenant_id, item_id, patch)
    return {"status": "ok", "item": updated,
            "ai_generated": "openai" if router.mode == "openai" else "mock"}


def save_item_to_library(tenant_id: str, item_id: str) -> dict:
    """Save a calendar item's content into the reusable idea library."""
    item = _CAL.get(tenant_id, item_id)
    if not item:
        return {"status": "not_found", "id": item_id}
    from . import idea_curator
    idea_type = item.get("content_type") if item.get("content_type") in {"carousel", "reel"} else "reel"
    res = idea_curator.save_idea(tenant_id, {
        "type": idea_type, "title": item.get("topic", ""), "hook": item.get("hook", ""),
        "slide_flow_or_script": "", "visual_direction": item.get("visual_direction", ""),
        "caption": item.get("caption", ""), "cta": "",
    })
    return {"status": "saved", "idea": res.get("idea")}


def request_publish(tenant_id: str, item_id: str, now: str = "") -> dict:
    """File an approval to publish this item via the existing gate. Nothing is
    published here — it enters the Approvals queue and (when approved) runs through
    the marketing-agent executor, which publishes for real only if Meta is really
    connected AND App-Review'd; otherwise it's a mock. Item → 'scheduled'."""
    item = _CAL.get(tenant_id, item_id)
    if not item:
        return {"status": "not_found", "id": item_id}

    from approvals.router import create_approval
    from integrations import resolve_connector

    store = get_meta_store()
    defaults = store.defaults(tenant_id)
    platform = item.get("platform", "instagram")
    ctype = item.get("content_type", "post")
    asset_id = (defaults.get("instagram_id") if platform == "instagram" else defaults.get("page_id")) or ""
    if not asset_id:
        return {"status": "missing_asset",
                "message": "Select a Facebook Page / Instagram account first."}

    capability = "meta_reel_publish" if ctype in ("reel", "video") else "meta_content_publish"
    caption = item.get("caption", "")
    payload = {"platform": platform, "asset_id": asset_id, "caption": caption, "media_asset_id": "",
               "media_url": "", "media_type": _MEDIA_TYPE.get(ctype, "IMAGE"),
               "content_type": ctype, "scheduled_time": item.get("date")}
    tool = resolve_connector(tenant_id, capability).provider
    prepared_output = {"platform": platform, "content_type": ctype, "caption": caption,
                       "calendar_item_id": item_id, "scheduled_date": item.get("date"),
                       "execution_actions": [{"capability": capability, "payload": payload}]}
    approval = create_approval(
        tenant_id, AGENT_SLUG, title=f"Publish {ctype} to {platform}", action_type=capability,
        description=caption[:140], created_at=now, risk_level="medium", capability=capability,
        tool=tool, prepared_output=prepared_output, preview=caption[:120])
    updated = _CAL.update(tenant_id, item_id, {"status": "scheduled", "approval_id": approval.id})
    return {"status": "approval_required", "approval_id": approval.id, "item": updated,
            "note": "Queued for publishing. Approve it in the Approvals tab. Real publishing "
                    "needs Meta App Review — until then it runs as a safe mock."}


def mark_publish_result(tenant_id: str, item_id: str, real: bool, ok: bool) -> None:
    """Reflect an executed publish approval back on the calendar item (honest):
    real publish → 'published'; mock success → stays 'scheduled'; failure →
    back to 'approved' so it can be retried."""
    status = "published" if real else ("scheduled" if ok else "approved")
    _CAL.update(tenant_id, item_id, {"status": status})
