"""Rank-tracking job function.

A plain function a scheduler COULD call later — this unit deliberately does not
wire a real scheduler nor integrate with any existing one. Tenant-scoped: every
snapshot is stamped with ``tenant_id`` and stored under it, so concurrent
tenants never cross. A single bad target never aborts the run — per-target
failures are caught, recorded as an error entry, and the job continues.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from seo.jobs.models import RankSnapshot
from seo.jobs.provider import RankProvider, get_rank_provider
from seo.jobs.store import RankSnapshotStore, get_rank_store


def run_rank_tracking_job(
    tenant_id: str,
    targets: List[Dict[str, Any]],
    *,
    provider: Optional[RankProvider] = None,
    store: Optional[RankSnapshotStore] = None,
) -> Dict[str, Any]:
    """Look up each target's rank, persist a snapshot, and summarize.

    ``targets`` is a list of dicts: ``{"keyword","url","location"?,"device"?}``.
    Returns a summary with one snapshot per successful target plus an ``errors``
    list for targets that could not be processed. Never raises on normal input.
    """
    provider = provider or get_rank_provider()
    store = store or get_rank_store()

    snapshots: List[Dict[str, Any]] = []
    errors: List[Dict[str, Any]] = []
    total_cost = 0.0
    total_latency = 0
    checked = 0

    for index, target in enumerate(targets or []):
        try:
            if not isinstance(target, dict):
                raise ValueError("target must be a mapping")
            keyword = target.get("keyword")
            url = target.get("url")
            if not keyword or not url:
                raise ValueError("target requires non-empty 'keyword' and 'url'")

            location = target.get("location") or "us"
            device = target.get("device") or "desktop"

            result = provider.lookup(
                keyword,
                url,
                location=location,
                device=device,
            )

            snapshot = RankSnapshot(
                tenant_id=tenant_id,
                keyword=keyword,
                url=url,
                position=result.position,
                provider=result.provider,
            )
            store.add(snapshot)

            snapshots.append(snapshot.to_dict())
            total_cost += float(result.estimated_cost or 0.0)
            total_latency += int(result.latency_ms or 0)
            checked += 1
        except Exception as exc:  # noqa: BLE001 - per-target isolation by design
            errors.append({
                "index": index,
                "target": target if isinstance(target, dict) else str(target),
                "error": str(exc),
            })

    # Provider name for the summary: prefer the one actually emitted on a
    # snapshot, else fall back to the provider's declared name.
    provider_name = getattr(provider, "name", "unknown")

    return {
        "tenant_id": tenant_id,
        "checked": checked,
        "snapshots": snapshots,
        "errors": errors,
        "provider": provider_name,
        "estimated_cost": round(total_cost, 6),
        "latency_ms": total_latency,
    }


def rank_history(
    tenant_id: str,
    keyword: str,
    url: str,
    *,
    store: Optional[RankSnapshotStore] = None,
) -> List[Dict[str, Any]]:
    """Tenant-scoped snapshot history for one (keyword, url), insertion order."""
    store = store or get_rank_store()
    return [snap.to_dict() for snap in store.history(tenant_id, keyword, url)]
