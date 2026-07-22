"""Pydantic v2 contracts for the publishing engine.

The immutable ``PublishSnapshot`` is the auditable record of exactly what was
requested (source doc/version, final platform text, media set). A ``PublishJob``
references a snapshot; editing content produces a NEW snapshot + fingerprint. No
token or secret is ever stored on any of these models.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field

from .enums import ContentFormat, Platform, PublishMode, PublishStatus, SourceProduct


class _Base(BaseModel):
    model_config = ConfigDict(extra="ignore")


class _Tenanted(_Base):
    tenant_id: str = Field(..., min_length=1)


class PublishSnapshot(_Base):
    """Immutable content snapshot — what will actually be published."""
    source_product: SourceProduct
    document_id: str = ""          # Content Agent document
    version_id: str = ""           # Content Agent version
    influencer_video_id: str = ""  # AI Influencer video
    influencer_post_id: str = ""   # AI Influencer post package
    content_format: ContentFormat = ContentFormat.TEXT
    text: str = ""                 # final, platform-specific caption/text
    link: str = ""
    media_asset_ids: List[str] = Field(default_factory=list)
    first_comment: str = ""


class PublishJob(_Tenanted):
    source_product: SourceProduct
    connection_id: str = ""
    platform: Platform
    account_id: str = ""           # page id / IG business account id
    mode: PublishMode = PublishMode.DRY_RUN
    status: PublishStatus = PublishStatus.SCHEDULED
    snapshot: PublishSnapshot

    # scheduling
    scheduled_utc: str = ""        # canonical execution time (UTC ISO)
    local_time: str = ""           # original local time as entered
    timezone: str = "UTC"          # IANA timezone

    # execution bookkeeping
    attempt_count: int = 0
    max_attempts: int = 3
    next_retry_utc: str = ""
    locked_at: str = ""
    locked_by: str = ""
    started_at: str = ""
    completed_at: str = ""

    # results
    platform_post_id: str = ""
    platform_permalink: str = ""
    error_category: str = ""
    error_correlation_id: str = ""

    # provenance
    fingerprint: str = ""
    idempotency_key: str = ""
    created_by: str = ""
    cancelled_by: str = ""
    created_at: str = ""
    updated_at: str = ""


class PublishAttempt(_Tenanted):
    job_id: str = ""
    attempt_number: int = 1
    started_at: str = ""
    completed_at: str = ""
    result: str = ""               # a PublishStatus value (published/failed/…)
    simulated: bool = True         # True in dry-run
    platform_post_id: str = ""
    platform_request_id: str = ""
    error_category: str = ""
    error_correlation_id: str = ""
    retryable: bool = False
    response_meta: Dict[str, Any] = Field(default_factory=dict)  # NO secrets


# ── Request bodies ─────────────────────────────────────────────────────────────
class CreatePublishJobBody(_Tenanted):
    source_product: SourceProduct
    connection_id: str = Field(..., min_length=1)
    platform: Platform
    account_id: str = ""
    mode: PublishMode = PublishMode.DRY_RUN
    # content selection (Content Agent OR influencer)
    document_id: str = ""
    version_id: str = ""
    influencer_video_id: str = ""
    influencer_post_id: str = ""
    content_format: ContentFormat = ContentFormat.TEXT
    text: str = ""
    link: str = ""
    media_asset_ids: List[str] = Field(default_factory=list)
    first_comment: str = ""
    # scheduling — omit scheduled_local for publish-now
    scheduled_local: str = ""      # "" → publish now
    timezone: str = ""             # IANA; defaults to workspace/server default
    idempotency_key: str = ""
    confirm: bool = False          # explicit user confirmation (required for live)
    created_by: str = ""


class RescheduleBody(_Tenanted):
    scheduled_local: str = ""      # "" → publish now
    timezone: str = ""


class CancelBody(_Tenanted):
    cancelled_by: str = ""


class RetryBody(_Tenanted):
    pass
