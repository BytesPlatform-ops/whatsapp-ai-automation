"""Earned-link/placement tracking and verification for SEO outreach.

Verification:
- Uses seo.url_guard.assert_safe_url (SSRF guard) + an injected fetcher
  (default: seo.httpx_fetch.fetch_full) so tests can pass a fake fetcher
  without any network calls.
- Checks that the won link still exists on the source page:
    - anchor text present in body
    - target URL present in body as an href
    - rel attribute not blocking (nofollow checked + reported)
- When a won link disappears, a SeoAlert is created via seo.search_stores.

Metering: record_link_verification (zero when is_mock=True).
"""

from __future__ import annotations

import logging
import re
from typing import Any, Callable, Dict, List, Optional, Tuple

from seo.metering_search import LIMIT_OUTREACH_VERIFICATIONS, enforce_seo_limit, record_link_verification
from seo.stores import _now, _uid
from seo.url_guard import UrlRejected, assert_safe_url

from .stores import (
    LinkPlacement,
    PlacementOutcome,
    get_campaign_repository,
    get_contact_repository,
    get_link_placement_repository,
)

_log = logging.getLogger("pixie.seo.outreach.link_tracking")

# Default fetcher (injected in tests to avoid network).
_DEFAULT_FETCHER = None   # will be set to fetch_full lazily


def _get_fetcher() -> Callable:
    global _DEFAULT_FETCHER
    if _DEFAULT_FETCHER is None:
        from seo.httpx_fetch import fetch_full
        _DEFAULT_FETCHER = fetch_full
    return _DEFAULT_FETCHER


# ── CRUD ──────────────────────────────────────────────────────────────────────

def add_placement(
    tenant_id: str,
    campaign_id: str,
    contact_id: str,
    *,
    outcome: PlacementOutcome = PlacementOutcome.PENDING,
    target_url: str = "",
    source_url: str = "",
    anchor: str = "",
    rel: str = "",
) -> Tuple[str, LinkPlacement]:
    """Record a new link placement (pending or won)."""
    # Validate URLs if provided.
    for url in (target_url, source_url):
        if url:
            try:
                assert_safe_url(url)
            except UrlRejected as exc:
                raise ValueError(f"unsafe_url: {exc.reason}") from exc

    # Cross-tenant guard: campaign must belong to this tenant.
    camp_result = get_campaign_repository().get(tenant_id, campaign_id)
    if not camp_result:
        raise ValueError(f"campaign_not_found: {campaign_id!r} for tenant {tenant_id!r}")

    lp = LinkPlacement(
        tenant_id=tenant_id,
        campaign_id=campaign_id,
        contact_id=contact_id,
        outcome=outcome,
        target_url=target_url,
        source_url=source_url,
        anchor=anchor,
        rel=rel,
    )
    return get_link_placement_repository().create(lp)


def get_placement(tenant_id: str, placement_id: str) -> Optional[Tuple[str, LinkPlacement]]:
    return get_link_placement_repository().get(tenant_id, placement_id)


def update_placement(
    tenant_id: str,
    placement_id: str,
    **fields,
) -> Optional[Tuple[str, LinkPlacement]]:
    return get_link_placement_repository().update(tenant_id, placement_id, **fields)


def list_placements(tenant_id: str, campaign_id: str) -> List[Tuple[str, LinkPlacement]]:
    return get_link_placement_repository().list_by_campaign(tenant_id, campaign_id)


def list_won_placements(tenant_id: str) -> List[Tuple[str, LinkPlacement]]:
    return get_link_placement_repository().list_won(tenant_id)


# ── Verification ──────────────────────────────────────────────────────────────

def _check_link_in_html(
    html: str,
    *,
    target_url: str,
    anchor: str,
) -> Dict[str, Any]:
    """Parse HTML to check for a link presence.

    Returns:
        {found: bool, anchor_found: bool, url_found: bool, is_nofollow: bool}
    """
    # Normalise for substring matching.
    html_lower = html.lower()
    target_lower = target_url.lower()
    anchor_lower = anchor.lower()

    url_found = target_lower in html_lower if target_lower else False
    anchor_found = anchor_lower in html_lower if anchor_lower else False

    # Check rel=nofollow on any <a> tag referencing the target.
    is_nofollow = False
    if url_found:
        # Find all <a ...href="..."> blocks referencing the target.
        pattern = re.compile(r'<a\s[^>]*href\s*=\s*["\'][^"\']*' + re.escape(target_lower) + r'[^"\']*["\'][^>]*>', re.IGNORECASE)
        for match in pattern.finditer(html):
            tag = match.group(0).lower()
            if "nofollow" in tag:
                is_nofollow = True

    return {
        "found": url_found,
        "anchor_found": anchor_found,
        "url_found": url_found,
        "is_nofollow": is_nofollow,
    }


def _create_link_lost_alert(
    tenant_id: str,
    *,
    placement_id: str,
    source_url: str,
    target_url: str,
    campaign_id: str,
) -> None:
    """Create a SeoAlert when a won link is no longer present."""
    try:
        from seo.schemas import Severity
        from seo.search_stores import AlertStatus, SeoAlert, get_alert_repository

        alert = SeoAlert(
            tenant_id=tenant_id,
            site_id="",
            project_id="",
            alert_type="earned_link_removed",
            severity=Severity.HIGH,
            title="Earned link removed",
            message=(
                f"A previously verified earned link on {source_url} "
                f"pointing to {target_url} is no longer detectable."
            ),
            evidence={
                "placement_id": placement_id,
                "source_url": source_url,
                "target_url": target_url,
                "campaign_id": campaign_id,
            },
            data_source="link_verification",
            affected_item_type="link_placement",
            affected_item_id=placement_id,
            affected_url=source_url,
        )
        get_alert_repository().create(alert)
        _log.info("SeoAlert created for removed link placement %s", placement_id)
    except Exception as exc:
        _log.warning("Failed to create SeoAlert for removed link: %s", exc)


def verify_placement(
    tenant_id: str,
    placement_id: str,
    *,
    fetcher: Optional[Callable] = None,
    is_mock: bool = True,
) -> Dict[str, Any]:
    """Verify that a won/pending link placement still exists.

    Args:
        tenant_id: workspace.
        placement_id: the placement to verify.
        fetcher: injectable HTTP fetcher (default: fetch_full). Must accept (url, timeout) and
                 return {"html": str, "final_url": str, "status": int, "headers": dict}.
        is_mock: when True, metering records zero.

    Returns:
        {status: "present"|"removed"|"skipped"|"error", detail: dict}
    """
    lp_repo = get_link_placement_repository()
    result = lp_repo.get(tenant_id, placement_id)
    if not result:
        return {"status": "error", "detail": {"reason": "placement_not_found"}}

    pid, placement = result

    # Only verify won/pending placements.
    if placement.outcome not in (PlacementOutcome.LINK_WON, PlacementOutcome.PENDING, PlacementOutcome.CITATION, PlacementOutcome.MENTION):
        return {"status": "skipped", "detail": {"reason": f"outcome_not_verifiable: {placement.outcome}"}}

    if not placement.source_url:
        return {"status": "skipped", "detail": {"reason": "no_source_url"}}

    # Validate URL.
    try:
        assert_safe_url(placement.source_url)
    except UrlRejected as exc:
        return {"status": "error", "detail": {"reason": f"unsafe_url: {exc.reason}"}}

    # Plan limit.
    try:
        enforce_seo_limit(tenant_id, LIMIT_OUTREACH_VERIFICATIONS, 1)
    except Exception as exc:
        return {"status": "error", "detail": {"reason": f"plan_limit: {exc}"}}

    # Fetch page.
    do_fetch = fetcher or _get_fetcher()
    try:
        page = do_fetch(placement.source_url, 20.0)
        html_text = page.get("html", "")
        http_status = page.get("status", 0)
    except UrlRejected as exc:
        return {"status": "error", "detail": {"reason": f"url_rejected: {exc.reason}"}}
    except Exception as exc:
        _log.warning("link verification fetch failed for %s: %s", placement.source_url, exc)
        return {"status": "error", "detail": {"reason": f"fetch_failed: {exc}"}}

    if http_status >= 400:
        return {"status": "error", "detail": {"reason": f"http_{http_status}"}}

    # Check link.
    check = _check_link_in_html(html_text, target_url=placement.target_url, anchor=placement.anchor)

    now_ts = _now()

    if check["found"]:
        # Link is present.
        lp_repo.update(
            tenant_id, placement_id,
            last_verified=now_ts,
            last_verified_status="present",
        )
        if not placement.first_verified:
            lp_repo.update(tenant_id, placement_id, first_verified=now_ts)

        # Mark as won if it was pending.
        if placement.outcome == PlacementOutcome.PENDING:
            lp_repo.update(tenant_id, placement_id, outcome=PlacementOutcome.LINK_WON)

        record_link_verification(tenant_id, job_id=placement_id, link_count=1, is_mock=is_mock)
        return {
            "status": "present",
            "detail": {
                "anchor_found": check["anchor_found"],
                "is_nofollow": check["is_nofollow"],
                "verified_at": now_ts,
            },
        }
    else:
        # Link not found.
        lp_repo.update(
            tenant_id, placement_id,
            last_verified=now_ts,
            last_verified_status="removed",
        )

        # Alert only when the placement was previously verified as present.
        if placement.first_verified and placement.outcome == PlacementOutcome.LINK_WON:
            lp_repo.update(tenant_id, placement_id, outcome=PlacementOutcome.REMOVED)
            _create_link_lost_alert(
                tenant_id,
                placement_id=placement_id,
                source_url=placement.source_url,
                target_url=placement.target_url,
                campaign_id=placement.campaign_id,
            )

        record_link_verification(tenant_id, job_id=placement_id, link_count=1, is_mock=is_mock)
        return {
            "status": "removed",
            "detail": {"verified_at": now_ts},
        }
