"""Real Meta Graph-API posting adapter PLACEHOLDER — PURE STDLIB.

This module holds the *real* adapter shape (token discovery + a documented live
path), but it is deliberately inert in this build: ``publish`` refuses to go
live whenever ``req.dry_run`` is True OR the global ``dry_run_posting()`` flag is
True — which is the default. The token is read via ``os.getenv`` and is never
logged.

``get_posting_adapter`` is the factory the scheduler uses: it returns the mock
adapters for meta/instagram and future-placeholder adapters for the rest, and
NEVER the real adapter while ``dry_run_posting()`` is True.
"""

from __future__ import annotations

import os

from content_creator.config import dry_run_posting
from content_creator.enums import PostStatus
from content_creator.integrations.posting_base import (
    PostingAdapter,
    PostRequest,
    PostResult,
    SupportLevel,
)
from content_creator.integrations.mock_meta_adapter import (
    LinkedinAdapter,
    MockInstagramAdapter,
    MockMetaAdapter,
    TiktokAdapter,
    XAdapter,
    YoutubeAdapter,
)


class MetaApiAdapter(PostingAdapter):
    """Real Meta Graph-API adapter placeholder. Inert by default.

    Reads ``META_ACCESS_TOKEN`` from the environment but never logs it. Live
    posting only happens when explicitly enabled (NOT in this build's default
    config), and never while ``dry_run`` or ``dry_run_posting()`` is True.
    """

    name = "meta"
    support_level = SupportLevel.PARTIAL_API

    def __init__(self) -> None:
        # Token is held privately; it is never logged or returned anywhere.
        self._token = os.getenv("META_ACCESS_TOKEN", "")

    def available(self) -> bool:
        """True only when a non-empty access token is configured."""
        return bool(self._token)

    def publish(self, req: PostRequest) -> PostResult:
        # SAFETY: refuse to go live while either the per-request flag or the
        # global posting flag is in dry-run. This is the default state.
        if req.dry_run or dry_run_posting():
            return PostResult(
                tenant_id=req.tenant_id,
                platform=req.platform,
                status=PostStatus.DRY_RUN.value,
                would_post=False,
                dry_run=True,
                external_ref="",
                detail="Live Meta posting is gated (dry_run) — nothing was posted.",
            )
        if not self.available():
            return PostResult(
                tenant_id=req.tenant_id,
                platform=req.platform,
                status=PostStatus.FAILED.value,
                would_post=False,
                dry_run=False,
                external_ref="",
                detail="META_ACCESS_TOKEN is not configured.",
            )
        # Real Graph-API publish path — intentionally unimplemented in this
        # build. Reaching here requires explicit opt-out of every dry-run flag.
        return self._publish_live(req)  # pragma: no cover

    def _publish_live(self, req: PostRequest) -> PostResult:  # pragma: no cover
        # Real implementation would POST to
        #   https://graph.facebook.com/<version>/<page-id>/videos
        # with the access token in the Authorization header (never logged),
        # poll for the resulting media id, and return it as external_ref.
        raise NotImplementedError("Live Meta posting is not enabled in this build.")


def get_posting_adapter(platform) -> PostingAdapter:
    """Return the adapter to use for ``platform``.

    Mock adapters for meta/instagram, future-placeholders for the rest. Never
    returns the real :class:`MetaApiAdapter` while ``dry_run_posting()`` is True
    (the default), so the safe path is always selected in this build.
    """
    key = getattr(platform, "value", platform)
    key = str(key).strip().lower()

    placeholders = {
        "tiktok": TiktokAdapter,
        "youtube": YoutubeAdapter,
        "linkedin": LinkedinAdapter,
        "x": XAdapter,
    }
    if key in placeholders:
        return placeholders[key]()
    if key == "instagram":
        return MockInstagramAdapter()
    if key == "meta":
        if dry_run_posting():
            return MockMetaAdapter()
        return MetaApiAdapter()  # pragma: no cover
    # Unknown platform → safe mock that refuses to post.
    adapter = MockMetaAdapter()
    adapter.name = key
    return adapter
