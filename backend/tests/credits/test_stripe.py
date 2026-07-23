"""Stripe sync — signature, idempotent webhooks, grants, transitions, checkout/portal.
No live Stripe: signatures are stdlib HMAC and checkout/portal use a mock transport."""

from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

import pytest

pytest.importorskip("fastapi")

from fastapi import FastAPI
from fastapi.testclient import TestClient

from credits import ledger, plans, stripe, stripe_sync, subscriptions, wallet
from credits.routes import billing_router, stripe_webhook_router

app = FastAPI()
app.include_router(billing_router)
app.include_router(stripe_webhook_router)
client = TestClient(app)

WHSEC = "whsec_test_123"


@pytest.fixture(autouse=True)
def _clean(monkeypatch):
    monkeypatch.setenv("PIXIE_INTERNAL_API_SECRET", "")
    monkeypatch.delenv("PIXIE_PERSIST", raising=False)
    monkeypatch.setenv("STRIPE_WEBHOOK_SECRET", WHSEC)
    monkeypatch.setenv("STRIPE_PRICE_STARTER", "price_starter")
    monkeypatch.setenv("STRIPE_PRICE_PRO", "price_pro")
    ledger.reset_ledger_repository()
    wallet.reset_wallet_repository()
    subscriptions.reset_subscription_repositories()
    plans.PRICE_TO_PLAN.clear()
    stripe.sync_plan_registry()
    yield
    ledger.reset_ledger_repository()
    wallet.reset_wallet_repository()
    subscriptions.reset_subscription_repositories()
    plans.PRICE_TO_PLAN.clear()


def _sub_event(etype, tenant="ws_A", price="price_pro", status="active", period_end=4000000000, eid="evt_1", **extra):
    obj = {"id": "sub_1", "status": status, "customer": "cus_1", "cancel_at_period_end": False,
           "current_period_start": 1000000000, "current_period_end": period_end,
           "items": {"data": [{"price": {"id": price}}]}, "metadata": {"tenant_id": tenant}}
    obj.update(extra)
    return {"id": eid, "type": etype, "data": {"object": obj}}


def _invoice_event(tenant="ws_A", eid="evt_inv", paid=True):
    return {"id": eid, "type": "invoice.paid",
            "data": {"object": {"id": "in_1", "customer": "cus_1", "paid": paid, "status": "paid",
                                "metadata": {"tenant_id": tenant}}}}


# ── signature ────────────────────────────────────────────────────────────────────
def test_signature_valid_and_invalid():
    payload = b'{"hello":"world"}'
    sig = stripe.sign_payload(payload, secret=WHSEC)
    stripe.verify_signature(payload, sig, secret=WHSEC)  # no raise
    with pytest.raises(stripe.SignatureError):
        stripe.verify_signature(payload, sig.replace("v1=", "v1=deadbeef"), secret=WHSEC)
    with pytest.raises(stripe.SignatureError):
        stripe.verify_signature(b'{"tampered":1}', sig, secret=WHSEC)


# ── subscription sync ─────────────────────────────────────────────────────────────
def test_subscription_created_syncs_plan_and_period():
    stripe_sync.process_event(_sub_event("customer.subscription.created"))
    sub = subscriptions.get_subscription_repository().get("ws_A")
    assert sub.plan_id == "pro" and sub.status == "active"
    assert plans.resolve_plan_id("ws_A") == "pro"  # wallet plan updated


def test_price_mapping_is_server_side_not_browser():
    # browser can't force a plan; only the mapped price id decides
    stripe_sync.process_event(_sub_event("customer.subscription.updated", price="price_starter"))
    assert subscriptions.get_subscription_repository().get("ws_A").plan_id == "starter"


def test_out_of_order_update_does_not_move_period_backwards():
    stripe_sync.process_event(_sub_event("customer.subscription.updated", period_end=4000000000, eid="e1"))
    stripe_sync.process_event(_sub_event("customer.subscription.updated", period_end=3000000000, eid="e2", price="price_starter"))
    sub = subscriptions.get_subscription_repository().get("ws_A")
    assert sub.current_period_end.startswith("2096")  # kept the newer period, ignored the older event


# ── monthly grants ────────────────────────────────────────────────────────────────
def test_invoice_paid_grants_monthly_credits_once():
    stripe_sync.process_event(_sub_event("customer.subscription.created"))  # pro = 10000 credits
    stripe_sync.process_event(_invoice_event(eid="evt_inv"))
    assert wallet.balances("ws_A")[0] == 10000 * 1000  # milli-credits
    # replay same event → no double grant
    stripe_sync.process_event(_invoice_event(eid="evt_inv"))
    assert wallet.balances("ws_A")[0] == 10000 * 1000


def test_failed_payment_not_granted():
    stripe_sync.process_event(_sub_event("customer.subscription.created"))
    r = stripe_sync.process_event(_invoice_event(eid="evt_x", paid=False))
    assert r["granted"] is False
    assert wallet.balances("ws_A")[0] == 0


def test_duplicate_event_id_is_noop():
    stripe_sync.process_event(_sub_event("customer.subscription.created", eid="evt_dup"))
    r = stripe_sync.process_event(_sub_event("customer.subscription.updated", eid="evt_dup", price="price_starter"))
    assert r.get("duplicate") is True
    # plan unchanged by the duplicate
    assert subscriptions.get_subscription_repository().get("ws_A").plan_id == "pro"


# ── transitions ───────────────────────────────────────────────────────────────────
def test_payment_failed_marks_past_due():
    stripe_sync.process_event(_sub_event("customer.subscription.created"))
    stripe_sync.process_event({"id": "evt_pf", "type": "invoice.payment_failed",
                               "data": {"object": {"id": "in_2", "metadata": {"tenant_id": "ws_A"}}}})
    assert subscriptions.get_subscription_repository().get("ws_A").past_due is True


def test_subscription_deleted_marks_canceled():
    stripe_sync.process_event(_sub_event("customer.subscription.created"))
    stripe_sync.process_event(_sub_event("customer.subscription.deleted", eid="evt_del"))
    assert subscriptions.get_subscription_repository().get("ws_A").status == "canceled"


# ── checkout / portal (mock transport) ──────────────────────────────────────────
def test_checkout_maps_plan_to_price_and_binds_tenant(monkeypatch):
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_x")
    captured = {}
    def fake(method, url, form, headers):
        captured.update(form)
        return 200, {"url": "https://checkout.stripe.test/s1", "id": "cs_1"}
    monkeypatch.setattr(stripe, "_default_transport", fake)
    session = stripe.create_checkout_session(price_id="price_pro", customer_id="", tenant_id="ws_A",
                                             success="s", cancel="c")
    assert session["url"].startswith("https://checkout")
    assert captured["line_items[0][price]"] == "price_pro"
    assert captured["client_reference_id"] == "ws_A"  # workspace bound server-side


def test_checkout_route_requires_stripe_configured(monkeypatch):
    monkeypatch.delenv("STRIPE_SECRET_KEY", raising=False)
    r = client.post("/api/billing/checkout", json={"tenant_id": "ws_A", "plan": "pro"})
    assert r.status_code == 503 and r.json()["detail"]["error"] == "stripe_not_configured"


def test_portal_requires_existing_customer(monkeypatch):
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_x")
    r = client.post("/api/billing/portal", json={"tenant_id": "ws_A"})
    assert r.status_code == 409 and r.json()["detail"]["error"] == "no_customer"


# ── webhook route ─────────────────────────────────────────────────────────────────
def test_webhook_route_verifies_signature_and_processes():
    event = _sub_event("customer.subscription.created", eid="evt_route")
    payload = json.dumps(event).encode()
    sig = stripe.sign_payload(payload, secret=WHSEC)
    r = client.post("/api/billing/webhook", content=payload, headers={"stripe-signature": sig})
    assert r.status_code == 200 and r.json()["type"] == "customer.subscription.created"
    assert subscriptions.get_subscription_repository().get("ws_A").plan_id == "pro"


def test_webhook_rejects_bad_signature():
    payload = json.dumps(_sub_event("customer.subscription.created")).encode()
    r = client.post("/api/billing/webhook", content=payload, headers={"stripe-signature": "t=1,v1=bad"})
    assert r.status_code == 400


def test_webhook_no_secret_leak_in_response():
    event = _sub_event("customer.subscription.created", eid="evt_leak")
    payload = json.dumps(event).encode()
    sig = stripe.sign_payload(payload, secret=WHSEC)
    r = client.post("/api/billing/webhook", content=payload, headers={"stripe-signature": sig})
    assert WHSEC not in r.text and "whsec_" not in r.text
