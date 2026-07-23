"""Publishing + social HTTP routes: connections, capabilities, create/list/cancel/
reschedule/retry, worker run-once, tenant isolation, internal-secret gate, and the
Content Agent dry-run end-to-end flow. No live calls."""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

import pytest

pytest.importorskip("fastapi")

from fastapi import FastAPI
from fastapi.testclient import TestClient

import publishing.store as store
from integrations import connections as integ_connections
from publishing.routes import publishing_router, social_router

app = FastAPI()
app.include_router(publishing_router)
app.include_router(social_router)
client = TestClient(app)


def _register_meta(tenant, scopes=("pages_manage_posts", "pages_show_list", "instagram_content_publish")):
    integ_connections.register_connection(tenant, "meta_content_publish", {
        "provider": "meta", "scopes": list(scopes),
        "pages": [{"id": "PAGE1", "name": "Test Page", "page_access_token": "PAGETOKEN",
                   "linked_instagram": {"id": "IG1", "username": "test_ig"}}],
    })


@pytest.fixture(autouse=True)
def _clean(monkeypatch):
    monkeypatch.setenv("PIXIE_INTERNAL_API_SECRET", "")
    monkeypatch.delenv("PIXIE_PERSIST", raising=False)
    monkeypatch.setenv("SOCIAL_PUBLISH_MODE", "dry_run")
    monkeypatch.delenv("META_PUBLISH_ENABLED", raising=False)
    store.reset_repositories()
    try:
        integ_connections._CONNECTIONS.clear()
    except Exception:
        pass
    yield
    store.reset_repositories()


def _create(tenant="ws_A", **kw):
    body = {"tenant_id": tenant, "source_product": "content_agent", "connection_id": "facebook:PAGE1",
            "platform": "facebook", "content_format": "text", "text": "hello", "document_id": "d1",
            "version_id": "v1", "mode": "dry_run"}
    body.update(kw)
    return client.post("/api/publishing/jobs", json=body)


# ── connections + capabilities ──────────────────────────────────────────────────
def test_list_connections_and_capabilities():
    _register_meta("ws_A")
    r = client.get("/api/social/connections", params={"tenant_id": "ws_A"}).json()
    ids = {c["connection_id"] for c in r["connections"]}
    assert "facebook:PAGE1" in ids and "instagram:IG1" in ids
    # no token leaks
    assert "PAGETOKEN" not in str(r)
    caps = client.get("/api/social/capabilities", params={"tenant_id": "ws_A"}).json()
    fb = next(a for a in caps["accounts"] if a["connection_id"] == "facebook:PAGE1")
    assert fb["capabilities"]["publishing_authorized"] is True


def test_connection_tenant_isolated():
    _register_meta("ws_A")
    assert client.get("/api/social/connections", params={"tenant_id": "ws_B"}).json()["connections"] == []


def test_config_defaults_dry_run():
    c = client.get("/api/publishing/config").json()
    assert c["publish_mode"] == "dry_run" and c["live_allowed"] is False


# ── create + list + tenant isolation ────────────────────────────────────────────
def test_create_and_list_job():
    _register_meta("ws_A")
    r = _create()
    assert r.status_code == 200, r.text
    jid = r.json()["id"]
    lst = client.get("/api/publishing/jobs", params={"tenant_id": "ws_A"}).json()
    assert any(j["id"] == jid for j in lst["jobs"])
    # cross-tenant cannot read
    assert client.get(f"/api/publishing/jobs/{jid}", params={"tenant_id": "ws_B"}).status_code == 404


def test_missing_connection_404():
    r = _create(connection_id="facebook:NONE")
    assert r.status_code == 404


def test_idempotent_create():
    _register_meta("ws_A")
    a = _create(scheduled_local="2099-01-01T09:00", timezone="UTC")
    b = _create(scheduled_local="2099-01-01T09:00", timezone="UTC")
    assert a.json()["id"] == b.json()["id"]


def test_invalid_timezone_422():
    _register_meta("ws_A")
    r = _create(scheduled_local="2099-01-01T09:00", timezone="Not/AZone")
    assert r.status_code == 422


def test_live_disabled_rejected():
    _register_meta("ws_A")
    r = _create(mode="live", confirm=True)
    assert r.status_code == 409 and r.json()["detail"]["error"] == "live_disabled"


# ── cancel / reschedule / retry ─────────────────────────────────────────────────
def test_cancel_before_execution():
    _register_meta("ws_A")
    jid = _create(scheduled_local="2099-01-01T09:00", timezone="UTC").json()["id"]
    r = client.post(f"/api/publishing/jobs/{jid}/cancel", json={"tenant_id": "ws_A", "cancelled_by": "u1"})
    assert r.json()["job"]["status"] == "cancelled" and r.json()["job"]["cancelled_by"] == "u1"


def test_reschedule_before_execution():
    _register_meta("ws_A")
    jid = _create(scheduled_local="2099-01-01T09:00", timezone="UTC").json()["id"]
    r = client.post(f"/api/publishing/jobs/{jid}/reschedule", json={"tenant_id": "ws_A", "scheduled_local": "2099-02-01T10:00", "timezone": "UTC"})
    assert r.json()["job"]["scheduled_utc"].startswith("2099-02-01T10:00")


def test_cross_tenant_cancel_forbidden():
    _register_meta("ws_A")
    jid = _create(scheduled_local="2099-01-01T09:00", timezone="UTC").json()["id"]
    assert client.post(f"/api/publishing/jobs/{jid}/cancel", json={"tenant_id": "ws_B"}).status_code == 404


# ── end-to-end dry-run flow ──────────────────────────────────────────────────────
def test_content_agent_dry_run_end_to_end():
    _register_meta("ws_A")
    # publish now (dry-run) → job queued
    jid = _create().json()["id"]
    # worker executes
    run = client.post("/api/publishing/worker/run-once").json()
    assert run["count"] >= 1
    job = client.get(f"/api/publishing/jobs/{jid}", params={"tenant_id": "ws_A"}).json()["job"]
    assert job["status"] == "published"
    assert job["platform_post_id"].startswith("dryrun_")
    # history + attempts durable
    hist = client.get("/api/publishing/history", params={"tenant_id": "ws_A"}).json()
    assert any(h["id"] == jid and h["status"] == "published" for h in hist["history"])
    attempts = client.get(f"/api/publishing/jobs/{jid}/attempts", params={"tenant_id": "ws_A"}).json()
    assert len(attempts["attempts"]) == 1


def test_scheduled_job_appears_in_calendar():
    _register_meta("ws_A")
    _create(scheduled_local="2099-01-01T09:00", timezone="America/New_York")
    cal = client.get("/api/publishing/calendar", params={"tenant_id": "ws_A"}).json()
    assert len(cal["events"]) == 1 and cal["events"][0]["timezone"] == "America/New_York"


# ── recovery: filter jobs by source content ─────────────────────────────────────
def test_list_jobs_filter_by_document_id():
    _register_meta("ws_A")
    a = _create(document_id="docA", version_id="v1").json()["id"]
    _create(document_id="docB", version_id="v1")
    lst = client.get("/api/publishing/jobs", params={"tenant_id": "ws_A", "document_id": "docA"}).json()
    ids = {j["id"] for j in lst["jobs"]}
    assert ids == {a}


def test_influencer_job_recovery_by_video_id(monkeypatch):
    """An AI Influencer job is recoverable by its approved video id — the frontend
    Step Posting stage resumes from this after refresh/restart."""
    import publishing.service as service
    monkeypatch.setattr(service, "_default_gate_check", lambda tenant, vid: True)
    _register_meta("ws_A")
    body = {"tenant_id": "ws_A", "source_product": "ai_influencer", "connection_id": "facebook:PAGE1",
            "platform": "facebook", "content_format": "video", "text": "reel", "influencer_video_id": "vid_1",
            "media_asset_ids": ["m1"], "mode": "dry_run", "scheduled_local": "2099-01-01T09:00", "timezone": "UTC"}
    jid = client.post("/api/publishing/jobs", json=body).json()["id"]
    rec = client.get("/api/publishing/jobs", params={
        "tenant_id": "ws_A", "source_product": "ai_influencer", "influencer_video_id": "vid_1"}).json()
    assert [j["id"] for j in rec["jobs"]] == [jid]
    # a different video does not resolve this job
    none = client.get("/api/publishing/jobs", params={
        "tenant_id": "ws_A", "influencer_video_id": "vid_other"}).json()
    assert none["jobs"] == []


def test_influencer_job_gate_blocked_without_approval():
    _register_meta("ws_A")
    body = {"tenant_id": "ws_A", "source_product": "ai_influencer", "connection_id": "facebook:PAGE1",
            "platform": "facebook", "content_format": "video", "text": "reel", "influencer_video_id": "vid_1",
            "media_asset_ids": ["m1"], "mode": "dry_run"}
    r = client.post("/api/publishing/jobs", json=body)
    assert r.status_code == 409 and r.json()["detail"]["error"] == "gate_blocked"


# ── internal secret gate ─────────────────────────────────────────────────────────
def test_internal_secret_enforced(monkeypatch):
    monkeypatch.setenv("PIXIE_INTERNAL_API_SECRET", "s3cret")
    assert client.get("/api/publishing/config").status_code == 401
    assert client.get("/api/publishing/config", headers={"X-Pixie-Internal-Secret": "s3cret"}).status_code == 200
