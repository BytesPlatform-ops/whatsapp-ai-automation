"""Publishing service — create/validate/schedule publish jobs.

Enforces: destination resolved server-side (no client tampering), AI Influencer
Gate 4 approval, timezone-aware scheduling, live-mode confirmation + authorization
(never a silent dry-run↔live switch), platform content validation, and
idempotency (one job per fingerprint).
"""

from __future__ import annotations

from typing import Callable, Optional, Tuple

from . import config, connections, fingerprint, scheduling
from .capabilities import account_capabilities
from .enums import ContentFormat, Platform, PublishMode, PublishStatus, SourceProduct
from .schemas import CreatePublishJobBody, PublishJob, PublishSnapshot
from .scheduling import now_utc_iso
from .store import get_job_repository


class PublishError(Exception):
    def __init__(self, category: str, message: str, http_status: int = 400, extra: Optional[dict] = None) -> None:
        super().__init__(message)
        self.category = category
        self.message = message
        self.http_status = http_status
        self.extra = extra or {}

    def to_detail(self) -> dict:
        return {"error": self.category, "message": self.message, **self.extra}


def _default_gate_check(tenant_id: str, video_id: str) -> bool:
    """Gate 4 (publish approval) for an AI Influencer video — latest-record-wins."""
    try:
        from content_creator.enums import ApprovalGate, ApprovalStatus
        from content_creator.store import get_approval_repository
        recs = [r for r in get_approval_repository().list(tenant_id, ApprovalGate.PUBLISH)
                if getattr(r, "target_ref", "") == video_id]
        return bool(recs) and recs[-1].status == ApprovalStatus.APPROVED
    except Exception:
        return False


def _validate_content(platform: Platform, snapshot: PublishSnapshot) -> None:
    caps = account_capabilities(platform, []).get("limits", {})
    fmt = snapshot.content_format
    from .capabilities import platform_capabilities
    pcaps = platform_capabilities(platform)

    if platform is Platform.INSTAGRAM:
        if fmt in (ContentFormat.TEXT, ContentFormat.LINK):
            raise PublishError("unsupported_format", "Instagram requires media — text-only posts aren't supported.", 422)
        if not snapshot.media_asset_ids:
            raise PublishError("media_required", "This Instagram post needs at least one media asset.", 422)
    if fmt in (ContentFormat.IMAGE, ContentFormat.VIDEO, ContentFormat.CAROUSEL, ContentFormat.REEL) and not snapshot.media_asset_ids:
        raise PublishError("media_required", f"A {fmt.value} post needs at least one media asset.", 422)
    limit = pcaps.get("caption_limit", 0)
    if limit and len(snapshot.text or "") > limit:
        raise PublishError("caption_too_long", f"Caption exceeds the {limit}-character limit for {platform.value}.", 422)
    if fmt is ContentFormat.CAROUSEL and len(snapshot.media_asset_ids) > pcaps.get("max_media", 10):
        raise PublishError("too_many_media", f"Carousel exceeds {pcaps.get('max_media', 10)} items.", 422)


def create_job(
    body: CreatePublishJobBody,
    *,
    account_resolver: Optional[Callable[[str, str], Optional[dict]]] = None,
    gate_checker: Optional[Callable[[str, str], bool]] = None,
) -> Tuple[str, PublishJob]:
    resolve_account = account_resolver or connections.get_account
    gate_check = gate_checker or _default_gate_check

    account = resolve_account(body.tenant_id, body.connection_id)
    if not account:
        raise PublishError("connection_not_found", "That social account isn't connected to this workspace.", 404)

    # Destination is taken from the SERVER-resolved account, never the client body,
    # so a tampered platform/account_id cannot redirect the post.
    platform = Platform(account["platform"])
    account_id = account["account_id"]

    # Gate 4 for AI Influencer.
    if body.source_product is SourceProduct.AI_INFLUENCER:
        if not body.influencer_video_id:
            raise PublishError("missing_source", "An approved influencer video is required.", 422)
        if not gate_check(body.tenant_id, body.influencer_video_id):
            raise PublishError("gate_blocked", "Publish approval (Gate 4) is required before publishing.", 409,
                               {"gate": "publish"})

    snapshot = PublishSnapshot(
        source_product=body.source_product,
        document_id=body.document_id,
        version_id=body.version_id,
        influencer_video_id=body.influencer_video_id,
        influencer_post_id=body.influencer_post_id,
        content_format=body.content_format,
        text=body.text,
        link=body.link,
        media_asset_ids=list(body.media_asset_ids or []),
        first_comment=body.first_comment,
    )
    _validate_content(platform, snapshot)

    # Schedule (or publish now).
    tz = body.timezone or config.default_timezone()
    if body.scheduled_local:
        resolved = scheduling.resolve(body.scheduled_local, tz)  # raises ScheduleError → mapped by router
        scheduled_utc = resolved.utc_iso
        if scheduling.is_past(scheduled_utc):
            raise PublishError("schedule_in_past", "Scheduled time is in the past.", 422)
        local_time, timezone_name = resolved.local_iso, resolved.timezone
        status = PublishStatus.SCHEDULED
    else:
        scheduled_utc = now_utc_iso()
        local_time, timezone_name = scheduled_utc, "UTC"
        status = PublishStatus.QUEUED

    # Mode: live requires explicit confirmation + global enablement + authorization.
    # There is NEVER a silent fallback between dry_run and live.
    mode = body.mode
    if mode is PublishMode.LIVE:
        if not body.confirm:
            raise PublishError("confirmation_required", "Live publishing requires explicit confirmation.", 400)
        if not config.live_allowed():
            raise PublishError("live_disabled",
                               "Live publishing is disabled (SOCIAL_PUBLISH_MODE/META_PUBLISH_ENABLED). "
                               "Use dry-run, or enable live in backend config.", 409)
        caps = account_capabilities(platform, account.get("scopes", []))
        if not caps["publishing_authorized"]:
            raise PublishError("missing_permission",
                               "This account is not authorized to publish. Reconnect and grant publishing permission.",
                               403, {"missing_scopes": caps["missing_scopes"]})

    fp = fingerprint.compute(body.tenant_id, body.connection_id, platform.value, account_id,
                             snapshot.model_dump(), scheduled_utc, mode.value,
                             idempotency_key=body.idempotency_key)

    # Idempotency: one job per fingerprint (double-click / proxy retry → same job).
    existing = get_job_repository().find_by_fingerprint(body.tenant_id, fp)
    if existing:
        return existing

    job = PublishJob(
        tenant_id=body.tenant_id,
        source_product=body.source_product,
        connection_id=body.connection_id,
        platform=platform,
        account_id=account_id,
        mode=mode,
        status=status,
        snapshot=snapshot,
        scheduled_utc=scheduled_utc,
        local_time=local_time,
        timezone=timezone_name,
        max_attempts=config.max_retries(),
        fingerprint=fp,
        idempotency_key=body.idempotency_key,
        created_by=body.created_by,
    )
    return get_job_repository().create(job)
