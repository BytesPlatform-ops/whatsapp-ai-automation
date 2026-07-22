"""Platform + account capability matrix.

Two layers:
* ``platform_capabilities(platform)`` — what the platform's publishing API can do
  in principle (formats, limits, scheduling), independent of any account.
* ``account_capabilities(platform, granted_scopes)`` — what a CONNECTED account is
  actually AUTHORIZED to do, derived from GRANTED scopes (not requested scopes).
  The frontend only offers actions where ``publishing_authorized`` is true.

Never exposes tokens. Placeholder platforms (LinkedIn/TikTok/X/YouTube) advertise
no live capability — the adapters are interface stubs only.
"""

from __future__ import annotations

from typing import Dict, List

from .enums import LIVE_CAPABLE_PLATFORMS, Platform

# Scopes required to publish, per platform (Meta granted-scope names).
PUBLISH_SCOPES: Dict[Platform, List[str]] = {
    Platform.FACEBOOK: ["pages_manage_posts"],
    Platform.INSTAGRAM: ["instagram_content_publish", "pages_show_list"],
}

_MATRIX: Dict[Platform, dict] = {
    Platform.FACEBOOK: {
        "text": True, "link": True, "image": True, "video": True, "carousel": True,
        "reel": False, "story": False, "scheduling": True,
        "max_media": 10, "caption_limit": 63206,
        "aspect_ratios": ["1:1", "4:5", "16:9", "9:16"],
        "formats": ["jpg", "jpeg", "png", "gif", "mp4", "mov"],
    },
    Platform.INSTAGRAM: {
        "text": False, "link": False, "image": True, "video": True, "carousel": True,
        "reel": True, "story": False, "scheduling": True,
        "max_media": 10, "caption_limit": 2200,
        "aspect_ratios": ["1:1", "4:5", "1.91:1", "9:16"],
        "formats": ["jpg", "jpeg", "png", "mp4", "mov"],
    },
}


def _empty() -> dict:
    return {
        "text": False, "link": False, "image": False, "video": False, "carousel": False,
        "reel": False, "story": False, "scheduling": False,
        "max_media": 0, "caption_limit": 0, "aspect_ratios": [], "formats": [],
    }


def platform_capabilities(platform: Platform) -> dict:
    return dict(_MATRIX.get(platform, _empty()))


def account_capabilities(platform: Platform, granted_scopes: List[str]) -> dict:
    """Capabilities an authorized CONNECTED account exposes, gated by granted scopes."""
    granted = set(granted_scopes or [])
    required = PUBLISH_SCOPES.get(platform, [])
    missing = [s for s in required if s not in granted]
    live_capable = platform in LIVE_CAPABLE_PLATFORMS
    authorized = live_capable and not missing
    caps = platform_capabilities(platform)
    return {
        "platform": platform.value,
        "live_capable": live_capable,
        "publishing_authorized": authorized,
        "missing_scopes": missing,
        "reconnection_required": bool(required) and bool(missing),
        "formats_supported": {k: v for k, v in caps.items() if k in ("text", "link", "image", "video", "carousel", "reel", "story")},
        "limits": {k: caps[k] for k in ("max_media", "caption_limit", "aspect_ratios", "formats")},
        "scheduling": caps["scheduling"],
    }
