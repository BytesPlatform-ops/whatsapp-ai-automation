"""Canonical enums for the publishing engine — PURE STDLIB."""

from __future__ import annotations

from enum import Enum


class PublishStatus(str, Enum):
    DRAFT = "draft"
    SCHEDULED = "scheduled"
    QUEUED = "queued"
    PUBLISHING = "publishing"
    PUBLISHED = "published"
    FAILED = "failed"
    CANCELLED = "cancelled"
    RETRY_WAIT = "retry_wait"
    RECONNECTION_REQUIRED = "reconnection_required"


# Terminal states — a job here is never selected by the worker again.
TERMINAL_STATUSES = {PublishStatus.PUBLISHED, PublishStatus.CANCELLED, PublishStatus.FAILED}

# States the worker may pick up when due.
DUE_STATUSES = {PublishStatus.SCHEDULED, PublishStatus.QUEUED, PublishStatus.RETRY_WAIT}


class SourceProduct(str, Enum):
    CONTENT_AGENT = "content_agent"
    AI_INFLUENCER = "ai_influencer"


class PublishMode(str, Enum):
    DRY_RUN = "dry_run"
    LIVE = "live"


class Platform(str, Enum):
    FACEBOOK = "facebook"
    INSTAGRAM = "instagram"
    # Adapter-interface placeholders — NOT live in this build.
    LINKEDIN = "linkedin"
    TIKTOK = "tiktok"
    X = "x"
    YOUTUBE = "youtube"


# Platforms with a real (mock-contract-tested) publishing adapter.
LIVE_CAPABLE_PLATFORMS = {Platform.FACEBOOK, Platform.INSTAGRAM}


class ContentFormat(str, Enum):
    TEXT = "text"
    LINK = "link"
    IMAGE = "image"
    VIDEO = "video"
    CAROUSEL = "carousel"
    REEL = "reel"
    STORY = "story"
