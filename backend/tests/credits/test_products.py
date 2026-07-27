"""Tests for credits.products — product registry, validation, and attribution."""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

import pytest

from credits.products import (
    PRODUCT_IDS,
    PRODUCT_CATALOG,
    all_products,
    attribute_by_operation,
    attribute_by_source_product,
    counter_keys_for_product,
    get_product,
    validate_product,
)


# ── registry shape ────────────────────────────────────────────────────────────────

def test_product_ids_are_stable():
    """The five stable product ids must always be present."""
    expected = {"content_agent", "ai_influencer", "seo_agent", "social_marketer", "ai_receptionist"}
    assert expected == set(PRODUCT_IDS)


def test_catalog_matches_product_ids():
    assert set(PRODUCT_CATALOG.keys()) == set(PRODUCT_IDS)


def test_all_products_returns_every_product():
    specs = all_products()
    assert len(specs) == len(PRODUCT_IDS)
    ids_from_specs = {s.product_id for s in specs}
    assert ids_from_specs == set(PRODUCT_IDS)


def test_each_product_has_required_fields():
    for pid, spec in PRODUCT_CATALOG.items():
        assert spec.product_id == pid, f"{pid}: product_id mismatch"
        assert spec.display_name, f"{pid}: empty display_name"
        assert spec.agent_backend_key, f"{pid}: empty agent_backend_key"
        assert isinstance(spec.usage_counter_keys, list), f"{pid}: usage_counter_keys not list"
        assert isinstance(spec.implemented, bool), f"{pid}: implemented not bool"
        assert isinstance(spec.billing_active, bool), f"{pid}: billing_active not bool"


def test_content_agent_spec():
    spec = get_product("content_agent")
    assert spec is not None
    assert spec.agent_backend_key == "content"
    assert "content_text" in spec.operation_types
    assert "content_agent" in spec.source_products
    assert spec.access_key == "content_agent"
    assert spec.implemented is True
    assert spec.billing_active is True


def test_ai_influencer_spec():
    spec = get_product("ai_influencer")
    assert spec is not None
    assert "influencer_video" in spec.operation_types
    assert "influencer_idea" in spec.operation_types
    assert spec.implemented is True


def test_seo_agent_spec_has_usage_keys():
    spec = get_product("seo_agent")
    assert spec is not None
    assert spec.implemented is True
    assert "seo_audits" in spec.usage_counter_keys


def test_get_product_unknown_returns_none():
    assert get_product("nonexistent_product") is None
    assert get_product("") is None


# ── validate_product ──────────────────────────────────────────────────────────────

def test_validate_known_products():
    for pid in PRODUCT_IDS:
        assert validate_product(pid) == pid, f"Known product {pid!r} should validate to itself"


def test_validate_unknown_returns_none():
    assert validate_product("made_up_agent") is None
    assert validate_product("") is None
    assert validate_product(None) is None  # type: ignore[arg-type]
    assert validate_product("   ") is None


def test_validate_strips_whitespace():
    # A known id surrounded by spaces should still normalize
    assert validate_product("  content_agent  ") == "content_agent"


def test_validate_unknown_never_raises():
    # Arbitrary strings must never raise — just return None
    for val in ["'; DROP TABLE --", "../../etc/passwd", "a" * 500, 123]:  # type: ignore[list-item]
        result = validate_product(val)  # type: ignore[arg-type]
        assert result is None, f"Expected None for {val!r}, got {result!r}"


# ── attribute_by_operation ────────────────────────────────────────────────────────

def test_attribute_content_text_to_content_agent():
    assert attribute_by_operation("content_text") == "content_agent"


def test_attribute_influencer_ops_to_ai_influencer():
    for op in ("influencer_idea", "influencer_script", "influencer_video"):
        assert attribute_by_operation(op) == "ai_influencer", f"{op!r} should map to ai_influencer"


def test_attribute_seo_op_to_seo_agent():
    assert attribute_by_operation("seo_audit") == "seo_agent"


def test_attribute_unknown_operation_returns_none():
    assert attribute_by_operation("totally_unknown_op") is None
    assert attribute_by_operation("") is None


# ── attribute_by_source_product ───────────────────────────────────────────────────

def test_attribute_source_content_agent():
    assert attribute_by_source_product("content_agent") == "content_agent"


def test_attribute_source_content_creator_to_ai_influencer():
    assert attribute_by_source_product("content_creator") == "ai_influencer"
    assert attribute_by_source_product("ai_influencer") == "ai_influencer"


def test_attribute_source_seo_agent():
    assert attribute_by_source_product("seo_agent") == "seo_agent"


def test_attribute_source_unknown_returns_none():
    assert attribute_by_source_product("nope") is None


# ── counter_keys_for_product ──────────────────────────────────────────────────────

def test_counter_keys_content_agent():
    keys = counter_keys_for_product("content_agent")
    assert keys is not None
    assert "content_text" in keys


def test_counter_keys_ai_influencer():
    keys = counter_keys_for_product("ai_influencer")
    assert keys is not None
    assert "influencer_video" in keys
    assert "influencer_idea" in keys


def test_counter_keys_seo_agent():
    keys = counter_keys_for_product("seo_agent")
    assert keys is not None
    assert "seo_audits" in keys


def test_counter_keys_unknown_product_returns_none():
    assert counter_keys_for_product("no_such_product") is None


# ── attribution stability (mapping never drifts) ──────────────────────────────────

def test_attribution_mapping_is_stable():
    """All operation_types listed in the catalog should attribute back to their product."""
    for pid, spec in PRODUCT_CATALOG.items():
        for op in spec.operation_types:
            result = attribute_by_operation(op)
            assert result == pid, (
                f"operation_type {op!r} attributed to {result!r} but expected {pid!r}"
            )


def test_source_product_mapping_is_stable():
    """All source_products in the catalog should attribute back to their product."""
    for pid, spec in PRODUCT_CATALOG.items():
        for src in spec.source_products:
            result = attribute_by_source_product(src)
            assert result == pid, (
                f"source_product {src!r} attributed to {result!r} but expected {pid!r}"
            )


# ── routes integration: product filter on usage + tenant isolation ────────────────

pytest.importorskip("fastapi")

from fastapi import FastAPI
from fastapi.testclient import TestClient

from credits import ledger, reservations, service, wallet
from credits.routes import billing_router

_app = FastAPI()
_app.include_router(billing_router)
_client = TestClient(_app)
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


def test_usage_product_filter_content_agent():
    """?product=content_agent should only return counters for content_agent."""
    r = _client.get(f"{B}/usage", params={"tenant_id": "ws_A", "product": "content_agent"})
    assert r.status_code == 200
    body = r.json()
    assert body["product"] == "content_agent"
    for counter in body.get("counters", []):
        assert counter["key"] in ("content_text", "documents"), (
            f"Unexpected counter {counter['key']!r} for content_agent"
        )


def test_usage_product_filter_ai_influencer():
    r = _client.get(f"{B}/usage", params={"tenant_id": "ws_A", "product": "ai_influencer"})
    assert r.status_code == 200
    body = r.json()
    assert body["product"] == "ai_influencer"
    allowed_keys = {"influencer_idea", "influencer_script", "influencer_video",
                    "influencer_profiles", "publish_jobs", "connected_accounts",
                    "scheduled_jobs"}
    for counter in body.get("counters", []):
        assert counter["key"] in allowed_keys, (
            f"Unexpected counter {counter['key']!r} for ai_influencer"
        )


def test_usage_invalid_product_falls_back_to_all():
    """Unknown product must NOT error — returns all counters."""
    r = _client.get(f"{B}/usage", params={"tenant_id": "ws_A", "product": "INVALID_PRODUCT"})
    assert r.status_code == 200
    body = r.json()
    # No product key when falling back
    assert "product" not in body
    # Should contain at least one counter (the global counters)
    assert "counters" in body


def test_usage_no_product_returns_all_counters():
    r = _client.get(f"{B}/usage", params={"tenant_id": "ws_A"})
    assert r.status_code == 200
    body = r.json()
    assert "product" not in body
    assert "counters" in body


def test_entitlements_with_product_adds_product_access():
    r = _client.get(f"{B}/entitlements", params={"tenant_id": "ws_A", "product": "content_agent"})
    assert r.status_code == 200
    body = r.json()
    assert body["product"] == "content_agent"
    # content_agent access flag is True on the free plan
    assert "product_access" in body


def test_entitlements_invalid_product_falls_back():
    r = _client.get(f"{B}/entitlements", params={"tenant_id": "ws_A", "product": "BOGUS"})
    assert r.status_code == 200
    body = r.json()
    assert "product" not in body
    assert "access" in body


def test_ledger_product_filter_returns_subset():
    """A product filter on /ledger should not crash and return entries (or an empty list)."""
    service.grant("ws_A", 5000, reason_code="seed", idempotency_key="s1")
    r = _client.get(f"{B}/ledger", params={"tenant_id": "ws_A", "product": "content_agent"})
    assert r.status_code == 200
    body = r.json()
    assert body["product"] == "content_agent"
    assert "entries" in body


def test_ledger_invalid_product_falls_back():
    service.grant("ws_A", 5000, reason_code="seed", idempotency_key="s2")
    r = _client.get(f"{B}/ledger", params={"tenant_id": "ws_A", "product": "ZZUNKNOWNZZ"})
    assert r.status_code == 200
    body = r.json()
    # Fallback: no product key, returns all entries
    assert "product" not in body
    assert body["total"] == 1


def test_cross_tenant_usage_isolated():
    """A product filter must NOT leak data across tenants."""
    service.grant("ws_A", 5000, reason_code="seed", idempotency_key="s3")
    r = _client.get(f"{B}/usage", params={"tenant_id": "ws_B", "product": "content_agent"})
    assert r.status_code == 200
    body = r.json()
    for counter in body.get("counters", []):
        assert counter["used"] == 0, f"ws_B should see no usage, but {counter!r}"


def test_status_product_param_accepted_silently():
    """product param on /status is accepted (no 422); result is workspace-level."""
    r = _client.get(f"{B}/status", params={"tenant_id": "ws_A", "product": "content_agent"})
    assert r.status_code == 200
    body = r.json()
    assert "subscription" in body
    assert body.get("product") == "content_agent"


def test_wallet_tenant_isolated_with_product():
    service.grant("ws_A", 5000, reason_code="s", idempotency_key="wa1")
    other = _client.get(f"{B}/wallet", params={"tenant_id": "ws_B"}).json()
    assert other["wallet"]["available_mc"] == 0
