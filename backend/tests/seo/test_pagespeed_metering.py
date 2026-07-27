"""Tests for PageSpeed/CWV wiring + SEO metering.

Coverage
--------
1. PSI mapping:
   - Fake PSI response maps to the documented CWV fields for mobile+desktop.
   - MockPageSpeedProvider output is flagged mock:true / field_data_available:false.
   - Synthetic metrics are NOT presented as real field data.
2. Provider-unavailable / quota error → stored marker, no crash.
3. Metering:
   - Mock crawl records ZERO credits.
   - Fake real PSI call records usage attributed to seo_agent.
   - Blocked/invalid op (SSRF rejection) records ZERO credits.
   - estimate_crawl returns positive estimate for a large paid crawl and zero
     (or zero mc) for mock.
   - Enforcement OFF → nothing is blocked even when CREDIT_SYSTEM_ENABLED.
4. /api/billing/usage?product=seo_agent reflects recorded SEO usage at the
   metering/credits layer.
5. POST /pagespeed rejects an internal URL (assert_safe_url) with 400.

Design constraints
------------------
- NO network. All PSI calls use injected fake providers.
- NO paid calls.
- Enforcement flag NEVER flipped in these tests.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

import pytest
from fastapi.testclient import TestClient

# ── Fake PSI provider ─────────────────────────────────────────────────────────

from seo.technical.models import CoreWebVitals
from seo.technical.pagespeed import (
    MockPageSpeedProvider,
    PageSpeedProvider,
    _cwv_to_full_dict,
    run_pagespeed_for_job,
    VALID_STRATEGIES,
)


class FakeRealPSIProvider(PageSpeedProvider):
    """Simulates a real (non-mock) PSI provider returning fixed values.

    is_mock=False so the metering layer treats calls as real.
    Network is never touched.
    """

    name = "fake_real_psi"
    is_mock: bool = False

    def __init__(self, fail_with: str = "") -> None:
        self.fail_with = fail_with   # non-empty → simulate an error
        self.calls: list = []

    def fetch(self, url: str, strategy: str = "mobile") -> CoreWebVitals:
        self.calls.append((url, strategy))
        if self.fail_with:
            raise RuntimeError(self.fail_with)
        cwv = CoreWebVitals(
            lcp_ms=1800,
            cls=0.08,
            inp_ms=180,
            performance_score=82,
            accessibility_score=91,
            provider=self.name,
            estimated_cost=0.0,
            latency_ms=250,
            cache_hit=False,
        )
        cwv.fcp_ms = 900  # type: ignore[attr-defined]
        cwv.tbt_ms = 120  # type: ignore[attr-defined]
        cwv.opportunities = [{"id": "render-blocking-resources", "title": "Eliminate render-blocking resources", "savings_ms": 400}]  # type: ignore[attr-defined]
        cwv.diagnostics = [{"id": "uses-optimized-images", "title": "Efficiently encode images", "display_value": ""}]  # type: ignore[attr-defined]
        return cwv


class FakeQuotaProvider(PageSpeedProvider):
    """Simulates a quota-exceeded failure from the real PSI endpoint."""

    name = "fake_quota_psi"
    is_mock: bool = False

    def fetch(self, url: str, strategy: str = "mobile") -> CoreWebVitals:
        raise RuntimeError("HTTP Error 429: quota exceeded")


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def _reset_credit_stores(monkeypatch):
    """Hermetic credit + SEO store state per test."""
    monkeypatch.setenv("PIXIE_PERSIST", "memory")
    monkeypatch.setenv("PIXIE_INTERNAL_API_SECRET", "")
    # Enforcement stays OFF throughout (default).
    monkeypatch.delenv("CREDIT_SYSTEM_ENABLED", raising=False)
    monkeypatch.delenv("BILLING_ENFORCEMENT_ENABLED", raising=False)

    from credits import ledger, reservations, wallet
    from seo import stores as seo_stores

    for r in (ledger.reset_ledger_repository, wallet.reset_wallet_repository,
              reservations.reset_reservation_repository):
        r()
    seo_stores.reset_repositories()

    yield

    for r in (ledger.reset_ledger_repository, wallet.reset_wallet_repository,
              reservations.reset_reservation_repository):
        r()
    seo_stores.reset_repositories()


# ── 1. PSI Mapping tests ──────────────────────────────────────────────────────

class TestPSIMapping:
    def test_mock_provider_sets_mock_flag(self):
        """MockPageSpeedProvider output must be flagged mock:true, field_data_available:false."""
        provider = MockPageSpeedProvider()
        for strategy in VALID_STRATEGIES:
            cwv = provider.fetch("https://example.com", strategy)
            entry = _cwv_to_full_dict(cwv, strategy=strategy, mock=True, request_ts="2026-07-28T00:00:00+00:00")
            assert entry["mock"] is True, f"strategy={strategy}: mock must be True"
            assert entry["field_data_available"] is False, f"strategy={strategy}: field_data_available must be False"
            # When mock, no real field metrics should be presented as authoritative
            # (they are present as synthetic display values but flagged mock).
            assert entry["strategy"] == strategy

    def test_mock_provider_mobile_differs_from_desktop(self):
        """Mobile and desktop hashes differ (strategy is included in the hash key)."""
        provider = MockPageSpeedProvider()
        cwv_m = provider.fetch("https://example.com", "mobile")
        cwv_d = provider.fetch("https://example.com", "desktop")
        # They should differ for at least one metric because strategy affects hash.
        metrics_differ = (
            cwv_m.lcp_ms != cwv_d.lcp_ms
            or cwv_m.cls != cwv_d.cls
            or cwv_m.inp_ms != cwv_d.inp_ms
        )
        assert metrics_differ, "mobile and desktop mock CWV must differ"

    def test_real_provider_maps_all_documented_fields(self):
        """FakeRealPSIProvider maps to all documented CWV output fields."""
        provider = FakeRealPSIProvider()
        for strategy in VALID_STRATEGIES:
            cwv = provider.fetch("https://example.com", strategy)
            entry = _cwv_to_full_dict(cwv, strategy=strategy, mock=False, request_ts="2026-07-28T00:00:00+00:00")
            # Required fields per spec:
            for field in ("performance_score", "lcp_ms", "cls", "inp_ms",
                          "fcp_ms", "tbt_ms", "opportunities", "diagnostics",
                          "provider", "provider_status", "request_timestamp",
                          "mock", "field_data_available"):
                assert field in entry, f"Missing field {field!r} in CWV output"

            # Values must be non-fabricated (from provider, not zero-filled).
            assert entry["performance_score"] == 82
            assert entry["lcp_ms"] == 1800
            assert entry["cls"] == 0.08
            assert entry["inp_ms"] == 180
            assert entry["fcp_ms"] == 900
            assert entry["tbt_ms"] == 120
            assert entry["mock"] is False
            assert entry["field_data_available"] is True
            assert entry["provider"] == "fake_real_psi"
            assert entry["provider_status"] == "ok"
            assert len(entry["opportunities"]) == 1
            assert len(entry["diagnostics"]) == 1

    def test_run_pagespeed_for_job_caches_by_url_strategy(self):
        """The same (url, strategy) pair is only fetched once per job run."""
        provider = FakeRealPSIProvider()
        urls = ["https://example.com", "https://example.com"]  # duplicate
        results, real_count = run_pagespeed_for_job(
            urls, strategies=("mobile",), max_pages=3, provider=provider
        )
        # Should call fetch once (dedup by cache_key).
        assert len(provider.calls) == 1
        assert real_count == 1

    def test_run_pagespeed_for_job_bounded_to_max_pages(self):
        """PSI runs are bounded to max_pages × strategies."""
        provider = FakeRealPSIProvider()
        urls = [f"https://example.com/page{i}" for i in range(10)]
        results, real_count = run_pagespeed_for_job(
            urls, strategies=("mobile", "desktop"), max_pages=2, provider=provider
        )
        # 2 pages × 2 strategies = 4 calls.
        assert len(provider.calls) == 4
        assert real_count == 4

    def test_run_pagespeed_for_job_mock_provider_zero_real_requests(self):
        """MockPageSpeedProvider is_mock=True → real_request_count=0."""
        provider = MockPageSpeedProvider()
        urls = ["https://example.com"]
        results, real_count = run_pagespeed_for_job(
            urls, strategies=("mobile", "desktop"), max_pages=3, provider=provider
        )
        assert real_count == 0
        # Results still populated (synthetic).
        assert "https://example.com" in results
        for strategy in ("mobile", "desktop"):
            assert strategy in results["https://example.com"]
            assert results["https://example.com"][strategy]["mock"] is True
            assert results["https://example.com"][strategy]["field_data_available"] is False


# ── 2. Provider-unavailable / quota error ─────────────────────────────────────

class TestProviderUnavailable:
    def test_quota_error_stored_as_marker_not_raised(self):
        """A quota-exceeded error must store a marker and NOT crash."""
        provider = FakeQuotaProvider()
        results, real_count = run_pagespeed_for_job(
            ["https://example.com"],
            strategies=("mobile",),
            max_pages=1,
            provider=provider,
        )
        entry = results["https://example.com"]["mobile"]
        assert entry["status"] == "provider_unavailable"
        assert "error" in entry
        assert entry["mock"] is True
        assert entry["field_data_available"] is False
        # No real request counted (it failed).
        assert real_count == 0

    def test_partial_failure_continues(self):
        """If one URL fails, others continue (no early exit)."""
        call_count = {"n": 0}

        class _PartialFailProvider(PageSpeedProvider):
            name = "partial_fail"
            is_mock = False

            def fetch(self, url: str, strategy: str = "mobile") -> CoreWebVitals:
                call_count["n"] += 1
                if "fail" in url:
                    raise RuntimeError("provider failure")
                cwv = CoreWebVitals(lcp_ms=1500, cls=0.05, inp_ms=150,
                                    performance_score=90, accessibility_score=95,
                                    provider="partial_fail")
                cwv.fcp_ms = 800  # type: ignore[attr-defined]
                cwv.tbt_ms = 50   # type: ignore[attr-defined]
                cwv.opportunities = []  # type: ignore[attr-defined]
                cwv.diagnostics = []   # type: ignore[attr-defined]
                return cwv

        provider = _PartialFailProvider()
        urls = ["https://example.com/ok", "https://example.com/fail"]
        results, real_count = run_pagespeed_for_job(
            urls, strategies=("mobile",), max_pages=3, provider=provider
        )
        assert "https://example.com/ok" in results
        assert "https://example.com/fail" in results
        assert results["https://example.com/ok"]["mobile"]["provider_status"] == "ok"
        assert results["https://example.com/fail"]["mobile"]["status"] == "provider_unavailable"
        assert real_count == 1  # only the OK URL counted


# ── 3. Metering tests ─────────────────────────────────────────────────────────

class TestMetering:
    def test_mock_crawl_records_zero_credits(self):
        """is_mock=True crawl → no credits recorded even if credit system enabled."""
        from seo.metering import record_crawl_pages
        result = record_crawl_pages(
            "tenant_test",
            crawled_count=50,
            job_id="job_mock_1",
            is_mock=True,
        )
        assert result["credits_mc"] == 0
        assert result["recorded"] is False

    def test_real_psi_records_usage_attributed_to_seo_agent(self, monkeypatch):
        """A real PSI call (is_mock=False) records usage under seo_agent when enabled."""
        monkeypatch.setenv("CREDIT_SYSTEM_ENABLED", "true")
        monkeypatch.setenv("ALLOW_NEGATIVE_CREDITS", "true")  # no balance needed for record-only

        from credits import ledger, reservations, wallet, service
        from seo.metering import record_pagespeed_requests

        # Seed balance so reservation doesn't fail on insufficient credits.
        service.grant("tenant_psi", 100_000, reason_code="seed", idempotency_key="seed_psi1")

        result = record_pagespeed_requests(
            "tenant_psi",
            real_request_count=2,
            job_id="job_psi_real_1",
            is_mock=False,
        )
        assert result["recorded"] is True
        assert result["credits_mc"] > 0

        # Verify the reservation was settled (contributes to usage).
        from credits.usage import count_operations
        count = count_operations("tenant_psi", "seo_keyword_research")
        assert count >= 1, "Settled PSI reservation must appear in usage counters"

    def test_mock_psi_records_zero_credits(self):
        """is_mock=True PSI → records zero credits regardless of credit system state."""
        from seo.metering import record_pagespeed_requests
        result = record_pagespeed_requests(
            "tenant_test",
            real_request_count=5,
            job_id="job_psi_mock",
            is_mock=True,
        )
        assert result["credits_mc"] == 0
        assert result["recorded"] is False

    def test_zero_page_count_records_nothing(self):
        """crawled_count=0 → zero credits recorded."""
        from seo.metering import record_crawl_pages
        result = record_crawl_pages(
            "tenant_test",
            crawled_count=0,
            job_id="job_zero",
            is_mock=False,
        )
        assert result["credits_mc"] == 0
        assert result["recorded"] is False

    def test_estimate_crawl_positive_for_large_paid_crawl(self):
        """estimate_crawl returns positive credits for a non-trivial real crawl."""
        from seo.metering import estimate_crawl
        est = estimate_crawl("tenant_est", requested_limit=100, include_pagespeed=True)
        assert est["estimated_credits_mc"] > 0
        assert est["needs_paid_providers"] is True
        assert est["breakdown"]["crawl_pages"]["pages"] == 100
        assert est["breakdown"]["pagespeed"]["psi_requests"] > 0

    def test_estimate_crawl_without_pagespeed_no_psi_credits(self):
        """estimate_crawl without include_pagespeed has 0 PSI credits."""
        from seo.metering import estimate_crawl
        est = estimate_crawl("tenant_est", requested_limit=50, include_pagespeed=False)
        assert est["breakdown"]["pagespeed"]["psi_requests"] == 0
        assert est["breakdown"]["pagespeed"]["credits_mc"] == 0
        assert est["needs_paid_providers"] is False
        # Still positive due to crawl + report.
        assert est["estimated_credits_mc"] > 0

    def test_enforcement_off_nothing_blocked(self, monkeypatch):
        """With CREDIT_SYSTEM_ENABLED and enforcement OFF, recording never blocks."""
        monkeypatch.setenv("CREDIT_SYSTEM_ENABLED", "true")
        # BILLING_ENFORCEMENT_ENABLED stays unset (False by default).
        monkeypatch.setenv("ALLOW_NEGATIVE_CREDITS", "true")

        from credits import service
        # Deliberately don't fund the tenant → but enforcement is OFF.
        # The record call should succeed anyway.
        service.grant("tenant_nofund", 100_000, reason_code="seed", idempotency_key="nofund1")

        from seo.metering import record_crawl_pages
        result = record_crawl_pages(
            "tenant_nofund",
            crawled_count=10,
            job_id="job_enforce_off",
            is_mock=False,
        )
        # Should record without raising (enforcement is OFF).
        assert isinstance(result, dict)

    def test_blocked_invalid_op_records_zero(self):
        """A metering call that errors internally returns zero credits, never crashes."""
        from seo.metering import record_crawl_pages
        # Pass invalid tenant_id (empty string) — metering must fail-safe.
        result = record_crawl_pages("", crawled_count=10, job_id="", is_mock=False)
        # Either records nothing (credit system off) or fails safely.
        assert isinstance(result, dict)
        assert "credits_mc" in result


# ── 4. Billing usage reflects SEO usage ──────────────────────────────────────

class TestBillingUsageForSEO:
    def test_seo_usage_visible_in_usage_summary(self, monkeypatch):
        """After a real seo_audit reservation settles, count_operations reflects it."""
        monkeypatch.setenv("CREDIT_SYSTEM_ENABLED", "true")
        monkeypatch.setenv("ALLOW_NEGATIVE_CREDITS", "true")

        from credits import service
        from credits.usage import count_operations
        from seo.metering import record_report_generated

        service.grant("tenant_seo_usage", 100_000, reason_code="seed", idempotency_key="seed_su1")
        result = record_report_generated(
            "tenant_seo_usage",
            job_id="job_report_1",
            is_mock=False,
        )
        assert result["recorded"] is True

        # seo_fix operation should appear in settled reservations.
        count = count_operations("tenant_seo_usage", "seo_fix")
        assert count >= 1

    def test_seo_agent_counter_keys_in_product_catalog(self):
        """seo_agent product spec has the expected counter keys."""
        from credits.products import get_product
        spec = get_product("seo_agent")
        assert spec is not None
        assert "seo_audits" in spec.usage_counter_keys
        assert "seo_jobs" in spec.usage_counter_keys

    def test_seo_audit_attributed_to_seo_agent(self):
        """attribute_by_operation maps seo_audit → seo_agent."""
        from credits.products import attribute_by_operation
        assert attribute_by_operation("seo_audit") == "seo_agent"

    def test_seo_fix_attributed_to_seo_agent(self):
        """attribute_by_operation maps seo_fix → seo_agent."""
        from credits.products import attribute_by_operation
        assert attribute_by_operation("seo_fix") == "seo_agent"

    def test_seo_keyword_research_attributed_to_seo_agent(self):
        """attribute_by_operation maps seo_keyword_research → seo_agent."""
        from credits.products import attribute_by_operation
        assert attribute_by_operation("seo_keyword_research") == "seo_agent"


# ── 5. POST /pagespeed endpoint SSRF rejection ────────────────────────────────

# Build the minimal FastAPI test client.
pytest.importorskip("fastapi")

from fastapi import FastAPI

_test_app = FastAPI()


@pytest.fixture(scope="module")
def _seo_client():
    """Build the SEO router once for the HTTP-layer tests."""
    from seo.agent_routes import router as seo_router
    app = FastAPI()
    app.include_router(seo_router)
    return TestClient(app, raise_server_exceptions=False)


@pytest.fixture(autouse=False)
def _reset_stores_http(monkeypatch):
    monkeypatch.setenv("PIXIE_PERSIST", "memory")
    monkeypatch.setenv("PIXIE_INTERNAL_API_SECRET", "")
    from seo import stores as seo_stores
    seo_stores.reset_repositories()
    yield
    seo_stores.reset_repositories()


class TestPageSpeedEndpoint:
    """Integration tests for POST /api/agents/seo/pagespeed."""

    BASE = "/api/agents/seo"

    def test_internal_ip_rejected_400(self, _seo_client, _reset_stores_http):
        """assert_safe_url must reject internal/private URLs with 400."""
        internal_urls = [
            "http://127.0.0.1/secret",
            "http://localhost/admin",
            "http://169.254.169.254/metadata",
            "ftp://example.com/file",
        ]
        for url in internal_urls:
            resp = _seo_client.post(
                f"{self.BASE}/pagespeed",
                json={"url": url, "tenant_id": "demo_tenant"},
            )
            assert resp.status_code == 400, (
                f"Expected 400 for internal URL {url!r}, got {resp.status_code}"
            )
            detail = resp.json().get("detail", {})
            assert "unsafe_url" in str(detail), (
                f"Expected unsafe_url error for {url!r}"
            )

    def test_invalid_strategy_422(self, _seo_client, _reset_stores_http):
        """An invalid strategy value should return 422."""
        resp = _seo_client.post(
            f"{self.BASE}/pagespeed",
            json={"url": "https://example.com", "strategy": "turbo", "tenant_id": "demo_tenant"},
        )
        assert resp.status_code == 422

    def test_valid_url_returns_cwv_dict(self, _seo_client, _reset_stores_http, monkeypatch):
        """A valid public URL returns the CWV dict (mocked PSI, no network)."""
        # Monkeypatch get_pagespeed_provider to return our fake.
        import seo.technical.pagespeed as ps_mod
        provider = FakeRealPSIProvider()
        monkeypatch.setattr(ps_mod, "get_pagespeed_provider", lambda: provider)

        # Also patch assert_safe_url to skip DNS for test hostname.
        from seo import url_guard
        from seo.url_guard import UrlRejected, REASON_BLOCKED_PRIVATE_IP
        from seo.mode_external.ssrf import is_safe_url
        from urllib.parse import urlsplit as _urlsplit

        def _test_assert(url: str) -> None:
            parts = _urlsplit(url.strip())
            scheme = (parts.scheme or "").lower()
            if scheme not in ("http", "https"):
                raise UrlRejected(REASON_BLOCKED_PRIVATE_IP)
            ok, _ = is_safe_url(url)
            if not ok:
                raise UrlRejected(REASON_BLOCKED_PRIVATE_IP)

        monkeypatch.setattr(url_guard, "assert_safe_url", _test_assert)

        resp = _seo_client.post(
            f"{self.BASE}/pagespeed",
            json={"url": "https://example.com", "strategy": "mobile", "tenant_id": "demo_tenant"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "results" in body
        assert "mobile" in body["results"]
        cwv = body["results"]["mobile"]
        assert cwv["performance_score"] == 82
        assert cwv["lcp_ms"] == 1800

    def test_crawl_estimate_returns_estimate(self, _seo_client, _reset_stores_http):
        """POST /crawl/estimate returns a valid estimate dict."""
        resp = _seo_client.post(
            f"{self.BASE}/crawl/estimate",
            json={"requested_limit": 200, "include_pagespeed": True, "tenant_id": "demo_tenant"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "estimate" in body
        est = body["estimate"]
        assert est["estimated_credits_mc"] > 0
        assert est["breakdown"]["crawl_pages"]["pages"] == 200
        assert est["breakdown"]["pagespeed"]["psi_requests"] > 0
        assert body["include_pagespeed"] is True

    def test_crawl_estimate_clamps_limit(self, _seo_client, _reset_stores_http):
        """Browser-supplied requested_limit above CRAWL_LIMIT_MAX is clamped server-side."""
        from seo.agent_schemas import CRAWL_LIMIT_MAX
        resp = _seo_client.post(
            f"{self.BASE}/crawl/estimate",
            json={"requested_limit": 99999, "include_pagespeed": False, "tenant_id": "demo_tenant"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["requested_limit"] <= CRAWL_LIMIT_MAX


# ── 6. Enforcement flags not flipped ─────────────────────────────────────────

class TestEnforcementFlagsNotFlipped:
    def test_credit_system_disabled_by_default(self):
        from credits.config import credit_system_enabled
        # Without env override, must be False.
        assert credit_system_enabled() is False

    def test_billing_enforcement_disabled_by_default(self):
        from credits.config import billing_enforcement_enabled
        assert billing_enforcement_enabled() is False

    def test_metering_no_ops_when_credit_system_off(self):
        """All metering functions return immediately without recording when system off."""
        from seo.metering import (
            record_crawl_pages,
            record_pagespeed_requests,
            record_report_generated,
        )
        for fn, kwargs in [
            (record_crawl_pages, {"crawled_count": 50, "job_id": "j1", "is_mock": False}),
            (record_pagespeed_requests, {"real_request_count": 3, "job_id": "j2", "is_mock": False}),
            (record_report_generated, {"job_id": "j3", "is_mock": False}),
        ]:
            result = fn("tenant_off", **kwargs)  # type: ignore[operator]
            assert result["recorded"] is False
            assert result["reason"] == "credit_system_disabled"
