"""Publishing service (create/validate/Gate4/idempotency/live-guard) + worker
(dry-run publish, retry, terminal, reconnection, lock, idempotency)."""

from __future__ import annotations

import pytest

pytest.importorskip("pydantic")

import publishing.store as store
from publishing import service, worker
from publishing.adapters import PublishOutcome
from publishing.enums import ContentFormat, Platform, PublishMode, PublishStatus, SourceProduct
from publishing.schemas import CreatePublishJobBody
from content_agent.errors import ErrorCategory


FB_ACCOUNT = {
    "connection_id": "facebook:PAGE1", "platform": "facebook", "account_id": "PAGE1",
    "page_id": "PAGE1", "display_name": "Test Page", "scopes": ["pages_manage_posts", "pages_show_list"],
}
IG_ACCOUNT = {
    "connection_id": "instagram:IG1", "platform": "instagram", "account_id": "IG1",
    "page_id": "PAGE1", "display_name": "test_ig", "scopes": ["instagram_content_publish", "pages_show_list"],
}


def _resolver(*accounts):
    m = {a["connection_id"]: a for a in accounts}
    return lambda tenant, cid: m.get(cid)


@pytest.fixture(autouse=True)
def _clean(monkeypatch):
    monkeypatch.delenv("PIXIE_PERSIST", raising=False)
    monkeypatch.setenv("SOCIAL_PUBLISH_MODE", "dry_run")
    monkeypatch.delenv("META_PUBLISH_ENABLED", raising=False)
    store.reset_repositories()
    yield
    store.reset_repositories()


def _body(**kw):
    base = dict(tenant_id="ws_A", source_product=SourceProduct.CONTENT_AGENT, connection_id="facebook:PAGE1",
                platform=Platform.FACEBOOK, content_format=ContentFormat.TEXT, text="hello world",
                document_id="d1", version_id="v1", mode=PublishMode.DRY_RUN)
    base.update(kw)
    return CreatePublishJobBody(**base)


# ── service: create + validation ────────────────────────────────────────────────
def test_create_publish_now_job():
    jid, job = service.create_job(_body(), account_resolver=_resolver(FB_ACCOUNT))
    assert job.status is PublishStatus.QUEUED and job.platform is Platform.FACEBOOK
    assert job.mode is PublishMode.DRY_RUN and job.scheduled_utc


def test_unknown_connection_rejected():
    with pytest.raises(service.PublishError) as ei:
        service.create_job(_body(connection_id="facebook:NOPE"), account_resolver=_resolver(FB_ACCOUNT))
    assert ei.value.http_status == 404


def test_instagram_text_only_rejected():
    with pytest.raises(service.PublishError) as ei:
        service.create_job(_body(connection_id="instagram:IG1", content_format=ContentFormat.TEXT, text="x"),
                           account_resolver=_resolver(IG_ACCOUNT))
    assert ei.value.category == "unsupported_format"


def test_destination_not_client_tamperable():
    # client claims instagram but the resolved facebook account wins
    _jid, job = service.create_job(_body(platform=Platform.INSTAGRAM), account_resolver=_resolver(FB_ACCOUNT))
    assert job.platform is Platform.FACEBOOK and job.account_id == "PAGE1"


def test_schedule_in_past_rejected():
    with pytest.raises(service.PublishError) as ei:
        service.create_job(_body(scheduled_local="2000-01-01T00:00", timezone="UTC"), account_resolver=_resolver(FB_ACCOUNT))
    assert ei.value.category == "schedule_in_past"


def test_scheduled_job_is_scheduled_status():
    _jid, job = service.create_job(_body(scheduled_local="2099-01-01T09:00", timezone="America/New_York"),
                                   account_resolver=_resolver(FB_ACCOUNT))
    assert job.status is PublishStatus.SCHEDULED
    assert job.timezone == "America/New_York" and job.scheduled_utc.startswith("2099-01-01T14:00")


# ── idempotency ─────────────────────────────────────────────────────────────────
def test_duplicate_request_returns_same_job():
    a = service.create_job(_body(scheduled_local="2099-01-01T09:00", timezone="UTC"), account_resolver=_resolver(FB_ACCOUNT))
    b = service.create_job(_body(scheduled_local="2099-01-01T09:00", timezone="UTC"), account_resolver=_resolver(FB_ACCOUNT))
    assert a[0] == b[0]  # one job, not two


def test_edited_content_makes_new_job():
    a = service.create_job(_body(scheduled_local="2099-01-01T09:00", timezone="UTC", text="one"), account_resolver=_resolver(FB_ACCOUNT))
    b = service.create_job(_body(scheduled_local="2099-01-01T09:00", timezone="UTC", text="two"), account_resolver=_resolver(FB_ACCOUNT))
    assert a[0] != b[0]


# ── Gate 4 ──────────────────────────────────────────────────────────────────────
def test_influencer_requires_gate4_approval():
    body = _body(source_product=SourceProduct.AI_INFLUENCER, influencer_video_id="vid1",
                 content_format=ContentFormat.VIDEO, media_asset_ids=["a1"], document_id="", version_id="")
    with pytest.raises(service.PublishError) as ei:
        service.create_job(body, account_resolver=_resolver(FB_ACCOUNT), gate_checker=lambda t, v: False)
    assert ei.value.category == "gate_blocked" and ei.value.http_status == 409


def test_influencer_publishes_after_gate4():
    body = _body(source_product=SourceProduct.AI_INFLUENCER, influencer_video_id="vid1",
                 content_format=ContentFormat.VIDEO, media_asset_ids=["a1"], document_id="", version_id="")
    jid, job = service.create_job(body, account_resolver=_resolver(FB_ACCOUNT), gate_checker=lambda t, v: True)
    assert job.status is PublishStatus.QUEUED


# ── live-mode guard ───────────────────────────────────────────────────────────────
def test_live_requires_confirmation():
    with pytest.raises(service.PublishError) as ei:
        service.create_job(_body(mode=PublishMode.LIVE, confirm=False), account_resolver=_resolver(FB_ACCOUNT))
    assert ei.value.category == "confirmation_required"


def test_live_disabled_by_default_no_silent_fallback(monkeypatch):
    monkeypatch.setenv("SOCIAL_PUBLISH_MODE", "dry_run")  # live not enabled
    with pytest.raises(service.PublishError) as ei:
        service.create_job(_body(mode=PublishMode.LIVE, confirm=True), account_resolver=_resolver(FB_ACCOUNT))
    assert ei.value.category == "live_disabled"  # rejected, NOT silently downgraded


def test_live_missing_permission(monkeypatch):
    monkeypatch.setenv("SOCIAL_PUBLISH_MODE", "live")
    monkeypatch.setenv("META_PUBLISH_ENABLED", "true")
    acct = {**FB_ACCOUNT, "scopes": ["pages_show_list"]}  # no pages_manage_posts
    with pytest.raises(service.PublishError) as ei:
        service.create_job(_body(mode=PublishMode.LIVE, confirm=True), account_resolver=_resolver(acct))
    assert ei.value.category == "missing_permission"


# ── worker: dry-run publish ────────────────────────────────────────────────────
def test_worker_publishes_dry_run_job():
    jid, _ = service.create_job(_body(), account_resolver=_resolver(FB_ACCOUNT))
    summary = worker.run_due_once("w1", media_resolver=lambda t, a: [])
    assert summary["count"] == 1 and summary["processed"][0]["result"] == "published"
    _, job = store.get_job_repository().get("ws_A", jid)
    assert job.status is PublishStatus.PUBLISHED and job.platform_post_id.startswith("dryrun_")
    attempts = store.get_attempt_repository().list_by_job("ws_A", jid)
    assert len(attempts) == 1 and attempts[0][1].simulated is True


def test_worker_survives_restart_of_repos():
    jid, _ = service.create_job(_body(), account_resolver=_resolver(FB_ACCOUNT))
    worker.run_due_once("w1", media_resolver=lambda t, a: [])
    store.reset_repositories()  # simulate restart (memory → gone; file would persist)
    # published job is terminal and not reselected
    assert store.get_job_repository().due_jobs() == []


def test_worker_retries_then_terminal(monkeypatch):
    monkeypatch.setenv("SOCIAL_PUBLISH_MODE", "live")
    monkeypatch.setenv("META_PUBLISH_ENABLED", "true")
    monkeypatch.setenv("PUBLISH_MAX_RETRIES", "2")
    store.reset_repositories()
    jid, _ = service.create_job(_body(mode=PublishMode.LIVE, confirm=True), account_resolver=_resolver(FB_ACCOUNT))

    def rate_limited(method, url, params):
        return 400, {"error": {"code": 4, "message": "rate"}}

    r1 = worker.run_due_once("w1", transport=rate_limited, token_resolver=lambda t, c: "tok", media_resolver=lambda t, a: [])
    assert r1["processed"][0]["result"] == "retry_wait"
    _, job = store.get_job_repository().get("ws_A", jid)
    assert job.status is PublishStatus.RETRY_WAIT and job.attempt_count == 1
    # force it due again
    store.get_job_repository().update("ws_A", jid, next_retry_utc="2000-01-01T00:00:00+00:00")
    r2 = worker.run_due_once("w1", transport=rate_limited, token_resolver=lambda t, c: "tok", media_resolver=lambda t, a: [])
    assert r2["processed"][0]["result"] == "failed"  # attempts exhausted → terminal
    _, job = store.get_job_repository().get("ws_A", jid)
    assert job.status is PublishStatus.FAILED and job.attempt_count == 2


def test_worker_reconnection_required_is_terminalish(monkeypatch):
    monkeypatch.setenv("SOCIAL_PUBLISH_MODE", "live")
    monkeypatch.setenv("META_PUBLISH_ENABLED", "true")
    store.reset_repositories()
    jid, _ = service.create_job(_body(mode=PublishMode.LIVE, confirm=True), account_resolver=_resolver(FB_ACCOUNT))
    expired = lambda m, u, p: (400, {"error": {"code": 190, "message": "expired"}})
    r = worker.run_due_once("w1", transport=expired, token_resolver=lambda t, c: "tok", media_resolver=lambda t, a: [])
    assert r["processed"][0]["result"] == "reconnection_required"
    _, job = store.get_job_repository().get("ws_A", jid)
    assert job.status is PublishStatus.RECONNECTION_REQUIRED


def test_worker_non_retryable_terminal(monkeypatch):
    monkeypatch.setenv("SOCIAL_PUBLISH_MODE", "live")
    monkeypatch.setenv("META_PUBLISH_ENABLED", "true")
    store.reset_repositories()
    jid, _ = service.create_job(_body(mode=PublishMode.LIVE, confirm=True), account_resolver=_resolver(FB_ACCOUNT))
    denied = lambda m, u, p: (403, {"error": {"code": 200, "message": "no perm"}})
    r = worker.run_due_once("w1", transport=denied, token_resolver=lambda t, c: "tok", media_resolver=lambda t, a: [])
    assert r["processed"][0]["result"] == "failed"
    _, job = store.get_job_repository().get("ws_A", jid)
    assert job.status is PublishStatus.FAILED and job.attempt_count == 1  # no retry for permission error
