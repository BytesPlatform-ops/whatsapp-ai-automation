"""Platform-aware SEO agent tests — canned HTML fed to the REAL audit engine
(deterministic, no network). Connectors gated by a stored connection."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

WP_HTML = (
    "<html><head><title>" + "Very long WordPress page title " * 4 + "</title>"
    "<link rel='stylesheet' href='/wp-content/themes/x/style.css'>"
    "<meta name='generator' content='WordPress 6.5'></head>"
    "<body><h1>Welcome</h1><img src='a.jpg'><p>Some content here.</p></body></html>"
)
SHOPIFY_HTML = (
    "<html><head><title>Shop</title>"
    "<script src='https://cdn.shopify.com/s/x.js'></script></head>"
    "<body><h1>One</h1><h1>Two</h1><img src='b.jpg'></body></html>"
)
SQSP_HTML = (
    "<html><head><title>SQ</title>"
    "<script src='https://static1.squarespace.com/x.js'></script></head>"
    "<body><img src='c.jpg'></body></html>"
)


def _fake_fetch(url, timeout=20.0):
    html = WP_HTML
    if "shop" in url:
        html = SHOPIFY_HTML
    elif "square" in url:
        html = SQSP_HTML
    return {"html": html, "headers": {}, "final_url": url, "status": 200}


@pytest.fixture(autouse=True)
def _reset(monkeypatch):
    import approvals.router as ar
    import activity.router as act
    import seo.audit_agent as aa
    from integrations import connections

    ar._store = None
    act._store = None
    aa._repos = None
    for p in ("wordpress", "shopify", "squarespace"):
        connections.disconnect("t_seo", [f"seo:{p}"])
    monkeypatch.setattr("seo.audit_agent.fetch_full", _fake_fetch)
    monkeypatch.setattr("seo.agent_routes.fetch_full", _fake_fetch)
    monkeypatch.setenv("PIXIE_AGENT_MODE", "production")
    monkeypatch.setenv("PIXIE_EXECUTION_MODE", "mock")
    yield
    for p in ("wordpress", "shopify", "squarespace"):
        connections.disconnect("t_seo", [f"seo:{p}"])


@pytest.fixture
def client():
    from app import app
    return TestClient(app)


def _audit(client, url="https://mysite.com", t="t_seo"):
    return client.post("/api/agents/seo/audit/start", json={"tenant_id": t, "website_url": url}).json()


def _connect_wp(t="t_seo"):
    from integrations import connections
    connections.register_connection(t, "seo:wordpress", {
        "provider": "wordpress", "status": "active", "site_url": "https://mysite.com",
        "username": "admin", "application_password": "SECRET_APP_PW", "connected_as": "Admin"})


def test_audit_detects_platform_and_maps_issues(client):
    r = _audit(client)
    assert r["status"] == "complete"
    assert r["audit"]["platform"] == "wordpress"
    assert r["audit"]["issue_count"] >= 1
    iss = r["issues"][0]
    for k in ("issue", "one_liner", "fix_one_liner", "fix_mode", "category", "auto_fix_available"):
        assert k in iss


def test_platform_detect_endpoint(client):
    r = client.get("/api/agents/seo/platform-detect", params={"url": "https://shop.example.com"}).json()
    assert r["detected_platform"] == "shopify"


def test_not_connected_is_copy_ready(client):
    r = _audit(client)
    content = next(i for i in r["issues"] if i["connection_required"])
    assert content["fix_mode"] == "copy_ready"
    pr = client.post("/api/agents/seo/optimize/prepare",
                     json={"tenant_id": "t_seo", "audit_id": r["audit"]["id"], "issue_id": content["id"]}).json()
    assert pr["status"] == "copy_ready" and pr["copy_text"]


def test_optimize_prepare_creates_approval_when_connected(client):
    _connect_wp()
    r = _audit(client)
    content = next(i for i in r["issues"] if i["connection_required"] and i["fix_mode"] == "auto_fix")
    pr = client.post("/api/agents/seo/optimize/prepare",
                     json={"tenant_id": "t_seo", "audit_id": r["audit"]["id"], "issue_id": content["id"]}).json()
    assert pr["status"] == "approval_required" and pr["approval_id"]


def test_no_apply_before_approval(client):
    _connect_wp()
    r = _audit(client)
    content = next(i for i in r["issues"] if i["fix_mode"] == "auto_fix")
    client.post("/api/agents/seo/optimize/prepare",
                json={"tenant_id": "t_seo", "audit_id": r["audit"]["id"], "issue_id": content["id"]})
    activity = client.get("/api/activity", params={"tenant_id": "t_seo"}).json()
    assert not any(e["type"] == "action_executed" for e in activity)


def test_approve_applies_via_connector_no_fake_success(client):
    """Approve runs the REAL WP connector against an unreachable fake site → it
    fails honestly (no fake 'applied')."""
    _connect_wp()
    r = _audit(client)
    content = next(i for i in r["issues"] if i["fix_mode"] == "auto_fix")
    apid = client.post("/api/agents/seo/optimize/prepare",
                       json={"tenant_id": "t_seo", "audit_id": r["audit"]["id"], "issue_id": content["id"]}).json()["approval_id"]
    res = client.post(f"/api/approvals/{apid}/approve", json={"tenant_id": "t_seo"}).json()
    er = res["execution_result"]
    assert er["executed"] is False  # real apply did not fake success


def test_unsupported_platform_is_honest(client):
    from integrations import connections
    connections.register_connection("t_seo", "seo:squarespace", {"provider": "squarespace", "status": "active"})
    r = _audit(client, url="https://square.example.com")
    assert r["audit"]["platform"] == "squarespace"
    content = next(i for i in r["issues"] if i["connection_required"])
    assert content["fix_mode"] == "unsupported"


def test_history_lists_audits(client):
    _audit(client)
    _audit(client, url="https://shop.example.com")
    h = client.get("/api/agents/seo/history", params={"tenant_id": "t_seo"}).json()
    assert len(h["audits"]) == 2


def test_connection_status_no_secret(client):
    _connect_wp()
    text = client.get("/api/agents/seo/connections/status", params={"tenant_id": "t_seo"}).text
    assert "SECRET_APP_PW" not in text and "application_password" not in text
