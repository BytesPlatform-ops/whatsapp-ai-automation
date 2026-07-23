"""Publishing reconciliation — recover jobs stranded in PUBLISHING by a crashed or
restarted worker. Strategy is polling + reconciliation, not webhooks (see
publishing/RECONCILIATION.md). No live calls."""

from __future__ import annotations

import pytest

pytest.importorskip("pydantic")

import publishing.store as store
from publishing import service, worker
from publishing.enums import ContentFormat, Platform, PublishMode, PublishStatus, SourceProduct
from publishing.schemas import CreatePublishJobBody

FB_ACCOUNT = {
    "connection_id": "facebook:PAGE1", "platform": "facebook", "account_id": "PAGE1",
    "page_id": "PAGE1", "display_name": "Test Page", "scopes": ["pages_manage_posts", "pages_show_list"],
}


def _resolver(*accounts):
    m = {a["connection_id"]: a for a in accounts}
    return lambda tenant, cid: m.get(cid)


@pytest.fixture(autouse=True)
def _clean(monkeypatch):
    monkeypatch.delenv("PIXIE_PERSIST", raising=False)
    monkeypatch.setenv("SOCIAL_PUBLISH_MODE", "dry_run")
    monkeypatch.delenv("META_PUBLISH_ENABLED", raising=False)
    monkeypatch.setenv("PUBLISH_LOCK_TIMEOUT_SECONDS", "300")
    store.reset_repositories()
    yield
    store.reset_repositories()


def _body(**kw):
    base = dict(tenant_id="ws_A", source_product=SourceProduct.CONTENT_AGENT, connection_id="facebook:PAGE1",
                platform=Platform.FACEBOOK, content_format=ContentFormat.TEXT, text="hello",
                document_id="d1", version_id="v1", mode=PublishMode.DRY_RUN)
    base.update(kw)
    return CreatePublishJobBody(**base)


def _strand(jid, tenant="ws_A", *, post_id="", lock_age_iso="2000-01-01T00:00:00+00:00"):
    """Force a job into a stranded PUBLISHING state with a STALE lock."""
    store.get_job_repository().update(tenant, jid, status=PublishStatus.PUBLISHING,
                                      locked_at=lock_age_iso, locked_by="dead-worker",
                                      platform_post_id=post_id)


def test_stranded_without_post_id_is_requeued():
    jid, _ = service.create_job(_body(), account_resolver=_resolver(FB_ACCOUNT))
    _strand(jid)
    summary = worker.reconcile_pending()
    assert summary["count"] == 1 and summary["reconciled"][0]["result"] == "requeued"
    _, job = store.get_job_repository().get("ws_A", jid)
    assert job.status is PublishStatus.QUEUED and not job.locked_at


def test_stranded_with_post_id_is_finalized_published():
    """Delayed-completion recovery — the platform accepted the post, only our
    bookkeeping lagged."""
    jid, _ = service.create_job(_body(), account_resolver=_resolver(FB_ACCOUNT))
    _strand(jid, post_id="123_456")
    summary = worker.reconcile_pending()
    assert summary["reconciled"][0]["result"] == "finalized_published"
    _, job = store.get_job_repository().get("ws_A", jid)
    assert job.status is PublishStatus.PUBLISHED and job.completed_at


def test_fresh_lock_left_untouched():
    """A job an active worker is still publishing (fresh lock) must not be reconciled."""
    jid, _ = service.create_job(_body(), account_resolver=_resolver(FB_ACCOUNT))
    store.get_job_repository().update("ws_A", jid, status=PublishStatus.PUBLISHING,
                                      locked_at=store.now_iso(), locked_by="live-worker")
    assert worker.reconcile_pending()["count"] == 0
    _, job = store.get_job_repository().get("ws_A", jid)
    assert job.status is PublishStatus.PUBLISHING


def test_restart_recovery_requeue_then_publishes():
    """Full self-heal: crash mid-publish → reconcile requeues → next tick publishes."""
    jid, _ = service.create_job(_body(), account_resolver=_resolver(FB_ACCOUNT))
    _strand(jid)
    # run_due_once reconciles at the head of the tick, then processes the requeued job
    summary = worker.run_due_once("w1", media_resolver=lambda t, a: [])
    assert any(p["result"] == "published" for p in summary["processed"])
    _, job = store.get_job_repository().get("ws_A", jid)
    assert job.status is PublishStatus.PUBLISHED and job.platform_post_id.startswith("dryrun_")


def test_reconcile_is_tenant_scoped_write():
    jid, _ = service.create_job(_body(tenant_id="ws_A"), account_resolver=_resolver(FB_ACCOUNT))
    _strand(jid, tenant="ws_A", post_id="p1")
    worker.reconcile_pending()
    # recovered job is only reachable by its owning tenant
    assert store.get_job_repository().get("ws_B", jid) is None
    _, job = store.get_job_repository().get("ws_A", jid)
    assert job.status is PublishStatus.PUBLISHED
