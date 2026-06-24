"""Platform adapter contract (provider-agnostic).

Mirrors the style of `receptionist/channels/base.py`: an ABC + abstractmethods
with clear docstrings. An *adapter* is the only thing that knows how a specific
provider/surface wants a post formatted, what its limits are, and how (someday)
to publish. Today every concrete adapter is a DRY-RUN placeholder — nothing
posts live.

SAFETY INVARIANT: `publish_post` and `schedule_post` MUST refuse to perform a
real publish while `dry_run` is True (the default). They return a
`DryRunResult` with `would_post=False`. There is no live-posting code path in
this module; concrete adapters subclass `BasePlaceholderAdapter`.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field

from ..schemas import Platform
from .strategy import get_platform_spec


class SupportLevel(str, Enum):
    """How much real integration an adapter has."""

    FULL_API = "full_api"          # full programmatic publish + read
    PARTIAL_API = "partial_api"    # some API surface (e.g. publish but no analytics)
    MANUAL_EXPORT = "manual_export"  # we generate a ready-to-paste export
    CLIPBOARD_ASSIST = "clipboard_assist"  # copy/paste helper
    REMINDER_ONLY = "reminder_only"  # we just remind a human to post
    FUTURE_PLACEHOLDER = "future_placeholder"  # stub; integration not built yet


class PostContent(BaseModel):
    """Normalized content an adapter formats / (eventually) schedules.

    Provider-agnostic: the strategy/content layers build this, adapters consume it.
    """

    platform: str
    content_type: str = "post"
    body: str = ""
    caption: str = ""
    hashtags: list[str] = Field(default_factory=list)
    media_refs: list[str] = Field(default_factory=list)
    cta: str = ""


class DryRunResult(BaseModel):
    """Result of a dry-run format/schedule/publish. Nothing went live."""

    would_post: bool = False  # always False in dry-run
    platform: str
    support_level: str
    formatted_preview: dict[str, Any] = Field(default_factory=dict)
    limit_checks: list[dict[str, Any]] = Field(default_factory=list)
    notes: str = ""


class PlatformAdapter(ABC):
    """Abstract contract for a per-platform adapter.

    Class attributes:
        platform: which `Platform` this adapter serves.
        support_level: how real the integration is.
        dry_run: when True (default) nothing publishes live.
    """

    platform: Platform
    support_level: SupportLevel
    dry_run: bool = True

    # ── capability / account ────────────────────────────────────────────────
    @abstractmethod
    def validate_account(self) -> dict[str, Any]:
        """Check whether an account/credential is wired for this platform."""

    @abstractmethod
    def get_capabilities(self) -> dict[str, Any]:
        """Describe what this adapter can/can't do (publish, analytics, etc.)."""

    # ── formatting / limits ─────────────────────────────────────────────────
    @abstractmethod
    def format_content(self, content: PostContent) -> dict[str, Any]:
        """Shape `content` into this platform's native post structure."""

    @abstractmethod
    def check_limits(self, content: PostContent) -> list[dict[str, Any]]:
        """Run the platform's limit rules; return [{name, passed, detail}]."""

    # ── scheduling / publishing (gated by dry_run) ──────────────────────────
    @abstractmethod
    def schedule_post(self, content: PostContent, when: Optional[str] = None) -> DryRunResult:
        """Schedule a post. MUST NOT publish live while dry_run is True."""

    @abstractmethod
    def publish_post(self, content: PostContent) -> DryRunResult:
        """Publish a post now. MUST NOT publish live while dry_run is True."""

    # ── reads (no live integration yet → empty/placeholder) ─────────────────
    def get_analytics(self, post_ref: Optional[str] = None) -> dict[str, Any]:
        """Fetch analytics for a post. Placeholder until real API is wired."""
        return {"platform": self.platform.value, "supported": False, "data": {}}

    def get_comments(self, post_ref: Optional[str] = None) -> list[dict[str, Any]]:
        """Fetch comments. Placeholder until real API is wired."""
        return []

    def reply_to_comment(self, comment_ref: str, body: str) -> dict[str, Any]:
        """Reply to a comment. Refused while dry_run / not integrated."""
        return {
            "platform": self.platform.value,
            "performed": False,
            "note": "Comment replies are not enabled (dry-run / no live integration).",
        }

    # ── dry-run + manual export (concrete) ──────────────────────────────────
    @abstractmethod
    def dry_run_post(self, content: PostContent) -> DryRunResult:
        """Format + limit-check without posting. The safe, always-available path."""

    @abstractmethod
    def export_manual_post(self, content: PostContent) -> dict[str, Any]:
        """Produce a copy/paste-ready bundle for a human to post manually."""


class BasePlaceholderAdapter(PlatformAdapter):
    """Deterministic dry-run adapter. Concrete placeholders just set attrs.

    Formatting is driven by the platform's `PlatformSpec`; limit checks compare
    the content against `spec.limits`. Nothing here calls any model or network.
    """

    platform: Platform
    support_level: SupportLevel = SupportLevel.FUTURE_PLACEHOLDER
    dry_run: bool = True

    # ── account / capabilities ──────────────────────────────────────────────
    def validate_account(self) -> dict[str, Any]:
        return {
            "platform": self.platform.value,
            "connected": False,
            "support_level": self.support_level.value,
            "note": "Placeholder adapter — no live account connection.",
        }

    def get_capabilities(self) -> dict[str, Any]:
        live = self.support_level in (SupportLevel.FULL_API, SupportLevel.PARTIAL_API)
        return {
            "platform": self.platform.value,
            "support_level": self.support_level.value,
            "can_publish_live": False,  # always False in this module
            "can_format": True,
            "can_check_limits": True,
            "can_manual_export": True,
            "can_read_analytics": live,
            "can_read_comments": live,
            "dry_run": self.dry_run,
        }

    # ── formatting ──────────────────────────────────────────────────────────
    def format_content(self, content: PostContent) -> dict[str, Any]:
        spec = get_platform_spec(self.platform)
        text = content.caption or content.body
        hashtags = list(content.hashtags)
        return {
            "platform": self.platform.value,
            "content_type": content.content_type,
            "text": text,
            "hashtags": hashtags,
            "hashtag_string": " ".join(f"#{h.lstrip('#')}" for h in hashtags),
            "media_refs": list(content.media_refs),
            "cta": content.cta or spec.cta_style,
            "recommended_formats": spec.formats,
            "media_needs": spec.media_needs,
        }

    # ── limit checks ────────────────────────────────────────────────────────
    def _text_length(self, content: PostContent) -> int:
        return len(content.caption or content.body or "")

    def check_limits(self, content: PostContent) -> list[dict[str, Any]]:
        spec = get_platform_spec(self.platform)
        limits = spec.limits
        checks: list[dict[str, Any]] = []

        # caption / body length (use whichever limit the spec defines)
        text_len = self._text_length(content)
        cap = limits.get("caption_chars")
        if cap is None:
            cap = limits.get("body_chars")
        if cap is not None:
            checks.append({
                "name": "caption_length",
                "passed": text_len <= cap,
                "detail": f"{text_len}/{cap} chars",
            })

        # subject line (email)
        if "subject_chars" in limits:
            subj = content.body if content.content_type == "subject" else ""
            # Subject is conventionally carried in `cta`-free header; we check body
            # length only when content_type signals a subject, else informational.
            subj_len = len(subj)
            checks.append({
                "name": "subject_length",
                "passed": subj_len <= limits["subject_chars"],
                "detail": f"{subj_len}/{limits['subject_chars']} chars",
            })

        # title (reddit / youtube / pinterest)
        if "title_chars" in limits:
            title = content.body if content.content_type == "title" else (content.caption or "")
            checks.append({
                "name": "title_length",
                "passed": len(title) <= limits["title_chars"],
                "detail": f"{len(title)}/{limits['title_chars']} chars",
            })

        # hashtag count
        if "hashtags" in limits:
            n = len(content.hashtags)
            checks.append({
                "name": "hashtag_count",
                "passed": n <= limits["hashtags"],
                "detail": f"{n}/{limits['hashtags']} hashtags",
            })

        # media count
        if "media_count" in limits:
            n = len(content.media_refs)
            checks.append({
                "name": "media_count",
                "passed": n <= limits["media_count"],
                "detail": f"{n}/{limits['media_count']} media items",
            })

        return checks

    # ── dry-run core ────────────────────────────────────────────────────────
    def dry_run_post(self, content: PostContent) -> DryRunResult:
        preview = self.format_content(content)
        checks = self.check_limits(content)
        failed = [c for c in checks if not c["passed"]]
        if failed:
            notes = "Dry run: limit checks FAILED — " + "; ".join(
                f"{c['name']} ({c['detail']})" for c in failed
            )
        else:
            notes = "Dry run only — nothing was posted. All limit checks passed."
        return DryRunResult(
            would_post=False,
            platform=self.platform.value,
            support_level=self.support_level.value,
            formatted_preview=preview,
            limit_checks=checks,
            notes=notes,
        )

    # ── scheduling / publishing — both refuse to go live ────────────────────
    def schedule_post(self, content: PostContent, when: Optional[str] = None) -> DryRunResult:
        result = self.dry_run_post(content)
        when_txt = f" for {when}" if when else ""
        result.notes = (
            f"DRY-RUN: schedule_post is gated{when_txt}; nothing was scheduled live. "
            + result.notes
        )
        return result

    def publish_post(self, content: PostContent) -> DryRunResult:
        result = self.dry_run_post(content)
        result.notes = (
            "DRY-RUN: publish_post is gated; nothing was posted live. " + result.notes
        )
        return result

    # ── manual export ───────────────────────────────────────────────────────
    def export_manual_post(self, content: PostContent) -> dict[str, Any]:
        formatted = self.format_content(content)
        body = formatted["text"]
        if formatted["hashtag_string"]:
            body = f"{body}\n\n{formatted['hashtag_string']}".strip()
        return {
            "platform": self.platform.value,
            "support_level": self.support_level.value,
            "copy_paste_text": body,
            "media_refs": formatted["media_refs"],
            "cta": formatted["cta"],
            "instructions": (
                f"Copy the text above and post manually on {self.platform.value}. "
                f"Attach media: {formatted['media_needs']}"
            ),
        }
