"""Content Agent × credit enforcement (route level). Mock consumes zero; real mode
reserves before the provider, settles once, releases on failure, blocks on
insufficient credits — all behind CREDIT_SYSTEM_ENABLED. No live provider calls."""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

import pytest

pytest.importorskip("fastapi")

from fastapi import FastAPI
from fastapi.testclient import TestClient

import content_agent.store as store
from content_agent import routes
from content_agent.routes import router
from content_agent.schemas import GenerationResult, GeneratedVariation, UsageMeta
from content_agent.enums import ContentType
from credits import ledger, reservations, service, wallet

app = FastAPI()
app.include_router(router)
client = TestClient(app)
BASE = "/api/content-agent"


@pytest.fixture(autouse=True)
def _clean(monkeypatch):
    monkeypatch.setenv("PIXIE_INTERNAL_API_SECRET", "")
    monkeypatch.delenv("PIXIE_PERSIST", raising=False)
    monkeypatch.setenv("PIXIE_MODEL_MODE", "fake")
    for k in ["CREDIT_SYSTEM_ENABLED", "BILLING_ENFORCEMENT_ENABLED", "MOCK_USAGE_CONSUMES_CREDITS"]:
        monkeypatch.delenv(k, raising=False)
    store.reset_repositories()
    for r in (ledger.reset_ledger_repository, wallet.reset_wallet_repository,
              reservations.reset_reservation_repository):
        r()
    yield
    store.reset_repositories()
    for r in (ledger.reset_ledger_repository, wallet.reset_wallet_repository,
              reservations.reset_reservation_repository):
        r()


def _fund(tenant="ws_A", amount=100000):
    service.grant(tenant, amount, reason_code="seed", idempotency_key=f"seed:{tenant}")


def _gen(tenant="ws_A", key=""):
    return client.post(f"{BASE}/generate", json={
        "tenant_id": tenant, "content_type": "social_post",
        "inputs": {"topic": "summer sale"}, "options": {"platform": "instagram", "variations": 1},
        "idempotency_key": key})


def _fake_real(monkeypatch, cost_usd=0.005):
    """Force real mode with a stubbed provider result (no network)."""
    monkeypatch.setattr(routes, "is_mock", lambda: False)
    result = GenerationResult(
        content_type=ContentType.SOCIAL_POST,
        variations=[GeneratedVariation(index=0, title="t", text="hello")],
        usage=UsageMeta(provider="openai", model="gpt", mock=False, tokens=100, estimated_cost=cost_usd))
    monkeypatch.setattr(routes, "generate", lambda ct, i, o: result)


def test_mock_generation_consumes_zero_credits_even_when_enabled(monkeypatch):
    monkeypatch.setenv("CREDIT_SYSTEM_ENABLED", "true")
    _fund()
    assert _gen().status_code == 200
    assert wallet.balances("ws_A") == (100000, 0)  # mock → no charge


def test_disabled_system_preserves_behaviour(monkeypatch):
    # credit system off → real-shaped generation runs with no reservation at all
    _fake_real(monkeypatch)
    r = _gen()
    assert r.status_code == 200
    assert wallet.balances("ws_A") == (0, 0)  # no wallet activity


def test_real_generation_reserves_and_settles_once(monkeypatch):
    monkeypatch.setenv("CREDIT_SYSTEM_ENABLED", "true")
    _fund()
    _fake_real(monkeypatch, cost_usd=0.005)  # 5000 µUSD → 650 mc
    r = _gen()
    assert r.status_code == 200
    avail, reserved = wallet.balances("ws_A")
    assert reserved == 0 and avail == 100000 - 650
    # exactly one settled reservation
    res = [rr for _i, rr in reservations.get_reservation_repository().list("ws_A")]
    assert len(res) == 1 and res[0].status == "settled"


def test_insufficient_credits_blocks_and_provider_not_called(monkeypatch):
    monkeypatch.setenv("CREDIT_SYSTEM_ENABLED", "true")
    _fund(amount=100)  # far below the ~2600 mc max reservation
    called = {"gen": False}
    def _boom(ct, i, o):
        called["gen"] = True
        raise AssertionError("provider must not be called")
    _fake_real(monkeypatch)
    monkeypatch.setattr(routes, "generate", _boom)
    r = _gen()
    assert r.status_code == 402 and r.json()["detail"]["error"] == "insufficient_credits"
    assert called["gen"] is False
    assert wallet.balances("ws_A") == (100, 0)  # nothing reserved


def test_real_failure_releases_full_reservation(monkeypatch):
    from content_agent.errors import ProviderError, ErrorCategory
    monkeypatch.setenv("CREDIT_SYSTEM_ENABLED", "true")
    _fund()
    monkeypatch.setattr(routes, "is_mock", lambda: False)
    def _fail(ct, i, o):
        raise ProviderError(ErrorCategory.TEMPORARY_PROVIDER_FAILURE, "boom")
    monkeypatch.setattr(routes, "generate", _fail)
    r = _gen()
    assert r.status_code >= 500
    assert wallet.balances("ws_A") == (100000, 0)  # fully released, unbilled


def test_duplicate_request_reuses_operation_no_double_charge(monkeypatch):
    monkeypatch.setenv("CREDIT_SYSTEM_ENABLED", "true")
    _fund()
    _fake_real(monkeypatch, cost_usd=0.005)
    a = _gen(key="stable-op")
    b = _gen(key="stable-op")   # duplicate HTTP retry, same idempotency key
    assert a.status_code == 200 and b.status_code == 200
    assert wallet.balances("ws_A")[0] == 100000 - 650  # charged once
    assert len(reservations.get_reservation_repository().list("ws_A")) == 1
