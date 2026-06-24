"""The `Site` document and its parts — the central product object.

A `Site` is the complete, structured website produced by the Builder and
mutated by the Editor. It is JSON-serializable and the contract the frontend
will eventually render. The quality gate inspects this object to decide whether
the result looks bespoke or templated.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from pydantic import BaseModel, ConfigDict, Field

from .common import (
    Alignment,
    BackgroundStyle,
    CTA,
    ContactInfo,
    MediaAsset,
    Palette,
    SectionItem,
    SectionType,
    SocialLink,
    Typography,
)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class SectionStyle(BaseModel):
    """Per-section visual intent. Variety here is what the quality gate uses to
    reject 'everything centered + same background' templated output."""

    model_config = ConfigDict(extra="ignore")

    alignment: Alignment = Alignment.LEFT
    background: BackgroundStyle = BackgroundStyle.SOLID
    full_width: bool = False
    variant: str | None = Field(default=None, description="Layout variant name, e.g. 'split-left', 'cards-3', 'stacked'.")


class Section(BaseModel):
    """One section of the page (hero, services, menu, …)."""

    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: uuid.uuid4().hex[:8])
    type: SectionType
    order: int = Field(default=0, description="Render order, ascending.")
    eyebrow: str | None = Field(default=None, max_length=80, description="Small label above the heading.")
    heading: str | None = Field(default=None, max_length=200)
    subheading: str | None = Field(default=None, max_length=400)
    body: str | None = Field(default=None, max_length=4000, description="Benefit-led prose — never lorem/placeholder.")
    items: list[SectionItem] = Field(default_factory=list)
    media: list[MediaAsset] = Field(default_factory=list)
    ctas: list[CTA] = Field(default_factory=list)
    style: SectionStyle = Field(default_factory=SectionStyle)


class SiteMeta(BaseModel):
    """Site-level identity + SEO + contact. One coherent brand per site."""

    model_config = ConfigDict(extra="ignore")

    brand_name: str = Field(..., min_length=1, max_length=120)
    business_type: str = Field(..., description="Free-text type, e.g. 'italian restaurant', 'emergency plumber'.")
    tagline: str | None = Field(default=None, max_length=200)
    voice: str | None = Field(default=None, description="Brand voice/tone, e.g. 'warm, confident, no jargon'.")
    locale: str = Field(default="en", description="BCP-47 language tag.")

    # SEO
    seo_title: str | None = Field(default=None, max_length=70)
    seo_description: str | None = Field(default=None, max_length=160)
    keywords: list[str] = Field(default_factory=list)
    og_image: MediaAsset | None = None
    favicon: str | None = None

    contact: ContactInfo = Field(default_factory=ContactInfo)
    socials: list[SocialLink] = Field(default_factory=list)


class Site(BaseModel):
    """A complete bespoke website as structured data.

    Tenant-scoped (`tenant_id`). `version` increments on each accepted edit so
    the Editor and billing can reason about history. `source_request_id` ties a
    site back to the request that produced/changed it.
    """

    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    tenant_id: str = Field(..., description="Owning tenant — every row is scoped by this.")

    meta: SiteMeta
    palette: Palette
    typography: Typography
    sections: list[Section] = Field(default_factory=list)

    version: int = Field(default=1, ge=1)
    source_request_id: str | None = None
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)

    def ordered_sections(self) -> list[Section]:
        """Sections sorted by `order` (stable for equal orders)."""
        return sorted(self.sections, key=lambda s: s.order)
