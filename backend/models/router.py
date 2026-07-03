"""ModelRouter — picks a provider + concrete model by task difficulty, calls it,
computes cost, and logs `{model, tokens_in, tokens_out, latency_ms}` on EVERY call.

Mode is env-driven (`PIXIE_MODEL_MODE`, default 'fake'). Cheap-first routing:
firewall/classify → small, edits → small/mid, full generation → large. Adding
the real OpenAI provider is a one-line registration here; callers don't change.
"""

from __future__ import annotations

import logging
import os

from schemas import ModelTier

from .base import ModelRequest, ModelResult, Provider
from .fake import FakeProvider
from .pricing import cost_for

logger = logging.getLogger("pixie.models")

# Real OpenAI model id (used for every tier in openai mode — receptionist replies
# are short, so one cheap model is plenty; override with OPENAI_MODEL).
_DEFAULT_OPENAI_MODEL = "gpt-4o-mini"
_OPENAI_EMBED_MODEL = "text-embedding-3-small"


def _resolve_mode(raw: str | None) -> str:
    """Map the spec's PIXIE_LLM_PROVIDER vocabulary onto the internal modes.

    Precedence: explicit arg → PIXIE_LLM_PROVIDER → PIXIE_MODEL_MODE → 'fake'.
    'mock' is an alias for the built-in FakeProvider.
    """
    mode = (raw or os.getenv("PIXIE_LLM_PROVIDER") or os.getenv("PIXIE_MODEL_MODE") or "fake")
    mode = mode.strip().lower()
    return "fake" if mode == "mock" else mode

# Concrete model id per tier, per mode.
_MODEL_BY_TIER: dict[str, dict[ModelTier, str]] = {
    "fake": {
        ModelTier.SMALL: "fake-small",
        ModelTier.LARGE: "fake-large",
        ModelTier.EMBED: "fake-embed",
        ModelTier.NONE: "fake-small",
    },
    "openai": {
        ModelTier.SMALL: "gpt-5.4-nano",
        ModelTier.LARGE: "gpt-5.4",
        ModelTier.EMBED: "text-embedding-3-small",
        ModelTier.NONE: "gpt-5.4-nano",
    },
}


class ModelRouter:
    def __init__(self, mode: str | None = None) -> None:
        self.mode = _resolve_mode(mode)
        self._provider: Provider = self._make_provider(self.mode)

    def _make_provider(self, mode: str) -> Provider:
        if mode == "fake":
            return FakeProvider()
        if mode == "openai":
            from .openai import OpenAIProvider  # local import: no key needed for fake mode

            return OpenAIProvider()
        raise ValueError(f"Unknown LLM provider mode={mode!r} (have: fake, mock, openai)")

    def model_for(self, tier: ModelTier) -> str:
        if self.mode == "openai":
            if tier is ModelTier.EMBED:
                return os.getenv("OPENAI_EMBED_MODEL", _OPENAI_EMBED_MODEL)
            return os.getenv("OPENAI_MODEL", _DEFAULT_OPENAI_MODEL)
        table = _MODEL_BY_TIER.get(self.mode, _MODEL_BY_TIER["fake"])
        return table[tier]

    async def complete(self, req: ModelRequest) -> ModelResult:
        model = self.model_for(req.tier)
        result = await self._provider.complete(req, model=model)
        result.cost_usd = cost_for(result.model, result.tokens_in, result.tokens_out)
        logger.info(
            "model_call provider=%s model=%s tier=%s task=%s tok_in=%d tok_out=%d latency_ms=%d cost=$%.5f",
            self._provider.name, result.model, result.tier.value, req.task,
            result.tokens_in, result.tokens_out, result.latency_ms, result.cost_usd,
        )
        return result


_router: ModelRouter | None = None


def get_router() -> ModelRouter:
    """Process-wide router (provider is cheap/stateless; one instance is fine)."""
    global _router
    if _router is None:
        _router = ModelRouter()
    return _router
