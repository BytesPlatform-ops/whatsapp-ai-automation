"""Safe PDF + website knowledge ingestion (Wave 6, Parts 4-8).

Hermetic + $0: PDF fixtures are generated in-process with reportlab (already a
dependency) and extracted with the stdlib zlib extractor — no OCR, no paid calls.
Website fetches are stubbed at the shared SSRF guard; real SSRF rejection is
exercised through the guard itself (no network).
"""

from __future__ import annotations

import io

import pytest


@pytest.fixture(autouse=True)
def _mem(monkeypatch):
    monkeypatch.setenv("PIXIE_PERSIST", "memory")
    monkeypatch.setenv("PIXIE_MODEL_MODE", "fake")
    from receptionist.service import stores
    stores.reset_all()
    yield
    stores.reset_all()


def _make_pdf(lines: list[str]) -> bytes:
    from reportlab.pdfgen import canvas
    from reportlab.lib.pagesizes import A4
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    y = 800
    for ln in lines:
        c.drawString(72, y, ln)
        y -= 20
    c.showPage()
    c.save()
    return buf.getvalue()


# ── PDF ───────────────────────────────────────────────────────────────────────

def test_pdf_validation_rejects_non_pdf():
    from receptionist.service import ingestion
    with pytest.raises(ingestion.IngestionError) as e:
        ingestion.validate_pdf(b"not a pdf at all")
    assert e.value.reason == "not_a_pdf"


def test_pdf_validation_rejects_encrypted():
    from receptionist.service import ingestion
    fake = b"%PDF-1.4\n/Encrypt 5 0 R\n"
    with pytest.raises(ingestion.IngestionError) as e:
        ingestion.validate_pdf(fake)
    assert e.value.reason == "encrypted_pdf"


def test_pdf_ingest_extracts_and_chunks():
    from receptionist.service import ingestion, stores
    pdf = _make_pdf(["Our cancellation policy requires 24 hours notice.",
                     "Cleaning costs ninety dollars."])
    src = ingestion.ingest_pdf("t_a", "../../etc/policy.pdf", pdf)
    assert src["source_type"] == "pdf"
    assert src["filename"] == "policy.pdf"  # path traversal stripped by basename
    assert src["index_status"] == "indexed" and src["chunk_count"] >= 1
    # chunks are retrievable and carry source metadata
    from receptionist.service import knowledge
    res = knowledge.retrieve("t_a", "what is the cancellation policy?")
    assert res["confident"]
    ev = res["evidence"][0]
    assert ev["source_type"] == "pdf" and ev["source_id"] == src["id"]


def test_pdf_page_limit(monkeypatch):
    from receptionist.service import ingestion
    monkeypatch.setenv("AI_RECEPTIONIST_KNOWLEDGE_MAX_PDF_PAGES", "1")
    # 3-page PDF
    from reportlab.pdfgen import canvas
    buf = io.BytesIO()
    c = canvas.Canvas(buf)
    for _ in range(3):
        c.drawString(72, 800, "page")
        c.showPage()
    c.save()
    with pytest.raises(ingestion.IngestionError) as e:
        ingestion.ingest_pdf("t_a", "big.pdf", buf.getvalue())
    assert e.value.reason == "too_many_pages"


def test_invalid_pdf_writes_nothing():
    from receptionist.service import ingestion, stores
    with pytest.raises(ingestion.IngestionError):
        ingestion.ingest_pdf("t_a", "x.pdf", b"garbage")
    assert stores.knowledge_sources().count("t_a") == 0
    assert stores.knowledge().count("t_a") == 0


# ── website ───────────────────────────────────────────────────────────────────

def test_website_ingest_with_stubbed_fetch(monkeypatch):
    from receptionist.service import ingestion, knowledge, stores
    html = ("<html><head><title>Bright Dental</title></head><body>"
            "<script>evil()</script><h1>Hours</h1>"
            "<p>We are open Monday to Friday 8am to 6pm.</p></body></html>")

    def fake_safe_fetch(url, **kw):
        return {"final_url": url, "status": 200, "headers": {}, "text": html,
                "content_type": "text/html"}

    monkeypatch.setattr("seo.url_guard.safe_fetch", fake_safe_fetch)
    src = ingestion.ingest_website("t_a", "https://brightdental.example/hours")
    assert src["source_type"] == "website" and src["index_status"] == "indexed"
    res = knowledge.retrieve("t_a", "when are you open?")
    assert res["confident"]
    ev = res["evidence"][0]
    assert ev["source_type"] == "website"
    assert "8am to 6pm" in ev["text"]
    assert "evil()" not in ev["text"]  # script stripped


def test_website_ingest_blocks_ssrf():
    from receptionist.service import ingestion
    for bad in ("http://localhost/admin", "http://169.254.169.254/latest/meta-data",
                "http://127.0.0.1:8000", "file:///etc/passwd"):
        with pytest.raises(ingestion.IngestionError):
            ingestion.ingest_website("t_a", bad)


def test_website_archive_excludes_from_retrieval(monkeypatch):
    from receptionist.service import ingestion, knowledge
    monkeypatch.setattr("seo.url_guard.safe_fetch", lambda url, **kw: {
        "final_url": url, "status": 200, "headers": {}, "content_type": "text/html",
        "text": "<title>Refunds</title><body>Refunds are given within fourteen days.</body>"})
    src = ingestion.ingest_website("t_a", "https://shop.example/refunds")
    assert knowledge.retrieve("t_a", "tell me about refunds")["confident"]
    ingestion.archive_source("t_a", src["id"])
    # archived source no longer surfaces
    assert not knowledge.retrieve("t_a", "tell me about refunds")["confident"]


def test_website_ingestion_runs_through_durable_job(monkeypatch):
    from receptionist.service import ingestion, knowledge, stores
    from receptionist.worker import handlers, jobs_store
    monkeypatch.setattr("seo.url_guard.safe_fetch", lambda url, **kw: {
        "final_url": url, "status": 200, "headers": {}, "content_type": "text/html",
        "text": "<title>Delivery</title><body>Delivery takes three business days.</body>"})
    jobs_store.reset_stores()

    rec = ingestion.enqueue_website_ingestion("t_a", "https://shop.example/delivery")
    assert rec["status"] == "queued"
    # a worker job was enqueued for it
    due = jobs_store.due_jobs(limit=10)
    assert any(j.get("job_type") == "website_ingest" for _id, j in due)

    # run the handler (as the worker would) → job completes and indexes chunks
    result = handlers.get_handler("website_ingest")({
        "tenant_id": "t_a", "payload": {"ingestion_job_id": rec["id"]}})
    assert result["status"] == "completed"
    final = stores.ingestion_jobs().get("t_a", rec["id"])
    assert final["status"] == "completed" and final["source_id"]
    assert knowledge.retrieve("t_a", "how long is delivery?")["confident"]


def test_delete_source_removes_chunks(monkeypatch):
    from receptionist.service import ingestion, stores
    src = ingestion.ingest_text("t_a", "Parking", "Free parking is available on site.")
    assert stores.knowledge().count("t_a") >= 1
    ingestion.delete_source("t_a", src["id"])
    assert stores.knowledge_sources().get("t_a", src["id"]) is None
    assert not any(i.get("source_id") == src["id"] for i in stores.knowledge().list("t_a"))
