"""Tests for Fix Verification (seo.fix_verify + fix_verify_routes).

Coverage
--------
1. record_fix creates a PENDING FixVerification row.
2. verify_fix with a fetcher returning the intended value → VERIFIED.
3. verify_fix with a fetcher still returning the before_value → FAILED
   (remaining_evidence.still_matches_before is True).
4. verify_fix with a fetcher returning a third unexpected value → FAILED
   (still_matches_before is False).
5. verify_fix when fetch raises → row left with remaining_evidence.error.
6. Cross-tenant isolation: tenant B cannot verify or list tenant A's records.
7. list_fix_verifications filtering by issue_id and site_id.
8. HTTP routes: POST /fix-verify/record, POST /fix-verify/{fix_id}/verify,
   GET /fix-verify.

No network calls — all fetchers are injected fake callables.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

import pytest
from fastapi.testclient import TestClient

TENANT_A = "tenant_fv_a"
TENANT_B = "tenant_fv_b"


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def _reset(monkeypatch):
    monkeypatch.setenv("PIXIE_PERSIST", "memory")
    monkeypatch.setenv("PIXIE_INTERNAL_API_SECRET", "")
    import seo.stores as _st
    import seo.search_stores as _ss
    _st.reset_repositories()
    _ss.reset_repositories()
    yield
    _st.reset_repositories()
    _ss.reset_repositories()


@pytest.fixture()
def client():
    from app import app
    return TestClient(app)


@pytest.fixture()
def fv_client():
    """A TestClient that mounts only the fix_verify_routes router (+ the main app).

    This allows HTTP-level testing of fix-verify endpoints without requiring
    app.py to be modified.  The fix_verify_routes router uses the same prefix
    /api/agents/seo as the main seo_agent_router so it slots in naturally.
    """
    from fastapi import FastAPI
    from seo.fix_verify_routes import router as fv_router

    mini_app = FastAPI()
    mini_app.include_router(fv_router)
    return TestClient(mini_app)


def _hdr(tenant: str) -> dict:
    return {"X-Pixie-Tenant": tenant}


# ── HTML helpers ──────────────────────────────────────────────────────────────

def _html_with_title(title: str) -> str:
    return f"<html><head><title>{title}</title></head><body></body></html>"


def _html_with_meta(description: str) -> str:
    return (
        f'<html><head><meta name="description" content="{description}"></head>'
        f'<body></body></html>'
    )


def _html_with_h1(h1: str) -> str:
    return f"<html><body><h1>{h1}</h1></body></html>"


def _fetcher_for(html: str):
    """Return a callable (url) -> html that always returns the given HTML."""
    def _f(_url: str) -> str:
        return html
    return _f


def _failing_fetcher(_url: str) -> str:
    raise OSError("simulated network failure")


# ══════════════════════════════════════════════════════════════════════════════
# 1. record_fix — creates PENDING
# ══════════════════════════════════════════════════════════════════════════════

class TestRecordFix:
    def test_creates_pending(self):
        from seo.fix_verify import record_fix
        from seo.search_stores import VerifyStatus

        fix_id, fv = record_fix(
            TENANT_A,
            site_id="site_x",
            issue_id="issue_x",
            page_id="page_x",
            page_url="https://example.io/",
            rule_key="missing_title",
            applied_fix="Set title to 'About Us'",
            field_name="title",
            before_value="",
            intended_after_value="About Us",
        )
        assert fix_id.startswith("fixver_")
        assert fv.result == VerifyStatus.PENDING
        assert fv.tenant_id == TENANT_A
        assert fv.field_name == "title"
        assert fv.before_value == ""
        assert fv.intended_after_value == "About Us"

    def test_fix_id_unique(self):
        from seo.fix_verify import record_fix

        id1, _ = record_fix(
            TENANT_A, site_id="s", issue_id="i", page_id="p",
            page_url="https://a.io/", rule_key="r",
            applied_fix="f", field_name="title",
            before_value="Old", intended_after_value="New",
        )
        id2, _ = record_fix(
            TENANT_A, site_id="s", issue_id="i", page_id="p",
            page_url="https://a.io/", rule_key="r",
            applied_fix="f", field_name="title",
            before_value="Old", intended_after_value="New",
        )
        assert id1 != id2


# ══════════════════════════════════════════════════════════════════════════════
# 2. verify_fix — VERIFIED when page shows intended value
# ══════════════════════════════════════════════════════════════════════════════

class TestVerifyFix:
    def test_verified_when_title_matches_intended(self):
        from seo.fix_verify import record_fix, verify_fix
        from seo.search_stores import VerifyStatus

        fix_id, _ = record_fix(
            TENANT_A, site_id="s", issue_id="i", page_id="p",
            page_url="https://v.io/",
            rule_key="missing_title",
            applied_fix="Added title",
            field_name="title",
            before_value="",
            intended_after_value="About Us",
        )

        result = verify_fix(
            TENANT_A, fix_id,
            fetcher=_fetcher_for(_html_with_title("About Us")),
        )
        assert result is not None
        _, fv = result
        assert fv.result == VerifyStatus.VERIFIED
        assert fv.observed_after_value == "About Us"
        assert fv.remaining_evidence == {}

    def test_verified_trims_whitespace(self):
        from seo.fix_verify import record_fix, verify_fix
        from seo.search_stores import VerifyStatus

        fix_id, _ = record_fix(
            TENANT_A, site_id="s", issue_id="i", page_id="p",
            page_url="https://v.io/",
            rule_key="missing_title",
            applied_fix="trim test",
            field_name="title",
            before_value="",
            intended_after_value="About Us",
        )
        # HTML returns title with surrounding whitespace
        result = verify_fix(
            TENANT_A, fix_id,
            fetcher=_fetcher_for(_html_with_title("  About Us  ")),
        )
        _, fv = result
        assert fv.result == VerifyStatus.VERIFIED

    def test_verified_meta_description(self):
        from seo.fix_verify import record_fix, verify_fix
        from seo.search_stores import VerifyStatus

        fix_id, _ = record_fix(
            TENANT_A, site_id="s", issue_id="i", page_id="p",
            page_url="https://v.io/",
            rule_key="missing_meta_desc",
            applied_fix="Added description",
            field_name="meta_description",
            before_value="",
            intended_after_value="We sell widgets",
        )
        result = verify_fix(
            TENANT_A, fix_id,
            fetcher=_fetcher_for(_html_with_meta("We sell widgets")),
        )
        _, fv = result
        assert fv.result == VerifyStatus.VERIFIED

    def test_verified_h1(self):
        from seo.fix_verify import record_fix, verify_fix
        from seo.search_stores import VerifyStatus

        fix_id, _ = record_fix(
            TENANT_A, site_id="s", issue_id="i", page_id="p",
            page_url="https://v.io/",
            rule_key="missing_h1",
            applied_fix="Added H1",
            field_name="h1",
            before_value="",
            intended_after_value="Welcome to Pixie",
        )
        result = verify_fix(
            TENANT_A, fix_id,
            fetcher=_fetcher_for(_html_with_h1("Welcome to Pixie")),
        )
        _, fv = result
        assert fv.result == VerifyStatus.VERIFIED


# ══════════════════════════════════════════════════════════════════════════════
# 3. verify_fix — FAILED when page still shows before_value
# ══════════════════════════════════════════════════════════════════════════════

class TestVerifyFixFailed:
    def test_failed_when_still_shows_before_value(self):
        from seo.fix_verify import record_fix, verify_fix
        from seo.search_stores import VerifyStatus

        fix_id, _ = record_fix(
            TENANT_A, site_id="s", issue_id="i", page_id="p",
            page_url="https://fail.io/",
            rule_key="bad_title",
            applied_fix="Attempted fix",
            field_name="title",
            before_value="Old Title",
            intended_after_value="New Title",
        )
        result = verify_fix(
            TENANT_A, fix_id,
            fetcher=_fetcher_for(_html_with_title("Old Title")),
        )
        assert result is not None
        _, fv = result
        assert fv.result == VerifyStatus.FAILED
        assert fv.remaining_evidence.get("still_matches_before") is True
        assert fv.observed_after_value == "Old Title"

    def test_failed_with_third_value(self):
        """Observed is neither before_value nor intended → FAILED, still_matches_before=False."""
        from seo.fix_verify import record_fix, verify_fix
        from seo.search_stores import VerifyStatus

        fix_id, _ = record_fix(
            TENANT_A, site_id="s", issue_id="i", page_id="p",
            page_url="https://fail3.io/",
            rule_key="bad_title",
            applied_fix="Wrong fix",
            field_name="title",
            before_value="Old Title",
            intended_after_value="New Title",
        )
        result = verify_fix(
            TENANT_A, fix_id,
            fetcher=_fetcher_for(_html_with_title("Something Else")),
        )
        _, fv = result
        assert fv.result == VerifyStatus.FAILED
        assert fv.remaining_evidence.get("still_matches_before") is False
        assert fv.observed_after_value == "Something Else"

    def test_failed_when_fetch_raises(self):
        """A fetch failure leaves the row in FAILED with error in remaining_evidence."""
        from seo.fix_verify import record_fix, verify_fix
        from seo.search_stores import VerifyStatus

        fix_id, _ = record_fix(
            TENANT_A, site_id="s", issue_id="i", page_id="p",
            page_url="https://failnet.io/",
            rule_key="bad_title",
            applied_fix="Fix",
            field_name="title",
            before_value="Old",
            intended_after_value="New",
        )
        result = verify_fix(TENANT_A, fix_id, fetcher=_failing_fetcher)
        assert result is not None
        _, fv = result
        # Row should still have some error recorded
        assert fv.remaining_evidence.get("error") == "fetch_failed"


# ══════════════════════════════════════════════════════════════════════════════
# 4. Cross-tenant isolation
# ══════════════════════════════════════════════════════════════════════════════

class TestCrossTenantIsolation:
    def test_tenant_b_cannot_verify_tenant_a_fix(self):
        from seo.fix_verify import record_fix, verify_fix

        fix_id, _ = record_fix(
            TENANT_A, site_id="s", issue_id="i", page_id="p",
            page_url="https://iso.io/",
            rule_key="r",
            applied_fix="f",
            field_name="title",
            before_value="Old",
            intended_after_value="New",
        )
        # Tenant B tries to verify tenant A's record → None (not found)
        result = verify_fix(
            TENANT_B, fix_id,
            fetcher=_fetcher_for(_html_with_title("New")),
        )
        assert result is None

    def test_tenant_b_cannot_list_tenant_a_fixes(self):
        from seo.fix_verify import record_fix, list_fix_verifications

        record_fix(
            TENANT_A, site_id="s", issue_id="i", page_id="p",
            page_url="https://iso.io/",
            rule_key="r",
            applied_fix="f",
            field_name="title",
            before_value="Old",
            intended_after_value="New",
        )
        tenant_b_records = list_fix_verifications(TENANT_B)
        assert tenant_b_records == []


# ══════════════════════════════════════════════════════════════════════════════
# 5. list_fix_verifications filtering
# ══════════════════════════════════════════════════════════════════════════════

class TestListFixVerifications:
    def test_filter_by_issue_id(self):
        from seo.fix_verify import record_fix, list_fix_verifications

        record_fix(
            TENANT_A, site_id="s", issue_id="issue_1", page_id="p",
            page_url="https://x.io/",
            rule_key="r", applied_fix="f", field_name="title",
            before_value="", intended_after_value="New",
        )
        record_fix(
            TENANT_A, site_id="s", issue_id="issue_2", page_id="p",
            page_url="https://x.io/",
            rule_key="r", applied_fix="f", field_name="title",
            before_value="", intended_after_value="New",
        )

        result = list_fix_verifications(TENANT_A, issue_id="issue_1")
        assert len(result) == 1
        _, fv = result[0]
        assert fv.issue_id == "issue_1"

    def test_filter_by_site_id(self):
        from seo.fix_verify import record_fix, list_fix_verifications

        record_fix(
            TENANT_A, site_id="site_alpha", issue_id="i", page_id="p",
            page_url="https://x.io/",
            rule_key="r", applied_fix="f", field_name="title",
            before_value="", intended_after_value="New",
        )
        record_fix(
            TENANT_A, site_id="site_beta", issue_id="i", page_id="p",
            page_url="https://x.io/",
            rule_key="r", applied_fix="f", field_name="title",
            before_value="", intended_after_value="New",
        )

        result = list_fix_verifications(TENANT_A, site_id="site_alpha")
        assert len(result) == 1
        _, fv = result[0]
        assert fv.site_id == "site_alpha"

    def test_no_filter_returns_all(self):
        from seo.fix_verify import record_fix, list_fix_verifications

        for i in range(3):
            record_fix(
                TENANT_A, site_id="s", issue_id=f"issue_{i}", page_id="p",
                page_url="https://x.io/",
                rule_key="r", applied_fix="f", field_name="title",
                before_value="", intended_after_value="New",
            )
        result = list_fix_verifications(TENANT_A)
        assert len(result) == 3


# ══════════════════════════════════════════════════════════════════════════════
# 6. HTTP routes
# ══════════════════════════════════════════════════════════════════════════════

class TestFixVerifyRoutes:
    """HTTP-level tests that exercise the fix_verify_routes.router via TestClient.

    Uses ``fv_client`` (a mini FastAPI app mounting only fix_verify_routes)
    so these tests are self-contained and do not require app.py changes.
    """

    def _record_via_api(self, fv_client, tenant: str, **overrides) -> dict:
        payload = {
            "site_id": "site_x",
            "issue_id": "issue_x",
            "page_id": "page_x",
            "page_url": "https://route.io/",
            "rule_key": "missing_title",
            "applied_fix": "Set title",
            "field_name": "title",
            "before_value": "Old",
            "intended_after_value": "New Title",
        }
        payload.update(overrides)
        resp = fv_client.post(
            "/api/agents/seo/fix-verify/record",
            json=payload,
            headers=_hdr(tenant),
        )
        assert resp.status_code == 200, resp.text
        return resp.json()

    def test_record_returns_pending(self, fv_client):
        body = self._record_via_api(fv_client, TENANT_A)
        fv = body["fix_verification"]
        assert fv["result"] == "pending"
        assert fv["id"].startswith("fixver_")

    def test_list_empty_initially(self, fv_client):
        resp = fv_client.get("/api/agents/seo/fix-verify", headers=_hdr(TENANT_A))
        assert resp.status_code == 200
        assert resp.json()["fix_verifications"] == []

    def test_list_after_record(self, fv_client):
        self._record_via_api(fv_client, TENANT_A)
        resp = fv_client.get("/api/agents/seo/fix-verify", headers=_hdr(TENANT_A))
        assert resp.status_code == 200
        assert len(resp.json()["fix_verifications"]) == 1

    def test_list_filter_by_issue_id(self, fv_client):
        self._record_via_api(fv_client, TENANT_A, issue_id="issue_alpha")
        self._record_via_api(fv_client, TENANT_A, issue_id="issue_beta")

        resp = fv_client.get(
            "/api/agents/seo/fix-verify",
            params={"issue_id": "issue_alpha"},
            headers=_hdr(TENANT_A),
        )
        records = resp.json()["fix_verifications"]
        assert len(records) == 1
        assert records[0]["issue_id"] == "issue_alpha"

    def test_verify_route_not_found(self, fv_client):
        resp = fv_client.post(
            "/api/agents/seo/fix-verify/fixver_nope/verify",
            headers=_hdr(TENANT_A),
        )
        assert resp.status_code == 404

    def test_verify_route_cross_tenant_blocked(self, fv_client):
        """Tenant B cannot verify a fix belonging to tenant A."""
        body = self._record_via_api(fv_client, TENANT_A)
        fix_id = body["fix_verification"]["id"]

        resp = fv_client.post(
            f"/api/agents/seo/fix-verify/{fix_id}/verify",
            headers=_hdr(TENANT_B),
        )
        assert resp.status_code == 404

    def test_verify_route_returns_result(self, fv_client, monkeypatch):
        """Inject a fake fetcher into fix_verify.py to avoid network I/O."""
        import seo.fix_verify as fv_mod

        # Pre-create the fix record via API
        body = self._record_via_api(fv_client, TENANT_A)
        fix_id = body["fix_verification"]["id"]

        # Patch the production _default_fetcher so verify_fix never hits network
        intended_html = _html_with_title("New Title")
        monkeypatch.setattr(fv_mod, "_default_fetcher", _fetcher_for(intended_html))

        resp = fv_client.post(
            f"/api/agents/seo/fix-verify/{fix_id}/verify",
            headers=_hdr(TENANT_A),
        )
        assert resp.status_code == 200
        fv = resp.json()["fix_verification"]
        assert fv["result"] == "verified"
        assert fv["observed_after_value"] == "New Title"
