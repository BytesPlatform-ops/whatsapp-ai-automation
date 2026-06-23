"""Orchestrator implementation."""

from __future__ import annotations

from dataclasses import dataclass

from billing import UsageRecorder, get_recorder
from generation import build_site_fake
from schemas import ModelTier, Request, RequestMode, Site, UsageEventType


@dataclass
class GenerationOutcome:
    """What a run produced: the Site plus the usage events it generated.

    `latency_ms` is the end-to-end orchestration time (sum of metered steps +
    overhead) — the number we watch for p50/p95.
    """

    site: Site
    recorder: UsageRecorder

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
        """Build vs edit. AUTO → edit when a target site is referenced."""
        if request.mode is not RequestMode.AUTO:
            return request.mode
        return RequestMode.EDIT if request.site_id else RequestMode.CREATE

    async def handle(self, request: Request) -> GenerationOutcome:
        """Entry point: Request → Site (+ usage). Async so step 4's real model
        call (network-bound) drops in without reshaping callers."""
        mode = self._decide_mode(request)

        if mode is RequestMode.EDIT:
            # Editor lands in step 5; until then, treat as a (fake) rebuild.
            event_type = UsageEventType.EDIT
        else:
            event_type = UsageEventType.BUILD

        # Meter the generation. tier=NONE because step 2 makes no model call;
        # step 4 sets tier=LARGE + real tokens/cost on the meter.
        with self._recorder.measure(
            tenant_id=request.tenant_id,
            request_id=request.id,
            event_type=event_type,
            tier=ModelTier.NONE,
            model=None,
        ) as meter:
            site = build_site_fake(request)
            meter.tokens_in = 0
            meter.tokens_out = 0
            meter.cost_usd = 0.0

        return GenerationOutcome(site=site, recorder=self._recorder)
