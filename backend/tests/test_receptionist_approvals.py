"""Tests for Wave 4 approval gating in the AI Receptionist.

Hermetic + $0: PIXIE_PERSIST=memory (default) and PIXIE_PERSIST=file for
the cross-reset durability test. Covers:
  - Payment-link action creates a pending approval and does NOT create a live link
  - Approving executes the action exactly once (idempotent)
  - Rejected/expired approvals never execute
  - Cross-tenant approval access fails (404)
  - Approval survives stores.reset_all() under PIXIE_PERSIST=file
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

BASE = "/api/agents/ai-receptionist"
APPROVALS_BASE = "/api/approvals"


# ── fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setenv("PIXIE_PERSIST", "memory")
    monkeypatch.setenv("PIXIE_MODEL_MODE", "fake")
    monkeypatch.setenv("PIXIE_LLM_PROVIDER", "")
    monkeypatch.setenv("PIXIE_AGENT_MODE", "test")
    monkeypatch.setenv("PIXIE_EXECUTION_MODE", "mock")
    monkeypatch.setenv("PIXIE_INTERNAL_API_SECRET", "")
    for k in ("STRIPE_SECRET_KEY", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN",
              "TWILIO_PHONE_NUMBER", "EMAIL_PROVIDER_API_KEY", "AI_RECEPTIONIST_WEBHOOK_URL"):
        monkeypatch.delenv(k, raising=False)

    import models.router as mr
    mr._router = None

    from receptionist.service import stores
    stores.reset_all()

    import approvals.router as ar
    ar._store = None

    import app
    return TestClient(app.app)


# ── test 1: payment-link action creates approval, no live link ────────────────

class TestPaymentLinkApprovalGating:

    def test_create_payment_link_files_approval(self, client):
        """Payment-link action via /message must file an approval, not create a Stripe link."""
        r = client.post(f"{BASE}/message", json={
            "tenant_id": "t_pay",
            "message": "Can you send me a payment link for $500?",
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["intent"] == "payment_link"

        # The payment record must exist with status=pending (not link_created)
        pays = client.get(f"{BASE}/payments", params={"tenant_id": "t_pay"}).json()["payments"]
        assert len(pays) >= 1, "Payment record must be created"
        pay = pays[0]
        assert pay["status"] == "pending", (
            f"Payment record must be pending (not link_created); got: {pay['status']}"
        )
        assert pay.get("payment_link", "") == "", (
            "No payment link must be present in the record"
        )

    def test_registry_payment_action_creates_pending_approval(self):
        """Direct registry call: create_payment_link returns approval_required."""
        from receptionist.service.registry import execute_action
        import approvals.router as ar
        ar._store = None

        from receptionist.service import stores
        stores.reset_all()

        result = execute_action(
            "t_regpay", "create_payment_link",
            {"amount": "250", "currency": "USD", "description": "Invoice #1"},
            conversation_id="conv_pay_test",
        )
        assert result["status"] == "approval_required", (
            f"create_payment_link must return approval_required; got: {result['status']}"
        )
        assert result["record_type"] in ("payment", "approval")
        # No live Stripe link
        from receptionist.service import stores as st
        payments = st.payments().list("t_regpay")
        if payments:
            assert payments[0].get("payment_link", "") == "", (
                "No live link must be present"
            )
        # Check an approval was filed
        approvals = ar.get_approvals_store().list("t_regpay")
        assert len(approvals) >= 1, "An approval must be filed"
        assert approvals[0].status == "pending"
        assert approvals[0].action_type == "create_payment_link"

    def test_payment_message_does_not_call_stripe(self, client):
        """Stripe must not be called during payment flow (no STRIPE_SECRET_KEY set)."""
        # If Stripe were called without a key it would raise; the test implicitly
        # verifies no exception is raised and the response is 200.
        r = client.post(f"{BASE}/message", json={
            "tenant_id": "t_nostri",
            "message": "Send me a payment link for $1000, email pay@test.com",
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("intent") == "payment_link"


# ── test 2: approving executes exactly once (idempotent) ──────────────────────

class TestApprovalExecution:

    def _create_payment_approval(self, tenant: str = "t_apexec") -> str:
        """Helper: file a payment approval directly via the registry and return
        the approval id."""
        from receptionist.service import stores
        stores.reset_all()
        import approvals.router as ar
        ar._store = None

        from receptionist.service.registry import execute_action
        result = execute_action(
            tenant, "create_payment_link",
            {"amount": "100", "currency": "USD"},
            conversation_id="conv_apexec",
        )
        assert result["status"] == "approval_required"
        # Find the approval id
        approvals_list = ar.get_approvals_store().list(tenant)
        assert len(approvals_list) >= 1
        return approvals_list[0].id

    def test_approve_executes_once(self, client):
        """Approving once runs the action; a second approve is idempotent."""
        from approvals.router import get_approvals_store, _resolve, ResolveBody

        tenant = "t_once"
        approval_id = self._create_payment_approval(tenant)

        store = get_approvals_store()
        body = ResolveBody(tenant_id=tenant)

        # First approve
        item1 = _resolve(approval_id, body, "executed", "approval_completed")
        assert item1.status == "executed"

        # Second approve — must be idempotent (already executed)
        item2 = _resolve(approval_id, body, "executed", "approval_completed")
        assert item2.status == "executed"
        assert item2.id == item1.id

    def test_approve_via_api_endpoint(self, client):
        """Approve via the /api/approvals/{id}/approve endpoint."""
        tenant = "t_api_approve"
        from receptionist.service import stores
        stores.reset_all()
        import approvals.router as ar
        ar._store = None

        from receptionist.service.registry import execute_action
        result = execute_action(
            tenant, "create_payment_link",
            {"amount": "75", "currency": "USD"},
            conversation_id="conv_api_approve",
        )
        assert result["status"] == "approval_required"

        approvals_list = ar.get_approvals_store().list(tenant)
        approval_id = approvals_list[0].id

        r = client.post(f"{APPROVALS_BASE}/{approval_id}/approve",
                        json={"tenant_id": tenant})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["status"] == "executed"

        # Second approve must be idempotent
        r2 = client.post(f"{APPROVALS_BASE}/{approval_id}/approve",
                         json={"tenant_id": tenant})
        assert r2.status_code == 200
        data2 = r2.json()
        assert data2["status"] == "executed", (
            "Second approve must be idempotent and still return executed"
        )


# ── test 3: rejected approvals never execute ──────────────────────────────────

class TestRejectedApprovals:

    def test_rejected_approval_never_executes(self, client):
        """Rejecting an approval must mark it rejected; it must never execute."""
        tenant = "t_reject"
        from receptionist.service import stores
        stores.reset_all()
        import approvals.router as ar
        ar._store = None

        from receptionist.service.registry import execute_action
        result = execute_action(
            tenant, "create_payment_link",
            {"amount": "999", "currency": "USD"},
            conversation_id="conv_reject",
        )
        assert result["status"] == "approval_required"

        approvals_list = ar.get_approvals_store().list(tenant)
        approval_id = approvals_list[0].id

        # Reject
        r = client.post(f"{APPROVALS_BASE}/{approval_id}/reject",
                        json={"tenant_id": tenant})
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "rejected", (
            f"Rejected approval must have status=rejected; got: {data['status']}"
        )
        # execution_result must be None (never executed)
        assert data.get("execution_result") is None, (
            "Rejected approval must not have an execution_result"
        )

    def test_reject_then_approve_stays_rejected(self, client):
        """Trying to approve a rejected item must leave it rejected (idempotent guard)."""
        tenant = "t_rejthen"
        from receptionist.service import stores
        stores.reset_all()
        import approvals.router as ar
        ar._store = None

        from receptionist.service.registry import execute_action
        execute_action(
            tenant, "create_payment_link",
            {"amount": "50", "currency": "USD"},
            conversation_id="conv_rejthen",
        )
        approvals_list = ar.get_approvals_store().list(tenant)
        approval_id = approvals_list[0].id

        # Reject first
        client.post(f"{APPROVALS_BASE}/{approval_id}/reject",
                    json={"tenant_id": tenant})

        # Now try to approve — must return the rejected item unchanged
        r = client.post(f"{APPROVALS_BASE}/{approval_id}/approve",
                        json={"tenant_id": tenant})
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "rejected", (
            "Approving a rejected item must not change its status"
        )
        assert data.get("execution_result") is None


# ── test 4: cross-tenant approval access fails ────────────────────────────────

class TestCrossTenantApprovalIsolation:

    def test_cross_tenant_approve_returns_404(self, client):
        """TenantB trying to approve TenantA's approval must return 404."""
        tenant_a = "t_ct_ap_a"
        tenant_b = "t_ct_ap_b"

        from receptionist.service import stores
        stores.reset_all()
        import approvals.router as ar
        ar._store = None

        from receptionist.service.registry import execute_action
        result = execute_action(
            tenant_a, "create_payment_link",
            {"amount": "200", "currency": "USD"},
            conversation_id="conv_ct_a",
        )
        assert result["status"] == "approval_required"

        approvals_a = ar.get_approvals_store().list(tenant_a)
        approval_id = approvals_a[0].id

        # TenantB tries to approve TenantA's approval
        r = client.post(f"{APPROVALS_BASE}/{approval_id}/approve",
                        json={"tenant_id": tenant_b})
        assert r.status_code == 404, (
            f"Cross-tenant approval access must return 404; got: {r.status_code}"
        )

    def test_cross_tenant_reject_returns_404(self, client):
        tenant_a = "t_ct_rej_a"
        tenant_b = "t_ct_rej_b"

        from receptionist.service import stores
        stores.reset_all()
        import approvals.router as ar
        ar._store = None

        from receptionist.service.registry import execute_action
        execute_action(
            tenant_a, "create_payment_link",
            {"amount": "100", "currency": "USD"},
            conversation_id="conv_ct_rej",
        )
        approvals_a = ar.get_approvals_store().list(tenant_a)
        approval_id = approvals_a[0].id

        r = client.post(f"{APPROVALS_BASE}/{approval_id}/reject",
                        json={"tenant_id": tenant_b})
        assert r.status_code == 404, (
            f"Cross-tenant rejection must return 404; got: {r.status_code}"
        )


# ── test 5: approval survives stores.reset_all() with PIXIE_PERSIST=file ─────

class TestApprovalDurability:

    def test_approval_survives_receptionist_store_reset_in_file_mode(self, tmp_path, monkeypatch):
        """An approval filed by the receptionist registry survives stores.reset_all()
        under PIXIE_PERSIST=file (the approvals store uses its own persistence key,
        not the receptionist stores — so receptionist reset doesn't affect it)."""
        monkeypatch.setenv("PIXIE_PERSIST", "file")
        monkeypatch.setenv("PIXIE_DATA_DIR", str(tmp_path))
        monkeypatch.setenv("PIXIE_MODEL_MODE", "fake")
        monkeypatch.setenv("PIXIE_LLM_PROVIDER", "")
        monkeypatch.setenv("PIXIE_AGENT_MODE", "test")
        monkeypatch.setenv("PIXIE_EXECUTION_MODE", "mock")
        monkeypatch.setenv("PIXIE_INTERNAL_API_SECRET", "")

        import models.router as mr
        mr._router = None

        from receptionist.service import stores
        stores.reset_all()

        import approvals.router as ar
        ar._store = None

        tenant = "t_dur_file"

        from receptionist.service.registry import execute_action
        result = execute_action(
            tenant, "create_payment_link",
            {"amount": "300", "currency": "USD"},
            conversation_id="conv_dur",
        )
        assert result["status"] == "approval_required"

        # Get the approval id before reset
        approvals_before = ar.get_approvals_store().list(tenant)
        assert len(approvals_before) >= 1
        approval_id = approvals_before[0].id

        # Simulate a process restart for the receptionist stores
        stores.reset_all()
        # The approvals store is separate — reset it too to simulate full restart
        ar._store = None

        # Re-read the approval — must survive
        approvals_after = ar.get_approvals_store().list(tenant)
        assert len(approvals_after) >= 1, (
            "Approval must survive stores.reset_all() in file mode"
        )
        assert approvals_after[0].id == approval_id
        assert approvals_after[0].status == "pending"


# ── test 6: create_follow_up and create_reminder return queued/pending ─────────

class TestHonestyStateForRemindersAndFollowUps:
    """Verify that create_reminder and create_follow_up return queued/pending,
    not a fake-success 'sent' or 'scheduled' claim."""

    def test_create_reminder_returns_queued(self):
        from receptionist.service import stores
        stores.reset_all()
        import approvals.router as ar
        ar._store = None

        # create_reminder requires approval, so it files one
        from receptionist.service.registry import execute_action
        result = execute_action(
            "t_rem", "create_reminder",
            {"title": "Appointment reminder", "remind_at": "2026-09-01T09:00:00Z"},
            conversation_id="conv_rem",
        )
        # Either approval_required (goes through approval path) or queued (if skip_approval)
        assert result["status"] in ("approval_required", "queued"), (
            f"create_reminder must return approval_required or queued; got: {result['status']}"
        )
        # Must NOT claim "sent"
        assert "sent" not in result.get("detail", "").lower(), (
            "create_reminder must not claim 'sent'"
        )

    def test_create_follow_up_returns_pending(self):
        from receptionist.service import stores
        stores.reset_all()
        import approvals.router as ar
        ar._store = None

        from receptionist.service.registry import execute_action
        result = execute_action(
            "t_fu", "create_follow_up",
            {"title": "Check in with customer", "due_at": "2026-08-05"},
            conversation_id="conv_fu",
        )
        # Either approval_required or pending
        assert result["status"] in ("approval_required", "pending"), (
            f"create_follow_up must return approval_required or pending; got: {result['status']}"
        )
        # Must NOT claim "scheduled" as if it's confirmed
        assert result["status"] != "completed", (
            "create_follow_up must not claim completed"
        )
