"""Reservation → settlement / release / refund — the money-safety core."""

from __future__ import annotations

import pytest

from credits import ledger, reservations, service, wallet
from credits.ledger import LedgerEntryType
from credits.reservations import ReservationStatus, get_reservation_repository


@pytest.fixture(autouse=True)
def _clean(monkeypatch):
    monkeypatch.delenv("PIXIE_PERSIST", raising=False)
    monkeypatch.delenv("ALLOW_NEGATIVE_CREDITS", raising=False)
    ledger.reset_ledger_repository()
    wallet.reset_wallet_repository()
    reservations.reset_reservation_repository()
    yield
    ledger.reset_ledger_repository()
    wallet.reset_wallet_repository()
    reservations.reset_reservation_repository()


def _fund(tenant="ws_A", amount=5000):
    service.grant(tenant, amount, reason_code="test_seed", idempotency_key=f"seed:{tenant}:{amount}")


def _reserve(tenant="ws_A", key="op-1", mc=1300, **kw):
    return service.reserve(tenant, operation_type="content_text", source_product="content_agent",
                           source_object_id="doc1", max_reserved_mc=mc, idempotency_key=key, **kw)


# ── reserve ─────────────────────────────────────────────────────────────────────
def test_reserve_holds_credits():
    _fund()
    rid, r = _reserve()
    assert r.status == ReservationStatus.ACTIVE.value
    assert wallet.balances("ws_A") == (3700, 1300)


def test_reserve_is_idempotent_one_action_one_hold():
    _fund()
    a, _ = _reserve(key="dup")
    b, _ = _reserve(key="dup")
    assert a == b
    # available only decremented once
    assert wallet.balances("ws_A") == (3700, 1300)


def test_insufficient_credits_blocks_before_provider_call():
    _fund(amount=1000)
    with pytest.raises(service.CreditError) as ei:
        _reserve(mc=1300)
    assert ei.value.code == "insufficient_credits" and ei.value.http_status == 402
    # nothing reserved
    assert wallet.balances("ws_A") == (1000, 0)


def test_allow_negative_flag_permits_overdraw(monkeypatch):
    monkeypatch.setenv("ALLOW_NEGATIVE_CREDITS", "true")
    _fund(amount=100)
    _reserve(mc=1300)  # would go negative — allowed only under the explicit flag
    assert wallet.balances("ws_A")[0] == -1200


# ── settle ──────────────────────────────────────────────────────────────────────
def test_settle_charges_actual_and_releases_unused():
    _fund()
    rid, _ = _reserve(mc=1300)  # reserved 1300
    # actual provider cost $0.007 = 7000 µUSD → 7000*1.3/10000 = 0.91 → ceil 910 mc
    service.settle("ws_A", rid, actual_provider_micro_usd=7000)
    avail, reserved = wallet.balances("ws_A")
    assert reserved == 0
    assert avail == 5000 - 910  # only actual charged; 390 unused returned
    _, r = get_reservation_repository().get("ws_A", rid)
    assert r.status == ReservationStatus.SETTLED.value and r.settled_mc == 910


def test_settle_is_idempotent_no_double_charge():
    _fund()
    rid, _ = _reserve(mc=1300)
    service.settle("ws_A", rid, settle_mc=1000)
    service.settle("ws_A", rid, settle_mc=1000)  # replayed provider callback
    assert wallet.balances("ws_A") == (4000, 0)  # charged once


def test_settle_never_exceeds_reservation_and_flags_anomaly():
    _fund()
    rid, _ = _reserve(mc=1000)
    # actual would be 1500 mc but only 1000 was reserved → charge 1000, flag anomaly
    service.settle("ws_A", rid, settle_mc=1500)
    _, r = get_reservation_repository().get("ws_A", rid)
    assert r.settled_mc == 1000 and r.anomaly == "under_reserved"
    assert wallet.balances("ws_A") == (4000, 0)  # never deducted more than reserved


# ── release ─────────────────────────────────────────────────────────────────────
def test_release_returns_full_hold():
    _fund()
    rid, _ = _reserve(mc=1300)
    service.release("ws_A", rid, reason_code=service.REASON_PROVIDER_REJECTED)
    assert wallet.balances("ws_A") == (5000, 0)  # fully restored
    _, r = get_reservation_repository().get("ws_A", rid)
    assert r.status == ReservationStatus.RELEASED.value and r.reason_code == "provider_rejected"


def test_release_is_idempotent():
    _fund()
    rid, _ = _reserve(mc=1300)
    service.release("ws_A", rid, reason_code=service.REASON_PROVIDER_TIMEOUT_UNBILLED)
    service.release("ws_A", rid, reason_code=service.REASON_PROVIDER_TIMEOUT_UNBILLED)
    assert wallet.balances("ws_A") == (5000, 0)


def test_cannot_release_after_settle():
    _fund()
    rid, _ = _reserve(mc=1300)
    service.settle("ws_A", rid, settle_mc=1000)
    service.release("ws_A", rid, reason_code=service.REASON_PROVIDER_REJECTED)  # no-op (terminal)
    assert wallet.balances("ws_A") == (4000, 0)  # settlement stands


# ── refund ──────────────────────────────────────────────────────────────────────
def test_refund_is_compensating_and_idempotent():
    _fund()
    rid, _ = _reserve(mc=1300)
    service.settle("ws_A", rid, settle_mc=1000)  # consumed 1000
    assert wallet.balances("ws_A")[0] == 4000
    service.refund("ws_A", amount_mc=1000, reason_code=service.REASON_PROVIDER_PARTIAL_FAILURE, reservation_id=rid)
    service.refund("ws_A", amount_mc=1000, reason_code=service.REASON_PROVIDER_PARTIAL_FAILURE, reservation_id=rid)
    assert wallet.balances("ws_A")[0] == 5000  # refunded once, not twice
    _, r = get_reservation_repository().get("ws_A", rid)
    assert r.status == ReservationStatus.REFUNDED.value


# ── cross-tenant safety ─────────────────────────────────────────────────────────
def test_cannot_settle_another_tenants_reservation():
    _fund("ws_A")
    rid, _ = _reserve("ws_A", key="a", mc=1000)
    with pytest.raises(service.CreditError) as ei:
        service.settle("ws_B", rid, settle_mc=500)  # wrong tenant
    assert ei.value.code == "not_found"
    # ws_A reservation untouched
    _, r = get_reservation_repository().get("ws_A", rid)
    assert r.status == ReservationStatus.ACTIVE.value


def test_grant_replayed_webhook_does_not_double_grant():
    service.grant("ws_A", 5000, entry_type=LedgerEntryType.MONTHLY_RESET,
                  reason_code="plan_included", idempotency_key="inv_123")
    service.grant("ws_A", 5000, entry_type=LedgerEntryType.MONTHLY_RESET,
                  reason_code="plan_included", idempotency_key="inv_123")  # replay
    assert wallet.balances("ws_A")[0] == 5000
