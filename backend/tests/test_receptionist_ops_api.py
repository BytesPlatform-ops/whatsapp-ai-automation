"""AI Receptionist operations API (Wave 6): worker, knowledge ingestion, config
versions, usage, limits, analytics ranges. Hermetic + $0."""

from __future__ import annotations

import io

import pytest
from fastapi.testclient import TestClient

BASE = "/api/agents/ai-receptionist"


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setenv("PIXIE_PERSIST", "memory")
    monkeypatch.setenv("PIXIE_MODEL_MODE", "fake")
    monkeypatch.setenv("PIXIE_INTERNAL_API_SECRET", "")
    from receptionist.service import stores
    from receptionist.worker import jobs_store
    stores.reset_all()
    jobs_store.reset_stores()
    import app
    return TestClient(app.app)


def test_worker_health(client):
    r = client.get(f"{BASE}/worker/health", params={"tenant_id": "t_a"})
    assert r.status_code == 200
    body = r.json()
    assert "worker" in body and "due_count" in body


def test_config_save_versions_rollback(client):
    r = client.post(f"{BASE}/config", json={"business_name": "Acme", "hours": "9-5"},
                    params={"tenant_id": "t_a"})
    assert r.status_code == 200 and r.json()["config"]["config_version"] == 1
    client.post(f"{BASE}/config", json={"hours": "8-8"}, params={"tenant_id": "t_a"})
    versions = client.get(f"{BASE}/config/versions", params={"tenant_id": "t_a"}).json()["versions"]
    assert len(versions) == 2
    v1 = [v for v in versions if v["version"] == 1][0]["id"]
    rb = client.post(f"{BASE}/config/rollback", json={"version_id": v1}, params={"tenant_id": "t_a"})
    assert rb.status_code == 200


def test_text_source_and_retrieval_test(client):
    r = client.post(f"{BASE}/knowledge-sources/text",
                    json={"title": "Hours", "content": "We are open Monday to Friday 8am to 6pm."},
                    params={"tenant_id": "t_a"})
    assert r.status_code == 200 and r.json()["source"]["source_type"] == "text"
    rt = client.post(f"{BASE}/knowledge/retrieval-test", json={"query": "when are you open?"},
                     params={"tenant_id": "t_a"})
    assert rt.status_code == 200 and rt.json()["confident"]
    sources = client.get(f"{BASE}/knowledge-sources", params={"tenant_id": "t_a"}).json()["sources"]
    assert len(sources) == 1


def test_pdf_upload(client):
    from reportlab.pdfgen import canvas
    buf = io.BytesIO()
    c = canvas.Canvas(buf)
    c.drawString(72, 800, "Refund policy: refunds within fourteen days.")
    c.showPage(); c.save()
    r = client.post(f"{BASE}/knowledge-sources/pdf",
                    params={"tenant_id": "t_a", "filename": "policy.pdf"},
                    content=buf.getvalue(), headers={"Content-Type": "application/pdf"})
    assert r.status_code == 200, r.text
    assert r.json()["source"]["source_type"] == "pdf"


def test_pdf_upload_rejects_garbage(client):
    r = client.post(f"{BASE}/knowledge-sources/pdf",
                    params={"tenant_id": "t_a", "filename": "x.pdf"},
                    content=b"not a pdf", headers={"Content-Type": "application/pdf"})
    assert r.status_code == 400
    assert r.json()["detail"]["reason"] == "not_a_pdf"


def test_website_source_enqueues_job(client):
    r = client.post(f"{BASE}/knowledge-sources/website",
                    json={"url": "https://example.com/help"}, params={"tenant_id": "t_a"})
    assert r.status_code == 200 and r.json()["job"]["status"] == "queued"


def test_website_source_blocks_ssrf(client):
    r = client.post(f"{BASE}/knowledge-sources/website",
                    json={"url": "ftp://localhost/x"}, params={"tenant_id": "t_a"})
    assert r.status_code == 400


def test_usage_and_limits(client):
    assert client.get(f"{BASE}/usage", params={"tenant_id": "t_a"}).status_code == 200
    lim = client.get(f"{BASE}/limits", params={"tenant_id": "t_a"}).json()["limits"]
    assert "knowledge_source" in lim


def test_analytics_range(client):
    client.post(f"{BASE}/message", json={"tenant_id": "t_a", "message": "hi"})
    r = client.get(f"{BASE}/analytics/range", params={"tenant_id": "t_a", "preset": "30d"})
    assert r.status_code == 200
    body = r.json()
    assert body["range"]["preset"] == "30d"
    assert body["metrics"]["conversations"] >= 1
    assert "generated_at" in body
