"""UsageRecorder — collects `UsageEvent`s for one request and persists them.

Append-only by contract: events are never mutated after `record`. The default
implementation keeps an in-process list (fine for local dev + tests); a future
Postgres-backed recorder will implement the same `record()` surface so nothing
upstream changes.
"""

from __future__ import annotations

import logging
from contextlib import contextmanager
from time import perf_counter
from typing import Iterator

from schemas import ModelTier, UsageEvent, UsageEventType

logger = logging.getLogger("pixie.billing")


class UsageRecorder:
    """Append-only collector of usage events.

    Use `record(...)` to log a finished step, or `measure(...)` as a context
    manager that times the block and emits the event automatically.
    """

    def __init__(self) -> None:
        self._events: list[UsageEvent] = []

    @property
    def events(self) -> list[UsageEvent]:
        return list(self._events)

    def record(self, event: UsageEvent) -> UsageEvent:
        self._events.append(event)
        logger.info(
            "usage tenant=%s type=%s model=%s tier=%s tok_in=%d tok_out=%d latency_ms=%d cost=$%.5f ok=%s",
            event.tenant_id, event.event_type.value, event.model, event.tier.value,
            event.tokens_in, event.tokens_out, event.latency_ms, event.cost_usd, event.success,
        )
        return event

    @contextmanager
    def measure(
        self,
        *,
        tenant_id: str,
        event_type: UsageEventType,
        request_id: str | None = None,
        site_id: str | None = None,
        model: str | None = None,
        tier: ModelTier = ModelTier.NONE,
    ) -> Iterator["_Meter"]:
        """Time a block and emit a UsageEvent when it exits.

        Inside the block, set token counts / cost on the yielded meter:
            with rec.measure(...) as m:
                ...
                m.tokens_in, m.tokens_out, m.cost_usd = 1200, 3400, 0.02
        """
        meter = _Meter()
        start = perf_counter()
        try:
            yield meter
        except Exception as exc:  # still emit a failed event — cost visibility on errors too
            self.record(UsageEvent(
                tenant_id=tenant_id, request_id=request_id, site_id=site_id,
                event_type=event_type, model=model, tier=tier,
                latency_ms=int((perf_counter() - start) * 1000),
                success=False, error=str(exc)[:500],
            ))
            raise
        else:
            self.record(UsageEvent(
                tenant_id=tenant_id, request_id=request_id, site_id=site_id,
                event_type=event_type, model=model, tier=tier,
                tokens_in=meter.tokens_in, tokens_out=meter.tokens_out,
                cost_usd=meter.cost_usd,
                latency_ms=int((perf_counter() - start) * 1000),
                success=True,
            ))


class _Meter:
    """Mutable counters set inside a `measure(...)` block."""

    __slots__ = ("tokens_in", "tokens_out", "cost_usd")

    def __init__(self) -> None:
        self.tokens_in = 0
        self.tokens_out = 0
        self.cost_usd = 0.0


def get_recorder() -> UsageRecorder:
    """Factory — one recorder per request (so events group per request)."""
    return UsageRecorder()
