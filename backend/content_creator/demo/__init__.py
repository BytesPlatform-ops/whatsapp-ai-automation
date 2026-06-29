"""Standalone demo app + UI for the Content Creator service (Wave 1).

This package is the HTTP/UI boundary only: a FastAPI router (`demo_routes`), a
mountable app (`demo_app`), and a vanilla-JS dashboard under `static/`. It holds
mock pipeline state in-memory and drives the deterministic core pipeline so the
whole 13-stage flow can be SEEN and clicked through in a browser — no real
provider calls, no secrets, no live spend (Gate 3 enforced).
"""

from __future__ import annotations
