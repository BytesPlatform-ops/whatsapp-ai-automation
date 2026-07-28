"""Tests for seo/reporting — PDF generation, assembler, store, routes, migration.

All tests are hermetic: no network, no paid calls, in-memory persistence.
PDF bytes are validated by asserting they start with b"%PDF-" and are non-trivial
in size. Content assertions decode the ASCII85 + zlib-compressed PDF content
streams to inspect the actual rendered text.

Coverage:
  - Each report kind renders to valid PDF bytes
  - User-controlled strings are escaped (XSS / formula injection / HTML special chars)
  - "Data unavailable" labels are present when a vertical is absent or empty
  - Tenant-safe download (Tenant B token rejected for Tenant A report → 404/403)
  - Expiring token rejected after TTL
  - Large-report truncation note rendered
  - Store: roundtrip create + read + list
  - Download token: generate/validate, expiry, cross-tenant rejection
  - Routes: POST generate, GET list, GET download (happy path + error paths)
  - Migration coverage: seo_generated_reports table present in SQL file
  - CSV/JSON import regression (assembler, pdf, store modules still importable)
"""

from __future__ import annotations

import os
import re
import sys
import time
from pathlib import Path
from typing import Optional
from unittest.mock import patch

import zlib
import pytest

# ── Path setup ────────────────────────────────────────────────────────────────

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(BACKEND_DIR))

# Force memory persistence for all tests
os.environ.setdefault("PIXIE_PERSIST", "memory")

# ── Imports (must not fail) ───────────────────────────────────────────────────

# Regression: these modules must remain importable (no broken imports)
import seo.reporting.assembler as assembler_mod   # noqa: E402
import seo.reporting.pdf as pdf_mod               # noqa: E402
import seo.reporting.store as store_mod           # noqa: E402

from seo.reporting.assembler import assemble_report, REPORT_KINDS  # noqa: E402
from seo.reporting.pdf import render_pdf, _esc, PDFTimeoutError    # noqa: E402
from seo.reporting.store import (                                   # noqa: E402
    GeneratedReport,
    GeneratedReportRepository,
    get_generated_report_repository,
    reset_repository,
    cache_pdf_bytes,
    get_pdf_bytes,
    clear_pdf_cache,
    generate_download_token,
    validate_download_token,
    DownloadTokenError,
)

# ── PDF text extraction helper ────────────────────────────────────────────────

def _pdf_text(pdf_bytes: bytes) -> str:
    """Extract all text from a ReportLab-generated PDF's compressed streams.

    ReportLab uses ASCII85 + zlib-compression for content streams.
    This function decodes them and returns concatenated text as a single string.
    Raises no exceptions — returns empty string on decode failure.
    """
    import re as _re

    def _a85decode(data: bytes) -> bytes:
        """Decode an ASCII85 byte sequence (without the ~> trailer)."""
        result = bytearray()
        buf = []
        for b in data:
            if b in (32, 9, 10, 13, 0):   # whitespace
                continue
            if b == ord("z"):
                result.extend([0, 0, 0, 0])
                buf = []
                continue
            buf.append(b)
            if len(buf) == 5:
                n = 0
                for c in buf:
                    n = n * 85 + (c - 33)
                result.extend(n.to_bytes(4, "big"))
                buf = []
        if buf:
            padding = 5 - len(buf)
            padded = buf + [ord("u")] * padding
            n = 0
            for c in padded:
                n = n * 85 + (c - 33)
            result.extend(n.to_bytes(4, "big")[: 4 - padding])
        return bytes(result)

    text_parts = []

    # Extract raw stream bytes (ASCII85+zlib compressed)
    for raw in _re.findall(b"stream\n(.*?)endstream", pdf_bytes, _re.DOTALL):
        raw = raw.strip()
        if raw.endswith(b"~>"):
            raw = raw[:-2]
        try:
            a85 = _a85decode(raw)
            decoded = zlib.decompress(a85).decode("latin-1", errors="replace")
            text_parts.append(decoded)
        except Exception:
            # Fall back to plain text extraction from the raw chunk
            try:
                text_parts.append(raw.decode("latin-1", errors="replace"))
            except Exception:
                pass

    # Also extract literal string tokens (TJ / Tj operators) from uncompressed parts
    for tok in _re.findall(rb"\(([^)\\]*(?:\\.[^)\\]*)*)\)", pdf_bytes):
        try:
            text_parts.append(tok.decode("latin-1", errors="replace"))
        except Exception:
            pass

    return "\n".join(text_parts)


# ── Fixtures ──────────────────────────────────────────────────────────────────

TENANT_A = "tenant_alpha"
TENANT_B = "tenant_beta"
SITE_A   = "site_test_001"


@pytest.fixture(autouse=True)
def _reset(monkeypatch):
    """Reset all repositories + cache between tests."""
    monkeypatch.setenv("PIXIE_PERSIST", "memory")
    monkeypatch.setenv("SEO_PDF_ENABLED", "1")
    import seo.stores as stores
    import seo.search_stores as search_stores
    stores.reset_repositories()
    search_stores.reset_repositories()
    reset_repository()
    clear_pdf_cache()
    yield
    stores.reset_repositories()
    search_stores.reset_repositories()
    reset_repository()
    clear_pdf_cache()


def _minimal_report(kind: str = "technical_audit") -> dict:
    """Assemble a report with no data seeded — all sections should be unavailable."""
    return assemble_report(
        TENANT_A, SITE_A,
        kind=kind, date_from="2026-01-01", date_to="2026-01-31",
    )


def _seed_site():
    """Seed a Site record so site_info section is available."""
    from seo.stores import Site, get_site_repository
    repo = get_site_repository()
    site = Site(
        tenant_id=TENANT_A,
        domain="example.com",
        display_name="Example Site",
        canonical_base_url="https://example.com",
    )
    sid, _ = repo.create(site)
    return sid


def _seed_crawl_report(site_id: str):
    """Seed a crawl job + report record."""
    from seo.stores import (
        CrawlJob, Report,
        get_crawl_job_repository, get_report_repository,
    )
    job = CrawlJob(tenant_id=TENANT_A, site_id=site_id)
    job_id, _ = get_crawl_job_repository().create(job)

    report = Report(
        tenant_id=TENANT_A, site_id=site_id, crawl_job_id=job_id,
        score=72,
        category_scores={"meta": 80, "links": 65, "performance": 70},
        issue_counts={"critical": 1, "high": 3, "medium": 5, "low": 2, "total": 11},
    )
    get_report_repository().create(report)
    return job_id


def _seed_issues(site_id: str, job_id: str, count: int = 5):
    """Seed open SEO issues."""
    from seo.stores import SeoIssue, get_issue_repository
    from seo.schemas import Severity
    repo = get_issue_repository()
    for i in range(count):
        issue = SeoIssue(
            tenant_id=TENANT_A, site_id=site_id, crawl_job_id=job_id,
            page_id=f"page_{i}", rule_key=f"rule_{i}",
            category="meta", severity=Severity.HIGH,
            recommendation=f"Fix recommendation {i}",
        )
        repo.create(issue)


def _seed_keywords(site_id: str):
    """Seed keyword records."""
    from seo.search_stores import Keyword, get_keyword_repository
    repo = get_keyword_repository()
    kw = Keyword(
        tenant_id=TENANT_A, project_id="proj_1",
        keyword="seo tools", site_id=site_id,
        current_rank=5, search_volume=1200,
    )
    repo.create(kw)


def _seed_opportunity(site_id: str):
    """Seed an open opportunity."""
    from seo.search_stores import SeoOpportunity, get_opportunity_repository
    repo = get_opportunity_repository()
    opp = SeoOpportunity(
        tenant_id=TENANT_A, site_id=site_id,
        opp_type="low_ctr", keyword="test keyword",
        page_url="https://example.com/page",
        estimated_impact="high", effort="medium",
        priority_score=0.85, recommended_action="Improve title tag",
    )
    repo.create(opp)


# ── 1. Escape function unit tests ─────────────────────────────────────────────

def test_esc_html_special_chars():
    assert "&amp;" in _esc("a & b")
    assert "&lt;" in _esc("<script>")
    assert "&gt;" in _esc(">alert")
    assert "&quot;" in _esc('"quoted"')


def test_esc_formula_injection():
    """Values starting with = + - @ | should be prefixed with ' to neutralise."""
    assert _esc("=SUM(A1)").startswith("'")
    assert _esc("+cmd").startswith("'")
    assert _esc("-1+1").startswith("'")
    assert _esc("@foo").startswith("'")
    assert _esc("|bar").startswith("'")


def test_esc_script_like_string():
    result = _esc("<script>alert('xss')</script>")
    assert "<script>" not in result
    assert "alert" in result  # content present but tags stripped


def test_esc_none_returns_empty():
    assert _esc(None) == ""


def test_esc_length_cap():
    long_str = "A" * 1000
    assert len(_esc(long_str)) <= 510  # 500 chars + possible quote prefix


# ── 2. Assembler: unavailable sections ───────────────────────────────────────

def test_assembler_returns_dict_with_required_keys():
    report = _minimal_report("technical_audit")
    assert "tenant" in report
    assert "site_id" in report
    assert "kind" in report
    assert "assembled_at" in report


def test_assembler_site_info_unavailable_when_no_site():
    report = _minimal_report("technical_audit")
    assert report["site_info"]["unavailable"] is True
    assert "data_source" in report["site_info"]


def test_assembler_technical_health_unavailable_when_no_report():
    report = _minimal_report("technical_audit")
    assert report["technical_health"]["unavailable"] is True
    assert "reason" in report["technical_health"]


def test_assembler_technical_issues_unavailable_when_no_issues():
    report = _minimal_report("technical_audit")
    assert report["technical_issues"]["unavailable"] is True


def test_assembler_opportunities_unavailable_when_none():
    report = _minimal_report("technical_audit")
    assert report["opportunities"]["unavailable"] is True


def test_assembler_gsc_unavailable_when_no_data():
    report = _minimal_report("search_performance")
    assert report["gsc_summary"]["unavailable"] is True


def test_assembler_ga4_unavailable_when_no_data():
    report = _minimal_report("search_performance")
    assert report["ga4_summary"]["unavailable"] is True


def test_assembler_keyword_unavailable_when_none():
    report = _minimal_report("keyword_ranking")
    assert report["keyword_rankings"]["unavailable"] is True


def test_assembler_backlink_section_unavailable():
    report = _minimal_report("backlink")
    assert report["backlinks"]["unavailable"] is True
    assert "backlink" in report["backlinks"]["data_source"].lower() or \
           "unavailable" in report["backlinks"].get("reason", "").lower()


def test_assembler_local_seo_section_unavailable():
    report = _minimal_report("local_seo")
    assert report["local_seo"]["unavailable"] is True


def test_assembler_invalid_kind_raises():
    with pytest.raises(ValueError, match="Unknown report kind"):
        assemble_report(TENANT_A, SITE_A, kind="invalid_kind",
                        date_from="2026-01-01", date_to="2026-01-31")


def test_assembler_executive_includes_all_sections():
    report = _minimal_report("executive")
    assert "technical_health" in report
    assert "gsc_summary" in report
    assert "keyword_rankings" in report
    assert "competitor_comparison" in report
    assert "backlinks" in report
    assert "local_seo" in report
    assert "opportunities" in report
    assert "completed_fixes" in report


def test_assembler_with_site_data():
    sid = _seed_site()
    report = assemble_report(
        TENANT_A, sid,
        kind="technical_audit", date_from="2026-01-01", date_to="2026-01-31",
    )
    assert report["site_info"]["unavailable"] is False
    assert report["site_info"]["data"]["domain"] == "example.com"


def test_assembler_with_full_technical_data():
    sid = _seed_site()
    job_id = _seed_crawl_report(sid)
    _seed_issues(sid, job_id, count=3)
    report = assemble_report(
        TENANT_A, sid,
        kind="technical_audit", date_from="2026-01-01", date_to="2026-01-31",
    )
    assert report["technical_health"]["unavailable"] is False
    assert report["technical_health"]["data"]["score"] == 72
    assert report["technical_issues"]["unavailable"] is False


# ── 3. PDF rendering: all kinds produce valid PDF ────────────────────────────

@pytest.mark.parametrize("kind", list(REPORT_KINDS))
def test_pdf_renders_for_each_kind(kind):
    """Each kind must produce bytes starting with %PDF- and be non-trivial size."""
    report = _minimal_report(kind)
    pdf = render_pdf(report, workspace_name="Test Workspace")
    assert isinstance(pdf, bytes)
    assert pdf.startswith(b"%PDF-"), f"Kind {kind!r}: PDF header missing"
    assert len(pdf) > 500, f"Kind {kind!r}: PDF suspiciously small ({len(pdf)} bytes)"


def test_pdf_with_seeded_data():
    """PDF with real data is larger than the empty-data version."""
    sid = _seed_site()
    job_id = _seed_crawl_report(sid)
    _seed_issues(sid, job_id, count=10)
    _seed_keywords(sid)
    _seed_opportunity(sid)

    report = assemble_report(
        TENANT_A, sid,
        kind="executive", date_from="2026-01-01", date_to="2026-01-31",
    )
    pdf = render_pdf(report, workspace_name="Acme Corp")
    assert pdf.startswith(b"%PDF-")
    assert len(pdf) > 2000


def test_pdf_workspace_name_in_content():
    """Workspace name appears in the decoded PDF content stream."""
    report = _minimal_report("technical_audit")
    ws = "PixieTestWorkspace"
    pdf = render_pdf(report, workspace_name=ws)
    text = _pdf_text(pdf)
    assert "PixieTestWorkspace" in text or "PixieTest" in text


def test_pdf_unavailable_label_present():
    """When a section is unavailable, the PDF must contain the 'unavailable' notice."""
    report = _minimal_report("technical_audit")
    pdf = render_pdf(report, workspace_name="WS")
    text = _pdf_text(pdf)
    assert "unavailable" in text.lower() or "Data unavailable" in text


# ── 4. Escape: user strings neutralised in PDF output ─────────────────────────

def test_pdf_escapes_html_in_site_name():
    """Business name with HTML special chars must not appear as raw tags in PDF text."""
    from seo.stores import Site, get_site_repository
    sid_val = _seed_site()
    # Update the site name with dangerous content
    repo = get_site_repository()
    repo.update(TENANT_A, sid_val, display_name='<b>EVIL</b> & "quoted"')

    report = assemble_report(
        TENANT_A, sid_val,
        kind="technical_audit", date_from="2026-01-01", date_to="2026-01-31",
    )
    pdf = render_pdf(report, workspace_name='<script>alert(1)</script>')
    # The raw script tag must not appear literally in the decoded text
    text = _pdf_text(pdf)
    # canvas.drawString uses _esc_canvas (strips tags); Paragraphs use _esc (html-encodes)
    # Either way the literal <script> tag must not survive into the PDF content
    assert "<script>" not in text
    # The raw <b>EVIL</b> literal must not appear (either stripped or encoded)
    assert "<b>EVIL</b>" not in text


def test_pdf_escapes_formula_injection_in_recommendation():
    """A recommendation starting with = (formula injection) is neutralised."""
    sid = _seed_site()
    job_id = _seed_crawl_report(sid)

    from seo.stores import SeoIssue, get_issue_repository
    from seo.schemas import Severity
    repo = get_issue_repository()
    issue = SeoIssue(
        tenant_id=TENANT_A, site_id=sid, crawl_job_id=job_id,
        page_id="page_evil", rule_key="test_rule",
        category="meta", severity=Severity.HIGH,
        recommendation="=SUM(A1:A100) & DROP TABLE users;",
    )
    repo.create(issue)

    report = assemble_report(
        TENANT_A, sid,
        kind="technical_audit", date_from="2026-01-01", date_to="2026-01-31",
    )
    pdf = render_pdf(report, workspace_name="WS")
    text = _pdf_text(pdf)
    # The raw formula prefix should be neutralised (prefixed with ' by _esc)
    # The literal =SUM( must not appear unescaped as the first character of a cell
    assert "=SUM(A1:A100)" not in text


def test_pdf_escapes_script_in_keyword():
    """A keyword with script-like content is escaped in the PDF."""
    sid = _seed_site()
    from seo.search_stores import Keyword, get_keyword_repository
    repo = get_keyword_repository()
    kw = Keyword(
        tenant_id=TENANT_A, project_id="p1",
        keyword='<script>alert("xss")</script>',
        site_id=sid,
    )
    repo.create(kw)

    report = assemble_report(
        TENANT_A, sid,
        kind="keyword_ranking", date_from="2026-01-01", date_to="2026-01-31",
    )
    pdf = render_pdf(report, workspace_name="WS")
    text = _pdf_text(pdf)
    # The raw <script> tag must not appear in decoded text
    assert "<script>" not in text


# ── 5. Truncation ─────────────────────────────────────────────────────────────

def test_pdf_large_issue_list_truncation():
    """When issues exceed MAX_TABLE_ROWS, a truncation note is rendered."""
    from seo.reporting.pdf import MAX_TABLE_ROWS
    sid = _seed_site()
    job_id = _seed_crawl_report(sid)
    _seed_issues(sid, job_id, count=MAX_TABLE_ROWS + 10)

    report = assemble_report(
        TENANT_A, sid,
        kind="technical_audit", date_from="2026-01-01", date_to="2026-01-31",
    )
    pdf = render_pdf(report, workspace_name="WS")
    assert pdf.startswith(b"%PDF-")
    # Decode the PDF content streams to check for the truncation note
    text = _pdf_text(pdf)
    assert "truncated" in text.lower() or "more" in text.lower()


# ── 6. Store: roundtrip ───────────────────────────────────────────────────────

def test_store_create_and_get():
    repo = get_generated_report_repository()
    meta = GeneratedReport(
        tenant_id=TENANT_A, site_id=SITE_A,
        kind="technical_audit", date_from="2026-01-01", date_to="2026-01-31",
        byte_size=12345, sha256="abc123", expires_at="2026-02-01T00:00:00Z",
    )
    rid, saved = repo.create(meta)
    assert rid.startswith("pdfrpt_")
    assert saved.tenant_id == TENANT_A

    pair = repo.get(TENANT_A, rid)
    assert pair is not None
    _, retrieved = pair
    assert retrieved.kind == "technical_audit"
    assert retrieved.sha256 == "abc123"
    assert retrieved.byte_size == 12345


def test_store_list_by_tenant():
    repo = get_generated_report_repository()
    for i in range(3):
        repo.create(GeneratedReport(
            tenant_id=TENANT_A, site_id=SITE_A,
            kind="technical_audit", date_from="2026-01-01", date_to="2026-01-31",
        ))
    pairs = repo.list_by_tenant(TENANT_A)
    assert len(pairs) == 3


def test_store_list_by_site_filter():
    repo = get_generated_report_repository()
    repo.create(GeneratedReport(tenant_id=TENANT_A, site_id="site_X",
                                kind="technical_audit", date_from="2026-01-01", date_to="2026-01-31"))
    repo.create(GeneratedReport(tenant_id=TENANT_A, site_id="site_Y",
                                kind="technical_audit", date_from="2026-01-01", date_to="2026-01-31"))
    pairs = repo.list_by_site(TENANT_A, "site_X")
    assert len(pairs) == 1
    assert pairs[0][1].site_id == "site_X"


def test_store_cross_tenant_isolation():
    """Tenant B cannot read Tenant A's reports."""
    repo = get_generated_report_repository()
    meta = GeneratedReport(
        tenant_id=TENANT_A, site_id=SITE_A,
        kind="technical_audit", date_from="2026-01-01", date_to="2026-01-31",
    )
    rid, _ = repo.create(meta)
    # Tenant B lookup returns None
    assert repo.get(TENANT_B, rid) is None
    # Tenant B list returns empty
    assert repo.list_by_tenant(TENANT_B) == []


def test_pdf_bytes_cache_roundtrip():
    fake_pdf = b"%PDF-fake"
    report_id = "pdfrpt_testcache"
    cache_pdf_bytes(report_id, fake_pdf)
    assert get_pdf_bytes(report_id) == fake_pdf
    assert get_pdf_bytes("pdfrpt_nonexistent") is None


# ── 7. Download token ─────────────────────────────────────────────────────────

def test_download_token_generate_and_validate():
    rid = "pdfrpt_tok001"
    token = generate_download_token(rid, TENANT_A)
    payload = validate_download_token(token, expected_tenant_id=TENANT_A, expected_report_id=rid)
    assert payload["rid"] == rid
    assert payload["tid"] == TENANT_A


def test_download_token_expired(monkeypatch):
    """Token rejected after TTL.

    We monkeypatch the time module imported by seo.reporting.store so that
    validate_download_token sees the token as expired. We do NOT reload the module
    (which would generate a new ephemeral key and break other tests).
    """
    import seo.reporting.store as store_module
    import time as time_mod

    rid = "pdfrpt_expiry"
    # Generate token at real current time
    token = generate_download_token(rid, TENANT_A)

    # Advance the time seen by store.validate_download_token
    real_time = time_mod.time()
    monkeypatch.setattr(store_module.time, "time", lambda: real_time + 9999)
    monkeypatch.setenv("SEO_PDF_TOKEN_TTL", "300")

    with pytest.raises(DownloadTokenError, match="expired"):
        validate_download_token(token, expected_tenant_id=TENANT_A, expected_report_id=rid)


def test_download_token_tampered():
    rid = "pdfrpt_tamper"
    token = generate_download_token(rid, TENANT_A)
    # Tamper with the payload
    parts = token.split(".")
    tampered = parts[0] + "X." + parts[1]
    with pytest.raises(DownloadTokenError):
        validate_download_token(tampered, expected_tenant_id=TENANT_A, expected_report_id=rid)


def test_download_token_cross_tenant_rejected():
    """Token for TENANT_A rejected when TENANT_B is the expected tenant."""
    rid = "pdfrpt_cross"
    token = generate_download_token(rid, TENANT_A)
    with pytest.raises(DownloadTokenError, match="tenant"):
        validate_download_token(token, expected_tenant_id=TENANT_B, expected_report_id=rid)


def test_download_token_wrong_report_id():
    """Token for report A rejected when report B is expected."""
    token = generate_download_token("pdfrpt_A", TENANT_A)
    with pytest.raises(DownloadTokenError, match="report_id"):
        validate_download_token(token, expected_tenant_id=TENANT_A, expected_report_id="pdfrpt_B")


def test_download_token_malformed():
    with pytest.raises(DownloadTokenError, match="malformed"):
        validate_download_token("notavalidtoken", expected_tenant_id=TENANT_A, expected_report_id="x")


# ── 8. Routes ─────────────────────────────────────────────────────────────────

@pytest.fixture
def client():
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from seo.reporting.routes import router as pdf_router
    app = FastAPI()
    app.include_router(pdf_router)
    return TestClient(app)


def test_route_generate_pdf(client, monkeypatch):
    monkeypatch.setenv("SEO_PDF_ENABLED", "1")
    _seed_site()
    resp = client.post("/api/agents/seo/reports/pdf", json={
        "tenant_id": TENANT_A,
        "site_id": SITE_A,
        "kind": "technical_audit",
        "date_from": "2026-01-01",
        "date_to": "2026-01-31",
        "workspace_name": "Test WS",
    })
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "report_id" in data
    assert "download_url" in data
    assert data["kind"] == "technical_audit"
    assert data["byte_size"] > 0
    assert data["sha256"]


def test_route_generate_pdf_invalid_kind(client):
    resp = client.post("/api/agents/seo/reports/pdf", json={
        "tenant_id": TENANT_A,
        "site_id": SITE_A,
        "kind": "bad_kind",
        "date_from": "2026-01-01",
        "date_to": "2026-01-31",
    })
    assert resp.status_code == 400
    assert "invalid_report_kind" in resp.text


def test_route_generate_pdf_invalid_date_range(client):
    resp = client.post("/api/agents/seo/reports/pdf", json={
        "tenant_id": TENANT_A,
        "site_id": SITE_A,
        "kind": "technical_audit",
        "date_from": "2026-03-01",
        "date_to": "2026-01-01",  # date_to < date_from
    })
    assert resp.status_code == 400
    assert "invalid_date_range" in resp.text or "invalid_date" in resp.text


def test_route_list_pdf_reports(client, monkeypatch):
    monkeypatch.setenv("SEO_PDF_ENABLED", "1")
    # Generate one report first
    client.post("/api/agents/seo/reports/pdf", json={
        "tenant_id": TENANT_A, "site_id": SITE_A,
        "kind": "technical_audit", "date_from": "2026-01-01", "date_to": "2026-01-31",
    })
    resp = client.get("/api/agents/seo/reports/pdf", params={"tenant_id": TENANT_A})
    assert resp.status_code == 200
    data = resp.json()
    assert "reports" in data
    assert data["total"] >= 1


def test_route_download_pdf_happy_path(client, monkeypatch):
    monkeypatch.setenv("SEO_PDF_ENABLED", "1")
    # Generate
    gen_resp = client.post("/api/agents/seo/reports/pdf", json={
        "tenant_id": TENANT_A, "site_id": SITE_A,
        "kind": "technical_audit", "date_from": "2026-01-01", "date_to": "2026-01-31",
    })
    assert gen_resp.status_code == 200
    data = gen_resp.json()
    report_id = data["report_id"]

    # Extract token from download_url
    download_url = data["download_url"]
    token = download_url.split("token=", 1)[1]

    dl_resp = client.get(
        f"/api/agents/seo/reports/pdf/{report_id}/download",
        params={"tenant_id": TENANT_A, "token": token},
    )
    assert dl_resp.status_code == 200
    assert dl_resp.headers["content-type"] == "application/pdf"
    assert dl_resp.content.startswith(b"%PDF-")


def test_route_download_cross_tenant_returns_403(client, monkeypatch):
    """Tenant B using a token generated for Tenant A's report gets 403."""
    monkeypatch.setenv("SEO_PDF_ENABLED", "1")
    gen_resp = client.post("/api/agents/seo/reports/pdf", json={
        "tenant_id": TENANT_A, "site_id": SITE_A,
        "kind": "technical_audit", "date_from": "2026-01-01", "date_to": "2026-01-31",
    })
    assert gen_resp.status_code == 200
    data = gen_resp.json()
    report_id = data["report_id"]
    download_url = data["download_url"]
    token = download_url.split("token=", 1)[1]

    # Tenant B tries to download using Tenant A's token (tenant mismatch)
    dl_resp = client.get(
        f"/api/agents/seo/reports/pdf/{report_id}/download",
        params={"tenant_id": TENANT_B, "token": token},
    )
    # Should get 403 (token tenant mismatch) or 404 (not found in tenant B scope)
    assert dl_resp.status_code in (403, 404)


def test_route_download_expired_token(client, monkeypatch):
    """Expired token returns 403.

    We generate a report first (with normal TTL), then patch time.time in the
    store module so the download validation sees the token as expired.
    """
    import time as time_mod
    import seo.reporting.store as store_module
    monkeypatch.setenv("SEO_PDF_ENABLED", "1")

    gen_resp = client.post("/api/agents/seo/reports/pdf", json={
        "tenant_id": TENANT_A, "site_id": SITE_A,
        "kind": "technical_audit", "date_from": "2026-01-01", "date_to": "2026-01-31",
    })
    assert gen_resp.status_code == 200, gen_resp.text
    data = gen_resp.json()
    report_id = data["report_id"]
    download_url = data["download_url"]
    token = download_url.split("token=", 1)[1]

    # Advance time so token appears expired — patch store module's time reference
    real_time = time_mod.time()
    monkeypatch.setattr(store_module.time, "time", lambda: real_time + 99999)

    dl_resp = client.get(
        f"/api/agents/seo/reports/pdf/{report_id}/download",
        params={"tenant_id": TENANT_A, "token": token},
    )
    # 403 expected for expired token
    assert dl_resp.status_code == 403


def test_route_pdf_disabled_returns_400(client, monkeypatch):
    """When SEO_PDF_ENABLED=0, all PDF endpoints return 400."""
    monkeypatch.setenv("SEO_PDF_ENABLED", "0")
    resp = client.post("/api/agents/seo/reports/pdf", json={
        "tenant_id": TENANT_A, "site_id": SITE_A,
        "kind": "technical_audit", "date_from": "2026-01-01", "date_to": "2026-01-31",
    })
    assert resp.status_code == 400
    assert "seo_pdf_disabled" in resp.text

    list_resp = client.get("/api/agents/seo/reports/pdf", params={"tenant_id": TENANT_A})
    assert list_resp.status_code == 400

    dl_resp = client.get(
        "/api/agents/seo/reports/pdf/some_id/download",
        params={"tenant_id": TENANT_A, "token": "fake"},
    )
    assert dl_resp.status_code == 400


def test_route_download_invalid_token_returns_403(client, monkeypatch):
    monkeypatch.setenv("SEO_PDF_ENABLED", "1")
    dl_resp = client.get(
        "/api/agents/seo/reports/pdf/pdfrpt_xyz/download",
        params={"tenant_id": TENANT_A, "token": "garbage.token"},
    )
    assert dl_resp.status_code == 403


# ── 9. Migration coverage ─────────────────────────────────────────────────────

REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent
MIGRATION_FILE = REPO_ROOT / "supabase" / "migrations" / "20260802_seo_reports.sql"


def _created_tables(sql: str) -> set:
    return {
        m.lower() for m in re.findall(
            r'create\s+table\s+(?:if\s+not\s+exists\s+)?"?([a-zA-Z_]+)"?',
            sql, re.I
        )
    }


def test_migration_file_exists():
    assert MIGRATION_FILE.exists(), (
        f"Migration file not found: {MIGRATION_FILE}\n"
        "Expected: supabase/migrations/20260802_seo_reports.sql"
    )


def test_migration_covers_generated_reports_table():
    sql = MIGRATION_FILE.read_text()
    tables = _created_tables(sql)
    assert "seo_generated_reports" in tables, (
        f"seo_generated_reports not found in migration tables: {tables}"
    )


def test_migration_enables_rls():
    sql = MIGRATION_FILE.read_text().lower()
    assert "enable row level security" in sql, (
        "Migration must ENABLE ROW LEVEL SECURITY on seo_generated_reports"
    )


def test_migration_has_tenant_index():
    sql = MIGRATION_FILE.read_text().lower()
    assert "tenant_id" in sql and "index" in sql, (
        "Migration should define at least one index on tenant_id"
    )


def test_store_table_name_matches_migration():
    """The repository table_name must match the migration."""
    assert GeneratedReportRepository.table_name == "seo_generated_reports"


# ── 10. CSV / JSON import regression ──────────────────────────────────────────

def test_assembler_module_importable():
    """seo.reporting.assembler must remain importable — no broken deps."""
    import importlib
    m = importlib.import_module("seo.reporting.assembler")
    assert hasattr(m, "assemble_report")


def test_pdf_module_importable():
    """seo.reporting.pdf must remain importable."""
    import importlib
    m = importlib.import_module("seo.reporting.pdf")
    assert hasattr(m, "render_pdf")


def test_store_module_importable():
    """seo.reporting.store must remain importable."""
    import importlib
    m = importlib.import_module("seo.reporting.store")
    assert hasattr(m, "get_generated_report_repository")


def test_routes_module_importable():
    """seo.reporting.routes must remain importable."""
    import importlib
    m = importlib.import_module("seo.reporting.routes")
    assert hasattr(m, "router")


def test_init_module_importable():
    """seo.reporting __init__ must remain importable."""
    import importlib
    m = importlib.import_module("seo.reporting")
    assert hasattr(m, "assemble_report")
    assert hasattr(m, "render_pdf")
