"""Orchestrator implementation.

Reads a request, decides build vs edit, calls the chosen generator through the
model layer, and emits a `UsageEvent` carrying the model layer's measured usage
(model/tokens/latency/cost). Firewall (step 4), RAG, and quality gate slot in
around this without changing the entry point.
"""

from __future__ import annotations

from dataclasses import dataclass

from billing import UsageRecorder, get_recorder
from generation import build_site
from schemas import Request, RequestMode, Site, UsageEvent, UsageEventType


@dataclass
class GenerationOutcome:
    """The Site plus the usage events the run generated, and the agent's reply."""

    site: Site
    recorder: UsageRecorder
    reply: str = ""

    @property
    def latency_ms(self) -> int:
        return sum(e.latency_ms for e in self.recorder.events)

    @property
    def cost_usd(self) -> float:
        return sum(e.cost_usd for e in self.recorder.events)


class Orchestrator:
    """Routes a request to the right generation path and meters it."""

    def __init__(self, recorder: UsageRecorder | None = None) -> None:
        self._recorder = recorder or get_recorder()

    def _decide_mode(self, request: Request) -> RequestMode:
        if request.mode is not RequestMode.AUTO:
            return request.mode
        return RequestMode.EDIT if request.site_id else RequestMode.CREATE

    async def handle(self, request: Request) -> GenerationOutcome:
        """Entry point: Request → Site (+ usage)."""
        mode = self._decide_mode(request)
        # NOTE: firewall pre-check goes here (step 4). EDIT routes to the Editor
        # once it exists (step 6); until then both paths build.
        event_type = UsageEventType.EDIT if mode is RequestMode.EDIT else UsageEventType.BUILD

        built = await build_site(request)

        # Record the model layer's measured usage as one append-only UsageEvent.
        r = built.result
        self._recorder.record(UsageEvent(
            tenant_id=request.tenant_id,
            request_id=request.id,
            site_id=built.site.id,
            event_type=event_type,
            model=r.model,
            tier=r.tier,
            tokens_in=r.tokens_in,
            tokens_out=r.tokens_out,
            latency_ms=r.latency_ms,
            cost_usd=r.cost_usd,
            billing_class=request.billing_class,
            success=True,
        ))

        return GenerationOutcome(site=built.site, recorder=self._recorder, reply=built.reply)
