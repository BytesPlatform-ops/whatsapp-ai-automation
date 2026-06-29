"""Mock posting scheduler (dry-run only) — PURE STDLIB.

``schedule_posts`` is the callable a real scheduler (cron / worker) would invoke
later; the cron wiring itself is NOT built here. For each platform it builds a
:class:`PostRequest` whose ``dry_run`` reflects the global ``dry_run_posting()``
flag (True by default), dispatches to the right adapter, and collects each
:class:`PostResult` as a dict. Deterministic and offline — nothing posts live.
"""

from __future__ import annotations

from typing import Any, Dict, List

from content_creator.config import dry_run_posting
from content_creator.integrations.meta_adapter import get_posting_adapter
from content_creator.integrations.posting_base import PostRequest


def schedule_posts(
    tenant_id: str,
    video_ref: str,
    platforms: List[Any],
    scheduled_time: str = "",
    *,
    caption: str = "",
) -> List[Dict[str, Any]]:
    """Dry-run-schedule ``video_ref`` to each platform for ``tenant_id``.

    Returns a list of ``PostResult.to_dict()`` — one per platform. Tenant-scoped
    and deterministic; nothing publishes live while ``dry_run_posting()`` is True
    (the default).
    """
    dry = dry_run_posting()
    results: List[Dict[str, Any]] = []
    for platform in platforms:
        key = getattr(platform, "value", platform)
        req = PostRequest(
            tenant_id=tenant_id,
            platform=str(key),
            video_ref=video_ref,
            caption=caption,
            scheduled_time=scheduled_time,
            dry_run=dry,
        )
        adapter = get_posting_adapter(platform)
        results.append(adapter.publish(req).to_dict())
    return results
