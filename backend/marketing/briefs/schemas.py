"""Creative-brief schemas for the Pixie Marketing AI Agent.

DECOUPLED by design: ``BriefRequest`` takes primitives + a ``MarketingProfile``
and never imports the parallel content / campaign clusters (which may not exist
yet on the shared branch). The only inbound link to other work is the loose
``content_ref_id`` string.

Pydantic v2, tenant-scoped (``tenant_id`` is the isolation key), tolerant of extra
keys so a richer model output never breaks parsing.
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field

from ..schemas import MarketingProfile, Platform


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class PixieVideoFormat(str, Enum):
    """The short-form video formats Pixie produces briefs for (Section E)."""

    AI_ROBOT_PROMO = "ai_robot_promo"
    PROBLEM_SOLUTION_REEL = "problem_solution_reel"
    FOUNDER_CONTENT = "founder_content"
    UGC_SCRIPT = "ugc_script"
    EXPLAINER = "explainer"
    MEME_BRAINROT = "meme_brainrot"
    CINEMATIC_LAUNCH_TEASER = "cinematic_launch_teaser"
    SOFT_LAUNCH = "soft_launch"
    INDUSTRY_AD = "industry_ad"


class BriefRequest(BaseModel):
    """Decoupled input to the creative-brief generator.

    Takes primitives + the business ``MarketingProfile`` so it never depends on
    another Wave-2 cluster's schema. ``content_ref_id`` is a loose, optional link
    to a content item produced elsewhere — a string only, never an import.
    """

    model_config = ConfigDict(extra="ignore")

    tenant_id: str = Field(..., description="Isolation key — which account this brief belongs to.")
    profile: MarketingProfile
    platform: Platform = Field(..., description="Where the video will run.")
    video_format: PixieVideoFormat = Field(..., description="Which Pixie video format to brief.")
    concept: str = Field(default="", description="The concept / topic / angle for the video.")
    topic: str = Field(default="", description="Alias for concept; either may be set.")
    hook_hint: str | None = Field(default=None, description="Optional opening-line / hook hint.")
    duration_seconds: int | None = Field(default=None, ge=1, le=600)
    content_ref_id: str | None = Field(default=None, description="Loose link to a content item (string only).")

    @property
    def topic_or_concept(self) -> str:
        """The effective concept, preferring ``concept`` then ``topic``."""
        return (self.concept or self.topic or "").strip()


class CreativeBrief(BaseModel):
    """A production-ready creative brief for one short-form video (Section E).

    Tenant-scoped and tolerant of extra keys so a richer model output is preserved
    rather than rejected.
    """

    model_config = ConfigDict(extra="allow")

    id: str = Field(default="")
    tenant_id: str
    content_ref_id: str | None = None

    platform: str
    video_format: str

    visual_concept: str = ""
    scene_direction: list[str] = Field(default_factory=list)
    camera: str = ""
    mood: str = ""
    lighting: str = ""
    colors: list[str] = Field(default_factory=list)
    characters: list[str] = Field(default_factory=list)
    props: list[str] = Field(default_factory=list)
    background: str = ""
    on_screen_text: list[str] = Field(default_factory=list)
    voiceover: str = ""
    music: str = ""
    editing_pace: str = ""
    aspect_ratio: str = ""
    duration_seconds: int = 0
    hook_frame: str = ""
    ending_frame: str = ""
    cta_frame: str = ""
    asset_checklist: list[str] = Field(default_factory=list)
    created_at: str = Field(default_factory=_now_iso)
