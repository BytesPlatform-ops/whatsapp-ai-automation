"""Per-content-type field registry — the single source of truth for what each type
collects. Served by ``GET /api/content-agent/content-types`` and consumed by the
frontend to render forms, and by the service to validate required inputs. Keeping
this here (not split across 10 form components) means adding a type is one entry.
"""

from __future__ import annotations

from typing import Dict, List

from .enums import STRUCTURED_TYPES, ContentType

# Field kinds the frontend knows how to render.
#   text | textarea | select | multiselect | number | toggle | tags
PLATFORMS_SOCIAL = ["instagram", "facebook", "linkedin", "x", "tiktok", "threads", "generic"]
PLATFORMS_AD = ["meta", "google_search", "linkedin", "tiktok", "display", "landing_page"]
TONES = ["professional", "friendly", "bold", "playful", "inspirational", "informative", "luxury"]
LENGTHS = ["short", "medium", "long"]


def _f(name, label, kind, required=False, options=None, placeholder="", hint=""):
    spec = {"name": name, "label": label, "kind": kind, "required": required}
    if options:
        spec["options"] = options
    if placeholder:
        spec["placeholder"] = placeholder
    if hint:
        spec["hint"] = hint
    return spec


# Cross-cutting controls (GenerationOptions) each type surfaces.
CTRL = {
    "tone": _f("tone", "Tone", "select", options=TONES),
    "length": _f("length", "Length", "select", options=LENGTHS),
    "language": _f("language", "Language", "text", placeholder="en"),
    "creativity": _f("creativity", "Creativity", "select", options=["low", "balanced", "high"]),
    "variations": _f("variations", "Variations", "number", hint="1–5"),
    "cta": _f("cta", "Call to action", "text", placeholder="Book now, DM us…"),
    "emojis": _f("include_emojis", "Include emojis", "toggle"),
    "hashtags": _f("include_hashtags", "Include hashtags", "toggle"),
    "pov": _f("pov", "Point of view", "select", options=["brand", "first_person", "third_person"]),
    "reading_level": _f("reading_level", "Reading level", "select", options=["simple", "standard", "advanced"]),
}


TYPES: Dict[ContentType, dict] = {
    ContentType.SOCIAL_POST: {
        "label": "Social media post", "icon": "megaphone",
        "description": "Platform-ready post with hook, body and CTA.",
        "example": "An Instagram post announcing a summer sale.",
        "fields": [
            _f("platform", "Platform", "select", required=True, options=PLATFORMS_SOCIAL),
            _f("topic", "Topic", "textarea", required=True, placeholder="What is the post about?"),
            _f("audience", "Audience", "text", placeholder="busy parents, gym-goers…"),
            _f("goal", "Goal", "text", placeholder="grow followers, drive bookings…"),
            _f("key_points", "Key points", "tags"),
        ],
        "controls": ["tone", "length", "language", "cta", "emojis", "hashtags", "variations"],
    },
    ContentType.CAPTION: {
        "label": "Social caption", "icon": "quote",
        "description": "Caption for an existing image or video.",
        "example": "A caption for a product photo on Instagram.",
        "fields": [
            _f("platform", "Platform", "select", required=True, options=PLATFORMS_SOCIAL),
            _f("image_context", "Image / video context", "textarea", required=True, placeholder="Describe the visual."),
            _f("goal", "Caption goal", "text"),
        ],
        "controls": ["tone", "length", "language", "cta", "emojis", "hashtags", "variations"],
    },
    ContentType.BLOG: {
        "label": "Blog / article", "icon": "file-text",
        "description": "Long-form article with structured sections.",
        "example": "A 700-word guide on choosing a personal trainer.",
        "fields": [
            _f("topic", "Topic", "textarea", required=True),
            _f("title", "Working title", "text"),
            _f("audience", "Target audience", "text"),
            _f("keyword", "Primary keyword", "text"),
            _f("secondary_keywords", "Secondary keywords", "tags"),
            _f("outline", "Outline (optional)", "textarea"),
            _f("sources", "Factual notes you supply", "textarea", hint="Pixie will not invent external facts."),
        ],
        "controls": ["tone", "length", "language", "pov", "reading_level", "cta"],
    },
    ContentType.EMAIL: {
        "label": "Marketing email", "icon": "mail",
        "description": "Email with subject-line options and body.",
        "example": "A promotional email for a weekend offer.",
        "fields": [
            _f("email_type", "Email type", "select", required=True,
               options=["promotional", "newsletter", "welcome", "follow_up", "re_engagement", "announcement", "cold_outreach", "event_invitation"]),
            _f("objective", "Objective", "text", required=True),
            _f("audience", "Audience", "text"),
            _f("offer", "Offer / product", "text"),
            _f("key_points", "Key details", "tags"),
        ],
        "controls": ["tone", "length", "language", "cta", "variations"],
    },
    ContentType.AD_COPY: {
        "label": "Advertisement copy", "icon": "badge-dollar-sign",
        "description": "Structured ad copy (primary text, headline, description).",
        "example": "A Meta ad for a new fitness app.",
        "fields": [
            _f("platform", "Platform", "select", required=True, options=PLATFORMS_AD),
            _f("product", "Product / service", "text", required=True),
            _f("audience", "Audience", "text"),
            _f("pain_point", "Pain point", "text"),
            _f("benefit", "Key benefit", "text"),
            _f("offer", "Offer", "text"),
        ],
        "controls": ["tone", "language", "cta", "variations"],
    },
    ContentType.PRODUCT_DESCRIPTION: {
        "label": "Product / service description", "icon": "package",
        "description": "Persuasive description with features and benefits.",
        "example": "A description for a handmade candle.",
        "fields": [
            _f("name", "Name", "text", required=True),
            _f("category", "Category", "text"),
            _f("features", "Features", "tags", required=True),
            _f("audience", "Audience", "text"),
            _f("keyword", "SEO keyword", "text"),
        ],
        "controls": ["tone", "length", "language", "cta"],
    },
    ContentType.SEO_CONTENT: {
        "label": "SEO content", "icon": "search",
        "description": "Search-optimized page content (structured).",
        "example": "A service page for a plumber in Austin.",
        "fields": [
            _f("page_type", "Page type", "select", required=True,
               options=["service_page", "landing_page", "location_page", "meta_title_description", "faq", "category_page", "homepage_section"]),
            _f("keyword", "Primary keyword", "text", required=True),
            _f("secondary_keywords", "Secondary keywords", "tags"),
            _f("search_intent", "Search intent", "text"),
            _f("location", "Location", "text"),
            _f("business_details", "Business details", "textarea"),
        ],
        "controls": ["tone", "length", "language", "cta"],
    },
    ContentType.VIDEO_SCRIPT: {
        "label": "Video script", "icon": "clapperboard",
        "description": "Script with hook, main points and CTA.",
        "example": "A 30-second TikTok script.",
        "fields": [
            _f("platform", "Platform", "select", required=True, options=PLATFORMS_SOCIAL),
            _f("topic", "Topic", "textarea", required=True),
            _f("duration", "Duration", "text", placeholder="30s, 60s…"),
            _f("hook", "Hook idea", "text"),
            _f("key_points", "Main points", "tags"),
            _f("presenter_style", "Presenter style", "text"),
        ],
        "controls": ["tone", "language", "cta", "variations"],
    },
    ContentType.CAROUSEL: {
        "label": "Carousel", "icon": "layout-grid",
        "description": "Slide-by-slide carousel (structured).",
        "example": "A 5-slide LinkedIn carousel of tips.",
        "fields": [
            _f("platform", "Platform", "select", required=True, options=PLATFORMS_SOCIAL),
            _f("topic", "Topic", "textarea", required=True),
            _f("slide_count", "Slide count", "number", hint="3–10"),
            _f("hook", "Hook idea", "text"),
            _f("key_points", "Key points", "tags"),
            _f("visual_direction", "Visual direction", "text"),
        ],
        "controls": ["tone", "language", "cta", "emojis"],
    },
    ContentType.REWRITE: {
        "label": "Rewrite / repurpose", "icon": "repeat",
        "description": "Transform existing content for a new format or tone.",
        "example": "Turn a blog post into a LinkedIn post.",
        "fields": [
            _f("original_content", "Original content", "textarea", required=True),
            _f("transformation", "Transformation", "select", required=True,
               options=["shorten", "expand", "simplify", "make_professional", "make_conversational",
                        "blog_to_social", "script_to_carousel", "article_to_email", "repost_other_platform"]),
            _f("target_platform", "Target platform", "select", options=PLATFORMS_SOCIAL),
        ],
        "controls": ["tone", "length", "language", "variations"],
    },
}


def type_catalog() -> List[dict]:
    """Serializable catalog for GET /content-types."""
    out = []
    for ct, spec in TYPES.items():
        out.append({
            "content_type": ct.value,
            "label": spec["label"],
            "icon": spec["icon"],
            "description": spec["description"],
            "example": spec["example"],
            "structured": ct in STRUCTURED_TYPES,
            "fields": spec["fields"],
            "controls": [CTRL[c] for c in spec["controls"]],
        })
    return out


def required_inputs(ct: ContentType) -> List[str]:
    return [f["name"] for f in TYPES[ct]["fields"] if f.get("required")]
