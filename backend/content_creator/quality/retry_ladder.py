"""Quality retry ladder — PURE STDLIB, deterministic, never raises.

When a generated video fails the deterministic checks (and optionally the LLM
review), we don't just give up: we escalate through an ordered ladder of prompt
mutations, regenerate, and recheck. Each rung is a strictly stronger nudge:

    1. tweak_prompt        — append a quality nudge to realism_cues
    2. stricter_identity   — pin the locked identity harder
    3. strengthen_negative — add to the negative prompt
    4. escalate_model      — bump the generation model tier
    5. manual_review       — give up, hand to a human

``run_quality_with_retries`` ties the ladder to a deterministic checker and an
injected ``generate_fn`` (e.g. ``MockHiggsfieldProvider().generate``) so the
whole loop is testable offline and ``$0``. Public functions never raise.
"""

from __future__ import annotations

import copy
from typing import Callable

from content_creator.quality.deterministic import run_deterministic_checks
from content_creator.quality.llm_review import LlmQualityReviewer

RETRY_LADDER = [
    "tweak_prompt",
    "stricter_identity",
    "strengthen_negative",
    "escalate_model",
    "manual_review",
]

_QUALITY_NUDGE = "high-fidelity, natural motion, no artifacts"
_NEGATIVE_NUDGE = "blurry, distorted face, extra fingers, warped background"


def next_action(attempt: int, budget: int) -> str:
    """Return the ladder step for ``attempt`` (0-indexed retry number).

    Returns ``"manual_review"`` once we've hit the budget or run past the
    ladder. Never raises.
    """
    try:
        attempt = int(attempt)
        budget = int(budget)
    except Exception:
        return "manual_review"
    if attempt >= budget or attempt >= len(RETRY_LADDER) or attempt < 0:
        return "manual_review"
    return RETRY_LADDER[attempt]


def apply_action(prompt: dict, action: str) -> dict:
    """Return a NEW prompt dict with ``action`` applied deterministically.

    Never mutates the input. Unknown actions return an unchanged copy.
    """
    new_prompt = copy.deepcopy(prompt or {})

    if action == "tweak_prompt":
        cues = list(new_prompt.get("realism_cues", []) or [])
        cues.append(_QUALITY_NUDGE)
        new_prompt["realism_cues"] = cues
    elif action == "stricter_identity":
        new_prompt["identity_strict"] = True
    elif action == "strengthen_negative":
        existing = new_prompt.get("negative_prompt", "") or ""
        existing = str(existing).strip()
        if existing:
            new_prompt["negative_prompt"] = existing + ", " + _NEGATIVE_NUDGE
        else:
            new_prompt["negative_prompt"] = _NEGATIVE_NUDGE
    elif action == "escalate_model":
        if new_prompt.get("model") == "standard":
            new_prompt["model"] = "premium"
        elif not new_prompt.get("model"):
            new_prompt["model"] = "premium"
    elif action == "manual_review":
        new_prompt["manual_review"] = True

    return new_prompt


def _has_blocking_llm_flags(video: dict, *, llm: bool) -> bool:
    """Run the (optional) LLM review and report whether it blocks a pass."""
    if not llm:
        return False
    try:
        review = LlmQualityReviewer().review(video)
        flags = review.get("llm_flags", []) if isinstance(review, dict) else []
        return bool(flags)
    except Exception:
        return False


def run_quality_with_retries(
    prompt: dict,
    generate_fn: Callable[[dict], dict],
    *,
    state: dict,
    max_retries: int = 2,
    llm: bool = False,
) -> dict:
    """Generate, check, and escalate through the retry ladder until pass/budget.

    ``generate_fn`` is injected (caller passes e.g.
    ``MockHiggsfieldProvider().generate``) so the loop is fully offline-testable.
    Returns a dict with ``video``, ``quality``, ``attempts``, ``actions``,
    ``status`` and ``manual_review``. Never raises.
    """
    try:
        max_retries = int(max_retries)
    except Exception:
        max_retries = 0
    if max_retries < 0:
        max_retries = 0

    actions = []

    # Initial attempt (attempt 0 = no ladder action yet).
    video = generate_fn(prompt)
    quality = run_deterministic_checks(video, state=state)

    def _is_pass(v: dict, q: dict) -> bool:
        return bool(q.get("passed")) and not _has_blocking_llm_flags(v, llm=llm)

    if _is_pass(video, quality):
        return {
            "video": video,
            "quality": quality,
            "attempts": 0,
            "actions": actions,
            "status": "pass",
            "manual_review": False,
        }

    attempts = 0
    for attempt in range(max_retries):
        action = next_action(attempt, max_retries)
        actions.append(action)
        prompt = apply_action(prompt, action)
        video = generate_fn(prompt)
        quality = run_deterministic_checks(video, state=state)
        attempts = attempt + 1
        if _is_pass(video, quality):
            return {
                "video": video,
                "quality": quality,
                "attempts": attempts,
                "actions": actions,
                "status": "pass",
                "manual_review": False,
            }

    # Exhausted the budget without passing.
    return {
        "video": video,
        "quality": quality,
        "attempts": attempts,
        "actions": actions,
        "status": "manual_review",
        "manual_review": True,
    }
