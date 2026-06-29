"""Contract tests for the Content Creator demo router.

Asserts every documented endpoint exists (route table contract) and that the
``/state`` envelope is well-formed: mock_mode banner + a 13-item progress view.

Run in a venv with fastapi + httpx installed:
    pytest -q backend/tests/content_creator/test_router_contract.py
"""

from __future__ import annotations

import pytest

pytest.importorskip("fastapi")

from fastapi import FastAPI
from fastapi.testclient import TestClient

from content_creator.demo.demo_routes import router as demo_router


def _client() -> TestClient:
    app = FastAPI()
    app.include_router(demo_router, prefix="/demo")
    return TestClient(app)


# (method, path) pairs that MUST exist under the /demo prefix.
EXPECTED_ROUTES = [
    ("GET", "/demo/api/content-creator/state"),
    ("POST", "/demo/api/content-creator/reset"),
    ("POST", "/demo/api/content-creator/profile"),
    ("POST", "/demo/api/content-creator/influencer/reference"),
    ("POST", "/demo/api/content-creator/influencer/characteristics"),
    ("POST", "/demo/api/content-creator/provider"),
    ("POST", "/demo/api/content-creator/ideas/generate"),
    ("POST", "/demo/api/content-creator/ideas/approve"),
    ("POST", "/demo/api/content-creator/scripts/generate"),
    ("POST", "/demo/api/content-creator/scripts/approve"),
    ("POST", "/demo/api/content-creator/cost-estimate"),
    ("POST", "/demo/api/content-creator/production/approve"),
    ("POST", "/demo/api/content-creator/videos/generate"),
    ("POST", "/demo/api/content-creator/videos/quality-check"),
    ("POST", "/demo/api/content-creator/videos/publish-approve"),
    ("POST", "/demo/api/content-creator/posts/schedule"),
    ("POST", "/demo/api/content-creator/analytics/sync"),
    ("GET", "/demo/api/content-creator/logs"),
]


def test_all_endpoints_registered():
    app = FastAPI()
    app.include_router(demo_router, prefix="/demo")
    registered = set()
    for route in app.routes:
        methods = getattr(route, "methods", None) or set()
        for m in methods:
            registered.add((m, route.path))
    for method, path in EXPECTED_ROUTES:
        assert (method, path) in registered, f"missing route: {method} {path}"


def test_state_envelope_contract():
    client = _client()
    # fresh tenant so progress reflects the start of the pipeline
    res = client.get("/demo/api/content-creator/state", params={"tenant": "contract"})
    assert res.status_code == 200
    body = res.json()

    assert "banner" in body and "progress" in body and "state" in body
    assert body["banner"]["mock_mode"] is True
    assert body["banner"]["banner"] == "DEMO · MOCK MODE"

    progress = body["progress"]
    assert isinstance(progress, list)
    assert len(progress) == 13
    # 4 gate stages flagged
    gate_stages = [p for p in progress if p.get("gate")]
    assert len(gate_stages) == 4
    # ordered 1..13
    assert [p["n"] for p in progress] == list(range(1, 14))


def test_reset_returns_intake_state():
    client = _client()
    res = client.post("/demo/api/content-creator/reset", params={"tenant": "contract2"})
    assert res.status_code == 200
    state = res.json()["state"]
    assert state["stage"] == "intake"
    assert state["tenant_id"] == "contract2"
