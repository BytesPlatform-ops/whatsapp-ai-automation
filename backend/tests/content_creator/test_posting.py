"""Tests for the Content Creator posting adapters + mock scheduler.

PURE STDLIB unittest. Asserts the dry-run safety invariant: nothing publishes
live, mock refs are deterministic, future placeholders never post, and no
adapter performs network I/O.
"""

from __future__ import annotations

import os
import socket
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from content_creator.enums import PlatformType, PostStatus
from content_creator.integrations.meta_adapter import (
    MetaApiAdapter,
    get_posting_adapter,
)
from content_creator.integrations.mock_meta_adapter import (
    MockInstagramAdapter,
    MockMetaAdapter,
    TiktokAdapter,
)
from content_creator.integrations.posting_base import (
    BasePlaceholderAdapter,
    PostRequest,
    PostResult,
    SupportLevel,
)
from content_creator.integrations.scheduler import schedule_posts


class TestMockAdapters(unittest.TestCase):
    def test_meta_and_instagram_dry_run(self):
        for adapter in (MockMetaAdapter(), MockInstagramAdapter()):
            req = PostRequest(
                tenant_id="t1",
                platform=adapter.name,
                video_ref="vid1",
                dry_run=True,
            )
            res = adapter.publish(req)
            self.assertIsInstance(res, PostResult)
            self.assertFalse(res.would_post)
            self.assertEqual(res.status, PostStatus.DRY_RUN.value)
            self.assertEqual(res.status, "dry_run")
            self.assertTrue(res.external_ref.startswith("mock-"))
            self.assertEqual(res.tenant_id, "t1")

    def test_external_ref_is_deterministic(self):
        adapter = MockMetaAdapter()
        req = PostRequest(tenant_id="t1", platform="meta", video_ref="vid1")
        first = adapter.publish(req).external_ref
        second = adapter.publish(
            PostRequest(tenant_id="t1", platform="meta", video_ref="vid1")
        ).external_ref
        self.assertEqual(first, second)
        # Different inputs → different ref.
        other = adapter.publish(
            PostRequest(tenant_id="t1", platform="meta", video_ref="vid2")
        ).external_ref
        self.assertNotEqual(first, other)

    def test_mock_never_posts_even_when_not_dry_run(self):
        # Even if a caller forces dry_run=False, the mock refuses to go live.
        res = MockMetaAdapter().publish(
            PostRequest(tenant_id="t1", platform="meta", video_ref="vid1", dry_run=False)
        )
        self.assertFalse(res.would_post)
        self.assertEqual(res.status, "dry_run")


class TestScheduler(unittest.TestCase):
    def test_schedule_posts_two_platforms(self):
        results = schedule_posts("tenant-A", "vid1", ["meta", "instagram"])
        self.assertEqual(len(results), 2)
        platforms = {r["platform"] for r in results}
        self.assertEqual(platforms, {"meta", "instagram"})
        for r in results:
            self.assertFalse(r["would_post"])
            self.assertEqual(r["status"], "dry_run")
            self.assertEqual(r["tenant_id"], "tenant-A")
            self.assertTrue(r["dry_run"])

    def test_schedule_posts_accepts_enum_platforms(self):
        results = schedule_posts("t", "vid1", [PlatformType.META, PlatformType.INSTAGRAM])
        self.assertEqual({r["platform"] for r in results}, {"meta", "instagram"})
        for r in results:
            self.assertFalse(r["would_post"])

    def test_future_placeholder_platform_never_posts(self):
        results = schedule_posts("t", "vid1", ["tiktok"])
        self.assertEqual(len(results), 1)
        r = results[0]
        self.assertFalse(r["would_post"])
        self.assertEqual(r["detail"], "adapter not built")
        # Direct adapter check too.
        res = TiktokAdapter().publish(
            PostRequest(tenant_id="t", platform="tiktok", video_ref="vid1")
        )
        self.assertFalse(res.would_post)
        self.assertEqual(get_posting_adapter("tiktok").support_level,
                         SupportLevel.FUTURE_PLACEHOLDER)


class TestRealAdapterGated(unittest.TestCase):
    def test_no_token_not_available(self):
        old = os.environ.pop("META_ACCESS_TOKEN", None)
        try:
            adapter = MetaApiAdapter()
            self.assertFalse(adapter.available())
            # Even constructed, publish refuses while dry_run.
            res = adapter.publish(
                PostRequest(tenant_id="t", platform="meta", video_ref="vid1", dry_run=True)
            )
            self.assertFalse(res.would_post)
            self.assertEqual(res.status, "dry_run")
        finally:
            if old is not None:
                os.environ["META_ACCESS_TOKEN"] = old

    def test_factory_never_returns_real_adapter_in_dry_run(self):
        # dry_run_posting() defaults True → factory returns the mock.
        adapter = get_posting_adapter("meta")
        self.assertIsInstance(adapter, MockMetaAdapter)
        self.assertNotIsInstance(adapter, MetaApiAdapter)


class TestNoNetworkIO(unittest.TestCase):
    def test_adapters_perform_no_network_io(self):
        original_socket = socket.socket

        def _boom(*args, **kwargs):
            raise AssertionError("network I/O attempted by a posting adapter")

        socket.socket = _boom  # type: ignore[assignment]
        try:
            schedule_posts("t", "vid1", ["meta", "instagram", "tiktok"])
            MockMetaAdapter().publish(
                PostRequest(tenant_id="t", platform="meta", video_ref="v")
            )
            MetaApiAdapter().publish(
                PostRequest(tenant_id="t", platform="meta", video_ref="v", dry_run=True)
            )
        finally:
            socket.socket = original_socket  # type: ignore[assignment]


if __name__ == "__main__":
    unittest.main()
