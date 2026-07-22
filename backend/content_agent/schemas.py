"""Pydantic v2 contracts for the General Content Agent HTTP boundary.

Design: instead of one untyped blob, generation input is split into two TYPED
models — ``GenerationOptions`` (cross-cutting controls: tone/length/variations/…)
and ``GenerationInputs`` (the content specifics: topic/audience/keyword/…). A
per-type field registry (``content_agent.types``) declares which inputs each
content type uses and which are required; the service validates against it. This
keeps the surface strongly typed while supporting 10 content types without a
10-way class explosion.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field

from .enums import ContentStatus, ContentType, JobStatus


class _Base(BaseModel):
    model_config = ConfigDict(extra="ignore")


class _Tenanted(_Base):
    tenant_id: str = Field(..., min_length=1)


# ── Generation controls (Task 17) ────────────────────────────────────────────
class GenerationOptions(_Base):
    tone: str = ""
    length: str = "medium"          # short | medium | long
    language: str = "en"
    creativity: str = "balanced"    # low | balanced | high
    variations: int = Field(default=1, ge=1, le=5)
    platform: str = ""
    cta: str = ""
    include_emojis: bool = True
    include_hashtags: bool = True
    pov: str = ""                   # first_person | brand | third_person …
    reading_level: str = ""


# ── Content specifics (union of fields across the 10 types; per-type required
#    fields are enforced by content_agent.types) ─────────────────────────────
class GenerationInputs(_Base):
    topic: str = ""
    title: str = ""
    audience: str = ""
    goal: str = ""
    objective: str = ""
    key_points: List[str] = Field(default_factory=list)
    keyword: str = ""
    secondary_keywords: List[str] = Field(default_factory=list)
    outline: str = ""
    sources: str = ""
    email_type: str = ""
    offer: str = ""
    product: str = ""
    category: str = ""
    features: List[str] = Field(default_factory=list)
    benefits: str = ""
    name: str = ""
    pain_point: str = ""
    benefit: str = ""
    constraints: str = ""
    page_type: str = ""
    search_intent: str = ""
    location: str = ""
    business_details: str = ""
    duration: str = ""
    hook: str = ""
    presenter_style: str = ""
    scene_suggestions: str = ""
    slide_count: int = 5
    visual_direction: str = ""
    original_content: str = ""
    transformation: str = ""
    target_platform: str = ""
    image_context: str = ""


class GenerationRequest(_Tenanted):
    content_type: ContentType
    inputs: GenerationInputs = Field(default_factory=GenerationInputs)
    options: GenerationOptions = Field(default_factory=GenerationOptions)
    title: str = ""                 # optional document title override
    save: bool = False              # generate-and-save vs generate-only (preview)


# ── Outputs ──────────────────────────────────────────────────────────────────
class GeneratedVariation(_Base):
    index: int = 0
    title: str = ""
    text: str = ""                              # plain-text rendering
    structured: Dict[str, Any] = Field(default_factory=dict)  # structured payload (carousel/ad/seo)


class UsageMeta(_Base):
    provider: str = "mock"
    model: str = "mock"
    mock: bool = True
    tokens: int = 0
    estimated_cost: float = 0.0
    prompt_version: str = ""


class GenerationResult(_Base):
    content_type: ContentType
    variations: List[GeneratedVariation] = Field(default_factory=list)
    usage: UsageMeta = Field(default_factory=UsageMeta)


# ── Persistence models ───────────────────────────────────────────────────────
class ContentVersion(_Tenanted):
    document_id: str = ""
    version_number: int = 1
    title: str = ""
    text: str = ""
    structured: Dict[str, Any] = Field(default_factory=dict)
    prompt_version: str = ""
    request_snapshot: Dict[str, Any] = Field(default_factory=dict)
    provider: str = "mock"
    model: str = "mock"
    mock: bool = True
    usage: Dict[str, Any] = Field(default_factory=dict)
    created_at: str = ""
    created_by: str = ""            # "generation" | "manual_edit" | "regenerate"
    parent_version_id: str = ""


class ContentDocument(_Tenanted):
    user_id: str = ""
    content_type: ContentType
    title: str = ""
    status: ContentStatus = ContentStatus.DRAFT
    current_version_id: str = ""
    folder: str = ""
    tags: List[str] = Field(default_factory=list)
    media_asset_ids: List[str] = Field(default_factory=list)
    campaign_ref: str = ""
    settings: Dict[str, Any] = Field(default_factory=dict)
    created_at: str = ""
    updated_at: str = ""
    archived_at: str = ""


class GenerationJob(_Tenanted):
    content_type: ContentType
    status: JobStatus = JobStatus.QUEUED
    request: Dict[str, Any] = Field(default_factory=dict)
    error: str = ""
    provider: str = "mock"
    model: str = "mock"
    started_at: str = ""
    completed_at: str = ""
    result_version_ids: List[str] = Field(default_factory=list)


class ContentUsage(_Tenanted):
    """One AI-generation usage record (text). Records provider metadata + tokens +
    estimated cost per request. Not a billing ledger — credit deduction is NOT
    enforced; ``actual_cost`` is filled only when a provider reports it."""
    product: str = "content_agent"
    content_type: ContentType
    provider: str = "mock"
    model: str = "mock"
    mock: bool = True
    variations: int = 1
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    duration_ms: int = 0
    estimated_cost: float = 0.0
    actual_cost: float = 0.0
    success: bool = True
    prompt_version: str = ""
    created_at: str = ""


# ── Request bodies for mutations ─────────────────────────────────────────────
class DocumentPatch(_Tenanted):
    title: Optional[str] = None
    status: Optional[ContentStatus] = None
    folder: Optional[str] = None
    tags: Optional[List[str]] = None
    campaign_ref: Optional[str] = None


class SaveGeneratedBody(_Tenanted):
    content_type: ContentType
    title: str = ""
    variation: GeneratedVariation
    settings: Dict[str, Any] = Field(default_factory=dict)
    prompt_version: str = ""
    provider: str = "mock"
    model: str = "mock"
    mock: bool = True


class ManualVersionBody(_Tenanted):
    title: str = ""
    text: str = ""
    structured: Dict[str, Any] = Field(default_factory=dict)


class SetCurrentVersionBody(_Tenanted):
    version_id: str = Field(..., min_length=1)
