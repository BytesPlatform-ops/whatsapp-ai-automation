"""Deterministic prompt-template builders for the Pixie Marketing AI Agent.

PURE string assembly — no model calls, no I/O, no awaits. Every builder takes a
``MarketingProfile`` (the business knowledge) plus the matching ``IndustryPreset``
(the industry priors) and optionally a ``BrainStrategy`` / free-text goal /
``Platform`` / ``FunnelStage``, and returns a ``(system, user)`` tuple ready to
hand to ``models.get_router().complete``.

Why pure: the brain, content, briefs and platform-adaptation layers all need to
build the same context block. Factoring ``_profile_block`` here means the business
profile, industry, audience, goal, platform, funnel stage, brand voice, CTA,
offer, compliance/restricted claims, past performance and the human-approval
requirement are woven into EVERY prompt the same way — and it's trivially unit
testable because nothing here touches the network.

These return strings only. The model call (and its deterministic fallback) lives
in the brain / briefs modules, never here.
"""

from __future__ import annotations

from ..knowledge import IndustryPreset
from ..schemas import (
    BrainStrategy,
    FunnelStage,
    MarketingProfile,
    Platform,
)

# A tuple type for readability.
Prompt = tuple  # (system: str, user: str)


def _join(items, fallback: str = "none") -> str:
    """Comma-join a list of strings, falling back to a placeholder when empty."""
    if not items:
        return fallback
    return ", ".join(str(i) for i in items if str(i).strip()) or fallback


def _platform_value(platform: Platform | str | None) -> str:
    if platform is None:
        return ""
    if isinstance(platform, Platform):
        return platform.value
    try:
        return Platform(platform).value
    except ValueError:
        return str(platform)


def _funnel_value(stage: FunnelStage | str | None, profile: MarketingProfile) -> str:
    if stage is None:
        stage = profile.funnel_stage
    if isinstance(stage, FunnelStage):
        return stage.value
    try:
        return FunnelStage(stage).value
    except ValueError:
        return str(stage)


def _profile_block(
    profile: MarketingProfile,
    preset: IndustryPreset,
    *,
    goal: str | None = None,
    platform: Platform | str | None = None,
    funnel_stage: FunnelStage | str | None = None,
    past_performance: str = "",
) -> str:
    """Render the shared business + industry context every prompt needs once.

    Weaves together: business profile, industry, audience, goal, platform, funnel
    stage, brand voice, CTA, offer, compliance/restricted claims, past performance
    and — when the business requires it — the human-approval gate. Deterministic.
    """
    p = profile
    platform_v = _platform_value(platform)
    funnel_v = _funnel_value(funnel_stage, p)
    cta = p.primary_cta or (preset.cta_examples[0] if preset.cta_examples else "Message us")
    offer = _join(preset.common_offers, fallback="-")
    brand_voice = _join(
        [p.brand_tone, p.brand_personality, p.content_style],
        fallback="clear, on-brand, no hype",
    )

    lines = [
        "BUSINESS PROFILE:",
        f"- name: {p.business_name}",
        f"- industry: {p.industry.value} ({preset.display_name})",
        f"- type: {p.business_type or '-'}",
        f"- location: {p.location or '-'}",
        f"- target_audience: {p.target_audience or preset.display_name + ' customers'}",
        f"- pain_points: {_join(p.pain_points or preset.pain_points, fallback='-')}",
        f"- products/services: {_join(p.products, fallback='-')}",
        f"- pricing: {p.pricing or '-'}",
        f"- usp: {p.usp or '-'}",
        f"- brand_voice: {brand_voice}",
        f"- primary_cta: {cta}",
        f"- typical_offer: {offer}",
        f"- funnel_stage: {funnel_v}",
        f"- budget_range: {p.budget_range or '-'}",
        f"- language: {p.language}",
    ]
    if platform_v:
        lines.append(f"- target_platform: {platform_v}")
    if goal:
        lines.append(f"- goal: {goal}")

    lines += [
        "",
        "COMPLIANCE & RESTRICTED CLAIMS (hard limits — never cross):",
        f"- restricted_claims (NEVER make these): {_join(p.restricted_claims, fallback='none specified')}",
        f"- compliance_notes: {p.compliance_notes or 'none'}",
        f"- industry_compliance_warnings: {_join(preset.compliance_warnings, fallback='none')}",
        f"- things_to_avoid: {_join(preset.things_to_avoid, fallback='none')}",
        f"- high_risk_industry: {'YES — human review is mandatory before anything is published.' if preset.high_risk else 'no'}",
    ]

    if past_performance:
        lines += ["", f"PAST PERFORMANCE: {past_performance}"]

    lines += [
        "",
        "INDUSTRY PRIORS (use as a starting point, tailor to THIS business — do not blindly copy):",
        f"- best_campaign_types: {_join(preset.best_campaign_types)}",
        f"- content_formats: {_join(preset.content_formats)}",
        f"- content_pillars: {_join(preset.content_pillars)}",
        f"- common_offers: {_join(preset.common_offers)}",
        f"- cta_examples: {_join(preset.cta_examples)}",
        f"- suggested_platforms: {_join([pl.value for pl in preset.platforms])}",
    ]

    if p.approval_required:
        lines += [
            "",
            "APPROVAL REQUIREMENT: A human must approve this output before it is marked "
            "ready or published. Flag anything that needs a human decision; never imply "
            "auto-publishing.",
        ]

    return "\n".join(lines)


def _strategy_block(strategy: BrainStrategy | None) -> str:
    """Render an existing BrainStrategy contract for prompts that build on it."""
    if strategy is None:
        return ""
    c = strategy.to_contract()
    lines = [
        "",
        "APPROVED STRATEGY (build on this — stay consistent with it):",
        f"- campaignGoal: {c.get('campaignGoal') or '-'}",
        f"- targetAudience: {c.get('targetAudience') or '-'}",
        f"- platforms: {_join(c.get('platforms'))}",
        f"- contentPillars: {_join(c.get('contentPillars'))}",
        f"- creativeAngles: {_join(c.get('creativeAngles'))}",
        f"- cta: {c.get('cta') or '-'}",
        f"- assetsNeeded: {_join(c.get('assetsNeeded'))}",
        f"- recommendedCadence: {c.get('recommendedCadence') or '-'}",
        f"- riskNotes: {_join(c.get('riskNotes'))}",
    ]
    return "\n".join(lines)


_COMPLIANCE_RULE = (
    "Respect every restricted claim and compliance warning above. Never promise "
    "guaranteed results, never fabricate metrics/reviews, and keep claims honest and "
    "specific to this business."
)


# ── prompt builders ──────────────────────────────────────────────────────────
def build_strategy_prompt(
    profile: MarketingProfile,
    preset: IndustryPreset,
    *,
    goal: str = "",
    platform_focus: list[Platform] | None = None,
    past_performance: str = "",
) -> Prompt:
    """High-level marketing strategy for a business + goal."""
    system = (
        "You are Pixie's marketing strategist. You reason about positioning, audience, "
        "creative angles and cadence for ONE specific business. Output a single JSON "
        "object with EXACTLY these keys: campaignGoal (string), targetAudience (string), "
        "platforms (string[]), contentPillars (string[]), creativeAngles (string[]), "
        "cta (string), assetsNeeded (string[]), recommendedCadence (string), "
        "riskNotes (string[]), nextActions (string[]). " + _COMPLIANCE_RULE
    )
    focus = _join([pl.value for pl in (platform_focus or [])], fallback="")
    user_parts = [
        f"GOAL: {goal or profile.monthly_goal or 'Grow this business.'}",
        "",
        _profile_block(profile, preset, goal=goal, past_performance=past_performance),
    ]
    if focus:
        user_parts += ["", f"RESTRICT TO PLATFORMS: {focus}"]
    return system, "\n".join(user_parts)


def build_campaign_prompt(
    profile: MarketingProfile,
    preset: IndustryPreset,
    *,
    strategy: BrainStrategy | None = None,
    goal: str = "",
    campaign_type: str = "",
) -> Prompt:
    """A concrete campaign (objective, offer, hook, channels, assets) for a goal."""
    system = (
        "You are Pixie's campaign planner. Turn a strategy + goal into ONE concrete, "
        "runnable campaign: objective, core offer, big idea/angle, channels, key assets, "
        "primary CTA, run length and success metric. Be specific to THIS business. "
        + _COMPLIANCE_RULE
    )
    user = "\n".join(
        [
            f"CAMPAIGN GOAL: {goal or profile.monthly_goal or 'Drive measurable results this month.'}",
            f"CAMPAIGN TYPE (if given): {campaign_type or _join(preset.best_campaign_types[:1], fallback='your best fit')}",
            "",
            _profile_block(profile, preset, goal=goal),
            _strategy_block(strategy),
        ]
    )
    return system, user


def build_content_prompt(
    profile: MarketingProfile,
    preset: IndustryPreset,
    *,
    platform: Platform | str | None = None,
    strategy: BrainStrategy | None = None,
    content_pillar: str = "",
    funnel_stage: FunnelStage | str | None = None,
) -> Prompt:
    """A single piece of content (hook, body, CTA, caption, hashtags) for a platform."""
    platform_v = _platform_value(platform) or "the primary platform"
    system = (
        "You are Pixie's content writer. Produce ONE platform-native piece of content: "
        "a scroll-stopping hook, the body, a clear CTA, the caption, and relevant "
        "hashtags. Match the brand voice and the platform's norms exactly. "
        + _COMPLIANCE_RULE
    )
    user = "\n".join(
        [
            f"WRITE CONTENT FOR: {platform_v}",
            f"CONTENT PILLAR (if given): {content_pillar or _join(preset.content_pillars[:1], fallback='your best fit')}",
            "",
            _profile_block(profile, preset, platform=platform, funnel_stage=funnel_stage),
            _strategy_block(strategy),
        ]
    )
    return system, user


def build_platform_adaptation_prompt(
    profile: MarketingProfile,
    preset: IndustryPreset,
    *,
    source_content: str,
    platform: Platform | str,
    funnel_stage: FunnelStage | str | None = None,
) -> Prompt:
    """Adapt one source piece into a single target platform's native format."""
    platform_v = _platform_value(platform)
    system = (
        f"You are Pixie's platform adapter. Rewrite the SOURCE content so it is native to "
        f"{platform_v}: right length, format, tone, structure, CTA placement and hashtag/link "
        "conventions for that platform — without losing the core message. " + _COMPLIANCE_RULE
    )
    user = "\n".join(
        [
            f"TARGET PLATFORM: {platform_v}",
            "",
            "SOURCE CONTENT:",
            source_content or "-",
            "",
            _profile_block(profile, preset, platform=platform, funnel_stage=funnel_stage),
        ]
    )
    return system, user


def build_creative_brief_prompt(
    profile: MarketingProfile,
    preset: IndustryPreset,
    *,
    platform: Platform | str,
    video_format: str,
    concept: str,
    hook_hint: str = "",
    duration_seconds: int | None = None,
    strategy: BrainStrategy | None = None,
) -> Prompt:
    """A production-ready creative brief for a short-form video / ad."""
    platform_v = _platform_value(platform)
    system = (
        "You are Pixie's creative director for short-form video. Produce a production-ready "
        "brief as a single JSON object with these keys: visual_concept (string), "
        "scene_direction (string[] — beat by beat), camera (string), mood (string), "
        "lighting (string), colors (string[]), characters (string[]), props (string[]), "
        "background (string), on_screen_text (string[]), voiceover (string), music (string), "
        "hook_frame (string), ending_frame (string), cta_frame (string). Make it shoot-able "
        "and specific to THIS business and format. " + _COMPLIANCE_RULE
    )
    user = "\n".join(
        [
            f"VIDEO FORMAT: {video_format}",
            f"PLATFORM: {platform_v}",
            f"CONCEPT / TOPIC: {concept or '-'}",
            f"HOOK HINT (optional): {hook_hint or '-'}",
            f"TARGET DURATION (seconds): {duration_seconds if duration_seconds else 'pick the platform default'}",
            "",
            _profile_block(profile, preset, platform=platform),
            _strategy_block(strategy),
        ]
    )
    return system, user


def build_performance_analysis_prompt(
    profile: MarketingProfile,
    preset: IndustryPreset,
    *,
    performance_data: str,
    goal: str = "",
) -> Prompt:
    """Analyse past performance and recommend what to do next."""
    system = (
        "You are Pixie's performance analyst. Read the performance data and produce: what "
        "worked, what didn't, the likely reasons, and concrete, prioritized next actions. "
        "Be honest and specific; do not invent numbers that aren't in the data. "
        + _COMPLIANCE_RULE
    )
    user = "\n".join(
        [
            f"GOAL CONTEXT: {goal or profile.monthly_goal or '-'}",
            "",
            "PERFORMANCE DATA:",
            performance_data or "-",
            "",
            _profile_block(profile, preset, goal=goal, past_performance=performance_data),
        ]
    )
    return system, user


def build_industry_prompt(
    profile: MarketingProfile,
    preset: IndustryPreset,
    *,
    goal: str = "",
) -> Prompt:
    """Industry-specific marketing guidance grounded in the preset's priors."""
    system = (
        f"You are Pixie's {preset.display_name} marketing specialist. Give marketing guidance "
        "that is specific to this industry — the offers, formats, objections and compliance "
        "constraints that actually matter here — tailored to THIS business. " + _COMPLIANCE_RULE
    )
    user = "\n".join(
        [
            f"INDUSTRY: {preset.display_name} ({profile.industry.value})",
            f"GOAL: {goal or profile.monthly_goal or '-'}",
            "",
            _profile_block(profile, preset, goal=goal),
        ]
    )
    return system, user


def build_brand_voice_prompt(
    profile: MarketingProfile,
    preset: IndustryPreset,
    *,
    sample_text: str = "",
) -> Prompt:
    """Define / codify the brand voice (and optionally rewrite a sample to match)."""
    system = (
        "You are Pixie's brand voice editor. Codify this business's voice — tone, personality, "
        "do's and don'ts, vocabulary and a short style guide — and, if a sample is provided, "
        "rewrite it to match. Stay true to the stated tone and personality. " + _COMPLIANCE_RULE
    )
    user_parts = [
        _profile_block(profile, preset),
    ]
    if sample_text:
        user_parts += ["", "SAMPLE TO REWRITE IN-VOICE:", sample_text]
    return system, "\n".join(user_parts)


def build_compliance_review_prompt(
    profile: MarketingProfile,
    preset: IndustryPreset,
    *,
    draft_content: str,
) -> Prompt:
    """Review a draft against restricted claims + industry compliance, flag + fix."""
    system = (
        "You are Pixie's compliance reviewer. Check the DRAFT against the business's "
        "restricted claims and the industry's compliance warnings. Flag every violation, "
        "explain why, and provide a compliant rewrite. When in doubt, require human review. "
        + _COMPLIANCE_RULE
    )
    user = "\n".join(
        [
            "DRAFT TO REVIEW:",
            draft_content or "-",
            "",
            _profile_block(profile, preset),
        ]
    )
    return system, user


def build_repurposing_prompt(
    profile: MarketingProfile,
    preset: IndustryPreset,
    *,
    source_content: str,
    target_platforms: list[Platform] | None = None,
) -> Prompt:
    """Repurpose one source piece into several platform-native variants."""
    targets = _join(
        [_platform_value(pl) for pl in (target_platforms or [])],
        fallback=_join([pl.value for pl in preset.platforms]),
    )
    system = (
        "You are Pixie's content repurposer. Turn ONE source piece into multiple "
        "platform-native variants, each adapted to that platform's length, format, tone and "
        "CTA conventions while preserving the core message. " + _COMPLIANCE_RULE
    )
    user = "\n".join(
        [
            f"REPURPOSE FOR PLATFORMS: {targets}",
            "",
            "SOURCE CONTENT:",
            source_content or "-",
            "",
            _profile_block(profile, preset),
        ]
    )
    return system, user
