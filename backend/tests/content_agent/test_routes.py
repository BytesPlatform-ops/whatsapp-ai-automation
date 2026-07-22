"""Production /api/content-agent router (FastAPI TestClient).

Covers: content-type registry, generate preview + save, tenant isolation and
spoofing, list/search/filter/pagination, archive/restore/duplicate/delete,
version numbering, regenerate, set-current-version, manual edit versions,
provider-unavailable mapping, and the internal-secret gate.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

import pytest

pytest.importorskip("fastapi")

from fastapi import FastAPI
from fastapi.testclient import TestClient

import content_agent.store as store
from content_agent.routes import router

app = FastAPI()
app.include_router(router)
client = TestClient(app)

BASE = "/api/content-agent"


@pytest.fixture(autouse=True)
def _clean(monkeypatch):
    monkeypatch.setenv("PIXIE_INTERNAL_API_SECRET", "")
    monkeypatch.delenv("PIXIE_PERSIST", raising=False)
    monkeypatch.setenv("PIXIE_MODEL_MODE", "fake")
    store.reset_repositories()
    yield
    store.reset_repositories()


def _generate(tenant="ws_A", ct="social_post", inputs=None, options=None, save=False, title=""):
    body = {
        "tenant_id": tenant, "content_type": ct,
        "inputs": inputs if inputs is not None else {"topic": "summer sale"},
        "options": options if options is not None else {"platform": "instagram"},
        "save": save, "title": title,
    }
    return client.post(f"{BASE}/generate", json=body)


def _save_doc(tenant="ws_A", ct="blog", title="My blog"):
    r = _generate(tenant=tenant, ct=ct, inputs={"topic": "running"}, options={}, save=True, title=title)
    assert r.status_code == 200, r.text
    return r.json()["id"]


# ── content-type registry + status ────────────────────────────────────────────
def test_content_types_lists_all_ten():
    r = client.get(f"{BASE}/content-types")
    assert r.status_code == 200
    assert len(r.json()["content_types"]) == 10


def test_status_reports_mock_mode():
    r = client.get(f"{BASE}/status")
    body = r.json()
    assert body["mock"] is True and body["provider"] == "mock"


# ── generation ─────────────────────────────────────────────────────────────────
def test_generate_preview_does_not_persist():
    r = _generate(options={"platform": "instagram", "variations": 3})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["saved"] is False
    assert len(body["result"]["variations"]) == 3
    # nothing saved
    assert client.get(f"{BASE}/documents", params={"tenant_id": "ws_A"}).json()["total"] == 0


def test_generate_and_save_creates_document_and_version():
    r = _generate(ct="blog", inputs={"topic": "running"}, options={}, save=True)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["saved"] is True and body["version"]["version_number"] == 1
    assert body["version"]["created_by"] == "generation"
    assert body["version"]["mock"] is True
    lst = client.get(f"{BASE}/documents", params={"tenant_id": "ws_A"}).json()
    assert lst["total"] == 1


def test_missing_required_input_is_422():
    r = client.post(f"{BASE}/generate", json={"tenant_id": "ws_A", "content_type": "social_post", "inputs": {}, "options": {}})
    assert r.status_code == 422
    assert "platform" in r.json()["detail"]["fields"]


def test_structured_type_carries_structured_payload():
    r = _generate(ct="carousel", inputs={"topic": "tips", "slide_count": 6}, options={"platform": "linkedin"})
    v = r.json()["result"]["variations"][0]
    assert v["structured"]["slides"] and len(v["structured"]["slides"]) == 6


# ── tenant isolation / spoofing ───────────────────────────────────────────────
def test_cross_tenant_cannot_read_document():
    doc_id = _save_doc(tenant="ws_A")
    assert client.get(f"{BASE}/documents/{doc_id}", params={"tenant_id": "ws_B"}).status_code == 404
    assert client.get(f"{BASE}/documents", params={"tenant_id": "ws_B"}).json()["total"] == 0


def test_cross_tenant_cannot_mutate_document():
    doc_id = _save_doc(tenant="ws_A")
    # ws_B patch/archive/delete all see "not found"
    assert client.patch(f"{BASE}/documents/{doc_id}", json={"tenant_id": "ws_B", "title": "hacked"}).status_code == 404
    assert client.post(f"{BASE}/documents/{doc_id}/archive", json={"tenant_id": "ws_B"}).status_code == 404
    assert client.delete(f"{BASE}/documents/{doc_id}", params={"tenant_id": "ws_B"}).status_code == 404
    # original untouched
    assert client.get(f"{BASE}/documents/{doc_id}", params={"tenant_id": "ws_A"}).json()["document"]["title"] == "My blog"


# ── list search / filter / pagination ─────────────────────────────────────────
def test_list_search_filter_and_pagination():
    _generate(tenant="ws_L", ct="social_post", inputs={"topic": "summer sale"}, options={"platform": "instagram"}, save=True, title="Summer sale")
    _generate(tenant="ws_L", ct="blog", inputs={"topic": "winter"}, options={}, save=True, title="Winter blog")
    # search
    assert client.get(f"{BASE}/documents", params={"tenant_id": "ws_L", "query": "summer"}).json()["total"] == 1
    # filter by type
    assert client.get(f"{BASE}/documents", params={"tenant_id": "ws_L", "content_type": "blog"}).json()["total"] == 1
    # pagination
    p = client.get(f"{BASE}/documents", params={"tenant_id": "ws_L", "page": 1, "page_size": 1}).json()
    assert len(p["documents"]) == 1 and p["total"] == 2


# ── lifecycle ──────────────────────────────────────────────────────────────────
def test_archive_restore_hides_and_shows():
    doc_id = _save_doc(tenant="ws_A")
    client.post(f"{BASE}/documents/{doc_id}/archive", json={"tenant_id": "ws_A"})
    assert client.get(f"{BASE}/documents", params={"tenant_id": "ws_A"}).json()["total"] == 0
    assert client.get(f"{BASE}/documents", params={"tenant_id": "ws_A", "include_archived": True}).json()["total"] == 1
    r = client.post(f"{BASE}/documents/{doc_id}/restore", json={"tenant_id": "ws_A"})
    assert r.json()["document"]["status"] == "draft"
    assert client.get(f"{BASE}/documents", params={"tenant_id": "ws_A"}).json()["total"] == 1


def test_duplicate_copies_content_into_new_document():
    doc_id = _save_doc(tenant="ws_A", title="Original")
    r = client.post(f"{BASE}/documents/{doc_id}/duplicate", json={"tenant_id": "ws_A"})
    assert r.status_code == 200
    new_id = r.json()["id"]
    assert new_id != doc_id
    assert "(copy)" in r.json()["document"]["title"]
    # copy has its own version 1
    vs = client.get(f"{BASE}/documents/{new_id}/versions", params={"tenant_id": "ws_A"}).json()
    assert len(vs["versions"]) == 1


def test_delete_removes_document():
    doc_id = _save_doc(tenant="ws_A")
    assert client.delete(f"{BASE}/documents/{doc_id}", params={"tenant_id": "ws_A"}).json()["deleted"] is True
    assert client.get(f"{BASE}/documents/{doc_id}", params={"tenant_id": "ws_A"}).status_code == 404


def test_patch_updates_metadata():
    doc_id = _save_doc(tenant="ws_A")
    r = client.patch(f"{BASE}/documents/{doc_id}", json={"tenant_id": "ws_A", "status": "ready", "tags": ["promo"]})
    assert r.status_code == 200
    doc = r.json()["document"]
    assert doc["status"] == "ready" and doc["tags"] == ["promo"]


# ── versions ───────────────────────────────────────────────────────────────────
def test_regenerate_creates_new_version_keeps_history():
    doc_id = _save_doc(tenant="ws_A")
    r = client.post(f"{BASE}/documents/{doc_id}/regenerate", json={"tenant_id": "ws_A"})
    assert r.status_code == 200
    assert r.json()["version"]["version_number"] == 2
    assert r.json()["version"]["created_by"] == "regenerate"
    vs = client.get(f"{BASE}/documents/{doc_id}/versions", params={"tenant_id": "ws_A"}).json()
    assert [v["version"]["version_number"] for v in vs["versions"]] == [1, 2]
    assert vs["current_version_id"] == r.json()["version_id"]


def test_manual_edit_saves_as_new_version():
    doc_id = _save_doc(tenant="ws_A")
    r = client.post(f"{BASE}/documents/{doc_id}/versions", json={"tenant_id": "ws_A", "title": "Edited", "text": "my edit"})
    assert r.status_code == 200
    assert r.json()["version"]["version_number"] == 2
    assert r.json()["version"]["created_by"] == "manual_edit"
    assert r.json()["version"]["text"] == "my edit"


def test_set_current_version_restores_previous():
    doc_id = _save_doc(tenant="ws_A")
    vs = client.get(f"{BASE}/documents/{doc_id}/versions", params={"tenant_id": "ws_A"}).json()
    v1 = vs["versions"][0]["id"]
    client.post(f"{BASE}/documents/{doc_id}/regenerate", json={"tenant_id": "ws_A"})  # now current is v2
    r = client.post(f"{BASE}/documents/{doc_id}/set-current-version", json={"tenant_id": "ws_A", "version_id": v1})
    assert r.status_code == 200 and r.json()["current_version_id"] == v1


def test_set_current_version_rejects_foreign_version():
    a = _save_doc(tenant="ws_A")
    b = _save_doc(tenant="ws_A")
    b_ver = client.get(f"{BASE}/documents/{b}/versions", params={"tenant_id": "ws_A"}).json()["versions"][0]["id"]
    # b's version cannot be set as a's current
    assert client.post(f"{BASE}/documents/{a}/set-current-version", json={"tenant_id": "ws_A", "version_id": b_ver}).status_code == 404


# ── provider-unavailable (real mode, no provider) ─────────────────────────────
def test_real_mode_without_provider_maps_to_503(monkeypatch):
    monkeypatch.setenv("PIXIE_MODEL_MODE", "openai")
    monkeypatch.setitem(sys.modules, "models", None)  # force the model import to fail
    r = _generate(ct="blog", inputs={"topic": "x"}, options={})
    assert r.status_code == 503
    assert r.json()["detail"]["status"] == "provider_not_configured"
    assert "correlation_id" in r.json()["detail"]


# ── internal-secret gate ───────────────────────────────────────────────────────
def test_internal_secret_enforced_when_configured(monkeypatch):
    monkeypatch.setenv("PIXIE_INTERNAL_API_SECRET", "s3cr3t")
    assert client.get(f"{BASE}/content-types").status_code == 401
    assert client.get(f"{BASE}/content-types", headers={"X-Pixie-Internal-Secret": "s3cr3t"}).status_code == 200


def test_missing_tenant_rejected():
    r = client.post(f"{BASE}/generate", json={"content_type": "blog"})
    assert r.status_code == 422
