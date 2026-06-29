"""Idea agent — generates ranked short-form reel ideas.

Model path renders ``curator_idea_v1`` and asks the LARGE tier for JSON; on any
failure / unavailability it falls through to the deterministic ``mock_ideas``.
Public function NEVER raises. PURE STDLIB at top level.
"""

from __future__ import annotations

from typing import Dict, List, Optional

from content_creator.agents.ai_client import CcAiClient, _load_prompt
from content_creator.agents.mock_ai import mock_ideas


def _as_text(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, (list, tuple)):
        return "\n".join(_as_text(v) for v in value if v is not None)
    if isinstance(value, dict):
        return "\n".join("{0}: {1}".format(k, v) for k, v in value.items())
    return str(value)


def _render_idea_prompt(profile: dict, trends: list, history: list, n: int) -> str:
    template = _load_prompt("curator_idea_v1")
    prof = profile if isinstance(profile, dict) else {}
    fields = {
        "idea_count": str(max(1, int(n))),
        "business_name": _as_text(prof.get("business_name", "")),
        "niche": _as_text(prof.get("niche", "")),
        "brand_tone": _as_text(prof.get("brand_tone", "")),
        "target_audience": _as_text(prof.get("target_audience", "")),
        "language": _as_text(prof.get("language", "en")) or "en",
        "key_offers": _as_text(prof.get("key_offers", "")),
        "compliance_notes": _as_text(prof.get("compliance_notes", "")),
        "trend_snippets": _as_text(trends or []),
        "history_last_30_days": _as_text(history or []),
    }
    rendered = template
    for key, val in fields.items():
        rendered = rendered.replace("{{" + key + "}}", val)
    return rendered


def _topic_from_profile(profile: dict) -> str:
    prof = profile if isinstance(profile, dict) else {}
    for key in ("niche", "business_name", "target_audience"):
        val = _as_text(prof.get(key, "")).strip()
        if val:
            return val
    return ""


def _coerce_ideas(data: object, n: int) -> Optional[List[Dict]]:
    """Pull a clean idea list out of the model's parsed JSON. Returns None if it
    can't be coerced into at least one well-formed idea."""
    if isinstance(data, dict):
        items = data.get("ideas")
    elif isinstance(data, list):
        items = data
    else:
        items = None
    if not isinstance(items, list) or not items:
        return None
    out: List[Dict] = []
    for it in items:
        if not isinstance(it, dict):
            continue
        title = _as_text(it.get("title", "")).strip()
        angle = _as_text(it.get("angle", "")).strip()
        hook = _as_text(it.get("hook", "")).strip()
        if not (title or angle or hook):
            continue
        idea: Dict[str, object] = {"title": title, "angle": angle, "hook": hook}
        if "score" in it:
            try:
                idea["score"] = int(it.get("score"))
            except Exception:
                pass
        out.append(idea)
    if not out:
        return None
    return out[: max(1, int(n))]


def generate_ideas(
    profile: dict,
    trends: list = None,
    history: list = None,
    *,
    ai: Optional[CcAiClient] = None,
    n: int = 5,
) -> list:
    """Return a list of ``{title, angle, hook, score?}`` ideas, ranked best-first.

    Tries the model layer (LARGE tier) then falls back to ``mock_ideas``.
    Never raises.
    """
    try:
        client = ai if ai is not None else CcAiClient()
        n = max(1, int(n) if n else 5)
        try:
            prompt = _render_idea_prompt(profile, trends, history, n)
            result = client.complete_json("idea", "large", prompt)
        except Exception:
            result = None
        if result is not None and result.data is not None:
            ideas = _coerce_ideas(result.data, n)
            if ideas:
                return ideas
        # Fallback — deterministic.
        prof = profile if isinstance(profile, dict) else {}
        topic = _topic_from_profile(prof)
        brand = _as_text(prof.get("business_name", ""))
        return mock_ideas(topic, brand, n)
    except Exception:
        # Absolute last-resort guard.
        try:
            return mock_ideas("", "", max(1, int(n) if n else 5))
        except Exception:
            return [{"title": "", "angle": "", "hook": "", "score": 0}]
