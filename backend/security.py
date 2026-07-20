"""Reusable trusted-request context for the content + content_creator routers.

The Python backend has no end-user session of its own; in production it must be
reachable ONLY by the trusted Next.js proxy, which resolves the caller's
workspace tenant server-side (``ws_<workspaceId>``) and attaches the shared
internal secret. This dependency makes that contract explicit and enforceable at
the router level (defence-in-depth alongside the global middleware in ``app.py``):

* When ``PIXIE_INTERNAL_API_SECRET`` is set, the request MUST carry a matching
  ``X-Pixie-Internal-Secret`` header. Missing / invalid → 401.
* When unset (local dev / the test suite, which drives the ASGI app directly with
  no proxy) it is a no-op, so nothing has to fake the header.

It returns a :class:`RequestContext` routes can attribute/log. Tenant OWNERSHIP is
enforced downstream, not here: every repository read is tenant-scoped, so a
mismatched ``tenant_id`` is indistinguishable from "not found" — a client can
never reach another workspace's rows by changing a body/query value, because the
proxy is the only thing that sets ``tenant_id`` and it derives it from the session.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Optional

from fastapi import Header, HTTPException


@dataclass
class RequestContext:
    """Trusted context for a content-service request."""

    internal: bool  # True when the caller proved it is the trusted Next.js proxy


def require_internal(
    x_pixie_internal_secret: Optional[str] = Header(default=None),
) -> RequestContext:
    """Router-level dependency: enforce the internal shared secret when configured.

    Reads the env live (not captured at import) so tests can toggle it per-case.
    """
    secret = os.getenv("PIXIE_INTERNAL_API_SECRET", "").strip()
    if secret:
        if (x_pixie_internal_secret or "") != secret:
            raise HTTPException(
                status_code=401, detail="unauthorized: missing/invalid internal secret"
            )
        return RequestContext(internal=True)
    return RequestContext(internal=False)
