"""Schemas for the Meta Marketing Agent flows."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class AnalyzeBody(BaseModel):
    tenant_id: str = "demo_tenant"
    user_id: str = "demo_user"
    asset_ids: list[str] = Field(default_factory=list)
    date_range: str = "last_30_days"
    now: str = ""


class PreparePostBody(BaseModel):
    model_config = ConfigDict(extra="ignore")
    tenant_id: str = "demo_tenant"
    user_id: str = "demo_user"
    platform: str = "instagram"          # instagram | facebook
    asset_id: str = ""                   # ig id or page id (defaults to selected)
    content_type: str = "reel"           # reel | post | photo | video
    idea: str = ""                       # rough idea / topic for the agent to expand
    caption: str = ""                    # optional: user-provided caption (skips generation)
    media_url: str = ""                  # public media URL (required for real IG publish)
    media_asset_id: str = ""
    scheduled_time: str | None = None
    now: str = ""


class PrepareReplyBody(BaseModel):
    tenant_id: str = "demo_tenant"
    asset_id: str = ""
    target_id: str = ""                  # comment id to reply to
    comment_text: str = ""               # the incoming comment (for the AI to answer)
    now: str = ""
