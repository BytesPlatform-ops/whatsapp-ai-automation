"""Omni — the central routing brain for test mode.

Omni takes a *signal* (a seeded demo signal, or one posted by the dashboard),
picks the right agent, has that agent PREPARE a draft/recommendation, and files a
rich approval. On approval the action runs through the mock executor and is logged
to the activity feed. Nothing real happens unless runtime.real_execution_allowed()
(production + real) — which is False by default.

This does not replace each agent's own API surface; it is the unified
detect → decide → prepare → approve → execute(mock) → log path used by the Test Lab.
"""

from .router import router  # noqa: F401
from . import workflow  # noqa: F401  (registers the approvals executor on import)
