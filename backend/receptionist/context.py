"""Trusted request context for the AI Receptionist — server-derived tenant +
fail-closed internal secret + provider webhook verification.

Single source of truth for "which workspace is this request for". The Next.js
proxy is the ONLY trusted caller: it authenticates the user, derives the
workspace tenant server-side (``ws_<workspaceId>``) and sends it as the
``X-Pixie-Tenant`` header alongside the shared ``X-Pixie-Internal-Secret``. The
backend NEVER trusts a tenant id taken from the request body or query when a
proxy is in front — that is how tenant spoofing is blocked.

Production posture (``PIXIE_INTERNAL_API_SECRET`` configured — a proxy is required):
  * ``X-Pixie-Internal-Secret`` MUST match, else 401.
  * ``X-Pixie-Tenant`` MUST be present and is AUTHORITATIVE. Body/query
    ``tenant_id`` is ignored entirely, so changing it cannot reach another
    workspace's rows.

Dev/test posture (secret unset — the ASGI app is driven directly, no proxy):
  * Fall back to ``X-Pixie-Tenant`` → ``?tenant_id=`` → body ``tenant_id`` →
    ``"demo_tenant"`` so the hermetic test-suite and local curl keep working with
    no header. Absence of the secret is the explicit dev bypass.

Reads env live (never captured at import) so tests can toggle it per-case.
"""

from __future__ import annotations

import hashlib
import hmac
import os
import time

from fastapi import HTTPException, Request

TENANT_HEADER = "x-pixie-tenant"
SECRET_HEADER = "x-pixie-internal-secret"

DEFAULT_TENANT = "demo_tenant"


def internal_secret() -> str:
    return os.getenv("PIXIE_INTERNAL_API_SECRET", "").strip()


def proxy_required() -> bool:
    """True when a trusted proxy is required (i.e. the internal secret is set).

    This is the production posture: client-supplied tenant ids are ignored.
    """
    return bool(internal_secret())


async def resolve_tenant(request: Request) -> str:
    """FastAPI dependency: return the trusted tenant for this request.

    Every receptionist route depends on this instead of reading ``tenant_id``
    from a Query() or a body field, so there is exactly one place that decides
    tenant ownership and it can never be spoofed in production.
    """
    secret = internal_secret()
    header_tenant = (request.headers.get(TENANT_HEADER) or "").strip()

    if secret:
        # Production: the proxy is the only trusted caller. Re-verify the shared
        # secret (defence-in-depth alongside the global middleware) and take the
        # tenant ONLY from the trusted header — body/query are ignored.
        if (request.headers.get(SECRET_HEADER) or "") != secret:
            raise HTTPException(
                status_code=401, detail="unauthorized: missing/invalid internal secret"
            )
        if not header_tenant:
            raise HTTPException(
                status_code=400,
                detail="missing X-Pixie-Tenant: tenant must be server-derived by the proxy",
            )
        return header_tenant

    # Dev / test (no proxy): header wins, then query, then body, then demo.
    if header_tenant:
        return header_tenant
    q = (request.query_params.get("tenant_id") or "").strip()
    if q:
        return q
    try:
        body = await request.json()
        if isinstance(body, dict):
            b = str(body.get("tenant_id") or "").strip()
            if b:
                return b
    except Exception:
        pass
    return DEFAULT_TENANT


# ── Stripe webhook signature verification ────────────────────────────────────

class WebhookVerificationError(Exception):
    """Raised when an inbound provider webhook cannot be authenticated."""


def verify_stripe_signature(
    payload: bytes,
    signature_header: str,
    secret: str,
    *,
    tolerance_seconds: int = 300,
    now: float | None = None,
) -> None:
    """Verify Stripe's ``Stripe-Signature`` header (``t=...,v1=...``).

    Raises :class:`WebhookVerificationError` on any failure so a forged
    ``checkout.session.completed`` can never flip a payment to ``paid``. This is
    the same scheme Stripe's SDK uses; implemented with stdlib hmac so no extra
    dependency is required.
    """
    if not secret:
        raise WebhookVerificationError("stripe webhook secret is not configured")
    if not signature_header:
        raise WebhookVerificationError("missing Stripe-Signature header")

    parts = {}
    for item in signature_header.split(","):
        key, _, val = item.partition("=")
        parts.setdefault(key.strip(), val.strip())

    timestamp = parts.get("t")
    provided = parts.get("v1")
    if not timestamp or not provided:
        raise WebhookVerificationError("malformed Stripe-Signature header")

    try:
        ts = int(timestamp)
    except ValueError as exc:
        raise WebhookVerificationError("invalid signature timestamp") from exc

    current = now if now is not None else time.time()
    if tolerance_seconds and abs(current - ts) > tolerance_seconds:
        raise WebhookVerificationError("signature timestamp outside tolerance (replay?)")

    signed_payload = f"{timestamp}.".encode() + payload
    expected = hmac.new(secret.encode(), signed_payload, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, provided):
        raise WebhookVerificationError("signature mismatch")
