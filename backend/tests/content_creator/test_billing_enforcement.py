"""AI Influencer idea/script credit enforcement (route level). Mock → zero credits;
real-shaped → reserve + settle once; insufficient → 402 before provider. No network."""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

import pytest

pytest.importorskip("fastapi")

from fastapi import FastAPI
from fastapi.testclient import TestClient

from content_creator import store as cc_store
from content_creator.router import router
from credits import ledger, reservations, service, wallet

app = FastAPI()
app.include_router(router)
client = TestClient(app)
B = "/api/content-creator"


@pytest.fixture(autouse=True)
def _clean(monkeypatch):
    monkeypatch.delenv("PIXIE_PERSIST", raising=False)
    monkeypatch.setenv("PIXIE_MODEL_MODE", "fake")     # no network even in "real" cc mode
    for k in ["CREDIT_SYSTEM_ENABLED", "BILLING_ENFORCEMENT_ENABLED", "CONTENT_CREATOR_MOCK"]:
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


def _seed_profile(t="ws_A"):
    client.post(f"{B}/profile", json={"tenant_id": t, "business_name": "Acme"})


def _fund(t="ws_A", amount=100000):
    service.grant(t, amount, reason_code="seed", idempotency_key=f"seed:{t}")


def _real(monkeypatch):
    monkeypatch.setenv("CREDIT_SYSTEM_ENABLED", "true")
    monkeypatch.setenv("CONTENT_CREATOR_MOCK", "false")   # real-shaped → reserves


def _ideas(t="ws_A", key=""):
    return client.post(f"{B}/ideas/generate", json={"tenant_id": t, "seeds": ["fitness"],
                                                     "idempotency_key": key})


def test_mock_ideas_consume_zero_credits(monkeypatch):
    monkeypatch.setenv("CREDIT_SYSTEM_ENABLED", "true")  # cc mock is the default
    _seed_profile(); _fund()
    assert _ideas().status_code == 200
    assert wallet.balances("ws_A") == (100000, 0)


def test_real_ideas_reserve_and_settle_once(monkeypatch):
    _real(monkeypatch)
    _seed_profile(); _fund()
    r = _ideas()
    assert r.status_code == 200
    _avail, reserved = wallet.balances("ws_A")
    assert reserved == 0   # hold placed then fully finalized (fake provider = $0 actual)
    res = [rr for _i, rr in reservations.get_reservation_repository().list("ws_A")
           if rr.operation_type == "influencer_idea"]
    assert len(res) == 1 and res[0].status == "settled"   # reserve→settle happened


def test_insufficient_credits_blocks_ideas(monkeypatch):
    _real(monkeypatch)
    _seed_profile(); _fund(amount=10)   # far below reservation
    r = _ideas()
    assert r.status_code == 402 and r.json()["detail"]["error"] == "insufficient_credits"
    # no idea persisted
    assert client.get(f"{B}/ideas", params={"tenant_id": "ws_A"}).json()["ideas"] == []


def test_duplicate_idea_request_reuses_operation(monkeypatch):
    _real(monkeypatch)
    _seed_profile(); _fund()
    a = _ideas(key="stable")
    before = wallet.balances("ws_A")[0]
    b = _ideas(key="stable")   # duplicate op id
    assert a.status_code == 200 and b.status_code == 200
    assert wallet.balances("ws_A")[0] == before  # not charged twice
    res = [rr for _i, rr in reservations.get_reservation_repository().list("ws_A")
           if rr.operation_type == "influencer_idea"]
    assert len(res) == 1


def test_script_enforcement_requires_approved_idea_and_reserves(monkeypatch):
    _real(monkeypatch)
    _seed_profile(); _fund()
    # generate + approve an idea (idea gen itself settles)
    idea_id = _ideas().json()["ideas"][0]["id"]
    client.post(f"{B}/ideas/{idea_id}/approve", json={"tenant_id": "ws_A"})
    r = client.post(f"{B}/scripts/generate", json={"tenant_id": "ws_A", "idea_id": idea_id})
    assert r.status_code == 200
    res = [rr for _i, rr in reservations.get_reservation_repository().list("ws_A")
           if rr.operation_type == "influencer_script"]
    assert len(res) == 1 and res[0].status == "settled"


def test_approval_consumes_no_credits(monkeypatch):
    _real(monkeypatch)
    _seed_profile(); _fund()
    idea_id = _ideas().json()["ideas"][0]["id"]
    before = wallet.balances("ws_A")[0]
    client.post(f"{B}/ideas/{idea_id}/approve", json={"tenant_id": "ws_A"})
    assert wallet.balances("ws_A")[0] == before  # approval is free
