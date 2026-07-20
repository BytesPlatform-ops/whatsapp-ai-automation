"""Content Agent repository contract + restart + isolation tests (memory + file)."""

from __future__ import annotations

import pytest

pytest.importorskip("pydantic")

import persistence
import content_agent.store as store
from content_agent.enums import ContentStatus, ContentType
from content_agent.schemas import ContentDocument, ContentVersion


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


def _doc(tenant="ws_A", ct=ContentType.SOCIAL_POST, title="Post", **kw):
    return ContentDocument(tenant_id=tenant, content_type=ct, title=title, **kw)


def test_document_crud_and_isolation(backend):
    repo = backend.get_document_repository()
    did, _ = repo.create(_doc(title="Hello", tags=["promo"]))
    got = repo.get("ws_A", did)
    assert got and got[1].title == "Hello"
    # tenant isolation
    assert repo.get("ws_B", did) is None
    # update
    repo.update("ws_A", did, title="Hello v2", status=ContentStatus.READY)
    assert repo.get("ws_A", did)[1].status == ContentStatus.READY
    # delete
    assert repo.delete("ws_A", did) is True
    assert repo.get("ws_A", did) is None


def test_version_numbering_and_ordering(backend):
    docs = backend.get_document_repository()
    vers = backend.get_version_repository()
    did, _ = docs.create(_doc())
    for n in range(1, 4):
        vers.create(ContentVersion(tenant_id="ws_A", document_id=did, version_number=vers.next_number("ws_A", did), text=f"v{n}"))
    listed = vers.list_by_document("ws_A", did)
    assert [v.version_number for (_i, v) in listed] == [1, 2, 3]
    assert vers.next_number("ws_A", did) == 4


def test_query_search_filter_sort_paginate(backend):
    repo = backend.get_document_repository()
    repo.create(_doc(title="Summer sale", ct=ContentType.SOCIAL_POST, tags=["promo"], status=ContentStatus.READY))
    repo.create(_doc(title="Winter blog", ct=ContentType.BLOG, tags=["seo"], status=ContentStatus.DRAFT))
    arch = repo.create(_doc(title="Old post", ct=ContentType.SOCIAL_POST))[0]
    repo.update("ws_A", arch, status=ContentStatus.ARCHIVED)

    # archived excluded by default
    res = backend.query_documents("ws_A")
    titles = [d["document"]["title"] for d in res["documents"]]
    assert "Old post" not in titles and res["total"] == 2
    # search
    assert backend.query_documents("ws_A", query="summer")["total"] == 1
    # filter by type
    assert backend.query_documents("ws_A", content_type="blog")["total"] == 1
    # filter by tag
    assert backend.query_documents("ws_A", tags=["seo"])["total"] == 1
    # include archived
    assert backend.query_documents("ws_A", include_archived=True)["total"] == 3
    # pagination
    p = backend.query_documents("ws_A", include_archived=True, page=1, page_size=2)
    assert len(p["documents"]) == 2 and p["total"] == 3
    # cross-tenant returns nothing
    assert backend.query_documents("ws_other")["total"] == 0


def test_survives_restart(backend):
    repo = backend.get_document_repository()
    did, _ = repo.create(_doc(title="Durable"))
    backend.reset_repositories()  # simulate restart
    after = backend.get_document_repository().get("ws_A", did)
    if persistence.enabled():
        assert after and after[1].title == "Durable"
    else:
        assert after is None
