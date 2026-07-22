"""Seeded Meta data — lets the whole Marketing flow be explored with NO Meta app.

Clearly labelled demo assets + analytics so a reviewer can click Connect (demo),
Analyze, prepare a post, and approve — all without App Review. Real connections
replace this with live Graph data; the shapes match so the UI is identical.
"""

from __future__ import annotations


def demo_assets() -> dict:
    return {
        "facebook_pages": [{
            "id": "page_demo_1", "name": "Bytes Coffee (demo)", "status": "connected",
            "tasks": ["CREATE_CONTENT", "MODERATE", "ANALYZE", "MANAGE"],
            "linked_instagram": {"id": "ig_demo_1", "username": "bytescoffee"},
        }],
        "instagram_accounts": [{"id": "ig_demo_1", "username": "bytescoffee", "page_id": "page_demo_1"}],
        "ad_accounts": [{"id": "act_demo_1", "name": "Bytes Coffee Ads (demo)"}],
    }


def demo_analytics_summary(asset_id: str = "ig_demo_1", date_range: str = "last_30_days") -> dict:
    """A realistic-looking organic + ads snapshot for the demo IG/Page."""
    return {
        "asset_id": asset_id,
        "date_range": date_range,
        "profile": {"followers": 4820, "follower_change_pct": 3.1, "reach": 21450, "views": 38900,
                    "engagement_rate_pct": 4.6},
        "top_posts": [
            {"media_id": "m1", "type": "REEL", "caption": "Latte art in 15s", "reach": 9800,
             "likes": 640, "comments": 51, "saves": 220, "shares": 88},
            {"media_id": "m2", "type": "IMAGE", "caption": "New oat milk menu", "reach": 5200,
             "likes": 310, "comments": 22, "saves": 61, "shares": 18},
        ],
        "weak_posts": [
            {"media_id": "m7", "type": "IMAGE", "caption": "Storefront photo", "reach": 640,
             "likes": 21, "comments": 1, "saves": 2, "shares": 0},
        ],
        "best_times": ["Tue 8am", "Thu 6pm", "Sat 10am"],
        "audience_notes": ["62% local (5km)", "peak age 25–34", "reels drive 3× the reach of images"],
        "ads_summary": {
            "spend_usd": 214.30, "impressions": 61240, "reach": 38110, "clicks": 1189,
            "ctr_pct": 1.94, "cpc_usd": 0.18, "cpm_usd": 3.50, "leads": 27,
            "best_campaign": "Weekend Brunch — Traffic", "worst_campaign": "Generic Boost — May",
        },
        "recent_media": [
            {"media_id": "m1", "type": "REEL", "permalink": "https://instagram.com/p/demo1"},
            {"media_id": "m2", "type": "IMAGE", "permalink": "https://instagram.com/p/demo2"},
        ],
    }


# ── Ads Marketing API demo data ───────────────────────────────────────────────
# Shapes match the live Graph responses so the Ads UI renders identically in demo
# and live modes. Clearly demo (act_demo_*), never a real ad account id.

def demo_ad_accounts() -> list[dict]:
    return [
        {"id": "act_demo_1", "name": "Bytes Coffee Ads (demo)", "account_id": "demo_1",
         "account_status": 1, "account_status_label": "ACTIVE", "currency": "USD",
         "timezone_name": "America/Los_Angeles"},
        {"id": "act_demo_2", "name": "Bytes Coffee — Test (demo)", "account_id": "demo_2",
         "account_status": 1, "account_status_label": "ACTIVE", "currency": "USD",
         "timezone_name": "America/New_York"},
    ]


def demo_campaigns(ad_account_id: str = "act_demo_1") -> list[dict]:
    return [
        {"id": "camp_demo_1", "name": "Weekend Brunch — Traffic", "status": "PAUSED",
         "effective_status": "PAUSED", "objective": "OUTCOME_TRAFFIC"},
        {"id": "camp_demo_2", "name": "New Menu Launch — Leads", "status": "ACTIVE",
         "effective_status": "ACTIVE", "objective": "OUTCOME_LEADS"},
        {"id": "camp_demo_3", "name": "Generic Boost — May", "status": "PAUSED",
         "effective_status": "CAMPAIGN_PAUSED", "objective": "OUTCOME_ENGAGEMENT"},
    ]


def demo_ad_insights() -> dict:
    """Account-level demo insights matching the live Graph field names."""
    return {"spend": 214.30, "impressions": 61240.0, "clicks": 1189.0, "ctr": 1.94, "cpc": 0.18}


# ── Brand Brain demo data ─────────────────────────────────────────────────────
# A realistic post history + a canned "analyzed" brand brain for the demo café, so
# the Brand Brain feature is fully explorable with no Meta app and no OpenAI key.
# Shapes match what the live pipeline produces (brand_brain.fetch_recent_content).

def demo_posts() -> list[dict]:
    """Normalized recent posts/media for the demo IG + Page (source='demo')."""
    return [
        {"platform": "instagram", "id": "m1", "type": "REEL",
         "caption": "Latte art in 15 seconds ☕ — can you do this at home?",
         "likes": 640, "comments": 51, "shares": 88, "saves": 220, "engagement": 999,
         "timestamp": "2026-07-18T08:10:00+0000", "permalink": "https://instagram.com/p/demo1"},
        {"platform": "instagram", "id": "m2", "type": "IMAGE",
         "caption": "New oat milk menu is here 🌱 which one are you trying first?",
         "likes": 310, "comments": 22, "shares": 18, "saves": 61, "engagement": 411,
         "timestamp": "2026-07-15T09:30:00+0000", "permalink": "https://instagram.com/p/demo2"},
        {"platform": "instagram", "id": "m3", "type": "REEL",
         "caption": "Behind the bar on a Saturday rush — sound on 🔊",
         "likes": 720, "comments": 63, "shares": 104, "saves": 190, "engagement": 1077,
         "timestamp": "2026-07-12T17:45:00+0000", "permalink": "https://instagram.com/p/demo3"},
        {"platform": "facebook", "id": "p1", "type": "STATUS",
         "caption": "Weekend brunch is back! Book a table for you and the crew.",
         "likes": 88, "comments": 12, "shares": 9, "saves": 0, "engagement": 109,
         "timestamp": "2026-07-11T10:00:00+0000", "permalink": "https://facebook.com/demo/p1"},
        {"platform": "instagram", "id": "m4", "type": "CAROUSEL_ALBUM",
         "caption": "3 signs your beans are stale (and how we keep ours fresh)",
         "likes": 402, "comments": 40, "shares": 55, "saves": 300, "engagement": 797,
         "timestamp": "2026-07-08T12:15:00+0000", "permalink": "https://instagram.com/p/demo4"},
        {"platform": "instagram", "id": "m5", "type": "IMAGE",
         "caption": "Storefront looking cozy this morning.",
         "likes": 21, "comments": 1, "shares": 0, "saves": 2, "engagement": 24,
         "timestamp": "2026-07-05T07:20:00+0000", "permalink": "https://instagram.com/p/demo5"},
        {"platform": "facebook", "id": "p2", "type": "STATUS",
         "caption": "We’re hiring a weekend barista — DM us if that’s you.",
         "likes": 15, "comments": 3, "shares": 1, "saves": 0, "engagement": 19,
         "timestamp": "2026-07-02T14:00:00+0000", "permalink": "https://facebook.com/demo/p2"},
        {"platform": "instagram", "id": "m6", "type": "IMAGE",
         "caption": "Menu update.",
         "likes": 33, "comments": 2, "shares": 1, "saves": 4, "engagement": 40,
         "timestamp": "2026-06-29T11:00:00+0000", "permalink": "https://instagram.com/p/demo6"},
    ]


def demo_brand_brain() -> dict:
    """Canned qualitative brand brain for the demo café (used only when the model
    returns nothing in fake mode). Live mode always uses the real model output."""
    return {
        "brand_tone": "Warm, playful, and craft-obsessed — talks to regulars like friends.",
        "audience": "Local coffee lovers aged 25–34 within ~5km; commuters and weekend brunch-goers.",
        "services": ["Specialty coffee & espresso", "Oat/alt-milk drinks", "Weekend brunch", "Fresh-roasted beans"],
        "best_topics": ["Latte art & barista craft", "Behind-the-bar moments", "New menu drops", "Coffee education"],
        "best_hooks": ["Can you do this at home?", "Sound on 🔊", "3 signs your beans are stale"],
        "weak_topics": ["Plain storefront photos", "Bare 'menu update' posts with no story"],
        "content_pillars": ["Craft & skill", "Behind the scenes", "Menu & seasonal", "Educate & tips", "Community"],
        "cta_style": "Light, question-led CTAs that invite replies and saves ('which are you trying first?').",
        "posting_suggestions": [
            "Lead with Reels — they drive ~3× the reach of static images.",
            "Post craft/behind-the-bar content Tue 8am and Sat mornings.",
            "Turn every menu change into a story or carousel, not a flat photo.",
        ],
    }
