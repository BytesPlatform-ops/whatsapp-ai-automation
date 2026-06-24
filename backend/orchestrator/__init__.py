"""Orchestrator — the request brain.

Reads a `Request`, decides what to run (build vs edit; split only when parts
are genuinely independent), calls the right generator, and meters the work via
billing. Step 2 wires build→fake-Builder. Firewall (step 3) and real Builder /
Editor (steps 4–5) slot in here without changing the entry point.
"""

from .orchestrator import GenerationOutcome, Orchestrator

__all__ = ["Orchestrator", "GenerationOutcome"]
