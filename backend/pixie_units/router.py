"""Trial routing API — POST /api/agents/{slug}/trial and POST /api/omni/trial.

Normalizes the slug through the registry, activates the agent's entitlement
(free / no payment) via the existing entitlements store, and returns the
CANONICAL redirect so the frontend can never route to the wrong dashboard.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from entitlements.router import ActivateBody, activate as activate_entitlement
from .registry import OMNI, get_pixie_unit

router = APIRouter(tags=["pixie-units"])


class TrialBody(BaseModel):
    tenant_id: str = "demo"
    source: str = "public_page"


def _resp(unit: dict, status: str = "trial") -> dict:
    return {
        "success": True,
        "unit": unit["slug"],
        "unit_type": unit["type"],
        "status": status,
        "redirect": unit["dashboard_path"],
    }


@router.post("/api/agents/{agent_slug}/trial")
def agent_trial(agent_slug: str, body: TrialBody) -> dict:
    unit = get_pixie_unit(agent_slug)
    if not unit or unit["type"] != "agent":
        raise HTTPException(status_code=404, detail=f"invalid agent: {agent_slug}")
    # free activation (no payment) via the entitlements store, keyed by backend_key
    activate_entitlement(ActivateBody(tenant_id=body.tenant_id, agent=unit["backend_key"], source=body.source))
    return _resp(unit)


@router.post("/api/omni/trial")
def omni_trial(body: TrialBody) -> dict:
    # Omni is the central brain — always available; no per-agent entitlement needed.
    return _resp(OMNI)
