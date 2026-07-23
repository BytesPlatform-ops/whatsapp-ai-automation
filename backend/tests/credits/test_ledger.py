"""Immutable credit ledger — append-only, idempotent, tenant-isolated."""

from __future__ import annotations

import pytest

from credits import ledger
from credits.ledger import LedgerEntry, LedgerEntryType, LedgerError, get_ledger_repository


@pytest.fixture(autouse=True)
def _clean(monkeypatch):
    monkeypatch.delenv("PIXIE_PERSIST", raising=False)
    ledger.reset_ledger_repository()
    yield
    ledger.reset_ledger_repository()


def _grant(tenant="ws_A", amount=5000, key="grant-1"):
    return get_ledger_repository().append(LedgerEntry(
        tenant_id=tenant, entry_type=LedgerEntryType.GRANT, amount_mc=amount,
        reason_code="plan_included", idempotency_key=key, pricing_version="2026-07-01"))


def test_grant_increases_available():
    _grant()
    avail, reserved = get_ledger_repository().balances("ws_A")
    assert avail == 5000 and reserved == 0


def test_reservation_moves_available_to_reserved():
    _grant()
    get_ledger_repository().append(LedgerEntry(
        tenant_id="ws_A", entry_type=LedgerEntryType.RESERVATION,
        amount_mc=-1300, reserved_delta_mc=1300, idempotency_key="res-1"))
    avail, reserved = get_ledger_repository().balances("ws_A")
    assert avail == 3700 and reserved == 1300
    assert avail + reserved == 5000  # owned unchanged by a reservation


def test_settlement_consumes_and_releases_unused():
    _grant()
    repo = get_ledger_repository()
    repo.append(LedgerEntry(tenant_id="ws_A", entry_type=LedgerEntryType.RESERVATION,
                            amount_mc=-1300, reserved_delta_mc=1300, idempotency_key="res-1"))
    # settle: consumed 1000, unused 300 returns to available
    repo.append(LedgerEntry(tenant_id="ws_A", entry_type=LedgerEntryType.SETTLEMENT,
                            amount_mc=300, reserved_delta_mc=-1300, idempotency_key="set-1",
                            reservation_id="res-1"))
    avail, reserved = repo.balances("ws_A")
    assert reserved == 0 and avail == 4000  # 5000 - 1000 consumed


def test_idempotent_append_returns_same_entry():
    a_id, _ = _grant(key="dup")
    b_id, _ = _grant(key="dup")  # replay
    assert a_id == b_id
    # only one entry actually stored
    assert len([e for _i, e in get_ledger_repository().list("ws_A")]) == 1


def test_positive_only_type_rejects_negative_amount():
    with pytest.raises(LedgerError):
        get_ledger_repository().append(LedgerEntry(
            tenant_id="ws_A", entry_type=LedgerEntryType.GRANT, amount_mc=-100, idempotency_key="bad"))


def test_tenant_isolation():
    _grant(tenant="ws_A", key="a")
    _grant(tenant="ws_B", amount=999, key="b")
    assert get_ledger_repository().balances("ws_A")[0] == 5000
    assert get_ledger_repository().balances("ws_B")[0] == 999
    # ws_B idempotency key namespace is separate from ws_A
    assert get_ledger_repository().find_by_idempotency("ws_A", "b") is None


def test_no_update_or_delete_surface():
    # The repository must not expose mutation of history.
    repo = get_ledger_repository()
    assert not hasattr(repo, "update")
    assert not hasattr(repo, "delete")


def test_refund_is_a_compensating_entry_not_an_edit():
    g_id, _ = _grant()
    repo = get_ledger_repository()
    # consume via settlement of a reservation
    repo.append(LedgerEntry(tenant_id="ws_A", entry_type=LedgerEntryType.RESERVATION,
                            amount_mc=-1000, reserved_delta_mc=1000, idempotency_key="r"))
    repo.append(LedgerEntry(tenant_id="ws_A", entry_type=LedgerEntryType.SETTLEMENT,
                            amount_mc=0, reserved_delta_mc=-1000, idempotency_key="s", reservation_id="r"))
    assert repo.balances("ws_A")[0] == 4000
    # refund the consumed 1000 as a NEW entry referencing the original
    repo.append(LedgerEntry(tenant_id="ws_A", entry_type=LedgerEntryType.REFUND, amount_mc=1000,
                            original_txn_id="s", reason_code="provider_partial_failure", idempotency_key="ref"))
    assert repo.balances("ws_A")[0] == 5000
    # original grant entry is untouched
    assert repo.get("ws_A", g_id)[1].amount_mc == 5000
    # history now has 4 entries (grant, reservation, settlement, refund)
    assert len(repo.list("ws_A")) == 4


def test_no_secrets_field_shape():
    _id, e = _grant()
    dumped = e.model_dump()
    assert "metadata" in dumped and dumped["metadata"] == {}
    assert "token" not in str(dumped).lower() and "secret" not in str(dumped).lower()
