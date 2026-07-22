"""Idea Curator — generate content ideas grounded in the Brand Brain.

Nine idea types (carousel, reel, caption hooks, ad angles, retargeting,
educational, pain-point, before/after, case study). Each idea has: title, hook,
slide flow or script, visual direction, caption, CTA.

Generation is stateless (returns fresh ideas). The user saves the ones they like
to a persisted idea library (pixie_kv, no schema change). In fake mode the model
returns nothing, so a deterministic template fallback builds ideas from the Brand
Brain — useful for any brand, honestly labelled ai_generated=false.
"""

from __future__ import annotations

import json
import secrets

from activity.router import log_activity
from models import ModelRequest, get_router
from schemas import ModelTier

from . import brand_brain
from .kv_store import KVList
from .store import get_meta_store

AGENT_SLUG = "marketing-agent"
_LIBRARY = KVList("meta_ideas")

# type key → human label. The 9 requested idea types.
IDEA_TYPES: list[dict] = [
    {"type": "carousel", "label": "Carousel"},
    {"type": "reel", "label": "Reel"},
    {"type": "caption_hook", "label": "Caption hooks"},
    {"type": "ad_angle", "label": "Ad angles"},
    {"type": "retargeting", "label": "Retargeting"},
    {"type": "educational", "label": "Educational"},
    {"type": "pain_point", "label": "Pain-point"},
    {"type": "before_after", "label": "Before / after"},
    {"type": "case_study", "label": "Case study"},
]
_VALID_TYPES = {t["type"] for t in IDEA_TYPES}
_TYPE_LABEL = {t["type"]: t["label"] for t in IDEA_TYPES}

IDEA_PROMPT = """
You are Pixie's content idea curator for a small business. Using the brand profile,
generate concrete, on-brand content ideas. For EACH idea return all fields.

Return JSON only, no markdown:
{
  "ideas": [
    {
      "type": "<one of the requested types>",
      "title": "short idea title",
      "hook": "scroll-stopping first line",
      "slide_flow_or_script": "slide-by-slide flow for carousels, or a shot script for reels, else key beats",
      "visual_direction": "what it should look like",
      "caption": "ready-to-post caption",
      "cta": "the call to action"
    }
  ]
}
Make ideas specific to the brand's tone, audience, services, and best topics.
""".strip()


def _new_id() -> str:
    return "idea_" + secrets.token_hex(6)


def _brand_context(tenant_id: str) -> tuple[dict, bool]:
    b = brand_brain.get_brand_brain(tenant_id)
    if b.get("exists"):
        return b.get("analyzed", {}) or {}, True
    return {}, False


async def _llm(analyzed: dict, types: list[str], per_type: int, tenant_id: str) -> tuple[list[dict], str, str]:
    router = get_router()
    want = ", ".join(f"{per_type}× {_TYPE_LABEL[t]} ({t})" for t in types)
    user_msg = (
        "BRAND PROFILE:\n" + json.dumps(analyzed, ensure_ascii=False)[:3000] +
        f"\n\nGenerate these idea types: {want}.\nReturn the JSON now."
    )
    result = await router.complete(ModelRequest(
        tier=ModelTier.SMALL, task="content_ideas", system=IDEA_PROMPT, user=user_msg,
        expects_json=True, context={"tenant_id": tenant_id, "agent": AGENT_SLUG}))
    try:
        data = json.loads(result.text) if result.text else {}
    except (ValueError, TypeError):
        data = {}
    ideas = data.get("ideas", []) if isinstance(data, dict) else []
    provider = "openai" if router.mode == "openai" else "mock"
    return (ideas if isinstance(ideas, list) else []), provider, result.model


def _fallback_ideas(analyzed: dict, types: list[str], per_type: int) -> list[dict]:
    """Deterministic, on-brand-ish ideas from the Brand Brain when no model runs."""
    topics = analyzed.get("best_topics") or analyzed.get("content_pillars") or ["your work"]
    services = analyzed.get("services") or ["your service"]
    cta = analyzed.get("cta_style") or "DM us to get started."
    out: list[dict] = []
    for t in types:
        for i in range(per_type):
            topic = topics[i % len(topics)]
            service = services[i % len(services)]
            label = _TYPE_LABEL[t]
            templates = {
                "carousel": (f"{topic}: a 5-slide breakdown",
                             "Slide 1 hook → 3 value slides → CTA slide"),
                "reel": (f"Quick {topic} in 15 seconds",
                         "Shot 1: hook on screen. Shot 2-4: the process. Shot 5: result + CTA"),
                "caption_hook": (f"Hook ideas about {topic}", "Three openers you can reuse"),
                "ad_angle": (f"Ad angle: the {service} outcome", "Lead with the result, not the feature"),
                "retargeting": (f"Retarget: still thinking about {service}?",
                                "Address the top objection, then a soft CTA"),
                "educational": (f"How {service} actually works", "Teach one thing well"),
                "pain_point": (f"The #1 frustration with {topic}", "Name the pain, then relieve it"),
                "before_after": (f"Before & after: {service}", "Split-screen or swipe reveal"),
                "case_study": (f"Client win with {service}", "Problem → what you did → result"),
            }
            title, flow = templates.get(t, (f"{label} idea about {topic}", "Hook → value → CTA"))
            out.append({
                "type": t, "title": title,
                "hook": f"{topic.capitalize()} — here’s what most people miss.",
                "slide_flow_or_script": flow,
                "visual_direction": "On-brand colors, real photos/clips, minimal text.",
                "caption": f"{title}. {cta}",
                "cta": cta if len(cta) < 40 else "Learn more",
            })
    return out


async def generate_ideas(tenant_id: str, types: list[str] | None = None, per_type: int = 2) -> dict:
    if get_meta_store().mode(tenant_id) is None:
        return {"status": "not_connected",
                "message": "No Meta account connected. Connect Meta (or use demo data) first."}

    types = [t for t in (types or []) if t in _VALID_TYPES] or [t["type"] for t in IDEA_TYPES]
    per_type = max(1, min(int(per_type or 2), 4))
    analyzed, brain_used = _brand_context(tenant_id)

    ideas, provider, model_id = await _llm(analyzed, types, per_type, tenant_id)
    ai_generated = bool(ideas)
    if not ideas:
        ideas = _fallback_ideas(analyzed, types, per_type)

    # Normalize + stamp ids (not persisted until saved).
    norm = []
    for it in ideas:
        itype = it.get("type") if it.get("type") in _VALID_TYPES else types[0]
        norm.append({
            "id": _new_id(), "type": itype, "type_label": _TYPE_LABEL[itype],
            "title": it.get("title", ""), "hook": it.get("hook", ""),
            "slide_flow_or_script": it.get("slide_flow_or_script", ""),
            "visual_direction": it.get("visual_direction", ""),
            "caption": it.get("caption", ""), "cta": it.get("cta", ""),
            "saved": False,
        })

    log_activity(tenant_id, "meta_ideas_generated", title="Pixie curated content ideas", agent=AGENT_SLUG)
    return {"status": "generated", "ideas": norm, "types": types,
            "brand_brain_used": brain_used, "ai_generated": ai_generated,
            "llm_provider": provider, "model": model_id,
            "note": ("Grounded in your Brand Brain." if brain_used
                     else "No Brand Brain yet — build one for sharper, on-brand ideas.")}


# ── Idea library (persisted) ──────────────────────────────────────────────────

def list_ideas(tenant_id: str) -> dict:
    return {"ideas": _LIBRARY.list(tenant_id)}


def save_idea(tenant_id: str, idea: dict) -> dict:
    itype = idea.get("type") if idea.get("type") in _VALID_TYPES else "reel"
    saved = {
        "id": idea.get("id") or _new_id(), "type": itype, "type_label": _TYPE_LABEL[itype],
        "title": idea.get("title", ""), "hook": idea.get("hook", ""),
        "slide_flow_or_script": idea.get("slide_flow_or_script", ""),
        "visual_direction": idea.get("visual_direction", ""),
        "caption": idea.get("caption", ""), "cta": idea.get("cta", ""), "saved": True,
    }
    # De-dupe by id: replace if already saved.
    if _LIBRARY.get(tenant_id, saved["id"]):
        _LIBRARY.update(tenant_id, saved["id"], saved)
    else:
        _LIBRARY.add(tenant_id, saved)
    return {"status": "saved", "idea": saved}


def delete_idea(tenant_id: str, idea_id: str) -> dict:
    return {"status": "deleted" if _LIBRARY.delete(tenant_id, idea_id) else "not_found", "id": idea_id}
