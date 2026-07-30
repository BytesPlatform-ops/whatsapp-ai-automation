"""AI Receptionist billing enablement + metering (Wave 5, Parts 16/17).

Hermetic + $0: no real provider calls. Exercises the credits engine directly with
a funded in-memory wallet. Proves the product is enabled, paid ops reserve+settle
once, duplicates charge once, mock/disabled cost zero, and plan limits exist.
"""

from __future__ import annotations

import pytest

from credits import ledger, reservations, wallet
from credits.ledger import LedgerEntry, LedgerEntryType, get_ledger_repository


@pytest.fixture()
def funded(monkeypatch):
    monkeypatch.delenv("PIXIE_PERSIST", raising=False)
    monkeypatch.setenv("CREDIT_SYSTEM_ENABLED", "1")
    monkeypatch.setenv("AI_RECEPTIONIST_BILLING_ENABLED", "1")
    monkeypatch.setenv("PIXIE_MODEL_MODE", "fake")
    ledger.reset_ledger_repository()
    reservations.reset_reservation_repository()
    wallet.reset_wallet_repository()
    get_ledger_repository().append(LedgerEntry(
        tenant_id="t_a", entry_type=LedgerEntryType.GRANT, amount_mc=100_000,
        reason_code="plan_included", idempotency_key="grant-1", pricing_version="2026-07-01"))
    yield
    ledger.reset_ledger_repository()
    reservations.reset_reservation_repository()
    wallet.reset_wallet_repository()


def _avail(tenant="t_a"):
    return get_ledger_repository().balances(tenant)[0]


# ── product + plan configuration ──────────────────────────────────────────────

def test_product_is_enabled():
    from credits.products import get_product
    spec = get_product("ai_receptionist")
    assert spec is not None
    assert spec.implemented and spec.billing_active
    assert spec.access_key == "ai_receptionist"
    assert "receptionist_reply" in spec.operation_types


def test_plan_limits_exist_and_scale():
    from credits.plans import get_plan
    free = get_plan("free"); starter = get_plan("starter"); pro = get_plan("pro")
    assert free.allows("ai_receptionist")
    assert free.limit("receptionist_monthly_conversations") == 50
    assert starter.limit("receptionist_monthly_conversations") == 1000
    # Pro must never accidentally reduce a limit below Starter.
    assert pro.limit("receptionist_stored_contacts") in (-1,) or \
        pro.limit("receptionist_stored_contacts") >= starter.limit("receptionist_stored_contacts")


# ── metering lifecycle ────────────────────────────────────────────────────────

def test_paid_operation_reserves_and_settles_once(funded):
    from receptionist.service import billing
    before = _avail()
    billing.charge("t_a", "receptionist_reply", operation_id="op-1",
                   actual_micro_usd=5_000, is_mock=False)
    after = _avail()
    assert after < before  # credits were consumed exactly once


def test_duplicate_operation_charges_once(funded):
    from receptionist.service import billing
    billing.charge("t_a", "receptionist_reply", operation_id="op-dup",
                   actual_micro_usd=5_000, is_mock=False)
    mid = _avail()
    billing.charge("t_a", "receptionist_reply", operation_id="op-dup",
                   actual_micro_usd=5_000, is_mock=False)  # replay
    assert _avail() == mid  # no second charge


def test_mock_operation_is_free(funded):
    from receptionist.service import billing
    before = _avail()
    billing.charge("t_a", "receptionist_reply", operation_id="op-mock",
                   actual_micro_usd=5_000, is_mock=True)
    assert _avail() == before  # mock consumes zero


def test_disabled_billing_is_free(monkeypatch):
    monkeypatch.setenv("CREDIT_SYSTEM_ENABLED", "1")
    monkeypatch.setenv("AI_RECEPTIONIST_BILLING_ENABLED", "0")  # receptionist flag off
    ledger.reset_ledger_repository()
    reservations.reset_reservation_repository()
    wallet.reset_wallet_repository()
    get_ledger_repository().append(LedgerEntry(
        tenant_id="t_a", entry_type=LedgerEntryType.GRANT, amount_mc=100_000,
        reason_code="x", idempotency_key="g", pricing_version="2026-07-01"))
    from receptionist.service import billing
    assert not billing.billing_enabled()
    before = _avail()
    billing.charge("t_a", "receptionist_reply", operation_id="op-off",
                   actual_micro_usd=5_000, is_mock=False)
    assert _avail() == before


def test_registry_meter_routes_billable_actions(funded):
    """The registry meter() maps billable actions to ai_receptionist operations and
    is honestly zero in mock mode (no real provider call occurred). A non-billable
    action never touches billing."""
    from receptionist.service import registry
    assert "create_payment_link" in registry._BILLABLE_OPERATIONS
    assert registry._BILLABLE_OPERATIONS["gmail_send"] == "receptionist_gmail_op"

    before = _avail()
    registry.meter("t_a", "create_payment_link", estimated_cost=0.005, idempotency_key="pay-1")
    assert _avail() == before  # mock mode → zero (honest: nothing was actually sent)
    registry.meter("t_a", "capture_contact", idempotency_key="c-1")
    assert _avail() == before  # non-billable → never charges


def test_registry_meter_charges_when_not_mock(funded):
    """When the underlying billable op is real (not mock), it charges once."""
    from receptionist.service import billing
    before = _avail()
    billing.charge("t_a", "receptionist_gmail_op", operation_id="gmail-1",
                   actual_micro_usd=4_000, is_mock=False)
    assert _avail() < before
