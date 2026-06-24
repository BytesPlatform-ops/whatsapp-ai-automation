"""Platform strategy engine — pure data + accessors, NO AI.

This module holds the deterministic, hand-authored knowledge about *how* each
social/marketing surface wants content shaped: formats, posting rules, hard
limits, CTA style, and risk notes. The content/brief/campaign clusters consult
these specs to tailor what they produce per platform.

Nothing here calls a model. Everything is a lookup over `PLATFORM_SPECS`.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from ..schemas import Platform


class PlatformSpec(BaseModel):
    """Static strategy profile for a single platform."""

    platform: str
    formats: list[str] = Field(default_factory=list)
    ideal_use: str = ""
    audience_style: str = ""
    posting_rules: list[str] = Field(default_factory=list)
    # Hard/soft limits the limit-checker enforces. Common keys:
    #   caption_chars, hashtags, video_seconds, title_chars, body_chars,
    #   media_count, subject_chars.
    limits: dict[str, int] = Field(default_factory=dict)
    media_needs: str = ""
    cta_style: str = ""
    risk_notes: list[str] = Field(default_factory=list)


# ── the authored spec table ──────────────────────────────────────────────────
# Realistic, current-ish defaults. Limits are intentionally a touch conservative
# so the limit-checker warns *before* a real API would reject.
PLATFORM_SPECS: dict[Platform, PlatformSpec] = {
    Platform.INSTAGRAM: PlatformSpec(
        platform="instagram",
        formats=["reel", "carousel", "single_image", "story"],
        ideal_use="Visual brand-building and reach via Reels and carousels.",
        audience_style="Aspirational, aesthetic-first, casual but polished.",
        posting_rules=[
            "Lead with a strong visual hook in the first 1-2 seconds.",
            "Front-load the caption; the first line shows before 'more'.",
            "Use 3-8 focused hashtags, not the full 30.",
        ],
        limits={"caption_chars": 2200, "hashtags": 30, "video_seconds": 90, "media_count": 10},
        media_needs="Required: high-quality vertical (9:16) video or square/portrait image.",
        cta_style="Soft CTA in caption or sticker (e.g. 'Link in bio', 'Save this').",
        risk_notes=[
            "Aggressive hashtag stuffing can suppress reach.",
            "External links only in bio / stories (with link sticker).",
        ],
    ),
    Platform.FACEBOOK: PlatformSpec(
        platform="facebook",
        formats=["single_image", "link_post", "video", "carousel", "text_post"],
        ideal_use="Community, events, and link-out to owned properties.",
        audience_style="Conversational, community-oriented, slightly older skew.",
        posting_rules=[
            "Links are first-class; a clear link preview drives clicks.",
            "Keep copy short; expand in comments if needed.",
            "Native video outperforms shared YouTube links.",
        ],
        limits={"caption_chars": 63206, "hashtags": 30, "video_seconds": 240, "media_count": 10},
        media_needs="Optional but recommended: image, native video, or rich link preview.",
        cta_style="Direct CTA acceptable ('Learn More', 'Shop Now', explicit link).",
        risk_notes=[
            "Organic reach for pages is low; expect to boost.",
            "Engagement-bait phrasing is down-ranked.",
        ],
    ),
    Platform.TIKTOK: PlatformSpec(
        platform="tiktok",
        formats=["short_video"],
        ideal_use="Trend-driven discovery and fast organic reach.",
        audience_style="Native, fast, entertaining; overly polished ads underperform.",
        posting_rules=[
            "Hook in the first second or viewers swipe away.",
            "Lean into trends, sounds, and on-screen text.",
            "Keep videos tight; 15-34s is a strong band.",
        ],
        limits={"caption_chars": 2200, "hashtags": 30, "video_seconds": 600, "media_count": 1},
        media_needs="Required: vertical (9:16) short-form video with audio.",
        cta_style="Verbal/on-screen CTA ('Comment X', 'Follow for part 2').",
        risk_notes=[
            "Clearly branded ads can tank organically.",
            "Reused watermarked content (e.g. IG/Reels logos) is down-ranked.",
        ],
    ),
    Platform.YOUTUBE_SHORTS: PlatformSpec(
        platform="youtube_shorts",
        formats=["short_video"],
        ideal_use="Discovery feeder for a long-form YouTube channel.",
        audience_style="Punchy, value-dense, search-and-retention oriented.",
        posting_rules=[
            "Title carries SEO weight; make it searchable.",
            "Hook fast and retain; loops help.",
            "Must be vertical and under 60 seconds to count as a Short.",
        ],
        limits={"caption_chars": 5000, "hashtags": 15, "video_seconds": 60, "title_chars": 100},
        media_needs="Required: vertical (9:16) video, <= 60s.",
        cta_style="Verbal CTA + 'Subscribe'; pinned-comment link.",
        risk_notes=[
            "Over 60s drops it out of the Shorts shelf.",
            "Hashtag spam in description is ignored/penalized.",
        ],
    ),
    Platform.LINKEDIN: PlatformSpec(
        platform="linkedin",
        formats=["text_post", "single_image", "document_carousel", "article", "video"],
        ideal_use="B2B authority, hiring, and professional thought leadership.",
        audience_style="Professional, insight-led, first-person and credible.",
        posting_rules=[
            "Open with a hook line; the 'see more' fold is ~3 lines.",
            "Document carousels (PDF) get strong dwell time.",
            "1-3 niche hashtags; avoid consumer-style tagging.",
        ],
        limits={"caption_chars": 3000, "hashtags": 10, "video_seconds": 600, "media_count": 9},
        media_needs="Optional: image, native video, or multi-page PDF carousel.",
        cta_style="Professional CTA ('Read the full breakdown', 'DM me').",
        risk_notes=[
            "Outbound links in-post can reduce reach; consider link-in-comment.",
            "Overly salesy tone underperforms vs. insight tone.",
        ],
    ),
    Platform.X: PlatformSpec(
        platform="x",
        formats=["text_post", "thread", "image_post", "video_post"],
        ideal_use="Real-time commentary, threads, and link distribution.",
        audience_style="Terse, opinionated, fast-moving.",
        posting_rules=[
            "Lead post must stand alone; threads expand it.",
            "1-2 hashtags max; more looks spammy.",
            "Images and short video lift engagement.",
        ],
        limits={"caption_chars": 280, "hashtags": 5, "video_seconds": 140, "media_count": 4},
        media_needs="Optional: image or short video; text-only is fine.",
        cta_style="Direct CTA or link; concise.",
        risk_notes=[
            "Default 280-char cap unless verified (longer posts).",
            "External links can reduce reach in the algorithm.",
        ],
    ),
    Platform.THREADS: PlatformSpec(
        platform="threads",
        formats=["text_post", "image_post", "video_post"],
        ideal_use="Conversational, Instagram-adjacent text-first sharing.",
        audience_style="Casual, friendly, conversational; less hashtag-driven.",
        posting_rules=[
            "Conversational openers outperform headlines.",
            "Hashtags are minimal/tag-style; don't stack them.",
            "Replies and quote-posts drive distribution.",
        ],
        limits={"caption_chars": 500, "hashtags": 1, "video_seconds": 300, "media_count": 10},
        media_needs="Optional: image or video; text-first works well.",
        cta_style="Soft, conversational CTA ('What do you think?').",
        risk_notes=[
            "Single tag per post (Threads tagging model).",
            "Link reach is modest; lead with the idea.",
        ],
    ),
    Platform.WHATSAPP: PlatformSpec(
        platform="whatsapp",
        formats=["text_message", "broadcast", "status", "template_message"],
        ideal_use="Direct 1:1 / list messaging and status updates.",
        audience_style="Personal, direct, permission-based.",
        posting_rules=[
            "Only message users who opted in.",
            "Business-initiated messages need approved templates.",
            "Keep it concise and personal; avoid blast-y tone.",
        ],
        limits={"caption_chars": 4096, "hashtags": 0, "video_seconds": 90, "media_count": 1},
        media_needs="Optional: image, short video, or document attachment.",
        cta_style="Direct, single CTA (reply, tap button, click link).",
        risk_notes=[
            "Non-opt-in messaging risks bans and policy violations.",
            "24-hour customer-service window rules apply to free-form replies.",
        ],
    ),
    Platform.EMAIL: PlatformSpec(
        platform="email",
        formats=["newsletter", "promotional", "transactional", "plain_text"],
        ideal_use="Owned-audience nurture, announcements, and conversion.",
        audience_style="Direct, value-led, scannable; subject line is everything.",
        posting_rules=[
            "Subject line drives open rate; keep it under ~50 chars.",
            "One primary CTA; secondary links below the fold.",
            "Include a plain-text fallback and unsubscribe link.",
        ],
        limits={"subject_chars": 78, "body_chars": 100000, "hashtags": 0, "media_count": 20},
        media_needs="Optional: header image; keep total weight low for deliverability.",
        cta_style="One clear button CTA above the fold.",
        risk_notes=[
            "Spammy subject words and image-only emails hurt deliverability.",
            "Must honor unsubscribe / CAN-SPAM / GDPR.",
        ],
    ),
    Platform.SMS: PlatformSpec(
        platform="sms",
        formats=["text_message"],
        ideal_use="Time-sensitive, high-open-rate alerts and offers.",
        audience_style="Ultra-concise, personal, urgent-but-respectful.",
        posting_rules=[
            "Keep within a single segment (160 chars) when possible.",
            "Identify the sender and include opt-out (STOP).",
            "Only message opted-in numbers.",
        ],
        limits={"caption_chars": 160, "hashtags": 0, "video_seconds": 0, "media_count": 0},
        media_needs="None for SMS; MMS (image) optional but costs more.",
        cta_style="One short link or reply keyword.",
        risk_notes=[
            "Multi-segment messages cost more and may split.",
            "Carrier filtering and TCPA/consent rules apply.",
        ],
    ),
    Platform.GOOGLE_BUSINESS: PlatformSpec(
        platform="google_business",
        formats=["update_post", "offer_post", "event_post"],
        ideal_use="Local visibility on Search/Maps for a physical business.",
        audience_style="Informative, local, trustworthy; keyword-aware.",
        posting_rules=[
            "Keep it factual and local; posts expire after ~7 days.",
            "Add a clear CTA button (Call, Book, Learn more).",
            "Use a strong image; avoid promotional fluff.",
        ],
        limits={"caption_chars": 1500, "hashtags": 0, "video_seconds": 30, "media_count": 1},
        media_needs="Recommended: a single high-quality landscape photo.",
        cta_style="Built-in CTA button (Book, Order, Call, Learn more).",
        risk_notes=[
            "No hashtags; not a social feed.",
            "Posts auto-expire; refresh regularly.",
        ],
    ),
    Platform.REDDIT: PlatformSpec(
        platform="reddit",
        formats=["text_post", "link_post", "image_post"],
        ideal_use="Niche community engagement and authentic discussion.",
        audience_style="Authentic, value-first, anti-marketing; community rules vary.",
        posting_rules=[
            "Read and follow each subreddit's rules before posting.",
            "Lead with genuine value, not a pitch.",
            "Title is critical; titles can't be edited after posting.",
        ],
        limits={"title_chars": 300, "body_chars": 40000, "hashtags": 0, "media_count": 20},
        media_needs="Optional: image or link; text posts are fine.",
        cta_style="Soft, disclosed CTA; overt self-promo gets removed.",
        risk_notes=[
            "Self-promotion outside allowed ratios gets banned.",
            "Per-subreddit moderation is strict and idiosyncratic.",
        ],
    ),
    Platform.PINTEREST: PlatformSpec(
        platform="pinterest",
        formats=["pin", "idea_pin", "video_pin"],
        ideal_use="Evergreen discovery and traffic for visual/how-to niches.",
        audience_style="Inspirational, planning-oriented, keyword-driven.",
        posting_rules=[
            "Vertical 2:3 images perform best.",
            "Keyword-rich titles and descriptions aid search.",
            "Every pin should link to a relevant destination.",
        ],
        limits={"title_chars": 100, "caption_chars": 500, "hashtags": 20, "media_count": 1},
        media_needs="Required: vertical (2:3) image or video.",
        cta_style="Descriptive CTA tied to the linked page.",
        risk_notes=[
            "Low-quality or mismatched destination links hurt distribution.",
            "Content has a long, evergreen tail — plan accordingly.",
        ],
    ),
    Platform.SNAPCHAT: PlatformSpec(
        platform="snapchat",
        formats=["snap", "story", "spotlight"],
        ideal_use="Younger-audience, ephemeral, authentic moments.",
        audience_style="Casual, playful, in-the-moment.",
        posting_rules=[
            "Vertical full-screen, native feel over produced ads.",
            "Spotlight rewards entertaining short video.",
            "Content is ephemeral; post consistently.",
        ],
        limits={"caption_chars": 250, "hashtags": 0, "video_seconds": 60, "media_count": 1},
        media_needs="Required: vertical (9:16) photo or video.",
        cta_style="Swipe-up / attachment CTA where available.",
        risk_notes=[
            "Skews young; not ideal for B2B.",
            "Content disappears; no evergreen value.",
        ],
    ),
    Platform.TELEGRAM: PlatformSpec(
        platform="telegram",
        formats=["channel_post", "message"],
        ideal_use="Broadcast channels and community groups.",
        audience_style="Direct, community-oriented, can be long-form.",
        posting_rules=[
            "Channel posts support rich formatting and media.",
            "Keep a consistent posting cadence for subscribers.",
            "Links are fully supported and clickable.",
        ],
        limits={"caption_chars": 4096, "hashtags": 5, "video_seconds": 600, "media_count": 10},
        media_needs="Optional: image, video, document, or text-only.",
        cta_style="Direct CTA with inline buttons or links.",
        risk_notes=[
            "No native discovery; growth is mostly off-platform.",
            "Spammy broadcast can trigger reports.",
        ],
    ),
    Platform.DISCORD: PlatformSpec(
        platform="discord",
        formats=["message", "announcement", "embed"],
        ideal_use="Engaged community building and real-time interaction.",
        audience_style="Casual, insider, community-native.",
        posting_rules=[
            "Post in the right channel; respect server norms.",
            "Use announcements channel for broadcasts.",
            "Conversation > broadcasting; engage replies.",
        ],
        limits={"caption_chars": 2000, "hashtags": 0, "video_seconds": 0, "media_count": 10},
        media_needs="Optional: image, video, or embed.",
        cta_style="Conversational CTA, role/thread mentions, links.",
        risk_notes=[
            "2000-char per-message cap (4000 for boosted/Nitro).",
            "Broadcast-only presence feels spammy to communities.",
        ],
    ),
    Platform.NEXTDOOR: PlatformSpec(
        platform="nextdoor",
        formats=["neighborhood_post", "business_post", "recommendation"],
        ideal_use="Hyper-local trust and word-of-mouth for local businesses.",
        audience_style="Neighborly, local, trust-and-recommendation driven.",
        posting_rules=[
            "Be genuinely local and helpful; neighbors flag spam.",
            "Recommendations and reviews carry the most weight.",
            "Avoid hard-sell; lead with community value.",
        ],
        limits={"caption_chars": 1000, "hashtags": 0, "video_seconds": 0, "media_count": 10},
        media_needs="Optional: image; text-first is common.",
        cta_style="Soft, local CTA ('Stop by', 'Ask for a quote').",
        risk_notes=[
            "Overt advertising gets flagged by neighbors/mods.",
            "Strictly local reach; no broad distribution.",
        ],
    ),
}

# Generic fallback spec — returned when a platform has no authored entry, so the
# accessor never crashes and adapters always have *something* to format against.
_GENERIC_SPEC = PlatformSpec(
    platform="generic",
    formats=["text_post", "image_post"],
    ideal_use="Generic content distribution.",
    audience_style="Neutral, clear, professional.",
    posting_rules=[
        "Lead with a clear hook.",
        "Keep copy concise and on-brand.",
        "Include one clear call to action.",
    ],
    limits={"caption_chars": 2000, "hashtags": 10, "video_seconds": 120, "media_count": 10},
    media_needs="Optional: image or video.",
    cta_style="One clear call to action.",
    risk_notes=["Generic fallback spec; tune per real platform when adding support."],
)


def _coerce_platform(platform: "Platform | str") -> "Platform | None":
    """Best-effort coerce a Platform or str into a Platform enum member."""
    if isinstance(platform, Platform):
        return platform
    if isinstance(platform, str):
        # Try value match first ("instagram"), then name match ("INSTAGRAM").
        try:
            return Platform(platform.lower())
        except ValueError:
            try:
                return Platform[platform.upper()]
            except KeyError:
                return None
    return None


def get_platform_spec(platform: "Platform | str") -> PlatformSpec:
    """Return the spec for a platform.

    Accepts a `Platform` enum or a string (value or name). Falls back to a
    generic spec (never raises) so callers can always format something.
    """
    member = _coerce_platform(platform)
    if member is not None and member in PLATFORM_SPECS:
        return PLATFORM_SPECS[member]
    return _GENERIC_SPEC


def list_platform_specs() -> list[PlatformSpec]:
    """Return all authored platform specs."""
    return list(PLATFORM_SPECS.values())
