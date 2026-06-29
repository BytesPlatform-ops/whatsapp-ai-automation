"""CcAiClient — fallback-safe AI bridge for the Content Creator agents.

Mirrors ``backend/seo/ai/client.py``: the shared model layer is reached lazily
(inside the call) and wrapped in ``try/except Exception``. Importing ``models``
pulls in pydantic, which is absent in the local stdlib-only interpreter, so every
local call falls through to ``None`` and the caller uses a deterministic
heuristic. That is by design — a public method NEVER raises.

PURE STDLIB at module top level (Python 3.9.6). The model-layer import lives
inside :meth:`CcAiClient.complete_json` only.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from functools import lru_cache
from typing import Dict, Optional


# ----------------------------------------------------------------------
# Result envelope
# ----------------------------------------------------------------------
@dataclass
class AiResult:
    text: str = ""
    data: object = None
    provider: str = ""
    model: str = ""
    estimated_cost: float = 0.0
    latency_ms: int = 0
    fallback: bool = True

    def to_dict(self) -> Dict[str, object]:
        return {
            "text": self.text,
            "data": self.data,
            "provider": self.provider,
            "model": self.model,
            "estimated_cost": self.estimated_cost,
            "latency_ms": self.latency_ms,
            "fallback": self.fallback,
        }


# ----------------------------------------------------------------------
# Prompt loading (cached file reader)
# ----------------------------------------------------------------------
_PROMPTS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "prompts")


@lru_cache(maxsize=None)
def _load_prompt(name: str) -> str:
    """Read ``prompts/<name>.md``. Never raises — returns "" if missing."""
    try:
        path = os.path.join(_PROMPTS_DIR, "{0}.md".format(name))
        with open(path, "r", encoding="utf-8") as fh:
            return fh.read()
    except Exception:
        return ""


# ----------------------------------------------------------------------
# JSON tolerance helpers
# ----------------------------------------------------------------------
def _strip_code_fences(text: str) -> str:
    """Drop a leading/trailing ```json ... ``` fence if present."""
    s = (text or "").strip()
    if s.startswith("```"):
        # remove first fence line
        nl = s.find("\n")
        if nl != -1:
            s = s[nl + 1:]
        else:
            s = s[3:]
        if s.rstrip().endswith("```"):
            s = s.rstrip()[:-3]
    return s.strip()


def _parse_json(text: str) -> Optional[object]:
    """Tolerant JSON parse. Strips fences, then tries to isolate the first
    object/array. Returns parsed value or ``None`` (never raises)."""
    raw = _strip_code_fences(text)
    if not raw:
        return None
    try:
        return json.loads(raw)
    except Exception:
        pass
    # Best-effort: isolate the outermost {...} or [...] span.
    for opener, closer in (("{", "}"), ("[", "]")):
        start = raw.find(opener)
        end = raw.rfind(closer)
        if start != -1 and end != -1 and end > start:
            try:
                return json.loads(raw[start:end + 1])
            except Exception:
                continue
    return None


# Scoring is a constrained judgment task → SMALL; idea/script are generative → LARGE.
_SMALL_TASKS = frozenset({"scoring", "score"})


class CcAiClient:
    """Fallback-safe Content Creator AI helper.

    ``mode="fallback"`` forces deterministic heuristics (the model layer is never
    touched). ``mode=None`` (default) tries the model layer and falls back on any
    failure.
    """

    def __init__(self, mode: Optional[str] = None) -> None:
        self.mode = mode

    def complete_json(self, task: str, tier_hint: str, prompt: str) -> Optional[AiResult]:
        """Call the model layer and parse its completion as JSON.

        Returns an :class:`AiResult` (with ``data`` = parsed JSON, ``fallback=False``)
        on success, or ``None`` on ANY failure / invalid JSON. Never raises.
        """
        if self.mode == "fallback":
            return None
        try:
            import asyncio

            from models import ModelRequest, get_router  # type: ignore
            from schemas import ModelTier  # type: ignore

            use_small = (task in _SMALL_TASKS) or (str(tier_hint).lower() == "small")
            tier = ModelTier.SMALL if use_small else ModelTier.LARGE
            router = get_router()
            req = ModelRequest(
                tier=tier,
                task="content_creator:{0}".format(task),
                system="You are a content-creation assistant. Return only JSON.",
                user=prompt,
                expects_json=True,
            )
            result = asyncio.run(router.complete(req))
            text = (getattr(result, "text", "") or "").strip()
            data = _parse_json(text)
            if data is None:
                return None
            provider = getattr(getattr(router, "_provider", None), "name", "") or ""
            return AiResult(
                text=text,
                data=data,
                provider=provider,
                model=getattr(result, "model", "") or "",
                estimated_cost=float(getattr(result, "cost_usd", 0.0) or 0.0),
                latency_ms=int(getattr(result, "latency_ms", 0) or 0),
                fallback=False,
            )
        except Exception:
            return None
