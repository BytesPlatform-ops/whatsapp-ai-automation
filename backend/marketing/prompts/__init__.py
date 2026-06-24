"""Deterministic prompt-template builders for the Pixie Marketing AI Agent.

Each builder assembles a ``(system, user)`` string tuple from a
``MarketingProfile`` + ``IndustryPreset`` (and optionally a ``BrainStrategy`` /
goal / ``Platform`` / ``FunnelStage``). PURE — no model calls, no I/O — so the
brain, content, briefs and platform layers can all reuse the same context block.
"""

from __future__ import annotations

from .templates import (
    build_brand_voice_prompt,
    build_campaign_prompt,
    build_compliance_review_prompt,
    build_content_prompt,
    build_creative_brief_prompt,
    build_industry_prompt,
    build_performance_analysis_prompt,
    build_platform_adaptation_prompt,
    build_repurposing_prompt,
    build_strategy_prompt,
)

__all__ = [
    "build_strategy_prompt",
    "build_campaign_prompt",
    "build_content_prompt",
    "build_platform_adaptation_prompt",
    "build_creative_brief_prompt",
    "build_performance_analysis_prompt",
    "build_industry_prompt",
    "build_brand_voice_prompt",
    "build_compliance_review_prompt",
    "build_repurposing_prompt",
]
