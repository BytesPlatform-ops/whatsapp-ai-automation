"""Durable rank-checking service.

``run_rank_check`` is the main entry point.  It:
  1. Enforces the plan limit for tracked keywords (``enforce_seo_limit``).
  2. Creates a ``RankJob`` row (QUEUED → RUNNING → COMPLETED/FAILED).
  3. For each keyword: resolves the existing ``Keyword`` row to get the keyword
     text + target domain/url, calls the provider, then writes a ``RankSnapshot``.
     Snapshots are keyed by ``(keyword_id, date)`` — a second run on the same
     calendar day UPDATES the existing snapshot rather than inserting a duplicate
     (idempotent).
  4. After writing the snapshot it also updates ``previous_position`` on the
     snapshot from the most-recent prior snapshot for that keyword.
  5. Updates ``Keyword.current_rank / previous_rank / best_rank / ranking_url``.
  6. Per-keyword errors are caught and recorded; one bad keyword never aborts
     the whole batch.
  7. Calls ``record_rank_check`` once per job (operation_id stable on job_id so
     replayed jobs do NOT double-charge).
  8. Returns a summary dict.

The ``today`` parameter (YYYY-MM-DD string) is injectable for deterministic
tests — callers should NEVER pass it in production (defaults to server date).
"""

from __future__ import annotations

import logging
from datetime import date as _date
from typing import Any, Dict, List, Optional

from seo.jobs.provider import RankProvider, get_rank_provider
from seo.metering_search import (
    LIMIT_TRACKED_KEYWORDS,
    enforce_seo_limit,
    record_rank_check,
)
from seo.search_stores import (
    RankJob,
    RankSnapshot,
    SyncJobStatus,
    _now,
    get_keyword_repository,
    get_rank_job_repository,
    get_rank_snapshot_repository,
)

_log = logging.getLogger("pixie.seo.rank.service")


def _today_str() -> str:
    return _date.today().isoformat()


def _is_mock(provider: RankProvider) -> bool:
    return getattr(provider, "name", "mock") == "mock"


def _previous_snapshot(
    tenant_id: str,
    keyword_id: str,
    current_snap_id: Optional[str],
    current_date: str,
) -> Optional[int]:
    """Return the position from the most-recent snapshot BEFORE today for this keyword."""
    snap_repo = get_rank_snapshot_repository()
    history = snap_repo.history(tenant_id, keyword_id)
    # history is sorted ascending by (date, created_at)
    best: Optional[int] = None
    for snap_id, snap in history:
        if snap_id == current_snap_id:
            continue
        if snap.date and snap.date < current_date:
            best = snap.position
    return best


def run_rank_check(
    tenant_id: str,
    project_id: str,
    keyword_ids: List[str],
    *,
    location: str = "us",
    device: str = "desktop",
    provider: Optional[RankProvider] = None,
    today: Optional[str] = None,
) -> Dict[str, Any]:
    """Run a durable rank check for ``keyword_ids`` under ``project_id``.

    Parameters
    ----------
    tenant_id:    Owning tenant (all rows scoped to this).
    project_id:   The keyword project these keywords belong to.
    keyword_ids:  List of ``Keyword`` row IDs to check.
    location:     SERP location hint passed to the provider (default "us").
    device:       Device type hint passed to the provider (default "desktop").
    provider:     Override the rank provider (for tests).
    today:        Override the check date (YYYY-MM-DD) — inject in tests only.

    Returns
    -------
    A summary dict with keys: job_id, checked, error_count, snapshots, errors,
    provider, is_mock, metering.
    """
    provider = provider or get_rank_provider()
    check_date = today or _today_str()
    mock = _is_mock(provider)

    # ── Plan limit gate ──────────────────────────────────────────────────────
    enforce_seo_limit(tenant_id, LIMIT_TRACKED_KEYWORDS, len(keyword_ids))

    kw_repo = get_keyword_repository()
    job_repo = get_rank_job_repository()
    snap_repo = get_rank_snapshot_repository()

    # ── Create RankJob (QUEUED) ──────────────────────────────────────────────
    job = RankJob(
        tenant_id=tenant_id,
        project_id=project_id,
        status=SyncJobStatus.QUEUED,
        frequency="manual",
        keyword_ids=list(keyword_ids),
        queued_at=_now(),
    )
    job_id, job = job_repo.create(job)

    # Transition to RUNNING
    job_repo.update(tenant_id, job_id, status=SyncJobStatus.RUNNING, started_at=_now())

    snapshots: List[Dict[str, Any]] = []
    errors: List[Dict[str, Any]] = []
    checked = 0
    error_count = 0

    for kw_id in keyword_ids:
        try:
            # Resolve keyword row
            kw_row = kw_repo.get(tenant_id, kw_id)
            if not kw_row:
                raise ValueError("keyword not found: %s" % kw_id)
            _, kw = kw_row

            if not kw.keyword:
                raise ValueError("keyword text is empty for: %s" % kw_id)

            # Determine target url: prefer target_page, fall back to project domain
            # or ranking_url from prior check; providers always receive a url.
            target_url = kw.target_page or kw.ranking_url or ""
            if not target_url:
                # Use the project's default_domain from project row if available;
                # fall back to a safe placeholder so the provider can still run.
                from seo.search_stores import get_keyword_project_repository
                proj_row = get_keyword_project_repository().get(tenant_id, project_id)
                if proj_row:
                    _, proj = proj_row
                    target_url = proj.default_domain or ""
            if not target_url:
                raise ValueError("no target url for keyword: %s (%s)" % (kw_id, kw.keyword))

            # Provider lookup
            result = provider.lookup(
                kw.keyword,
                target_url,
                location=location,
                device=device,
            )

            # SERP features from provider (never fabricated when absent)
            serp_features: List[str] = getattr(result, "serp_features", []) or []
            featured_snippet: bool = getattr(result, "featured_snippet", False) or False
            local_pack: bool = getattr(result, "local_pack", False) or False
            ranking_url: str = getattr(result, "ranking_url", "") or target_url
            data_freshness: str = getattr(result, "data_freshness", "") or check_date

            # ── Idempotency: find existing snapshot for (keyword_id, date) ──
            existing_snaps = snap_repo.list_where(
                tenant_id, keyword_id=kw_id, date=check_date
            )
            existing_snap_id: Optional[str] = None
            if existing_snaps:
                existing_snap_id, _ = existing_snaps[0]

            # Look up previous position from history (before today)
            previous_position = _previous_snapshot(
                tenant_id, kw_id, existing_snap_id, check_date
            )

            if existing_snap_id:
                # UPDATE the existing snapshot (same-day idempotency)
                snap_repo.update(
                    tenant_id,
                    existing_snap_id,
                    position=result.position,
                    previous_position=previous_position,
                    ranking_url=ranking_url,
                    serp_features=serp_features,
                    featured_snippet=featured_snippet,
                    local_pack=local_pack,
                    provider=result.provider,
                    data_freshness=data_freshness,
                    rank_job_id=job_id,
                    error="",
                )
                snap_id = existing_snap_id
                snap_dict = {
                    "snapshot_id": snap_id,
                    "keyword_id": kw_id,
                    "keyword": kw.keyword,
                    "date": check_date,
                    "position": result.position,
                    "previous_position": previous_position,
                    "ranking_url": ranking_url,
                    "serp_features": serp_features,
                    "featured_snippet": featured_snippet,
                    "local_pack": local_pack,
                    "provider": result.provider,
                    "idempotent_update": True,
                }
            else:
                # CREATE new snapshot
                snap = RankSnapshot(
                    tenant_id=tenant_id,
                    project_id=project_id,
                    keyword_id=kw_id,
                    keyword=kw.keyword,
                    date=check_date,
                    position=result.position,
                    previous_position=previous_position,
                    ranking_url=ranking_url,
                    serp_features=serp_features,
                    featured_snippet=featured_snippet,
                    local_pack=local_pack,
                    provider=result.provider,
                    data_freshness=data_freshness,
                    rank_job_id=job_id,
                )
                snap_id, snap = snap_repo.create(snap)
                snap_dict = {
                    "snapshot_id": snap_id,
                    "keyword_id": kw_id,
                    "keyword": kw.keyword,
                    "date": check_date,
                    "position": result.position,
                    "previous_position": previous_position,
                    "ranking_url": ranking_url,
                    "serp_features": serp_features,
                    "featured_snippet": featured_snippet,
                    "local_pack": local_pack,
                    "provider": result.provider,
                    "idempotent_update": False,
                }

            # ── Update Keyword row ────────────────────────────────────────────
            prev_rank = kw.current_rank  # what was current becomes previous
            new_current = result.position
            # best_rank: lowest (best) non-None position ever seen
            best = kw.best_rank
            if new_current is not None:
                if best is None or new_current < best:
                    best = new_current
            kw_repo.update(
                tenant_id,
                kw_id,
                current_rank=new_current,
                previous_rank=prev_rank,
                best_rank=best,
                ranking_url=ranking_url if new_current is not None else kw.ranking_url,
            )

            snapshots.append(snap_dict)
            checked += 1

        except Exception as exc:  # noqa: BLE001 — per-keyword isolation by design
            error_count += 1
            errors.append({"keyword_id": kw_id, "error": str(exc)})
            _log.warning("rank_check: keyword=%s error: %s", kw_id, exc)
            # Write an error snapshot so history is complete
            try:
                err_snap_existing = snap_repo.list_where(
                    tenant_id, keyword_id=kw_id, date=check_date
                )
                if err_snap_existing:
                    err_snap_id, _ = err_snap_existing[0]
                    snap_repo.update(
                        tenant_id, err_snap_id,
                        error=str(exc), rank_job_id=job_id,
                    )
                else:
                    err_snap = RankSnapshot(
                        tenant_id=tenant_id,
                        project_id=project_id,
                        keyword_id=kw_id,
                        date=check_date,
                        error=str(exc),
                        rank_job_id=job_id,
                    )
                    snap_repo.create(err_snap)
            except Exception:
                pass  # error snapshot write failure is non-fatal

    # ── Finalise job ─────────────────────────────────────────────────────────
    final_status = (
        SyncJobStatus.COMPLETED if error_count == 0 or checked > 0
        else SyncJobStatus.FAILED
    )
    job_repo.update(
        tenant_id,
        job_id,
        status=final_status,
        checked_count=checked,
        error_count=error_count,
        finished_at=_now(),
    )

    # ── Metering (once per job; operation_id keyed on job_id = idempotent) ──
    metering = record_rank_check(
        tenant_id,
        keyword_count=len(keyword_ids),
        job_id=job_id,
        is_mock=mock,
    )

    return {
        "job_id": job_id,
        "checked": checked,
        "error_count": error_count,
        "snapshots": snapshots,
        "errors": errors,
        "provider": getattr(provider, "name", "unknown"),
        "is_mock": mock,
        "metering": metering,
    }
