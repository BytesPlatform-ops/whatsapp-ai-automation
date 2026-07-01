"""Omni API — the Test Lab's routing brain.

  GET  /api/omni/signals             seeded demo signals to try
  POST /api/omni/run                 route a signal → prepare → file approval

Body for /run accepts either a seeded `signal_id`, or an inline signal
(`type` + optional `message`/`source`). Self-contained: one include_router line.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .signals import DEMO_SIGNALS, Signal, get_demo_signal
from .workflow import run

router = APIRouter(prefix="/api/omni", tags=["omni"])


@router.get("/signals", response_model=list[Signal])
def list_signals() -> list[Signal]:
    return DEMO_SIGNALS


class RunBody(BaseModel):
    tenant_id: str
    signal_id: str = ""       # use a seeded demo signal, OR ...
    type: str = ""            # ... provide an inline signal type
    message: str = ""
    source: str = "mock"
    now: str = ""


@router.post("/run")
def omni_run(body: RunBody) -> dict:
    if body.signal_id:
        signal = get_demo_signal(body.signal_id)
        if signal is None:
            raise HTTPException(status_code=404, detail=f"unknown signal_id: {body.signal_id}")
    elif body.type:
        signal = Signal(id=f"inline_{body.type}", type=body.type, source=body.source, message=body.message)
    else:
        raise HTTPException(status_code=400, detail="provide signal_id or type")
    return run(body.tenant_id, signal, now=body.now)
