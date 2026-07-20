"""Canonical enums for the General Content Agent — PURE STDLIB (no Pydantic)."""

from __future__ import annotations

from enum import Enum


class ContentType(str, Enum):
    SOCIAL_POST = "social_post"
    CAPTION = "caption"
    BLOG = "blog"
    EMAIL = "email"
    AD_COPY = "ad_copy"
    PRODUCT_DESCRIPTION = "product_description"
    SEO_CONTENT = "seo_content"
    VIDEO_SCRIPT = "video_script"
    CAROUSEL = "carousel"
    REWRITE = "rewrite"


# Content types whose primary output is a STRUCTURED payload (rendered field-by-field
# in the UI), not a single prose blob.
STRUCTURED_TYPES = {ContentType.CAROUSEL, ContentType.AD_COPY, ContentType.SEO_CONTENT}


class ContentStatus(str, Enum):
    DRAFT = "draft"
    READY = "ready"
    ARCHIVED = "archived"


class JobStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    DONE = "done"
    FAILED = "failed"
