"""Security tests for server-derived tenant isolation in the AI Receptionist.

Exercises:
  1. Body tenant_id is ignored when secret is set — only header tenant counts.
  2. Missing internal secret → 401.
  3. Secret present but no X-Pixie-Tenant header → 400.
  4. Cross-tenant read isolation: lead created under tenantA is 404 as tenantB.
  5. verify_stripe_signature: correct HMAC passes; tampered one raises WebhookVerificationError.
  6. Dev-mode back-compat: no secret set, body tenant_id still resolves correctly.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import time

import pytest
from fastapi.testclient import TestClient

from receptionist.context import WebhookVerificationError, verify_stripe_signature

BASE = "/api/agents/ai-receptionist"

SECRET = "test-internal-secret-xyz"


# ── fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture()
def client_with_secret(monkeypatch):
    """TestClient with PIXIE_INTERNAL_API_SECRET set — production posture."""
    monkeypatch.setenv("PIXIE_INTERNAL_API_SECRET", SECRET)
    monkeypatch.setenv("PIXIE_PERSIST", "memory")
    monkeypatch.setenv("PIXIE_MODEL_MODE", "fake")
    monkeypatch.setenv("PIXIE_LLM_PROVIDER", "")
    monkeypatch.setenv("PIXIE_AGENT_MODE", "test")
    monkeypatch.setenv("PIXIE_EXECUTION_MODE", "mock")
    for k in ("STRIPE_SECRET_KEY", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN",
              "TWILIO_PHONE_NUMBER", "EMAIL_PROVIDER_API_KEY", "AI_RECEPTIONIST_WEBHOOK_URL"):
        monkeypatch.delenv(k, raising=False)

    import models.router as mr
    mr._router = None

    from receptionist.service import stores
    stores.reset_all()

    import app
    return TestClient(app.app, raise_server_exceptions=True)


@pytest.fixture()
def client_no_secret(monkeypatch):
    """TestClient with PIXIE_INTERNAL_API_SECRET unset — dev/test posture."""
    monkeypatch.setenv("PIXIE_INTERNAL_API_SECRET", "")
    monkeypatch.setenv("PIXIE_PERSIST", "memory")
    monkeypatch.setenv("PIXIE_MODEL_MODE", "fake")
    monkeypatch.setenv("PIXIE_LLM_PROVIDER", "")
    monkeypatch.setenv("PIXIE_AGENT_MODE", "test")
    monkeypatch.setenv("PIXIE_EXECUTION_MODE", "mock")
    for k in ("STRIPE_SECRET_KEY", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN",
              "TWILIO_PHONE_NUMBER", "EMAIL_PROVIDER_API_KEY", "AI_RECEPTIONIST_WEBHOOK_URL"):
        monkeypatch.delenv(k, raising=False)

    import models.router as mr
    mr._router = None

    from receptionist.service import stores
    stores.reset_all()

    import app
    return TestClient(app.app, raise_server_exceptions=True)


# Helper: headers that identify as tenantA with the correct secret
def _auth(tenant: str) -> dict:
    return {
        "X-Pixie-Internal-Secret": SECRET,
        "X-Pixie-Tenant": tenant,
    }


# ── test 1: body tenant_id is ignored; header tenant wins ─────────────────────

def test_body_tenant_ignored_header_tenant_wins(client_with_secret):
    """POST with body tenant_id=tenantB but header X-Pixie-Tenant=tenantA.
    The conversation must land under tenantA and be invisible to tenantB.
    """
    # Send a message claiming body tenant=tenantB, but header says tenantA
    r = client_with_secret.post(
        f"{BASE}/message",
        json={"tenant_id": "tenantB", "message": "hi"},
        headers=_auth("tenantA"),
    )
    assert r.status_code == 200, r.text

    # tenantA must see its conversation
    r_a = client_with_secret.get(
        f"{BASE}/conversations",
        headers=_auth("tenantA"),
    )
    assert r_a.status_code == 200
    convs_a = r_a.json()["conversations"]
    assert len(convs_a) == 1, "expected exactly 1 conversation under tenantA"

    # tenantB must see zero conversations (the message was NOT stored there)
    r_b = client_with_secret.get(
        f"{BASE}/conversations",
        headers=_auth("tenantB"),
    )
    assert r_b.status_code == 200
    convs_b = r_b.json()["conversations"]
    assert len(convs_b) == 0, "tenantB must see zero conversations — body spoof rejected"


# ── test 2: missing secret → 401 ─────────────────────────────────────────────

def test_missing_secret_returns_401(client_with_secret):
    """Any request without the correct X-Pixie-Internal-Secret must be rejected."""
    r = client_with_secret.post(
        f"{BASE}/message",
        json={"tenant_id": "tenantA", "message": "hi"},
        # deliberately omit auth headers
    )
    assert r.status_code == 401, f"expected 401 but got {r.status_code}: {r.text}"


def test_wrong_secret_returns_401(client_with_secret):
    """Wrong secret value must also be rejected."""
    r = client_with_secret.post(
        f"{BASE}/message",
        json={"tenant_id": "tenantA", "message": "hi"},
        headers={
            "X-Pixie-Internal-Secret": "wrong-secret",
            "X-Pixie-Tenant": "tenantA",
        },
    )
    assert r.status_code == 401, f"expected 401 but got {r.status_code}: {r.text}"


# ── test 3: correct secret but no X-Pixie-Tenant → 400 ───────────────────────

def test_secret_present_no_tenant_header_returns_400(client_with_secret):
    """Secret matches but X-Pixie-Tenant is missing — must return 400."""
    r = client_with_secret.post(
        f"{BASE}/message",
        json={"tenant_id": "tenantA", "message": "hi"},
        headers={"X-Pixie-Internal-Secret": SECRET},
        # no X-Pixie-Tenant
    )
    assert r.status_code == 400, f"expected 400 but got {r.status_code}: {r.text}"


# ── test 4: cross-tenant read isolation ──────────────────────────────────────

def test_cross_tenant_lead_isolation(client_with_secret):
    """Lead created for tenantA must return 404 when fetched as tenantB."""
    # Create a lead under tenantA by posting a lead-style message
    r = client_with_secret.post(
        f"{BASE}/message",
        json={"tenant_id": "ignored", "message": "Hi, I'm interested. Email: iso@test.com, budget $5000"},
        headers=_auth("tenantA"),
    )
    assert r.status_code == 200, r.text

    # Get the lead list for tenantA
    r_leads = client_with_secret.get(
        f"{BASE}/leads",
        headers=_auth("tenantA"),
    )
    assert r_leads.status_code == 200
    leads_a = r_leads.json()["leads"]
    assert len(leads_a) >= 1, "at least one lead must exist under tenantA"

    lead_id = leads_a[0]["id"]

    # Confirm tenantA can fetch the individual lead
    r_ok = client_with_secret.get(
        f"{BASE}/leads/{lead_id}",
        headers=_auth("tenantA"),
    )
    assert r_ok.status_code == 200

    # tenantB must get 404 for the same lead id
    r_cross = client_with_secret.get(
        f"{BASE}/leads/{lead_id}",
        headers=_auth("tenantB"),
    )
    assert r_cross.status_code == 404, (
        f"cross-tenant read must be 404 but got {r_cross.status_code}: {r_cross.text}"
    )


# ── test 5: verify_stripe_signature unit tests ────────────────────────────────

def _make_sig_header(payload: bytes, secret: str, timestamp: int) -> str:
    signed_payload = f"{timestamp}.".encode() + payload
    sig = hmac.new(secret.encode(), signed_payload, hashlib.sha256).hexdigest()
    return f"t={timestamp},v1={sig}"


def test_valid_stripe_signature_passes():
    payload = b'{"type":"checkout.session.completed"}'
    secret = "whsec_test_secret_abc"
    now_ts = int(time.time())
    header = _make_sig_header(payload, secret, now_ts)
    # Must not raise
    verify_stripe_signature(payload, header, secret, now=float(now_ts))


def test_tampered_stripe_signature_raises():
    payload = b'{"type":"checkout.session.completed"}'
    secret = "whsec_test_secret_abc"
    now_ts = int(time.time())
    # Build a valid header then tamper with the v1 value
    header = _make_sig_header(payload, secret, now_ts)
    tampered = header.replace(header.split("v1=")[1], "0" * 64)
    with pytest.raises(WebhookVerificationError, match="signature mismatch"):
        verify_stripe_signature(payload, tampered, secret, now=float(now_ts))


def test_expired_stripe_signature_raises():
    payload = b'{"type":"checkout.session.completed"}'
    secret = "whsec_test_secret_abc"
    old_ts = int(time.time()) - 400  # 400s in the past, beyond 300s tolerance
    header = _make_sig_header(payload, secret, old_ts)
    with pytest.raises(WebhookVerificationError, match="tolerance"):
        verify_stripe_signature(payload, header, secret)  # uses real time.time()


def test_missing_stripe_secret_raises():
    with pytest.raises(WebhookVerificationError, match="not configured"):
        verify_stripe_signature(b"payload", "t=1,v1=abc", "")


def test_missing_stripe_signature_header_raises():
    with pytest.raises(WebhookVerificationError, match="missing"):
        verify_stripe_signature(b"payload", "", "some_secret")


# ── test 6: dev-mode back-compat (no secret, body tenant_id resolves) ─────────

def test_dev_mode_body_tenant_id_fallback(client_no_secret):
    """When PIXIE_INTERNAL_API_SECRET is unset, resolve_tenant falls back to
    body tenant_id, so the existing hermetic test suite keeps working unchanged."""
    r = client_no_secret.post(
        f"{BASE}/message",
        json={"tenant_id": "dev_tenant_x", "message": "hello from dev"},
    )
    assert r.status_code == 200, r.text

    # The conversation must appear under dev_tenant_x (body fallback)
    r_convs = client_no_secret.get(
        f"{BASE}/conversations",
        params={"tenant_id": "dev_tenant_x"},
    )
    assert r_convs.status_code == 200
    assert len(r_convs.json()["conversations"]) == 1

    # A different tenant sees zero
    r_other = client_no_secret.get(
        f"{BASE}/conversations",
        params={"tenant_id": "other_tenant"},
    )
    assert r_other.status_code == 200
    assert len(r_other.json()["conversations"]) == 0
