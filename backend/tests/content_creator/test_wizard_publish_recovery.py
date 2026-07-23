"""Content Creator posting stage recovers its REAL durable publish job.

The Step Posting stage creates a publish job through the publishing engine (not a
content_creator-only record). build_wizard_state surfaces that job so the wizard
resumes after refresh/restart and marks POSTING complete without a duplicate. No
live calls."""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

import pytest

pytest.importorskip("pydantic")

import publishing.store as pub_store
from content_creator import store as cc_store
from content_creator.schemas import Video, VideoStatus
from content_creator.wizard import build_wizard_state
from publishing import service as pub_service
from publishing.enums import ContentFormat, Platform, PublishMode, PublishStatus, SourceProduct
from publishing.schemas import CreatePublishJobBody

FB_ACCOUNT = {
    "connection_id": "facebook:PAGE1", "platform": "facebook", "account_id": "PAGE1",
    "page_id": "PAGE1", "display_name": "Test Page", "scopes": ["pages_manage_posts", "pages_show_list"],
}


def _resolver(cid):
    return {"facebook:PAGE1": FB_ACCOUNT}.get(cid)


@pytest.fixture(autouse=True)
def _clean(monkeypatch):
    monkeypatch.delenv("PIXIE_PERSIST", raising=False)
    monkeypatch.setenv("SOCIAL_PUBLISH_MODE", "dry_run")
    pub_store.reset_repositories()
    cc_store.reset_repositories()
    yield
    pub_store.reset_repositories()
    cc_store.reset_repositories()


def _seed_video(tenant="ws_A"):
    vid, _ = cc_store.get_video_repository().save(
        Video(tenant_id=tenant, script_ref="s1", status=VideoStatus.READY, asset_ref="asset_1")
    )
    return vid


def _create_job(tenant, video_id, **kw):
    body = dict(tenant_id=tenant, source_product=SourceProduct.AI_INFLUENCER,
                connection_id="facebook:PAGE1", platform=Platform.FACEBOOK,
                content_format=ContentFormat.VIDEO, text="reel caption",
                influencer_video_id=video_id, media_asset_ids=["asset_1"], mode=PublishMode.DRY_RUN)
    body.update(kw)
    return pub_service.create_job(CreatePublishJobBody(**body),
                                  account_resolver=lambda t, c: _resolver(c),
                                  gate_checker=lambda t, v: True)


def test_posting_incomplete_without_publish_job():
    _seed_video()
    s = build_wizard_state("ws_A")
    assert s["publish_job"] is None
    posting = next(x for x in s["stages"] if x["stage"] == "posting")
    assert posting["done"] is False


def test_publish_job_recovered_and_posting_complete():
    vid = _seed_video()
    jid, _ = _create_job("ws_A", vid, scheduled_local="2099-01-01T09:00", timezone="UTC")
    s = build_wizard_state("ws_A")
    pj = s["publish_job"]
    assert pj is not None and pj["id"] == jid
    assert pj["status"] == PublishStatus.SCHEDULED.value
    assert pj["platform"] == "facebook" and pj["mode"] == "dry_run"
    assert pj["local_time"].startswith("2099-01-01")
    # posting stage now complete off the real job (no content_creator Post record)
    posting = next(x for x in s["stages"] if x["stage"] == "posting")
    assert posting["done"] is True
    # no secrets/snapshot leaked into the resume payload
    assert "snapshot" not in pj and "token" not in str(pj).lower()


def test_recovery_is_idempotent_no_duplicate_on_refresh():
    vid = _seed_video()
    a, _ = _create_job("ws_A", vid, scheduled_local="2099-01-01T09:00", timezone="UTC")
    # a second identical create (double-click / refresh re-submit) returns the SAME job
    b, _ = _create_job("ws_A", vid, scheduled_local="2099-01-01T09:00", timezone="UTC")
    assert a == b
    # refreshing wizard-state resolves exactly one job
    assert build_wizard_state("ws_A")["publish_job"]["id"] == a


def test_recovery_is_tenant_scoped():
    vid = _seed_video("ws_A")
    _create_job("ws_A", vid, scheduled_local="2099-01-01T09:00", timezone="UTC")
    # a different tenant sees no publish job for its own (empty) pipeline
    assert build_wizard_state("ws_B")["publish_job"] is None
