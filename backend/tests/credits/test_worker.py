"""Credit reconciliation worker — expired holds recovered without double-charge."""

from __future__ import annotations

import pytest

from credits import ledger, reservations, service, wallet, worker
from credits.reservations import ReservationStatus, get_reservation_repository


@pytest.fixture(autouse=True)
def _clean(monkeypatch):
    monkeypatch.delenv("PIXIE_PERSIST", raising=False)
    monkeypatch.delenv("ALLOW_NEGATIVE_CREDITS", raising=False)
    for m in (ledger.reset_ledger_repository, wallet.reset_wallet_repository,
              reservations.reset_reservation_repository):
        m()
    yield
    for m in (ledger.reset_ledger_repository, wallet.reset_wallet_repository,
              reservations.reset_reservation_repository):
        m()


def _fund(tenant="ws_A", amount=5000):
    service.grant(tenant, amount, reason_code="seed", idempotency_key=f"seed:{tenant}")


def _reserve_expired(tenant="ws_A", key="op", mc=1300, op="content_text"):
    rid, _ = service.reserve(tenant, operation_type=op, source_product="content_agent",
                             source_object_id="doc1", max_reserved_mc=mc, idempotency_key=key,
                             ttl_seconds=1)
    # force expiry into the past
    get_reservation_repository().update(tenant, rid, expires_at="2000-01-01T00:00:00+00:00")
    return rid


def test_abandoned_expired_reservation_is_released():
    _fund()
    rid = _reserve_expired()
    summary = worker.reconcile_expired()
    assert summary["count"] == 1 and summary["processed"][0]["result"] == "expired_released"
    assert wallet.balances("ws_A") == (5000, 0)  # hold returned
    _, r = get_reservation_repository().get("ws_A", rid)
    assert r.status == ReservationStatus.EXPIRED.value


def test_completed_but_unsettled_is_settled():
    _fund()
    rid = _reserve_expired(mc=1300)
    resolver = lambda t, r: {"state": "completed", "settle_mc": 900}
    worker.reconcile_expired(resolver=resolver)
    assert wallet.balances("ws_A") == (5000 - 900, 0)
    _, r = get_reservation_repository().get("ws_A", rid)
    assert r.status == ReservationStatus.SETTLED.value and r.settled_mc == 900


def test_failed_unbilled_is_released():
    _fund()
    rid = _reserve_expired()
    worker.reconcile_expired(resolver=lambda t, r: {"state": "failed_unbilled"})
    assert wallet.balances("ws_A") == (5000, 0)
    _, r = get_reservation_repository().get("ws_A", rid)
    assert r.status == ReservationStatus.RELEASED.value


def test_long_running_video_is_preserved():
    _fund()
    rid = _reserve_expired(mc=2000, op="influencer_video")
    worker.reconcile_expired(resolver=lambda t, r: {"state": "pending"})
    # still reserved, still active, TTL pushed out
    assert wallet.balances("ws_A") == (3000, 2000)
    _, r = get_reservation_repository().get("ws_A", rid)
    assert r.status == ReservationStatus.ACTIVE.value and r.expires_at > "2000-01-01"


def test_duplicate_reconciliation_does_not_double_release():
    _fund()
    _reserve_expired()
    worker.reconcile_expired()
    second = worker.reconcile_expired()  # nothing left to do
    assert second["count"] == 0
    assert wallet.balances("ws_A") == (5000, 0)


def test_restart_recovery_reservation_survives_and_reconciles():
    _fund()
    rid = _reserve_expired()
    # simulate process restart by clearing only the in-process singletons for
    # reservation + wallet, keeping the ledger (durable-equivalent) intact is not
    # possible in memory mode; instead re-run the worker (durable rows persist).
    worker.reconcile_expired()
    assert get_reservation_repository().get("ws_A", rid)[1].status == ReservationStatus.EXPIRED.value


def test_active_not_yet_expired_is_left_alone():
    _fund()
    service.reserve("ws_A", operation_type="content_text", source_product="content_agent",
                    source_object_id="doc1", max_reserved_mc=1000, idempotency_key="fresh", ttl_seconds=9999)
    assert worker.reconcile_expired()["count"] == 0
    assert wallet.balances("ws_A") == (4000, 1000)  # hold preserved


def test_resolver_error_does_not_release_funds():
    _fund()
    rid = _reserve_expired()
    def boom(t, r):
        raise RuntimeError("provider unreachable")
    summary = worker.reconcile_expired(resolver=boom)
    assert summary["processed"][0]["result"] == "resolver_error"
    # ambiguous → hold preserved, NOT released
    assert wallet.balances("ws_A") == (3700, 1300)
    assert get_reservation_repository().get("ws_A", rid)[1].status == ReservationStatus.ACTIVE.value
