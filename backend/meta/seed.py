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
