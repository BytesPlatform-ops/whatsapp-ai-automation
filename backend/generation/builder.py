"""Builder — produces a NEW `Site` for a request.

Flow (identical for fake + real model): load the Pixie agent system prompt,
assemble a ModelRequest (LARGE tier, task='build', user message + RAG context),
call the model layer, then parse the agent's JSON response into a `Site`.

Default is ONE strong model call — we do NOT split the build into sub-agents.
A single call keeps one coherent brand across the whole site (palette, voice,
section rhythm); splitting tends to produce stitched-together, inconsistent
output. Revisit only if a single call provably underperforms.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

from models import ModelRequest, ModelResult, get_router
from schemas import ModelTier, Request, Site

_PROMPT_PATH = Path(__file__).resolve().parent.parent / "prompts" / "PIXIE_AGENT_system_prompt.md"


@lru_cache(maxsize=1)
def _system_prompt() -> str:
    try:
        return _PROMPT_PATH.read_text(encoding="utf-8")
    except FileNotFoundError:  # never hard-fail generation on a missing prompt file
        return "You are Pixie. Build a complete, bespoke website as JSON matching schemas.Site."


@dataclass
class BuildOutput:
    """What the Builder returns: the Site + the agent's reply/assumptions + the
    raw model usage (so the orchestrator can meter it)."""

    site: Site
    reply: str
    result: ModelResult
    assumptions: list[str] = field(default_factory=list)


async def build_site(request: Request, *, rag_context: dict | None = None, router=None) -> BuildOutput:
    """Build a full site from a plain-language request via ONE large-model call."""
    router = router or get_router()

    req = ModelRequest(
        tier=ModelTier.LARGE,
        task="build",
        system=_system_prompt(),  # variables ({{USER_MESSAGE}} etc.) filled by real provider later
        user=request.message,
        expects_json=True,
        context={"tenant_id": request.tenant_id, "rag": rag_context or {}},
    )
    result = await router.complete(req)

    payload = json.loads(result.text)  # agent OUTPUT FORMAT: {reply, site, assumptions, usage_note}
    site_data = dict(payload.get("site") or {})
    # Server owns tenancy + provenance — never trust the model for these.
    site_data["tenant_id"] = request.tenant_id
    site_data["source_request_id"] = request.id
    site = Site.model_validate(site_data)

    return BuildOutput(
        site=site,
        reply=str(payload.get("reply", "")),
        assumptions=list(payload.get("assumptions", []) or []),
        result=result,
    )
