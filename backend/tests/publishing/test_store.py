"""Publish job/attempt repositories — contract, restart, isolation, due-selection,
locking, stale-lock recovery, idempotency."""

from __future__ import annotations

import pytest

pytest.importorskip("pydantic")

import persistence
import publishing.store as store
from publishing.enums import ContentFormat, Platform, PublishStatus, SourceProduct
from publishing.schemas import PublishAttempt, PublishJob, PublishSnapshot


@pytest.fixture(params=["memory", "file"])
def backend(request, tmp_path, monkeypatch):
    if request.param == "file":
        monkeypatch.setenv("PIXIE_PERSIST", "file")
        monkeypatch.setenv("PIXIE_DATA_DIR", str(tmp_path))
    else:
        monkeypatch.delenv("PIXIE_PERSIST", raising=False)
    store.reset_repositories()
    assert persistence.enabled() is (request.param == "file")
    yield store
    store.reset_repositories()


def _snap():
    return PublishSnapshot(source_product=SourceProduct.CONTENT_AGENT, document_id="d1", version_id="v1",
                           content_format=ContentFormat.TEXT, text="hello")


def _job(tenant="ws_A", status=PublishStatus.SCHEDULED, scheduled="2000-01-01T00:00:00+00:00", **kw):
    return PublishJob(tenant_id=tenant, source_product=SourceProduct.CONTENT_AGENT, connection_id="c1",
                      platform=Platform.FACEBOOK, account_id="p1", status=status, snapshot=_snap(),
                      scheduled_utc=scheduled, fingerprint=kw.pop("fingerprint", "fp_x"), **kw)


def test_job_crud_and_isolation(backend):
    repo = backend.get_job_repository()
    jid, _ = repo.create(_job())
    assert repo.get("ws_A", jid)[1].platform == Platform.FACEBOOK
    assert repo.get("ws_B", jid) is None            # tenant isolation
    repo.update("ws_A", jid, status=PublishStatus.PUBLISHED)
    assert repo.get("ws_A", jid)[1].status == PublishStatus.PUBLISHED


def test_survives_restart(backend):
    repo = backend.get_job_repository()
    jid, _ = repo.create(_job())
    backend.reset_repositories()
    after = backend.get_job_repository().get("ws_A", jid)
    if persistence.enabled():
        assert after and after[0] == jid
    else:
        assert after is None


def test_due_selection(backend):
    repo = backend.get_job_repository()
    due, _ = repo.create(_job(scheduled="2000-01-01T00:00:00+00:00"))
    future, _ = repo.create(_job(scheduled="2099-01-01T00:00:00+00:00"))
    published, _ = repo.create(_job(status=PublishStatus.PUBLISHED))
    cancelled, _ = repo.create(_job(status=PublishStatus.CANCELLED))
    ids = {jid for (jid, _j) in repo.due_jobs()}
    assert due in ids
    assert future not in ids and published not in ids and cancelled not in ids


def test_lock_prevents_duplicate_execution(backend):
    repo = backend.get_job_repository()
    jid, _ = repo.create(_job())
    first = repo.acquire_lock("ws_A", jid, "worker-1")
    assert first is not None and first.locked_by == "worker-1"
    # a second worker cannot acquire a fresh lock
    assert repo.acquire_lock("ws_A", jid, "worker-2") is None


def test_stale_lock_recovery(backend):
    repo = backend.get_job_repository()
    jid, _ = repo.create(_job())
    repo.acquire_lock("ws_A", jid, "worker-1")
    # simulate an old lock by rewinding locked_at
    repo.update("ws_A", jid, locked_at="2000-01-01T00:00:00+00:00", status=PublishStatus.SCHEDULED)
    recovered = repo.acquire_lock("ws_A", jid, "worker-2", lock_timeout_s=60)
    assert recovered is not None and recovered.locked_by == "worker-2"


def test_idempotency_lookup(backend):
    repo = backend.get_job_repository()
    jid, _ = repo.create(_job(fingerprint="fp_dup"))
    found = repo.find_by_fingerprint("ws_A", "fp_dup")
    assert found and found[0] == jid
    assert repo.find_by_fingerprint("ws_A", "fp_other") is None
    assert repo.find_by_fingerprint("ws_B", "fp_dup") is None  # tenant scoped


def test_retry_wait_uses_next_retry_time(backend):
    repo = backend.get_job_repository()
    not_yet, _ = repo.create(_job(status=PublishStatus.RETRY_WAIT, next_retry_utc="2099-01-01T00:00:00+00:00"))
    ready, _ = repo.create(_job(status=PublishStatus.RETRY_WAIT, next_retry_utc="2000-01-01T00:00:00+00:00"))
    ids = {jid for (jid, _j) in repo.due_jobs()}
    assert ready in ids and not_yet not in ids


def test_attempts_ordered_and_scoped(backend):
    ar = backend.get_attempt_repository()
    for n in (1, 2, 3):
        ar.create(PublishAttempt(tenant_id="ws_A", job_id="j1", attempt_number=n, result="failed"))
    ar.create(PublishAttempt(tenant_id="ws_A", job_id="j2", attempt_number=1, result="published"))
    nums = [a.attempt_number for (_i, a) in ar.list_by_job("ws_A", "j1")]
    assert nums == [1, 2, 3]
    assert ar.list_by_job("ws_B", "j1") == []


def test_query_filters(backend):
    repo = backend.get_job_repository()
    repo.create(_job(status=PublishStatus.SCHEDULED))
    repo.create(_job(status=PublishStatus.FAILED))
    assert len(backend.query_jobs("ws_A", status="failed")) == 1
    assert len(backend.query_jobs("ws_A", platform="facebook")) == 2
    assert len(backend.query_jobs("ws_A", platform="instagram")) == 0
