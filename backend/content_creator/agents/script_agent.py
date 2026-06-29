"""Script agent — turns one approved idea into a ~15s AIDA short-form script.

Model path renders ``script_v1`` (LARGE tier); fallback is the deterministic
``mock_script``. Returns ``{"hook","body","cta","word_count","approx_seconds":15}``.
Public function NEVER raises. PURE STDLIB at top level.
"""

from __future__ import annotations

from typing import Dict, Optional

from content_creator.agents.ai_client import CcAiClient, _load_prompt
from content_creator.agents.mock_ai import mock_script


def _as_text(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, (list, tuple)):
        return "\n".join(_as_text(v) for v in value if v is not None)
    if isinstance(value, dict):
        return "\n".join("{0}: {1}".format(k, v) for k, v in value.items())
    return str(value)


def _render_script_prompt(idea: dict, profile: dict) -> str:
    template = _load_prompt("script_v1")
    prof = profile if isinstance(profile, dict) else {}
    idea_d = idea if isinstance(idea, dict) else {}
    fields = {
        "business_name": _as_text(prof.get("business_name", "")),
        "niche": _as_text(prof.get("niche", "")),
        "brand_tone": _as_text(prof.get("brand_tone", "")),
        "target_audience": _as_text(prof.get("target_audience", "")),
        "language": _as_text(prof.get("language", "en")) or "en",
        "platform": _as_text(prof.get("platform", "")) or "reels",
        "compliance_notes": _as_text(prof.get("compliance_notes", "")),
        "idea_title": _as_text(idea_d.get("title", "")),
        "idea_angle": _as_text(idea_d.get("angle", "")),
        "idea_hook": _as_text(idea_d.get("hook", "")),
        "idea_rationale": _as_text(idea_d.get("rationale", "")),
        "history_last_30_days": _as_text(prof.get("history_last_30_days", "")),
    }
    rendered = template
    for key, val in fields.items():
        rendered = rendered.replace("{{" + key + "}}", val)
    return rendered


def _coerce_script(data: object) -> Optional[Dict]:
    if not isinstance(data, dict):
        return None
    hook = _as_text(data.get("hook", "")).strip()
    body = _as_text(data.get("body", "")).strip()
    cta = _as_text(data.get("cta", "")).strip()
    if not (hook or body or cta):
        return None
    text = " ".join(p for p in (hook, body, cta) if p)
    try:
        word_count = int(data.get("word_count"))
    except Exception:
        word_count = len(text.split())
    return {
        "hook": hook,
        "body": body,
        "cta": cta,
        "word_count": word_count,
        "approx_seconds": 15,
    }


def _fallback_script(idea: dict, profile: dict) -> Dict:
    prof = profile if isinstance(profile, dict) else {}
    idea_d = idea if isinstance(idea, dict) else {}
    tone = _as_text(prof.get("brand_tone", "")).strip() or "friendly"
    language = _as_text(prof.get("language", "")).strip() or "en"
    s = mock_script(idea_d, tone=tone, language=language)
    return {
        "hook": s.get("hook", ""),
        "body": s.get("body", ""),
        "cta": s.get("cta", ""),
        "word_count": int(s.get("word_count", 0) or 0),
        "approx_seconds": int(s.get("approx_seconds", 15) or 15),
    }


def generate_script(idea: dict, profile: dict, *, ai: Optional[CcAiClient] = None) -> dict:
    """Return ``{"hook","body","cta","word_count","approx_seconds":15}``.

    Tries the model layer (LARGE tier) then falls back to ``mock_script``.
    Never raises.
    """
    try:
        client = ai if ai is not None else CcAiClient()
        try:
            prompt = _render_script_prompt(idea, profile)
            result = client.complete_json("script", "large", prompt)
        except Exception:
            result = None
        if result is not None and result.data is not None:
            script = _coerce_script(result.data)
            if script is not None:
                return script
        return _fallback_script(idea, profile)
    except Exception:
        try:
            return _fallback_script(idea, profile)
        except Exception:
            return {
                "hook": "",
                "body": "",
                "cta": "",
                "word_count": 0,
                "approx_seconds": 15,
            }
