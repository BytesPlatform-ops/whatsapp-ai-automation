"""Product-aware reservation resolver for the reconciliation worker.

Maps an expired/ambiguous reservation to a real product-operation state so the worker
settles/releases/preserves correctly instead of guessing:

  * influencer_video → look up the durable video: READY/MOCK → completed (settle final
    estimate), FAILED → unbilled release, GENERATING/pending → preserve (valid long
    job), missing → abandoned.
  * content_text / influencer_idea / influencer_script settle synchronously in-request,
    so a still-ACTIVE expired hold means the request died mid-flight → abandoned (release).

Never infers success from a frontend result — only from durable product records.
"""

from __future__ import annotations

from .reservations import Reservation


def _video_final_mc(tenant_id: str, video) -> int:
    from .estimate import influencer_video_estimate
    est = influencer_video_estimate(tenant_id, duration_seconds=int(getattr(video, "duration_seconds", 15) or 15),
                                    model=getattr(video, "model", "") or "standard", outputs=1, retry_budget=0,
                                    is_mock=False, authorized_balance=False)
    return int(est["max_reservation_mc"])


def resolve(tenant_id: str, r: Reservation) -> dict:
    op = r.operation_type
    if op == "influencer_video":
        try:
            from content_creator.store import get_video_repository
            found = get_video_repository().get(tenant_id, r.source_object_id)
        except Exception:
            found = None
        if not found:
            return {"state": "abandoned"}
        v = found[1]
        status = getattr(v.status, "value", None) or str(v.status)
        if status in ("ready", "mock"):
            return {"state": "completed", "settle_mc": _video_final_mc(tenant_id, v)}
        if status == "failed":
            return {"state": "failed_unbilled"}
        return {"state": "pending"}   # still generating → preserve the hold
    # synchronous text operations: an expired ACTIVE hold is a crashed request
    return {"state": "abandoned"}
