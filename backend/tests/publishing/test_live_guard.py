"""Guard: dry-run publishing NEVER calls a platform transport. If the worker
touches the injected transport while a job is dry-run, this fails — catching an
accidental live call."""

from __future__ import annotations

import pytest

pytest.importorskip("pydantic")

import publishing.store as store
from publishing import service, worker
from publishing.adapters import DryRunAdapter, MetaPublishAdapter, get_adapter
from publishing.enums import ContentFormat, Platform, PublishMode, PublishStatus, SourceProduct
from publishing.schemas import CreatePublishJobBody

FB = {"connection_id": "facebook:PAGE1", "platform": "facebook", "account_id": "PAGE1",
      "page_id": "PAGE1", "display_name": "P", "scopes": ["pages_manage_posts", "pages_show_list"]}


@pytest.fixture(autouse=True)
def _clean(monkeypatch):
    monkeypatch.delenv("PIXIE_PERSIST", raising=False)
    monkeypatch.setenv("SOCIAL_PUBLISH_MODE", "dry_run")
    monkeypatch.delenv("META_PUBLISH_ENABLED", raising=False)
    store.reset_repositories()
    yield
    store.reset_repositories()


def test_factory_ignores_transport_in_dry_run():
    a = get_adapter(Platform.FACEBOOK, PublishMode.DRY_RUN, transport=lambda *x: (_ for _ in ()).throw(AssertionError("called")))
    assert isinstance(a, DryRunAdapter)


def test_dry_run_worker_never_calls_transport():
    body = CreatePublishJobBody(tenant_id="ws_A", source_product=SourceProduct.CONTENT_AGENT,
                                connection_id="facebook:PAGE1", platform=Platform.FACEBOOK,
                                content_format=ContentFormat.TEXT, text="hi", document_id="d1", version_id="v1",
                                mode=PublishMode.DRY_RUN)
    jid, _ = service.create_job(body, account_resolver=lambda t, c: FB)

    def forbidden_transport(method, url, params):
        raise AssertionError("dry-run must not call a platform transport")

    summary = worker.run_due_once("w1", transport=forbidden_transport, media_resolver=lambda t, a: [])
    assert summary["processed"][0]["result"] == "published"
    _, job = store.get_job_repository().get("ws_A", jid)
    assert job.status is PublishStatus.PUBLISHED and job.platform_post_id.startswith("dryrun_")


def test_live_adapter_used_only_in_live_mode():
    assert isinstance(get_adapter(Platform.FACEBOOK, PublishMode.LIVE), MetaPublishAdapter)
