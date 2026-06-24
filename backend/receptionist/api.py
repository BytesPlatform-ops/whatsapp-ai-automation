"""Receptionist HTTP surface (web_chat channel).

GET  /receptionist        → a test chat page (type → reply + parsed [ACTION]).
POST /receptionist/chat   → run the engine for one message, return reply + action
                            + usage, and emit a UsageEvent for billing.

Mounted into the main FastAPI app (modular monolith). Real channels (sms, voice,
whatsapp) add their own adapters + routes against the same engine.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from billing import get_recorder
from schemas import UsageEvent, UsageEventType

from .actions import run_action
from .channels import WebChatAdapter
from .core import ReceptionEngine

router = APIRouter(prefix="/receptionist", tags=["receptionist"])
_STATIC = Path(__file__).resolve().parent / "static"
_adapter = WebChatAdapter()


class ChatIn(BaseModel):
    tenant_id: str = "t_demo"
    message: str = Field(..., min_length=1, max_length=8000)
    channel: str = "chat"  # "chat" | "voice" (browser speech)
    history: list[dict] = Field(default_factory=list)
    customer_id: str | None = None


@router.get("")
async def page() -> FileResponse:
    return FileResponse(_STATIC / "receptionist_chat.html")


@router.post("/chat")
async def chat(body: ChatIn) -> dict:
    req = _adapter.to_request(body.tenant_id, body.model_dump())
    reply, result = await ReceptionEngine().handle(req)

    # Run the real side-effect for the parsed action (booking → calendar, etc.).
    action_result = run_action(reply.action, req)

    # Bill the model call (model/tokens/latency/cost).
    get_recorder().record(UsageEvent(
        tenant_id=req.tenant_id,
        event_type=UsageEventType.RECEPTION,
        model=result.model,
        tier=result.tier,
        tokens_in=result.tokens_in,
        tokens_out=result.tokens_out,
        latency_ms=result.latency_ms,
        cost_usd=result.cost_usd,
    ))

    out = _adapter.format_reply(reply)
    out["action_result"] = action_result
    out["usage"] = {
        "model": result.model,
        "tokens_in": result.tokens_in,
        "tokens_out": result.tokens_out,
        "latency_ms": result.latency_ms,
        "cost_usd": result.cost_usd,
    }
    return out
