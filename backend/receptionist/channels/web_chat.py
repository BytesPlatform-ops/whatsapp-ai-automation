"""Web chat channel adapter — the first/simplest surface.

Inbound JSON {message, history?, customer_id?} → ReceptionRequest(channel=chat).
Outbound → {reply_text, action} (web chat just renders text; the action is
internal, surfaced here only so the test page can show the parsed loop).
"""

from __future__ import annotations

from typing import Any

from ..schemas import Channel, HistoryTurn, ReceptionReply, ReceptionRequest
from .base import ChannelAdapter


class WebChatAdapter(ChannelAdapter):
    channel = Channel.CHAT

    def to_request(self, tenant_id: str, payload: dict[str, Any]) -> ReceptionRequest:
        history = [
            HistoryTurn(role=str(t.get("role", "customer")), content=str(t.get("content", "")))
            for t in (payload.get("history") or [])
            if t.get("content")
        ]
        # Same web surface can run as 'chat' or 'voice' (browser speech); the
        # engine adapts reply length via {{CHANNEL}}.
        try:
            channel = Channel(str(payload.get("channel") or "chat"))
        except ValueError:
            channel = Channel.CHAT
        return ReceptionRequest(
            tenant_id=tenant_id,
            channel=channel,
            customer_id=payload.get("customer_id"),
            message=str(payload.get("message", "")),
            history=history,
        )

    def format_reply(self, reply: ReceptionReply) -> dict[str, Any]:
        return {"reply_text": reply.reply_text, "action": reply.action.model_dump(mode="json")}
