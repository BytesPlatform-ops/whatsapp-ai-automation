"""Posting adapter contract for the Content Creator — PURE STDLIB.

Mirrors the dry-run convention of ``marketing/platforms/base.py``: an ABC +
abstractmethods, a :class:`SupportLevel` enum, and result objects whose
``would_post`` flag is always ``False`` until a real, explicitly-enabled live
path exists. This module builds the Content-Creator's *own* types (it does NOT
import from ``marketing``).

SAFETY INVARIANT: a :class:`PostRequest`'s ``dry_run`` defaults to ``True`` and
no concrete adapter in this build publishes while ``dry_run`` is ``True``. The
:class:`BasePlaceholderAdapter` refuses to go live and returns a
:class:`PostResult` with ``would_post=False`` / status ``dry_run``. There is no
live HTTP in this module.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import Enum
from typing import Any, Dict

from content_creator.enums import PlatformType, PostStatus


class SupportLevel(str, Enum):
    """How much real integration a posting adapter has."""

    FULL_API = "full_api"                      # full programmatic publish
    PARTIAL_API = "partial_api"                # some API surface
    DRY_RUN = "dry_run"                        # mock / dry-run only
    FUTURE_PLACEHOLDER = "future_placeholder"  # stub; integration not built yet


@dataclass
class PostRequest:
    """A request to (eventually) publish a generated video to a platform.

    ``dry_run`` defaults to ``True`` — nothing publishes live by default.
    """

    tenant_id: str
    platform: str
    video_ref: str
    caption: str = ""
    scheduled_time: str = ""
    dry_run: bool = True


@dataclass
class PostResult:
    """Outcome of a publish attempt. ``would_post`` is ``False`` in dry-run."""

    tenant_id: str
    platform: str
    status: str          # a PostStatus value
    would_post: bool
    dry_run: bool
    external_ref: str = ""
    detail: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "tenant_id": self.tenant_id,
            "platform": self.platform,
            "status": self.status,
            "would_post": self.would_post,
            "dry_run": self.dry_run,
            "external_ref": self.external_ref,
            "detail": self.detail,
        }


class PostingAdapter(ABC):
    """Abstract contract for a per-platform posting adapter.

    Class attributes:
        name: short platform identifier (e.g. ``"meta"``).
        support_level: how real the integration is.
    """

    name: str
    support_level: SupportLevel

    @abstractmethod
    def publish(self, req: PostRequest) -> PostResult:
        """Publish a video. MUST NOT publish live while ``req.dry_run`` is True."""


class BasePlaceholderAdapter(PostingAdapter):
    """Concrete dry-run adapter. Refuses to go live; nothing posts.

    There is no live HTTP here. ``publish`` always returns a
    :class:`PostResult` with ``would_post=False`` and status ``dry_run`` while
    ``req.dry_run`` is True (the default).
    """

    name = "placeholder"
    support_level = SupportLevel.DRY_RUN

    def publish(self, req: PostRequest) -> PostResult:
        if req.dry_run:
            return PostResult(
                tenant_id=req.tenant_id,
                platform=req.platform,
                status=PostStatus.DRY_RUN.value,
                would_post=False,
                dry_run=True,
                external_ref="",
                detail="Dry run only — nothing was posted live.",
            )
        # No live HTTP path exists in this build; refuse rather than publish.
        return PostResult(
            tenant_id=req.tenant_id,
            platform=req.platform,
            status=PostStatus.DRY_RUN.value,
            would_post=False,
            dry_run=False,
            external_ref="",
            detail="Live posting is not enabled for this adapter; nothing was posted.",
        )
