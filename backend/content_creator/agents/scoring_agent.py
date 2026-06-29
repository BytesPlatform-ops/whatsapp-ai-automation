"""Scoring agent — rates a single reel idea 0-100 with reasons.

Model path renders ``scoring_v1`` (SMALL tier); fallback is a deterministic
sha1-seeded score over the idea title with a canned reason. Public function
NEVER raises. PURE STDLIB at top level.
"""

from __future__ import annotations

import hashlib
from typing import Dict, List, Optional

from content_creator.agents.ai_client import CcAiClient, _load_prompt


def _as_text(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, (list, tuple)):
        return "\n".join(_as_text(v) for v in value if v is not None)
    if isinstance(value, dict):
        return "\n".join("{0}: {1}".format(k, v) for k, v in value.items())
    return str(value)


def _render_scoring_prompt(idea: dict, profile: dict) -> str:
    template = _load_prompt("scoring_v1")
    prof = profile if isinstance(profile, dict) else {}
    idea_d = idea if isinstance(idea, dict) else {}
    fields = {
        "business_name": _as_text(prof.get("business_name", "")),
        "niche": _as_text(prof.get("niche", "")),
        "brand_tone": _as_text(prof.get("brand_tone", "")),
        "target_audience": _as_text(prof.get("target_audience", "")),
        "language": _as_text(prof.get("language", "en")) or "en",
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


def _clamp_score(value: object) -> Optional[int]:
    try:
        score = int(round(float(value)))
    except Exception:
        return None
    return max(0, min(100, score))


def _coerce_score(data: object) -> Optional[Dict]:
    if not isinstance(data, dict):
        return None
    score = _clamp_score(data.get("score"))
    if score is None:
        return None
    reasons_raw = data.get("reasons")
    reasons: List[str] = []
    if isinstance(reasons_raw, list):
        reasons = [_as_text(r).strip() for r in reasons_raw if _as_text(r).strip()]
    elif _as_text(reasons_raw).strip():
        reasons = [_as_text(reasons_raw).strip()]
    if not reasons:
        reasons = ["scored by model"]
    return {"score": score, "reasons": reasons}


def _fallback_score(idea: dict) -> Dict:
    idea_d = idea if isinstance(idea, dict) else {}
    title = _as_text(idea_d.get("title", "")).strip()
    seed = int(hashlib.sha1(title.encode("utf-8")).hexdigest(), 16)
    score = seed % 101  # 0..100 deterministic
    return {
        "score": score,
        "reasons": [
            "deterministic heuristic score (model unavailable)",
        ],
    }


def score_idea(idea: dict, profile: dict, *, ai: Optional[CcAiClient] = None) -> dict:
    """Return ``{"score": int 0-100, "reasons": [str]}``.

    Tries the model layer (SMALL tier) then falls back to a deterministic
    sha1-seeded score. Never raises.
    """
    try:
        client = ai if ai is not None else CcAiClient()
        try:
            prompt = _render_scoring_prompt(idea, profile)
            result = client.complete_json("scoring", "small", prompt)
        except Exception:
            result = None
        if result is not None and result.data is not None:
            scored = _coerce_score(result.data)
            if scored is not None:
                return scored
        return _fallback_score(idea)
    except Exception:
        try:
            return _fallback_score(idea)
        except Exception:
            return {"score": 0, "reasons": ["scoring unavailable"]}
