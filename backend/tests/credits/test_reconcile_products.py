"""Product-aware reconciliation — the worker resolves expired holds against real
video/text product state (not a frontend result)."""

from __future__ import annotations

import pytest

from content_creator import store as cc_store
from content_creator.schemas import Video, VideoStatus
from credits import ledger, reservations, service, wallet, worker
from credits.reservations import ReservationStatus, get_reservation_repository


@pytest.fixture(autouse=True)
def _clean(monkeypatch):
    monkeypatch.delenv("PIXIE_PERSIST", raising=False)
    cc_store.reset_repositories()
    for r in (ledger.reset_ledger_repository, wallet.reset_wallet_repository,
              reservations.reset_reservation_repository):
        r()
    yield
    cc_store.reset_repositories()
    for r in (ledger.reset_ledger_repository, wallet.reset_wallet_repository,
              reservations.reset_reservation_repository):
        r()


def _fund(t="ws_A", amount=1_000_000):
    service.grant(t, amount, reason_code="seed", idempotency_key=f"seed:{t}")


def _video(status, t="ws_A"):
    vid, _ = cc_store.get_video_repository().save(
        Video(tenant_id=t, script_ref="s", status=status, duration_seconds=15, model="standard"))
    return vid


def _expired_video_reservation(video_id, t="ws_A", mc=50000):
    rid, _ = service.reserve(t, operation_type="influencer_video", source_product="ai_influencer",
                             source_object_id=video_id, max_reserved_mc=mc, idempotency_key=f"vop:{video_id}")
    get_reservation_repository().update(t, rid, expires_at="2000-01-01T00:00:00+00:00")
    return rid


def test_completed_video_is_settled():
    _fund()
    vid = _video(VideoStatus.READY)
    rid = _expired_video_reservation(vid)
    worker.reconcile_expired()
    assert get_reservation_repository().get("ws_A", rid)[1].status == ReservationStatus.SETTLED.value


def test_failed_video_is_released():
    _fund()
    vid = _video(VideoStatus.FAILED)
    rid = _expired_video_reservation(vid)
    worker.reconcile_expired()
    assert get_reservation_repository().get("ws_A", rid)[1].status == ReservationStatus.RELEASED.value
    assert wallet.balances("ws_A") == (1_000_000, 0)


def test_generating_video_hold_is_preserved():
    _fund()
    vid = _video(VideoStatus.GENERATING)
    rid = _expired_video_reservation(vid)
    worker.reconcile_expired()
    r = get_reservation_repository().get("ws_A", rid)[1]
    assert r.status == ReservationStatus.ACTIVE.value and r.expires_at > "2000-01-01"


def test_crashed_text_operation_is_released():
    _fund()
    rid, _ = service.reserve("ws_A", operation_type="content_text", source_product="content_agent",
                             source_object_id="doc1", max_reserved_mc=1000, idempotency_key="txt")
    get_reservation_repository().update("ws_A", rid, expires_at="2000-01-01T00:00:00+00:00")
    worker.reconcile_expired()
    assert get_reservation_repository().get("ws_A", rid)[1].status == ReservationStatus.EXPIRED.value
    assert wallet.balances("ws_A") == (1_000_000, 0)


def test_missing_video_is_abandoned():
    _fund()
    rid = _expired_video_reservation("gone_video")  # no such video
    worker.reconcile_expired()
    assert get_reservation_repository().get("ws_A", rid)[1].status == ReservationStatus.EXPIRED.value
