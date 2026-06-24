"""Billing / usage metering.

Step 2: an in-memory recorder so every metered step still emits a `UsageEvent`
and we can read cost/latency back. Step 6 swaps the sink for the append-only
Postgres table + Redis quota — call sites won't change.
"""

from .recorder import UsageRecorder, get_recorder

__all__ = ["UsageRecorder", "get_recorder"]
