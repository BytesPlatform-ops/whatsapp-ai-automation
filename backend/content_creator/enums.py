"""Canonical enums for the Content Creator pipeline — PURE STDLIB.

Kept dependency-free (no Pydantic) so the core pipeline, gates, cost, providers
and quality modules can import them and stay unit-testable on a stdlib-only
interpreter. schemas.py (Pydantic) re-exports these for the HTTP boundary.
"""

from __future__ import annotations

from enum import Enum


class PipelineStage(str, Enum):
    """The 13 ordered stages (matches the demo progress bar)."""

    INTAKE = "intake"                          # 1
    INFLUENCER_SETUP = "influencer_setup"      # 2
    PROVIDER_CONNECTION = "provider_connection"  # 3
    IDEA_GENERATION = "idea_generation"        # 4
    IDEA_APPROVAL = "idea_approval"            # 5  (Gate 1)
    SCRIPT_GENERATION = "script_generation"    # 6
    SCRIPT_APPROVAL = "script_approval"        # 7  (Gate 2)
    COST_ESTIMATE = "cost_estimate"            # 8  (Gate 3 — production approval)
    VIDEO_GENERATION = "video_generation"      # 9
    QUALITY_CHECK = "quality_check"            # 10
    PUBLISH_APPROVAL = "publish_approval"      # 11 (Gate 4)
    POSTING = "posting"                        # 12
    ANALYTICS = "analytics"                    # 13


# Ordered list for progress display / advancement.
STAGE_SEQUENCE = list(PipelineStage)


class ApprovalGate(str, Enum):
    """The 4 owner-approval gates."""

    IDEA = "idea"            # Gate 1 — before script generation
    SCRIPT = "script"        # Gate 2 — before cost estimate
    PRODUCTION = "production"  # Gate 3 — before video generation (NO spend before this)
    PUBLISH = "publish"      # Gate 4 — before posting


class ApprovalStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    NEEDS_CHANGES = "needs_changes"


class ProviderMode(str, Enum):
    USER_ACCOUNT = "user_account"    # Mode A — user's own Higgsfield credits
    PIXIE_ACCOUNT = "pixie_account"  # Mode B — Pixie pays, charges via markup


class IdentitySource(str, Enum):
    REFERENCE_IMAGE = "reference_image"        # Path A — uploaded reference
    GENERATED_CHARACTER = "generated_character"  # Path B — characteristics → mock character


class JobStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    DONE = "done"
    FAILED = "failed"
    SKIPPED = "skipped"


class VideoStatus(str, Enum):
    PENDING = "pending"
    GENERATING = "generating"
    READY = "ready"
    FAILED = "failed"
    MOCK = "mock"


class PostStatus(str, Enum):
    SCHEDULED = "scheduled"
    DRY_RUN = "dry_run"
    POSTED = "posted"
    FAILED = "failed"


class QualityStatus(str, Enum):
    PASS = "pass"
    FAIL = "fail"
    NEEDS_RETRY = "needs_retry"
    MANUAL_REVIEW = "manual_review"


class PlatformType(str, Enum):
    META = "meta"
    INSTAGRAM = "instagram"
    TIKTOK = "tiktok"
    YOUTUBE = "youtube"
    LINKEDIN = "linkedin"
    X = "x"


# Which gate must be APPROVED before a given stage may run.
GATE_BLOCKS_STAGE = {
    ApprovalGate.IDEA: PipelineStage.SCRIPT_GENERATION,
    ApprovalGate.SCRIPT: PipelineStage.COST_ESTIMATE,
    ApprovalGate.PRODUCTION: PipelineStage.VIDEO_GENERATION,
    ApprovalGate.PUBLISH: PipelineStage.POSTING,
}
