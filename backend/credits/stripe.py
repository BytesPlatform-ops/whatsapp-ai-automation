"""Stripe integration — config, signature verification, and a thin injectable client.

No `stripe` pip dependency: webhook signatures are verified with stdlib HMAC (the
documented `t=…,v1=…` scheme) and checkout/portal sessions are created through an
INJECTABLE transport so tests exercise the full path against mocked Stripe responses
with no network. Secrets live only in the git-ignored env; nothing here is exposed to
the browser. Live mode is inert until real keys are configured.
"""

from __future__ import annotations

import hashlib
import hmac
import os
import time
from typing import Callable, Optional, Tuple

# transport(method, url, form: dict, headers: dict) -> (status, json)
Transport = Callable[[str, str, dict, dict], Tuple[int, dict]]

STRIPE_API = "https://api.stripe.com/v1"


# ── config (secret-free accessors) ──────────────────────────────────────────────
def secret_key() -> str:
    return os.getenv("STRIPE_SECRET_KEY", "").strip()


def webhook_secret() -> str:
    return os.getenv("STRIPE_WEBHOOK_SECRET", "").strip()


def publishable_key() -> str:
    return os.getenv("STRIPE_PUBLISHABLE_KEY", "").strip()


def configured() -> bool:
    return bool(secret_key())


def success_url() -> str:
    return os.getenv("STRIPE_CHECKOUT_SUCCESS_URL", "").strip() or "https://app.pixie.dev/pixie-lab/billing/center?checkout=success"


def cancel_url() -> str:
    return os.getenv("STRIPE_CHECKOUT_CANCEL_URL", "").strip() or "https://app.pixie.dev/pixie-lab/billing/center?checkout=cancel"


def portal_return_url() -> str:
    return os.getenv("STRIPE_PORTAL_RETURN_URL", "").strip() or "https://app.pixie.dev/pixie-lab/billing/center"


def price_to_plan() -> dict:
    """Server-side Stripe price id → internal plan id (from env). Empty prices skipped."""
    out = {}
    for plan, env in (("free", "STRIPE_PRICE_FREE"), ("starter", "STRIPE_PRICE_STARTER"), ("pro", "STRIPE_PRICE_PRO")):
        pid = os.getenv(env, "").strip()
        if pid:
            out[pid] = plan
    return out


def plan_to_price(plan_id: str) -> str:
    for pid, plan in price_to_plan().items():
        if plan == plan_id:
            return pid
    return ""


def sync_plan_registry() -> None:
    """Populate plans.PRICE_TO_PLAN from env so price→plan mapping is server-authoritative."""
    try:
        from . import plans
        plans.PRICE_TO_PLAN.clear()
        plans.PRICE_TO_PLAN.update(price_to_plan())
    except Exception:
        pass


# ── webhook signature (Stripe scheme, stdlib) ───────────────────────────────────
class SignatureError(Exception):
    pass


def verify_signature(payload: bytes, sig_header: str, *, secret: str = "", tolerance_s: int = 300,
                     now: Optional[int] = None) -> None:
    """Verify a Stripe-Signature header (`t=timestamp,v1=hexhmac`). Raises
    SignatureError on any mismatch. HMAC-SHA256 over `f"{t}.{payload}"`."""
    secret = secret or webhook_secret()
    if not secret:
        raise SignatureError("webhook secret not configured")
    parts = dict(p.split("=", 1) for p in sig_header.split(",") if "=" in p)
    t = parts.get("t", "")
    v1 = parts.get("v1", "")
    if not t or not v1:
        raise SignatureError("malformed signature header")
    if now is not None and abs(now - int(t)) > tolerance_s:
        raise SignatureError("timestamp outside tolerance")
    signed = f"{t}.".encode() + payload
    expected = hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, v1):
        raise SignatureError("signature mismatch")


def sign_payload(payload: bytes, *, secret: str, timestamp: Optional[int] = None) -> str:
    """Build a valid Stripe-Signature header (used ONLY by tests to sign fixtures)."""
    t = timestamp if timestamp is not None else int(time.time())
    signed = f"{t}.".encode() + payload
    v1 = hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()
    return f"t={t},v1={v1}"


# ── checkout / portal (injectable transport) ────────────────────────────────────
def _default_transport(method: str, url: str, form: dict, headers: dict) -> Tuple[int, dict]:
    import httpx  # local import; only in configured live mode
    with httpx.Client(timeout=20) as http:
        r = http.request(method, url, data=form, headers=headers)
        try:
            return r.status_code, r.json()
        except ValueError:
            return r.status_code, {}


def _auth_headers() -> dict:
    return {"Authorization": f"Bearer {secret_key()}", "Content-Type": "application/x-www-form-urlencoded"}


def create_checkout_session(*, price_id: str, customer_id: str, tenant_id: str, success: str, cancel: str,
                            transport: Optional[Transport] = None) -> dict:
    """Create a subscription checkout session. Binds the workspace via
    client_reference_id + metadata (never a browser-supplied customer)."""
    t = transport or _default_transport
    form = {
        "mode": "subscription",
        "line_items[0][price]": price_id,
        "line_items[0][quantity]": "1",
        "success_url": success,
        "cancel_url": cancel,
        "client_reference_id": tenant_id,
        "metadata[tenant_id]": tenant_id,
        "subscription_data[metadata][tenant_id]": tenant_id,
    }
    if customer_id:
        form["customer"] = customer_id
    status, body = t("POST", f"{STRIPE_API}/checkout/sessions", form, _auth_headers())
    if status >= 300:
        raise RuntimeError(f"stripe checkout failed ({status})")
    return body


def create_portal_session(*, customer_id: str, return_url: str,
                          transport: Optional[Transport] = None) -> dict:
    t = transport or _default_transport
    form = {"customer": customer_id, "return_url": return_url}
    status, body = t("POST", f"{STRIPE_API}/billing_portal/sessions", form, _auth_headers())
    if status >= 300:
        raise RuntimeError(f"stripe portal failed ({status})")
    return body
