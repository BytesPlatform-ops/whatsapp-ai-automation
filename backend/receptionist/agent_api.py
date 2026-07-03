"""AI Receptionist HTTP surface — the real vertical slice.

  POST /api/agents/ai-receptionist/run             run on a manual customer message
  POST /api/agents/ai-receptionist/run-from-gmail  run on a Gmail message (mock seed
                                                    for now; real mode blocks if Gmail
                                                    is not connected)
  GET  /api/integrations/status                     what each capability would do now
                                                    + LLM provider/model + exec mode

Self-contained: two include_router lines in app.py.
"""

from __future__ import annotations

import os

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from integrations import integration_status
from integrations.connections import find_active_connection
from models import get_router
from models.openai import MISSING_KEY_MESSAGE
from runtime.mode import execution_mode, mode_banner
from schemas import ModelTier

from .agent import AGENT_SLUG, run_receptionist
from .agent_schemas import ReceptionSignal, RunResponse

agent_router = APIRouter(prefix="/api/agents/ai-receptionist", tags=["ai-receptionist"])
integrations_router = APIRouter(prefix="/api/integrations", tags=["integrations"])


@agent_router.post("/run", response_model=RunResponse)
async def run(signal: ReceptionSignal) -> RunResponse:
    try:
        return await run_receptionist(signal)
    except RuntimeError as exc:
        # Missing OPENAI_API_KEY (or provider not ready) — clear, honest error.
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


_MOCK_GMAIL_MESSAGE = {
    "from_name": "Sarah",
    "from_email": "sarah@example.com",
    "subject": "Pricing and availability",
    "body": "Hi, can you tell me your pricing and if you are available this Friday?",
}


class GmailRunBody(BaseModel):
    tenant_id: str = "demo_tenant"
    user_id: str = "demo_user"
    message_id: str = ""
    now: str = ""


@agent_router.post("/run-from-gmail", response_model=RunResponse)
async def run_from_gmail(body: GmailRunBody) -> RunResponse:
    # Real mode needs a live Gmail read connection; fail closed if absent.
    if execution_mode().value == "real" and not find_active_connection(body.tenant_id, "email_read"):
        raise HTTPException(
            status_code=409,
            detail="missing_connection: Gmail is not connected for this tenant. "
                   "Connect Gmail or switch PIXIE_EXECUTION_MODE=mock.",
        )
    # Mock mode (or test): use a seeded Gmail message so the flow is exercisable.
    signal = ReceptionSignal(
        tenant_id=body.tenant_id, user_id=body.user_id, source="gmail", now=body.now,
        **_MOCK_GMAIL_MESSAGE,
    )
    try:
        return await run_receptionist(signal)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@integrations_router.get("/status")
def status(tenant_id: str = "demo_tenant", agent_slug: str = AGENT_SLUG) -> dict:
    router = get_router()
    provider = "openai" if router.mode == "openai" else "mock"
    model_id = router.model_for(ModelTier.SMALL)

    if provider == "openai":
        openai_status = "configured" if os.getenv("OPENAI_API_KEY") else "missing_key"
        openai_note = "" if openai_status == "configured" else MISSING_KEY_MESSAGE
    else:
        openai_status = "mock"
        openai_note = "Using the deterministic mock provider (no OpenAI key needed)."

    banner = mode_banner()
    return {
        "agent_slug": agent_slug,
        "execution_mode": banner["execution_mode"],
        "agent_mode": banner["agent_mode"],
        "real_execution_allowed": banner["real_execution_allowed"],
        "llm_provider": provider,
        "model": model_id,
        "openai": {"status": openai_status, "model": model_id, "note": openai_note},
        "capabilities": integration_status(tenant_id, agent_slug),
    }
