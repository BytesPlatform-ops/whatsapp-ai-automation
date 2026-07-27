"""Server-derived tenant resolution for the SEO agent.

Tenant precedence (most-trusted first):
  1. ``X-Pixie-Tenant`` header — set by the trusted Next.js proxy, derived
     from the signed-in session server-side. When present, this is the only
     value used; any body/query ``tenant_id`` is IGNORED (spoof blocked).
  2. Strict mode (``PIXIE_REQUIRE_INTERNAL_SECRET=1``) and no header →
     HTTP 400 ``{"error": "tenant_required"}``.  Production operators must
     always send the header; falling back to a client-supplied value is not
     acceptable in a hardened environment.
  3. Dev / test mode (flag OFF) → fall back to the body/query ``tenant_id``
     passed in by the caller, defaulting to ``"demo_tenant"``.  This keeps
     all existing tests working without any changes.

Usage:

  For GET routes where the tenant comes from a query param, use
  ``resolve_tenant`` directly as a ``Depends``; the fallback query param
  name is ``tenant_id`` and it's read from the URL automatically.

  For POST routes where the tenant may come from the request body, use
  ``make_tenant_resolver(body_tenant)`` inside the route:

      @router.post("/foo")
      async def foo(body: FooBody, _header_tenant: str = Depends(resolve_tenant_header)):
          tenant = _resolve_effective(body.tenant_id, _header_tenant)
          ...

  ``resolve_tenant_header`` extracts only the header / strict-mode check
  (returning ``None`` when in non-strict mode and the header is absent),
  so the route can provide its own body fallback.
"""

from __future__ import annotations

import os
from typing import Optional

from fastapi import Header, HTTPException, Query

# Sentinel returned by resolve_tenant_header when in non-strict mode and
# no header is present. Routes use this to know they should apply their
# own fallback (body.tenant_id or query tenant_id).
_NO_HEADER = ""


def _strict_mode() -> bool:
    """True when PIXIE_REQUIRE_INTERNAL_SECRET is set (read live, not at import)."""
    return os.getenv("PIXIE_REQUIRE_INTERNAL_SECRET", "").strip().lower() in (
        "1", "true", "yes", "on"
    )


def resolve_tenant_header(
    x_pixie_tenant: Optional[str] = Header(default=None),
) -> Optional[str]:
    """Extract the trusted tenant from the header only.

    Returns:
      - The header value (stripped) when the header is present and non-empty.
      - ``None`` when in non-strict mode and the header is absent — callers
        should fall back to their body/query ``tenant_id``.

    Raises HTTP 400 when in strict mode (``PIXIE_REQUIRE_INTERNAL_SECRET=1``)
    and the header is absent.
    """
    if x_pixie_tenant and x_pixie_tenant.strip():
        return x_pixie_tenant.strip()
    if _strict_mode():
        raise HTTPException(status_code=400, detail={"error": "tenant_required"})
    return None  # non-strict: caller provides the fallback


def effective_tenant(header_tenant: Optional[str], fallback: Optional[str]) -> str:
    """Merge header result with a route-supplied fallback.

    Header wins when present (never None).  Otherwise uses ``fallback``
    (body.tenant_id or query tenant_id), defaulting to ``"demo_tenant"``.
    """
    if header_tenant:
        return header_tenant
    return (fallback or "demo_tenant").strip() or "demo_tenant"


def resolve_tenant(
    x_pixie_tenant: Optional[str] = Header(default=None),
    tenant_id: Optional[str] = Query(default=None),
) -> str:
    """FastAPI dependency for GET routes (tenant from query param or header).

    Precedence:
      1. X-Pixie-Tenant header → authoritative, query param ignored.
      2. Strict mode + no header → HTTP 400.
      3. Non-strict → tenant_id query param (or "demo_tenant" if absent).
    """
    header = resolve_tenant_header(x_pixie_tenant)
    return effective_tenant(header, tenant_id)
