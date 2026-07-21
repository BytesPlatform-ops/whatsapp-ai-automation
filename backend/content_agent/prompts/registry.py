"""Versioned prompt templates for each content type.

Every generated version records ``PROMPT_VERSION`` so output is traceable. Prompts
supply business context, respect platform/tone/length/language, require the number
of variations, demand structured JSON where relevant, and explicitly forbid
inventing facts, testimonials, statistics, customer results, or guarantees.

These templates are used when a REAL provider is enabled; in mock mode the
deterministic generator returns schema-valid sample content but still stamps this
version. Adding a type is one entry here + one in ``content_agent.types``.
"""

from __future__ import annotations

from typing import Dict

from ..enums import ContentType

PROMPT_VERSION = "content_agent_v1"

_ROLE = (
    "You are Pixie, an expert marketing content writer for small businesses. "
    "Write only from the details provided. Do NOT invent facts, statistics, "
    "testimonials, customer results, or make guarantees. Keep claims defensible."
)

# Per-type body: what to produce + structure. {ctx} is the interpolated request.
_TEMPLATES: Dict[ContentType, str] = {
    ContentType.SOCIAL_POST: "Write {variations} distinct {platform} posts. Each: a strong hook, a short readable body, and a clear CTA. Respect tone={tone}, length={length}, language={language}.",
    ContentType.CAPTION: "Write {variations} {platform} captions for the described media. Hook first, concise, CTA. Emojis={include_emojis}, hashtags={include_hashtags}.",
    ContentType.BLOG: "Write a {length} article. Include an H1 title, an intro, 3-5 sections with H2 headings, and a conclusion with a CTA. Point of view={pov}. Use ONLY the supplied notes for facts.",
    ContentType.EMAIL: "Write {variations} marketing emails of type={email_type}. For each provide 3 subject-line options and a body with a single clear CTA. Tone={tone}.",
    ContentType.AD_COPY: "Write {variations} ad variations for {platform}. Return JSON per variation: primary_text, headline, description, cta. Concise, benefit-led, no unsupported claims.",
    ContentType.PRODUCT_DESCRIPTION: "Write a persuasive product/service description. Lead with the core benefit, weave in the features, close with a CTA. Length={length}.",
    ContentType.SEO_CONTENT: "Write SEO content for a {page_type} targeting the primary keyword. Return JSON: meta_title, meta_description, h1, sections (array of {{heading, body}}). Natural keyword use, no stuffing.",
    ContentType.VIDEO_SCRIPT: "Write a {platform} video script (~{duration}). Include HOOK, 3-5 beats/scenes, and a CTA. Presenter style guidance welcome.",
    ContentType.CAROUSEL: "Write a {platform} carousel. Return JSON: hook, slides (array of {{title, body}}), cta, caption, visual_direction. Produce the requested slide count.",
    ContentType.REWRITE: "Transform the supplied content: transformation={transformation}, target={target_platform}. Preserve meaning; apply new tone={tone}, length={length}, language={language}. Produce {variations} option(s).",
}


def _ctx(inputs: dict, options: dict) -> dict:
    merged = {**options, **{k: v for k, v in inputs.items() if v not in (None, "", [], {})}}
    merged.setdefault("platform", options.get("platform") or "generic")
    return merged


def build_prompt(content_type: ContentType, inputs: dict, options: dict) -> str:
    tmpl = _TEMPLATES[content_type]
    ctx = _ctx(inputs, options)
    try:
        body = tmpl.format(**{**{
            "variations": options.get("variations", 1), "platform": ctx.get("platform", "generic"),
            "tone": options.get("tone", ""), "length": options.get("length", "medium"),
            "language": options.get("language", "en"), "pov": options.get("pov", "brand"),
            "include_emojis": options.get("include_emojis", True), "include_hashtags": options.get("include_hashtags", True),
            "email_type": inputs.get("email_type", ""), "page_type": inputs.get("page_type", ""),
            "duration": inputs.get("duration", ""), "transformation": inputs.get("transformation", ""),
            "target_platform": inputs.get("target_platform", ""),
        }})
    except Exception:
        body = tmpl
    details = "\n".join(f"- {k}: {v}" for k, v in ctx.items() if v not in (None, "", [], {}))
    return f"{_ROLE}\n\nTASK:\n{body}\n\nDETAILS (the only source of truth):\n{details}\n\nReturn only the content."


def structured_schema(content_type: ContentType) -> dict:
    """Required keys for structured content types (used to validate output)."""
    if content_type == ContentType.AD_COPY:
        return {"required": ["primary_text", "headline", "description", "cta"]}
    if content_type == ContentType.SEO_CONTENT:
        return {"required": ["meta_title", "meta_description", "h1", "sections"]}
    if content_type == ContentType.CAROUSEL:
        return {"required": ["hook", "slides", "cta", "caption"]}
    return {"required": []}
