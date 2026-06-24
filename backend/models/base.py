"""Model layer contracts — provider-agnostic request/result + the Provider protocol.

Everything above this layer (builder, editor, firewall) talks to `models/` only
through `ModelRequest` / `ModelResult`. Swapping OpenAI ↔ fake ↔ another provider
changes nothing upstream.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol, runtime_checkable

from schemas import ModelTier


@dataclass
class ModelRequest:
    """A single model call, independent of provider/model id.

    `task` lets a provider/router pick the right behaviour + tier:
    'build' | 'edit' | 'firewall' | 'classify'. `tier` is the desired size class
    (router maps it to a concrete model). `expects_json` asks for strict JSON.
    """

    tier: ModelTier
    task: str
    system: str = ""
    user: str = ""
    expects_json: bool = True
    context: dict = field(default_factory=dict)


@dataclass
class ModelResult:
    """The completion + the metering every call must produce."""

    text: str
    model: str
    tier: ModelTier
    tokens_in: int = 0
    tokens_out: int = 0
    latency_ms: int = 0
    cost_usd: float = 0.0


@runtime_checkable
class Provider(Protocol):
    """A model backend. Async because real providers are network-bound."""

    name: str

    async def complete(self, req: ModelRequest, *, model: str) -> ModelResult: ...


def estimate_tokens(text: str) -> int:
    """Rough token estimate (~4 chars/token). Real providers return exact counts;
    this keeps the fake provider's metering plausible."""
    return max(0, len(text) // 4)
