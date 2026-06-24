"""Python → Node bridge for the existing website-gen templates.

Calls `backend/bridge/render_site.js` as a subprocess: sends a siteConfig as
JSON on stdin, receives a `{ "/index.html": "<html>", ... }` file map on stdout.
This reuses the previous developer's production templates (src/website-gen)
instead of re-rendering in Python.

RENDER ONLY — no API keys needed. Full content generation
(`generateWebsiteContent`, which calls the LLM + Pexels) and Netlify deploy are
separate and key-gated; we add those once keys are available.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

_BRIDGE_JS = Path(__file__).resolve().parent.parent / "bridge" / "render_site.js"


class NodeBridgeError(RuntimeError):
    pass


async def render_site_via_node(site_config: dict, *, timeout_s: float = 60.0) -> dict[str, str]:
    """Render a siteConfig into an HTML file map using the Node templates."""
    if not _BRIDGE_JS.exists():
        raise NodeBridgeError(f"bridge script missing: {_BRIDGE_JS}")

    proc = await asyncio.create_subprocess_exec(
        "node", str(_BRIDGE_JS),
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        out, err = await asyncio.wait_for(
            proc.communicate(json.dumps(site_config).encode("utf-8")), timeout=timeout_s
        )
    except asyncio.TimeoutError as exc:
        proc.kill()
        raise NodeBridgeError(f"node render timed out after {timeout_s}s") from exc

    if not out:
        raise NodeBridgeError(f"empty output from node bridge; stderr={err.decode('utf-8', 'ignore')[:500]}")

    # Strip any library banners printed to stdout before our sentinel-tagged JSON.
    text = out.decode("utf-8")
    marker = "<<<PIXIE_JSON>>>"
    idx = text.rfind(marker)
    if idx == -1:
        raise NodeBridgeError(f"no sentinel in node output: {text[:300]!r} stderr={err.decode('utf-8','ignore')[:300]}")
    try:
        data = json.loads(text[idx + len(marker):])
    except json.JSONDecodeError as exc:
        raise NodeBridgeError(f"bad JSON from node bridge: {text[idx:idx+300]!r}") from exc

    if not data.get("ok"):
        raise NodeBridgeError(data.get("error") or "unknown node bridge error")

    return data["files"]
