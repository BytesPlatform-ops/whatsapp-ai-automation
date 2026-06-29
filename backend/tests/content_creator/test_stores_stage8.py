"""Store repos for stages 9-13 (video / quality / post / metric / learning)."""

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

import pytest

pytest.importorskip("pydantic")

from content_creator.enums import PlatformType, PostStatus, QualityStatus, VideoStatus
from content_creator.schemas import Learning, Metric, Post, QualityCheck, Video
from content_creator.store import (
    InMemoryLearningRepository,
    InMemoryMetricRepository,
    InMemoryPostRepository,
    InMemoryQualityRepository,
    InMemoryVideoRepository,
)


def test_video_upsert_and_tenant_scope():
    r = InMemoryVideoRepository()
    vid, _ = r.save(Video(tenant_id="t1", script_ref="s1", status=VideoStatus.MOCK, asset_ref="a1"))
    vid2, _ = r.save(Video(tenant_id="t1", script_ref="s1", status=VideoStatus.MOCK, asset_ref="a1b"))
    assert vid == vid2  # same script → upsert, no dupe
    assert r.get("t1", vid) is not None
    assert r.get("other", vid) is None  # cross-tenant blocked


def test_quality_keyed_by_video():
    r = InMemoryQualityRepository()
    r.save(QualityCheck(tenant_id="t1", video_ref="v1", status=QualityStatus.PASS))
    assert r.get_by_video("t1", "v1") is not None
    assert r.get_by_video("t2", "v1") is None


def test_post_per_video_platform():
    r = InMemoryPostRepository()
    r.save(Post(tenant_id="t1", video_ref="v1", platform=PlatformType.META, status=PostStatus.DRY_RUN))
    r.save(Post(tenant_id="t1", video_ref="v1", platform=PlatformType.INSTAGRAM, status=PostStatus.DRY_RUN))
    assert len(r.list("t1")) == 2
    assert r.list("other") == []


def test_metric_and_learning_latest():
    m = InMemoryMetricRepository()
    m.save(Metric(tenant_id="t1", post_ref="p1", views=100))
    assert len(m.list("t1")) == 1 and m.list("zzz") == []

    L = InMemoryLearningRepository()
    L.save(Learning(tenant_id="t1", samples=1, next_focus="a"))
    L.save(Learning(tenant_id="t1", samples=2, next_focus="b"))
    latest = L.get_latest("t1")
    assert latest is not None and latest[1].next_focus == "b"  # most recent
    assert L.get_latest("nobody") is None
