"""Optional LLM-based quality review — never raises, lazy + guarded model import.

The deterministic checks in :mod:`content_creator.quality.deterministic` cover the
cheap, objective invariants. This module adds the *optional* semantic layer: a
soft LLM judge that surfaces realism/identity flags (face_drift, lip_sync_issue,
robotic_voice, …) the deterministic pass can't see.

The real model layer (Wave 2) is imported lazily *inside* ``review`` and fully
guarded — any ImportError / runtime failure falls back to the deterministic
:func:`content_creator.agents.mock_ai.mock_quality_review`. Public methods never
raise and never require a network/key.
"""

from __future__ import annotations

from typing import Optional

from content_creator.agents.mock_ai import mock_quality_review


class LlmQualityReviewer:
    """Soft LLM quality judge with a deterministic mock fallback.

    ``mode="fallback"`` forces the mock path (used by tests and ``$0`` local
    runs). Any other mode attempts the model layer first, then falls back.
    """

    def __init__(self, mode: Optional[str] = None) -> None:
        self.mode = mode

    def review(self, video: dict) -> dict:
        """Return ``{"llm_flags": [...], "fallback": bool}``. Never raises."""
        video = video or {}

        if self.mode == "fallback":
            return self._fallback(video)

        try:
            flags = self._review_with_model(video)
            if flags is None:
                return self._fallback(video)
            return {"llm_flags": list(flags), "fallback": False}
        except Exception:
            return self._fallback(video)

    def _review_with_model(self, video: dict):
        """Attempt the real model layer. Return a flag list or ``None``.

        Imported lazily and guarded so the absence of the model layer (or any
        failure within it) degrades to the mock instead of raising.
        """
        try:
            import asyncio

            from models import ModelRequest, get_router  # type: ignore
            from schemas import ModelTier  # type: ignore
        except Exception:
            return None

        try:
            router = get_router()
            req = ModelRequest(
                tier=ModelTier.SMALL,
                task="content_creator:quality_review",
                system=(
                    "You are a short-form video QA reviewer. "
                    "Return only JSON: {\"llm_flags\": [<string>, ...]}."
                ),
                user=str(video),
                expects_json=True,
            )
            result = asyncio.run(router.complete(req))
        except Exception:
            return None

        data = getattr(result, "data", None)
        if not isinstance(data, dict):
            return None
        flags = data.get("llm_flags")
        if not isinstance(flags, list):
            return None
        return [str(f) for f in flags]

    @staticmethod
    def _fallback(video: dict) -> dict:
        try:
            out = mock_quality_review(video)
            flags = out.get("llm_flags", []) if isinstance(out, dict) else []
        except Exception:
            flags = []
        return {"llm_flags": list(flags), "fallback": True}
