"""Wallet projection — derived from the ledger, reconcilable, no silent mutation."""

from __future__ import annotations

import pytest

from credits import ledger, wallet
from credits.ledger import LedgerEntry, LedgerEntryType, get_ledger_repository


@pytest.fixture(autouse=True)
def _clean(monkeypatch):
    monkeypatch.delenv("PIXIE_PERSIST", raising=False)
    ledger.reset_ledger_repository()
    wallet.reset_wallet_repository()
    yield
    ledger.reset_ledger_repository()
    wallet.reset_wallet_repository()


def _append(**kw):
    kw.setdefault("tenant_id", "ws_A")
    return get_ledger_repository().append(LedgerEntry(**kw))


def test_projection_matches_ledger_lifecycle():
    _append(entry_type=LedgerEntryType.GRANT, amount_mc=5000, idempotency_key="g")
    _append(entry_type=LedgerEntryType.PURCHASE, amount_mc=2000, idempotency_key="p")
    _append(entry_type=LedgerEntryType.RESERVATION, amount_mc=-1300, reserved_delta_mc=1300, idempotency_key="r")
    _append(entry_type=LedgerEntryType.SETTLEMENT, amount_mc=300, reserved_delta_mc=-1300, idempotency_key="s")
    w = wallet.project("ws_A")
    assert w.available_mc == 6000            # 5000 + 2000 - 1300 + 300
    assert w.reserved_mc == 0
    assert w.lifetime_granted_mc == 5000
    assert w.lifetime_purchased_mc == 2000
    assert w.lifetime_consumed_mc == 1000    # reserved 1300, unused 300 → 1000 consumed
    assert w.ledger_checkpoint == 4


def test_refresh_caches_projection():
    _append(entry_type=LedgerEntryType.GRANT, amount_mc=5000, idempotency_key="g")
    w = wallet.get_wallet_repository().refresh("ws_A", plan_id="pro")
    assert w.available_mc == 5000 and w.plan_id == "pro"
    cached = wallet.get_wallet_repository().get_cached("ws_A")
    assert cached and cached.available_mc == 5000 and cached.plan_id == "pro"


def test_reconcile_detects_divergence_and_only_repairs_on_request():
    _append(entry_type=LedgerEntryType.GRANT, amount_mc=5000, idempotency_key="g")
    repo = wallet.get_wallet_repository()
    repo.refresh("ws_A")  # cache in sync
    # ledger grows without a cache refresh → cache is now stale
    _append(entry_type=LedgerEntryType.GRANT, amount_mc=1000, idempotency_key="g2")
    report = repo.reconcile("ws_A", repair=False)
    assert report["diverged"] is True
    assert report["cached_available_mc"] == 5000 and report["ledger_available_mc"] == 6000
    assert report["repaired"] is False
    # cache still stale (no silent mutation)
    assert repo.get_cached("ws_A").available_mc == 5000
    # repair mode fixes it from the ledger
    fixed = repo.reconcile("ws_A", repair=True)
    assert fixed["repaired"] is True
    assert repo.get_cached("ws_A").available_mc == 6000


def test_reconcile_reports_no_divergence_when_in_sync():
    _append(entry_type=LedgerEntryType.GRANT, amount_mc=5000, idempotency_key="g")
    repo = wallet.get_wallet_repository()
    repo.refresh("ws_A")
    assert repo.reconcile("ws_A")["diverged"] is False


def test_balances_helper_reads_ledger_truth():
    _append(entry_type=LedgerEntryType.GRANT, amount_mc=4000, idempotency_key="g")
    _append(entry_type=LedgerEntryType.RESERVATION, amount_mc=-1000, reserved_delta_mc=1000, idempotency_key="r")
    assert wallet.balances("ws_A") == (3000, 1000)


def test_tenant_isolation_of_wallet():
    _append(tenant_id="ws_A", entry_type=LedgerEntryType.GRANT, amount_mc=5000, idempotency_key="a")
    _append(tenant_id="ws_B", entry_type=LedgerEntryType.GRANT, amount_mc=100, idempotency_key="b")
    assert wallet.project("ws_A").available_mc == 5000
    assert wallet.project("ws_B").available_mc == 100
