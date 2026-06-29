"""Standalone demo app for the Pixie Channels layer.

Mounts the channels API, serves the omni-channel manager + a page per agent, and
registers the concrete Wave-2 adapters + a mock receptionist handler so the
"test a message" loop produces a reply. Touches no service and no app.py.

Run (from backend/):
    PIXIE_MODEL_MODE=fake .venv/bin/python -m uvicorn channels.demo_app:app --port 8079
Then open http://localhost:8079/
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.responses import HTMLResponse, RedirectResponse

from .api import router as channels_router
from .compliance import evaluate_compliance
from .pages import agent_page, omni_page
from .registry import register_default_adapters
from .router import get_channel_router
from .schemas import InboundMessage, OutboundMessage

app = FastAPI(title="Pixie Channels — Demo Dashboard")
app.include_router(channels_router)

# Wire concrete adapters + the compliance gate + a demo service handler onto the
# process-wide router.
_router = register_default_adapters(get_channel_router())
_router.set_compliance_gate(lambda msg, config, store: evaluate_compliance(msg, config, store))


def _demo_receptionist(inb: InboundMessage) -> OutboundMessage:
    """Stand-in service handler — shows how a service replies WITHOUT knowing the
    channel (the real receptionist would register the same way, unedited)."""
    return OutboundMessage(
        tenant_id=inb.tenant_id,
        channel=inb.channel,
        recipient_id=inb.sender_id,
        thread_id=inb.thread_id,
        text=f"(Pixie receptionist) Thanks — I received: “{inb.text}”",
    )


_router.register_handler("receptionist", _demo_receptionist)


@app.get("/", response_class=HTMLResponse)
async def root() -> RedirectResponse:
    return RedirectResponse(url="/channels")


@app.get("/channels", response_class=HTMLResponse)
async def channels_home() -> str:
    return omni_page()


@app.get("/channels/agents/{name}", response_class=HTMLResponse)
async def channels_agent(name: str) -> str:
    return agent_page(name)
