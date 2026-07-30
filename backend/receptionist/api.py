"""Receptionist web-chat HTTP surface.

GET  /receptionist        → a test chat page (type → reply + parsed action).
POST /receptionist/chat   → run ONE message through the CANONICAL engine
                            (``service.engine.run_message``) and return a
                            legacy-compatible ``{reply_text, action, action_result,
                            usage}`` envelope via an adapter.

This route no longer runs its own prompt, tag parser or local action/CRM/calendar/
booking/payment side effects — all of that now converges on the canonical engine
(tenant resolution, idempotency, conversation lock, history + knowledge retrieval,
response plan, action registry, approval policy, Billing, activity/analytics). The
legacy ``core.ReceptionEngine`` / ``actions.run_action`` path is retained only as
reference and is unreachable from any writable route.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from .context import resolve_tenant

router = APIRouter(prefix="/receptionist", tags=["receptionist"])
_STATIC = Path(__file__).resolve().parent / "static"


class ChatIn(BaseModel):
    tenant_id: str = "t_demo"
    message: str = Field(..., min_length=1, max_length=8000)
    channel: str = "chat"  # "chat" | "voice" (browser speech)
    history: list[dict] = Field(default_factory=list)
    customer_id: str | None = None
    conversation_id: str | None = None
    idempotency_key: str = ""


def _legacy_chat_response(out: dict) -> dict:
    """Adapt the canonical engine result into the legacy web-chat envelope."""
    action_name = out.get("action", "none")
    handled = bool(action_name and action_name not in ("none", "fallback"))
    return {
        "reply_text": out.get("reply", ""),
        "action": {
            "type": out.get("intent", "fallback"),
            "status": out.get("status", ""),
            "action": action_name,
        },
        "action_result": {
            "handled": handled,
            "status": out.get("status", ""),
            "record_type": out.get("record_type", ""),
            "record_id": out.get("record_id", ""),
            "provider_status": out.get("provider_status", ""),
            "escalated": out.get("escalated", False),
        },
        "usage": {  # canonical Billing meters internally; token usage is not surfaced here
            "model": out.get("model", ""),
            "tokens_in": 0, "tokens_out": 0, "latency_ms": 0, "cost_usd": 0.0,
        },
        "conversation_id": out.get("conversation_id", ""),
        "intent": out.get("intent", "fallback"),
        "ai_paused": out.get("ai_paused", False),
        "response_plan_version": out.get("response_plan_version", ""),
    }


@router.get("")
async def page() -> FileResponse:
    return FileResponse(_STATIC / "receptionist_chat.html")


@router.post("/chat")
async def chat(body: ChatIn, tenant_id: str = Depends(resolve_tenant)) -> dict:
    from .service import engine

    channel = "voice" if str(body.channel) == "voice" else "web_chat"
    out = engine.run_message(
        tenant_id=tenant_id,
        message=body.message,
        channel=channel,
        conversation_id=body.conversation_id or None,
        idempotency_key=body.idempotency_key or "",
    )
    return _legacy_chat_response(out)
