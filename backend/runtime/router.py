"""Runtime-mode API — one endpoint the dashboard can trust for the safety banner.

  GET /api/mode   → the aggregated mode banner (agent_mode, execution_mode,
                    require_approval, real_execution_allowed, and the underlying
                    per-module mock flags).

Read-only. Self-contained: one include_router line in app.py.
"""

from __future__ import annotations

from fastapi import APIRouter

from .mode import mode_banner

router = APIRouter(prefix="/api/mode", tags=["mode"])


@router.get("")
def get_mode() -> dict:
    return mode_banner()
