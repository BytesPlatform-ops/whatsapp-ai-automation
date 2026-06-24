"""Concrete placeholder adapters — one per platform, all dry-run by default.

Every adapter subclasses `BasePlaceholderAdapter`, so the deterministic
format/limit/dry-run behavior lives in one place and each class is tiny: it just
declares its `platform` and `support_level`. NONE of these post live.

`ADAPTERS` maps every `Platform` to an adapter instance, and `get_adapter`
returns the right one (falling back to the always-safe ManualExportAdapter).
"""

from __future__ import annotations

from ..schemas import Platform
from .base import BasePlaceholderAdapter, PlatformAdapter, SupportLevel


# ── one class per platform / provider family ─────────────────────────────────
class MetaAdapter(BasePlaceholderAdapter):
    """Meta Graph API family — covers Instagram and Facebook.

    Instantiated per-platform (see ADAPTERS); `platform` is set on the instance
    so the same class serves both surfaces.
    """

    platform: Platform = Platform.INSTAGRAM
    support_level: SupportLevel = SupportLevel.FUTURE_PLACEHOLDER


class TikTokAdapter(BasePlaceholderAdapter):
    platform: Platform = Platform.TIKTOK
    support_level: SupportLevel = SupportLevel.FUTURE_PLACEHOLDER


class YouTubeAdapter(BasePlaceholderAdapter):
    platform: Platform = Platform.YOUTUBE_SHORTS
    support_level: SupportLevel = SupportLevel.FUTURE_PLACEHOLDER


class LinkedInAdapter(BasePlaceholderAdapter):
    platform: Platform = Platform.LINKEDIN
    support_level: SupportLevel = SupportLevel.FUTURE_PLACEHOLDER


class XAdapter(BasePlaceholderAdapter):
    platform: Platform = Platform.X
    support_level: SupportLevel = SupportLevel.FUTURE_PLACEHOLDER


class ThreadsAdapter(BasePlaceholderAdapter):
    platform: Platform = Platform.THREADS
    support_level: SupportLevel = SupportLevel.FUTURE_PLACEHOLDER


class PinterestAdapter(BasePlaceholderAdapter):
    platform: Platform = Platform.PINTEREST
    support_level: SupportLevel = SupportLevel.FUTURE_PLACEHOLDER


class RedditAdapter(BasePlaceholderAdapter):
    platform: Platform = Platform.REDDIT
    support_level: SupportLevel = SupportLevel.FUTURE_PLACEHOLDER


class SnapchatAdapter(BasePlaceholderAdapter):
    platform: Platform = Platform.SNAPCHAT
    support_level: SupportLevel = SupportLevel.FUTURE_PLACEHOLDER


class GoogleBusinessProfileAdapter(BasePlaceholderAdapter):
    platform: Platform = Platform.GOOGLE_BUSINESS
    support_level: SupportLevel = SupportLevel.FUTURE_PLACEHOLDER


class WhatsAppAdapter(BasePlaceholderAdapter):
    # Outbound messaging exists elsewhere in the repo, but here it's reminder-only.
    platform: Platform = Platform.WHATSAPP
    support_level: SupportLevel = SupportLevel.REMINDER_ONLY


class EmailAdapter(BasePlaceholderAdapter):
    platform: Platform = Platform.EMAIL
    support_level: SupportLevel = SupportLevel.MANUAL_EXPORT


class SMSAdapter(BasePlaceholderAdapter):
    platform: Platform = Platform.SMS
    support_level: SupportLevel = SupportLevel.REMINDER_ONLY


class TelegramAdapter(BasePlaceholderAdapter):
    platform: Platform = Platform.TELEGRAM
    support_level: SupportLevel = SupportLevel.FUTURE_PLACEHOLDER


class DiscordAdapter(BasePlaceholderAdapter):
    platform: Platform = Platform.DISCORD
    support_level: SupportLevel = SupportLevel.FUTURE_PLACEHOLDER


class NextdoorAdapter(BasePlaceholderAdapter):
    platform: Platform = Platform.NEXTDOOR
    support_level: SupportLevel = SupportLevel.REMINDER_ONLY


class ManualExportAdapter(BasePlaceholderAdapter):
    """Universal safe fallback: always produces a copy/paste export.

    Its `platform` is set per-instance to whatever it's standing in for.
    """

    platform: Platform = Platform.EMAIL  # overridden per instance
    support_level: SupportLevel = SupportLevel.MANUAL_EXPORT


def _build_adapter(cls: type[BasePlaceholderAdapter], platform: Platform) -> PlatformAdapter:
    """Instantiate `cls` bound to a specific platform.

    Class attrs are shared, so we set `platform` on the instance to avoid one
    class's value leaking across platforms (e.g. MetaAdapter for IG vs FB).
    """
    adapter = cls()
    adapter.platform = platform
    return adapter


# ── registry: every Platform → a concrete adapter ────────────────────────────
ADAPTERS: dict[Platform, PlatformAdapter] = {
    Platform.INSTAGRAM: _build_adapter(MetaAdapter, Platform.INSTAGRAM),
    Platform.FACEBOOK: _build_adapter(MetaAdapter, Platform.FACEBOOK),
    Platform.TIKTOK: _build_adapter(TikTokAdapter, Platform.TIKTOK),
    Platform.YOUTUBE_SHORTS: _build_adapter(YouTubeAdapter, Platform.YOUTUBE_SHORTS),
    Platform.LINKEDIN: _build_adapter(LinkedInAdapter, Platform.LINKEDIN),
    Platform.X: _build_adapter(XAdapter, Platform.X),
    Platform.THREADS: _build_adapter(ThreadsAdapter, Platform.THREADS),
    Platform.WHATSAPP: _build_adapter(WhatsAppAdapter, Platform.WHATSAPP),
    Platform.EMAIL: _build_adapter(EmailAdapter, Platform.EMAIL),
    Platform.SMS: _build_adapter(SMSAdapter, Platform.SMS),
    Platform.GOOGLE_BUSINESS: _build_adapter(
        GoogleBusinessProfileAdapter, Platform.GOOGLE_BUSINESS
    ),
    Platform.REDDIT: _build_adapter(RedditAdapter, Platform.REDDIT),
    Platform.PINTEREST: _build_adapter(PinterestAdapter, Platform.PINTEREST),
    Platform.SNAPCHAT: _build_adapter(SnapchatAdapter, Platform.SNAPCHAT),
    Platform.TELEGRAM: _build_adapter(TelegramAdapter, Platform.TELEGRAM),
    Platform.DISCORD: _build_adapter(DiscordAdapter, Platform.DISCORD),
    Platform.NEXTDOOR: _build_adapter(NextdoorAdapter, Platform.NEXTDOOR),
}


def get_adapter(platform: "Platform | str") -> PlatformAdapter:
    """Return the adapter for a platform.

    Accepts a `Platform` or a string (value or name). Falls back to a
    ManualExport adapter bound to the requested platform (or EMAIL) so a caller
    always gets a usable, safe adapter and never a crash.
    """
    member: Platform | None
    if isinstance(platform, Platform):
        member = platform
    elif isinstance(platform, str):
        try:
            member = Platform(platform.lower())
        except ValueError:
            try:
                member = Platform[platform.upper()]
            except KeyError:
                member = None
    else:
        member = None

    if member is not None and member in ADAPTERS:
        return ADAPTERS[member]

    # Safe fallback: a manual-export adapter bound to the best-known platform.
    fallback_platform = member if member is not None else Platform.EMAIL
    return _build_adapter(ManualExportAdapter, fallback_platform)
