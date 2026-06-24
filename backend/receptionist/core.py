"""Receptionist engine — build the system message, call the model, parse the
reply + [ACTION].

Loads PART 1 (the runtime prompt) untouched, injects the tenant's BUSINESS INFO
+ {{CHANNEL}} + {{HISTORY}} + {{USER_MESSAGE}}, calls the model layer (small/mid
tier by default — replies are short), and returns a `ReceptionReply`. Channel
adapters and action handlers wrap this; the engine never knows the channel
except via the {{CHANNEL}} variable.
"""

from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path

from models import ModelRequest, ModelResult, get_router
from schemas import ModelTier  # top-level website schemas package (ModelTier lives there)

from .action_parser import parse_reply
from .schemas import ReceptionReply, ReceptionRequest
from .tenant import load_tenant

_PROMPT_PATH = Path(__file__).resolve().parent / "prompts" / "RECEPTIONIST_RUNTIME_PROMPT.md"
_VAR_RE = re.compile(r"\{\{(\w+)\}\}")


@lru_cache(maxsize=1)
def _template() -> str:
    return _PROMPT_PATH.read_text(encoding="utf-8")


def _format_history(history) -> str:
    if not history:
        return "(no prior messages)"
    lines = []
    for turn in history:
        who = "Customer" if turn.role == "customer" else "Receptionist"
        lines.append(f"{who}: {turn.content}")
    return "\n".join(lines)


def build_system_message(request: ReceptionRequest, tenant: dict[str, str]) -> str:
    """Fill the runtime prompt's {{VARS}} from tenant data + request context.
    Unknown vars degrade to 'Not specified' (never leave a raw {{VAR}})."""
    values = dict(tenant)
    values["CHANNEL"] = request.channel.value
    values["HISTORY"] = _format_history(request.history)
    values["USER_MESSAGE"] = request.message
    return _VAR_RE.sub(lambda m: str(values.get(m.group(1), "Not specified")), _template())


class ReceptionEngine:
    """Turns a normalized ReceptionRequest into a ReceptionReply (+ usage)."""

    def __init__(self, router=None) -> None:
        self._router = router or get_router()

    async def handle(self, request: ReceptionRequest) -> tuple[ReceptionReply, ModelResult]:
        tenant = load_tenant(request.tenant_id)
        system = build_system_message(request, tenant)

        result = await self._router.complete(ModelRequest(
            tier=ModelTier.SMALL,  # receptionist replies are short; escalate per-case later
            task="reception",
            system=system,
            user=request.message,
            expects_json=False,
            context={"tenant_id": request.tenant_id, "channel": request.channel.value},
        ))

        reply = parse_reply(result.text)
        return reply, result
