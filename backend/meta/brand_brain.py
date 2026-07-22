"""Brand Brain — learn a business's voice from its own old Facebook/Instagram posts.

Pipeline:
  1. fetch_recent_content — pull recent IG media + FB Page posts (captions + the
     engagement metrics the granted scopes allow). Demo mode uses seeded posts.
  2. _compute_stats — deterministic engagement analysis (top/weak posts, post-type
     mix, averages). Always present, never faked.
  3. _llm — an LLM turns the captions + stats into a qualitative Brand Brain
     (tone, audience, services, best/weak topics & hooks, pillars, CTA style,
     posting suggestions). In fake mode it returns nothing, so demo mode falls back
     to a clearly-labelled canned brain; live mode uses the real model or stays
     honestly empty.

Persistence: one Brand Brain per tenant in the pixie_kv store (no schema change).
Tokens are read only through token_service and never returned to the UI.
"""

from __future__ import annotations

import json
from collections import Counter
from datetime import datetime, timezone

import httpx

import persistence
from activity.router import log_activity
from models import ModelRequest, get_router
from schemas import ModelTier

from . import oauth as m
from . import seed
from . import token_service as ts
from .store import get_meta_store

AGENT_SLUG = "marketing-agent"
_KV = "meta_brand_brain"

BRAND_BRAIN_PROMPT = """
You are Pixie's brand analyst. You are given a small business's recent social posts
(captions, post type, engagement) and computed stats. Infer the brand's identity so
future content can match its voice. Be specific and grounded in the posts — do not
invent facts. Return JSON only, no markdown, exactly:
{
  "brand_tone": "one or two sentences",
  "audience": "who they reach, specific",
  "services": ["main services/offers"],
  "best_topics": ["topics/themes that perform well"],
  "best_hooks": ["actual hook lines or hook patterns that worked"],
  "weak_topics": ["topics/patterns that underperform"],
  "content_pillars": ["3-6 repeatable content pillars"],
  "cta_style": "the call-to-action style that fits this brand",
  "posting_suggestions": ["concrete, actionable posting suggestions"]
}
""".strip()


# ── Persistence (pixie_kv) ────────────────────────────────────────────────────
# Mirror meta/store.py: an in-process snapshot cache backed by the KV store. In
# memory mode the KV is a hermetic no-op, so the cache is what carries data across
# requests within a process; in file/supabase mode the KV makes it durable.

_cache: dict | None = None


def _snapshot() -> dict:
    global _cache
    if _cache is None:
        _cache = persistence.load(_KV, {}) or {}
    return _cache


def _load(tenant_id: str) -> dict | None:
    return _snapshot().get(tenant_id)


def _store(tenant_id: str, brain: dict) -> None:
    snap = _snapshot()
    snap[tenant_id] = brain
    persistence.save(_KV, snap)


# ── Fetch ─────────────────────────────────────────────────────────────────────

def _norm_ig(md: dict) -> dict:
    likes = int(md.get("like_count") or 0)
    comments = int(md.get("comments_count") or 0)
    return {"platform": "instagram", "id": md.get("id"), "type": md.get("media_type") or "IMAGE",
            "caption": md.get("caption") or "", "likes": likes, "comments": comments,
            "shares": 0, "saves": 0, "engagement": likes + comments,
            "timestamp": md.get("timestamp") or "", "permalink": md.get("permalink") or ""}


def _norm_fb(pd: dict) -> dict:
    likes = int(((pd.get("likes") or {}).get("summary") or {}).get("total_count") or 0)
    comments = int(((pd.get("comments") or {}).get("summary") or {}).get("total_count") or 0)
    shares = int((pd.get("shares") or {}).get("count") or 0)
    return {"platform": "facebook", "id": pd.get("id"), "type": "STATUS",
            "caption": pd.get("message") or "", "likes": likes, "comments": comments,
            "shares": shares, "saves": 0, "engagement": likes + comments + shares,
            "timestamp": pd.get("created_time") or "", "permalink": pd.get("permalink_url") or ""}


def _fetch_live(tenant_id: str) -> tuple[list[dict], list[str]]:
    store = get_meta_store()
    assets = store.get_assets(tenant_id)
    posts: list[dict] = []
    errors: list[str] = []
    try:
        with httpx.Client(timeout=15) as http:
            for ig in assets.get("instagram_accounts", []):
                token = ts.get_token_for_server_call(tenant_id, ig["id"], by_instagram=True)
                if not token:
                    continue
                resp = http.get(f"{m.graph_base()}/{ig['id']}/media", params={
                    "fields": "id,caption,media_type,like_count,comments_count,timestamp,permalink",
                    "limit": 40, "access_token": token})
                if resp.status_code == 200:
                    posts.extend(_norm_ig(x) for x in resp.json().get("data", []))
                else:
                    errors.append(f"ig_media:{resp.status_code}")
            for page in assets.get("facebook_pages", []):
                token = ts.get_token_for_server_call(tenant_id, page["id"])
                if not token:
                    continue
                resp = http.get(f"{m.graph_base()}/{page['id']}/posts", params={
                    "fields": "id,message,created_time,permalink_url,shares,"
                              "likes.summary(true),comments.summary(true)",
                    "limit": 40, "access_token": token})
                if resp.status_code == 200:
                    posts.extend(_norm_fb(x) for x in resp.json().get("data", []))
                else:
                    errors.append(f"fb_posts:{resp.status_code}")
    except httpx.HTTPError as exc:
        errors.append(str(exc))
    return posts, errors


def fetch_recent_content(tenant_id: str) -> tuple[list[dict], str, bool, list[str]]:
    """(posts, source, partial, errors). Demo → seeded posts; live → real Graph."""
    if get_meta_store().mode(tenant_id) != "live":
        return seed.demo_posts(), "demo", False, []
    posts, errors = _fetch_live(tenant_id)
    return posts, "live", bool(errors), errors


# ── Stats (deterministic) ─────────────────────────────────────────────────────

def _trim(caption: str, n: int = 90) -> str:
    caption = (caption or "").strip().replace("\n", " ")
    return caption if len(caption) <= n else caption[: n - 1] + "…"


def _slim(p: dict) -> dict:
    return {"caption": _trim(p.get("caption", "")), "type": p.get("type"),
            "engagement": p.get("engagement", 0), "platform": p.get("platform"),
            "permalink": p.get("permalink", "")}


def _compute_stats(posts: list[dict]) -> dict:
    total = len(posts)
    if total == 0:
        return {"total_posts": 0, "avg_engagement": 0.0, "top_posts": [], "weak_posts": [],
                "post_types": {}}
    ranked = sorted(posts, key=lambda p: p.get("engagement", 0), reverse=True)
    avg = round(sum(p.get("engagement", 0) for p in posts) / total, 1)
    return {
        "total_posts": total,
        "avg_engagement": avg,
        "top_posts": [_slim(p) for p in ranked[:3]],
        "weak_posts": [_slim(p) for p in ranked[-3:][::-1]],
        "post_types": dict(Counter(p.get("type", "UNKNOWN") for p in posts)),
    }


# ── LLM ───────────────────────────────────────────────────────────────────────

def _has_content(analyzed: dict) -> bool:
    if not isinstance(analyzed, dict):
        return False
    return any(analyzed.get(k) for k in ("brand_tone", "services", "content_pillars", "best_topics"))


async def _llm(posts: list[dict], stats: dict, tenant_id: str) -> tuple[dict, str, str]:
    router = get_router()
    captions = [{"type": p.get("type"), "engagement": p.get("engagement", 0),
                 "caption": _trim(p.get("caption", ""), 160)} for p in posts[:30]]
    user_msg = ("POSTS:\n" + json.dumps(captions, ensure_ascii=False)[:5000] +
                "\n\nSTATS:\n" + json.dumps(stats, ensure_ascii=False)[:1500] +
                "\n\nBuild the Brand Brain JSON.")
    result = await router.complete(ModelRequest(
        tier=ModelTier.SMALL, task="brand_brain", system=BRAND_BRAIN_PROMPT,
        user=user_msg, expects_json=True,
        context={"tenant_id": tenant_id, "agent": AGENT_SLUG}))
    try:
        data = json.loads(result.text) if result.text else {}
    except (ValueError, TypeError):
        data = {}
    provider = "openai" if router.mode == "openai" else "mock"
    return (data if isinstance(data, dict) else {}), provider, result.model


# ── Public API ────────────────────────────────────────────────────────────────

async def generate_brand_brain(tenant_id: str) -> dict:
    """Fetch posts, analyze, persist, and return the Brand Brain."""
    if get_meta_store().mode(tenant_id) is None:
        return {"status": "not_connected",
                "message": "No Meta account connected. Connect Meta (or use demo data) first."}

    posts, source, partial, errors = fetch_recent_content(tenant_id)
    stats = _compute_stats(posts)
    analyzed, provider, model_id = await _llm(posts, stats, tenant_id)
    ai_generated = _has_content(analyzed)
    if not ai_generated and source == "demo":
        analyzed = seed.demo_brand_brain()  # labelled demo fallback

    brain = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": source,
        "partial": partial,
        "errors": errors,
        "post_count": len(posts),
        "ai_generated": ai_generated,
        "analyzed": analyzed,
        "stats": stats,
        "llm_provider": provider,
        "model": model_id,
    }
    _store(tenant_id, brain)
    log_activity(tenant_id, "meta_brand_brain_generated",
                 title="Pixie built your Brand Brain", agent=AGENT_SLUG)
    return {"status": "generated", "exists": True, **brain}


def get_brand_brain(tenant_id: str) -> dict:
    """Return the persisted Brand Brain, or {exists: False} if none yet."""
    brain = _load(tenant_id)
    if not brain:
        return {"status": "empty", "exists": False}
    return {"status": "ok", "exists": True, **brain}
