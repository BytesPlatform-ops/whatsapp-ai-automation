"""Standalone demo app for the Pixie Content Creator service (Wave 1).

Mounts the demo router under ``/demo`` and serves a single-page vanilla-JS
dashboard so the whole 13-stage, 4-gate pipeline can be SEEN and clicked through
in a browser. Everything is mock-mode only — no real provider calls, no secrets,
no live spend.

Run (from backend/):
    uvicorn content_creator.demo.demo_app:app --port 8090
Then open:
    http://localhost:8090/demo
"""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

from .demo_routes import router as demo_router

_HERE = Path(__file__).resolve().parent
_STATIC_DIR = _HERE / "static"
_INDEX = _STATIC_DIR / "demo.html"

app = FastAPI(title="Pixie Content Creator — Demo")
app.include_router(demo_router, prefix="/demo")
app.mount("/demo/static", StaticFiles(directory=str(_STATIC_DIR)), name="static")


@app.get("/demo", response_class=HTMLResponse)
def demo_index() -> FileResponse:
    """Serve the dashboard console."""
    return FileResponse(str(_INDEX), media_type="text/html")


@app.get("/", response_class=HTMLResponse)
def root() -> HTMLResponse:
    """Convenience redirect-ish landing pointing at /demo."""
    return HTMLResponse(
        '<!doctype html><meta charset="utf-8">'
        '<title>Pixie Content Creator — Demo</title>'
        '<body style="font:16px/1.6 system-ui;padding:3rem;background:#0e1726;color:#e7f6ee">'
        '<h1>Pixie Content Creator — Demo</h1>'
        '<p>Open the console at <a style="color:#3ddc97" href="/demo">/demo</a>.</p>'
        '</body>'
    )
