"""Deterministic, offline mock posting adapters — PURE STDLIB.

The mock Meta / Instagram adapters mirror the real Graph-API surface but never
touch the network: ``publish`` derives a stable ``external_ref`` from
``sha1(tenant|platform|video_ref|scheduled_time)`` and returns a dry-run
:class:`PostResult` (``would_post=False``). Future-platform adapters are pure
placeholders that never post.
"""

from __future__ import annotations

import hashlib

from content_creator.enums import PostStatus
from content_creator.integrations.posting_base import (
    BasePlaceholderAdapter,
    PostRequest,
    PostResult,
    SupportLevel,
)


def _mock_ref(req: PostRequest) -> str:
    """Deterministic external ref for a (tenant, platform, video, time) tuple."""
    raw = "{t}|{p}|{v}|{s}".format(
        t=req.tenant_id,
        p=req.platform,
        v=req.video_ref,
        s=req.scheduled_time,
    )
    digest = hashlib.sha1(raw.encode("utf-8")).hexdigest()
    return "mock-" + digest[:10]


class _MockAdapter(BasePlaceholderAdapter):
    """Shared dry-run publish that stamps a deterministic mock external_ref."""

    support_level = SupportLevel.DRY_RUN

    def publish(self, req: PostRequest) -> PostResult:
        # Mock adapters never publish live regardless of the dry_run flag.
        return PostResult(
            tenant_id=req.tenant_id,
            platform=req.platform,
            status=PostStatus.DRY_RUN.value,
            would_post=False,
            dry_run=req.dry_run,
            external_ref=_mock_ref(req),
            detail="Mock {name} adapter — dry run only, nothing was posted.".format(
                name=self.name
            ),
        )


class MockMetaAdapter(_MockAdapter):
    """Dry-run mock for Meta (Facebook) publishing."""

    name = "meta"


class MockInstagramAdapter(_MockAdapter):
    """Dry-run mock for Instagram publishing."""

    name = "instagram"


class _FuturePlaceholderAdapter(BasePlaceholderAdapter):
    """A platform whose integration is not built yet. Never posts."""

    support_level = SupportLevel.FUTURE_PLACEHOLDER

    def publish(self, req: PostRequest) -> PostResult:
        return PostResult(
            tenant_id=req.tenant_id,
            platform=req.platform,
            status=PostStatus.DRY_RUN.value,
            would_post=False,
            dry_run=req.dry_run,
            external_ref="",
            detail="adapter not built",
        )


class TiktokAdapter(_FuturePlaceholderAdapter):
    name = "tiktok"


class YoutubeAdapter(_FuturePlaceholderAdapter):
    name = "youtube"


class LinkedinAdapter(_FuturePlaceholderAdapter):
    name = "linkedin"


class XAdapter(_FuturePlaceholderAdapter):
    name = "x"
