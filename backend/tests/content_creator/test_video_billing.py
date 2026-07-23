"""AI Influencer video credit reservation (before Higgsfield submission) + settle/
release helpers. Gate 3 stays mandatory. Uses mock provider — no network."""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

import pytest

pytest.importorskip("fastapi")

from fastapi import FastAPI
from fastapi.testclient import TestClient

from content_creator import router as cc_router
from content_creator import store as cc_store
from content_creator.router import router
from content_creator.schemas import Video, VideoStatus
from credits import ledger, reservations, service, wallet
from credits.reservations import ReservationStatus, get_reservation_repository

app = FastAPI()
app.include_router(router)
client = TestClient(app)
B = "/api/content-creator"


@pytest.fixture(autouse=True)
def _clean(monkeypatch):
    monkeypatch.delenv("PIXIE_PERSIST", raising=False)
    monkeypatch.setenv("PIXIE_MODEL_MODE", "fake")
    for k in ["CREDIT_SYSTEM_ENABLED", "BILLING_ENFORCEMENT_ENABLED", "CONTENT_CREATOR_MOCK",
              "MOCK_USAGE_CONSUMES_CREDITS"]:
        monkeypatch.delenv(k, raising=False)
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


def _to_gate3(t="ws_A") -> str:
    """Drive the mock pipeline through Gate 3 (production approved). Returns script id."""
    client.post(f"{B}/profile", json={"tenant_id": t, "business_name": "Acme"})
    client.post(f"{B}/influencer/from-characteristics", json={"tenant_id": t, "look": "athletic"})
    client.post(f"{B}/provider/connect", json={"tenant_id": t, "mode": "pixie_managed"})
    idea_id = client.post(f"{B}/ideas/generate", json={"tenant_id": t}).json()["ideas"][0]["id"]
    client.post(f"{B}/ideas/{idea_id}/approve", json={"tenant_id": t})
    sid = client.post(f"{B}/scripts/generate", json={"tenant_id": t, "idea_id": idea_id}).json()["id"]
    client.post(f"{B}/scripts/{sid}/approve", json={"tenant_id": t})
    client.post(f"{B}/production/approve", json={"tenant_id": t})
    return sid


def _enable(monkeypatch):
    monkeypatch.setenv("CREDIT_SYSTEM_ENABLED", "true")
    monkeypatch.setenv("MOCK_USAGE_CONSUMES_CREDITS", "true")  # force a hold in mock provider mode


def test_gate3_still_required_without_approval():
    # no production approval → 409 (billing never reached)
    client.post(f"{B}/profile", json={"tenant_id": "ws_A", "business_name": "Acme"})
    r = client.post(f"{B}/videos/generate", json={"tenant_id": "ws_A", "script_id": "nope"})
    assert r.status_code == 409


def test_video_reserves_before_submission(monkeypatch):
    _enable(monkeypatch)
    _fund()
    sid = _to_gate3()
    r = client.post(f"{B}/videos/generate", json={"tenant_id": "ws_A", "script_id": sid})
    assert r.status_code == 200
    video = r.json()["video"]
    assert video["reservation_id"] and video["billing_state"] == "reserved"
    res = get_reservation_repository().get("ws_A", video["reservation_id"])[1]
    assert res.operation_type == "influencer_video" and res.status == ReservationStatus.ACTIVE.value


def test_video_insufficient_credits_blocks(monkeypatch):
    _enable(monkeypatch)
    # enough for the small idea/script holds (which settle to ~$0 and release in fake
    # mode) but far below a video reservation
    _fund(amount=20000)
    sid = _to_gate3()
    r = client.post(f"{B}/videos/generate", json={"tenant_id": "ws_A", "script_id": sid})
    assert r.status_code == 402 and r.json()["detail"]["error"] == "insufficient_credits"


def test_double_submit_reuses_one_reservation(monkeypatch):
    _enable(monkeypatch)
    _fund()
    sid = _to_gate3()
    a = client.post(f"{B}/videos/generate", json={"tenant_id": "ws_A", "script_id": sid, "idempotency_key": "vid-op"})
    b = client.post(f"{B}/videos/generate", json={"tenant_id": "ws_A", "script_id": sid, "idempotency_key": "vid-op"})
    assert a.status_code == 200 and b.status_code == 200
    vids = [rr for _i, rr in get_reservation_repository().list("ws_A") if rr.operation_type == "influencer_video"]
    assert len(vids) == 1


def test_settle_helper_settles_once(monkeypatch):
    _fund()
    rid, _ = service.reserve("ws_A", operation_type="influencer_video", source_product="ai_influencer",
                             source_object_id="v1", max_reserved_mc=50000, idempotency_key="op")
    video = Video(tenant_id="ws_A", script_ref="s", status=VideoStatus.READY, reservation_id=rid,
                  duration_seconds=15, model="standard")
    state = cc_router._settle_video_reservation("ws_A", video)
    assert state == "settled"
    assert get_reservation_repository().get("ws_A", rid)[1].status == ReservationStatus.SETTLED.value


def test_release_helper_releases_hold(monkeypatch):
    _fund()
    rid, _ = service.reserve("ws_A", operation_type="influencer_video", source_product="ai_influencer",
                             source_object_id="v1", max_reserved_mc=50000, idempotency_key="op")
    cc_router._release_video_reservation("ws_A", rid, credit_reason="provider_rejected")
    assert wallet.balances("ws_A") == (1_000_000, 0)  # fully returned
    assert get_reservation_repository().get("ws_A", rid)[1].status == ReservationStatus.RELEASED.value
