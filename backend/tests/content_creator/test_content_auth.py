"""Router-level access control: internal-secret gate + tenant isolation.

Exercises the content_creator router through a FastAPI TestClient (same style as
test_router_api.py). The ``require_internal`` dependency reads the env live, so we
toggle ``PIXIE_INTERNAL_API_SECRET`` per-case with monkeypatch.

Run: .venv/bin/python -m pytest tests/content_creator/test_content_auth.py -q
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

import pytest

pytest.importorskip("fastapi")

from fastapi import FastAPI
from fastapi.testclient import TestClient

from content_creator.router import router

app = FastAPI()
app.include_router(router)
client = TestClient(app)


def _mk_profile(tenant: str, name: str = "Acme"):
    return client.post("/api/content-creator/profile", json={"tenant_id": tenant, "business_name": name})


# ---------------------------------------------------------------------------
# Internal-secret gate
# ---------------------------------------------------------------------------
def test_requires_internal_secret_when_configured(monkeypatch):
    monkeypatch.setenv("PIXIE_INTERNAL_API_SECRET", "s3cr3t")
    # no header → 401
    assert client.get("/api/content-creator/status", params={"tenant_id": "ws_A"}).status_code == 401
    # wrong header → 401
    r = client.get(
        "/api/content-creator/status",
        params={"tenant_id": "ws_A"},
        headers={"X-Pixie-Internal-Secret": "nope"},
    )
    assert r.status_code == 401
    # correct header → allowed through the gate
    r = client.get(
        "/api/content-creator/status",
        params={"tenant_id": "ws_A"},
        headers={"X-Pixie-Internal-Secret": "s3cr3t"},
    )
    assert r.status_code == 200


def test_no_secret_configured_is_open_for_local_and_tests(monkeypatch):
    monkeypatch.setenv("PIXIE_INTERNAL_API_SECRET", "")
    assert client.get("/api/content-creator/status", params={"tenant_id": "ws_A"}).status_code == 200


# ---------------------------------------------------------------------------
# Tenant isolation — a caller cannot read another workspace's records
# ---------------------------------------------------------------------------
def test_tenant_cannot_read_another_workspace(monkeypatch):
    monkeypatch.setenv("PIXIE_INTERNAL_API_SECRET", "")
    assert _mk_profile("ws_iso_A", "AlphaCo").status_code == 200
    # ws_iso_A sees its profile
    mine = client.get("/api/content-creator/profile", params={"tenant_id": "ws_iso_A"}).json()
    assert mine.get("profile", {}).get("business_name") == "AlphaCo"
    # ws_iso_B — different workspace — sees nothing (empty, not AlphaCo)
    other = client.get("/api/content-creator/profile", params={"tenant_id": "ws_iso_B"}).json()
    assert other.get("profile", {}).get("business_name", "") != "AlphaCo"


def test_missing_tenant_is_rejected(monkeypatch):
    monkeypatch.setenv("PIXIE_INTERNAL_API_SECRET", "")
    # tenant_id is required (min_length=1) on the body → 422 validation error
    r = client.post("/api/content-creator/profile", json={"business_name": "NoTenant"})
    assert r.status_code == 422
