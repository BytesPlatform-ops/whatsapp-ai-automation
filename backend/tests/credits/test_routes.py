"""Billing API — wallet, reservations, estimate, config. Tenant-isolated, no secrets."""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

import pytest

pytest.importorskip("fastapi")

from fastapi import FastAPI
from fastapi.testclient import TestClient

from credits import ledger, reservations, service, wallet
from credits.routes import billing_router

app = FastAPI()
app.include_router(billing_router)
client = TestClient(app)
B = "/api/billing"


@pytest.fixture(autouse=True)
def _clean(monkeypatch):
    monkeypatch.setenv("PIXIE_INTERNAL_API_SECRET", "")
    monkeypatch.delenv("PIXIE_PERSIST", raising=False)
    for k in ["CREDIT_SYSTEM_ENABLED", "BILLING_ENFORCEMENT_ENABLED"]:
        monkeypatch.delenv(k, raising=False)
    for r in (ledger.reset_ledger_repository, wallet.reset_wallet_repository,
              reservations.reset_reservation_repository):
        r()
    yield
    for r in (ledger.reset_ledger_repository, wallet.reset_wallet_repository,
              reservations.reset_reservation_repository):
        r()


def test_config_reports_disabled_defaults():
    c = client.get(f"{B}/config").json()
    assert c["credit_system_enabled"] is False and c["billing_enforcement_enabled"] is False


def test_wallet_reflects_ledger():
    service.grant("ws_A", 5000, reason_code="seed", idempotency_key="s")
    w = client.get(f"{B}/wallet", params={"tenant_id": "ws_A"}).json()
    assert w["wallet"]["available_mc"] == 5000 and w["plan"]["id"] == "free"
    # no secrets/tokens in the payload
    assert "token" not in str(w).lower() and "secret" not in str(w).lower()


def test_wallet_tenant_isolated():
    service.grant("ws_A", 5000, reason_code="s", idempotency_key="a")
    other = client.get(f"{B}/wallet", params={"tenant_id": "ws_B"}).json()
    assert other["wallet"]["available_mc"] == 0


def test_estimate_endpoint_content_text():
    r = client.post(f"{B}/estimate", json={"tenant_id": "ws_A", "operation": "content_text",
                                           "variations": 3, "is_mock": False})
    body = r.json()
    assert body["max_reservation_mc"] > 0 and body["mock"] is False


def test_estimate_mock_is_zero():
    r = client.post(f"{B}/estimate", json={"tenant_id": "ws_A", "operation": "content_text", "is_mock": True})
    assert r.json()["max_reservation_mc"] == 0


def test_unknown_estimate_operation_422():
    r = client.post(f"{B}/estimate", json={"tenant_id": "ws_A", "operation": "nope"})
    assert r.status_code == 422


def test_reservations_pagination_and_isolation():
    service.grant("ws_A", 100000, reason_code="s", idempotency_key="s")
    for i in range(3):
        service.reserve("ws_A", operation_type="content_text", source_product="content_agent",
                        source_object_id=f"d{i}", max_reserved_mc=1000, idempotency_key=f"op{i}")
    r = client.get(f"{B}/reservations", params={"tenant_id": "ws_A", "limit": 2}).json()
    assert r["total"] == 3 and len(r["reservations"]) == 2
    # ws_B sees none
    assert client.get(f"{B}/reservations", params={"tenant_id": "ws_B"}).json()["total"] == 0


def test_operation_lookup_by_idempotency_key():
    service.grant("ws_A", 100000, reason_code="s", idempotency_key="s")
    service.reserve("ws_A", operation_type="content_text", source_product="content_agent",
                    source_object_id="d1", max_reserved_mc=1000, idempotency_key="op-xyz")
    r = client.get(f"{B}/operations/op-xyz", params={"tenant_id": "ws_A"})
    assert r.status_code == 200 and r.json()["operation"]["operation_id"] == "op-xyz"
    # wrong tenant cannot resolve it
    assert client.get(f"{B}/operations/op-xyz", params={"tenant_id": "ws_B"}).status_code == 404


def test_status_entitlements_usage_ledger():
    service.grant("ws_A", 5000, reason_code="seed", idempotency_key="s")
    st = client.get(f"{B}/status", params={"tenant_id": "ws_A"}).json()
    assert st["subscription"]["plan_id"] == "free" and st["subscription"]["past_due"] is False
    ent = client.get(f"{B}/entitlements", params={"tenant_id": "ws_A"}).json()
    assert ent["access"]["content_agent"] is True and "monthly_text_generations" in ent["limits"]
    usage = client.get(f"{B}/usage", params={"tenant_id": "ws_A"}).json()
    assert "counters" in usage and usage["period"]["fallback"] is True
    led = client.get(f"{B}/ledger", params={"tenant_id": "ws_A"}).json()
    assert led["total"] == 1 and led["entries"][0]["entry_type"] == "grant"
    # ledger never exposes idempotency keys or metadata
    assert "idempotency_key" not in led["entries"][0] and "metadata" not in led["entries"][0]


def test_ledger_tenant_isolated():
    service.grant("ws_A", 5000, reason_code="s", idempotency_key="a")
    assert client.get(f"{B}/ledger", params={"tenant_id": "ws_B"}).json()["total"] == 0


def test_internal_secret_enforced(monkeypatch):
    monkeypatch.setenv("PIXIE_INTERNAL_API_SECRET", "s3cret")
    assert client.get(f"{B}/config").status_code == 401
    assert client.get(f"{B}/config", headers={"X-Pixie-Internal-Secret": "s3cret"}).status_code == 200
