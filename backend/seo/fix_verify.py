"""Fix Verification — durable before/after + recrawl-based verification.

Records an intended fix for an SEO issue (before/after values), then verifies
the outcome by re-fetching the live page and comparing the observed value
against the intended value.

Key design:
  - Verification is based ONLY on the re-fetched observed value, never on
    whether an API call reported success.
  - A ``fetcher`` callable is accepted in ``verify_fix`` so tests can inject
    a fake HTML response with NO network I/O.
  - Persisted via the shared ``seo.search_stores.FixVerificationRepository``
    (table: seo_fix_verification, id prefix: fixver_).
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Callable, Dict, List, Optional, Tuple

from seo.search_stores import (
    FixVerification,
    VerifyStatus,
    get_fix_verification_repository,
)


# ── helpers ───────────────────────────────────────────────────────────────────

def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="microseconds")


# Fields this module knows how to extract from a parsed page.
_EXTRACTABLE_FIELDS = {"title", "meta_description", "h1"}


def _extract_field(html: str, field_name: str) -> str:
    """Extract a single SEO field from raw HTML using the existing parser.

    Supported field_name values: ``title``, ``meta_description``, ``h1``.
    Returns an empty string when the field is not found or field_name is
    not in the supported set.
    """
    from seo.mode_external.parser import html_to_page

    page = html_to_page(html)
    if field_name == "title":
        return page.get("title", "")
    if field_name == "meta_description":
        return page.get("meta_description", "")
    if field_name == "h1":
        headings = page.get("headings", [])
        h1_entries = [h["text"] for h in headings if h.get("level") == 1]
        return h1_entries[0] if h1_entries else ""
    return ""


def _default_fetcher(page_url: str) -> str:
    """Production fetcher: re-fetch the live page and return its HTML.

    Uses ``seo.httpx_fetch.fetch_full`` (the hardened SSRF-safe fetcher)
    so the same URL-safety policy applies during verification.
    """
    from seo.httpx_fetch import fetch_full

    result = fetch_full(page_url)
    return result.get("html", "")


# ── Public API ────────────────────────────────────────────────────────────────

def record_fix(
    tenant: str,
    *,
    site_id: str,
    issue_id: str,
    page_id: str,
    page_url: str,
    rule_key: str,
    applied_fix: str,
    field_name: str,
    before_value: str,
    intended_after_value: str,
) -> Tuple[str, FixVerification]:
    """Record that a fix has been applied for an SEO issue.

    Creates a new ``FixVerification`` row with ``result=PENDING`` and returns
    ``(fix_id, FixVerification)``.  Call ``verify_fix`` to compare the live
    page value against ``intended_after_value``.

    Parameters
    ----------
    tenant:               Tenant that owns the fix.
    site_id:              Pixie SEO site the issue belongs to.
    issue_id:             The ``SeoIssue`` row ID.
    page_id:              The ``CrawledPage`` row ID.
    page_url:             The public URL to re-fetch during verification.
    rule_key:             SEO rule that was violated (e.g. ``"missing_title"``).
    applied_fix:          Human-readable description of the applied change.
    field_name:           The page field that was changed (``title`` /
                          ``meta_description`` / ``h1``).
    before_value:         The field's value *before* the fix was applied.
    intended_after_value: The value the fix *should* have produced.
    """
    repo = get_fix_verification_repository()
    fv = FixVerification(
        tenant_id=tenant,
        site_id=site_id,
        issue_id=issue_id,
        page_id=page_id,
        page_url=page_url,
        rule_key=rule_key,
        applied_fix=applied_fix,
        field_name=field_name,
        before_value=before_value,
        intended_after_value=intended_after_value,
        result=VerifyStatus.PENDING,
    )
    return repo.create(fv)


def verify_fix(
    tenant: str,
    fix_id: str,
    *,
    fetcher: Optional[Callable[[str], str]] = None,
) -> Optional[Tuple[str, FixVerification]]:
    """Re-fetch the page and compare the observed field value to intended.

    Verification is based SOLELY on the re-fetched observed value — never on
    whether a prior API call reported success.

    Outcomes
    --------
    VERIFIED — observed value matches ``intended_after_value`` (stripped).
    FAILED   — observed value still matches ``before_value`` OR is a third
               value (neither before nor intended).  ``remaining_evidence``
               is populated with the mismatch detail.

    Parameters
    ----------
    tenant:   Tenant that owns the fix record.
    fix_id:   The ``fixver_…`` row ID returned by ``record_fix``.
    fetcher:  Callable ``(url: str) -> html_str``.  Defaults to the hardened
              SSRF-safe ``fetch_full`` fetcher.  Inject a fake in tests so
              NO network I/O occurs.

    Returns the updated ``(fix_id, FixVerification)`` or ``None`` when the
    row does not exist or the tenant does not own it.
    """
    repo = get_fix_verification_repository()
    result = repo.get(tenant, fix_id)
    if not result:
        return None
    _, fv = result

    _fetcher = fetcher if fetcher is not None else _default_fetcher

    try:
        html = _fetcher(fv.page_url)
    except Exception as exc:
        # Fetch failure — leave PENDING, record the error in remaining_evidence.
        remaining_evidence: Dict = {
            "error": "fetch_failed",
            "reason": str(exc)[:300],
            "field": fv.field_name,
        }
        return repo.update(
            tenant, fix_id,
            remaining_evidence=remaining_evidence,
        )

    observed = _extract_field(html, fv.field_name)
    intended = (fv.intended_after_value or "").strip()
    before = (fv.before_value or "").strip()
    observed_stripped = observed.strip()

    if observed_stripped == intended:
        new_result = VerifyStatus.VERIFIED
        remaining_evidence = {}
    else:
        new_result = VerifyStatus.FAILED
        still_old = observed_stripped == before
        remaining_evidence = {
            "field": fv.field_name,
            "observed": observed_stripped,
            "intended": intended,
            "still_matches_before": still_old,
            "note": (
                "field still shows old value — fix was not applied or not deployed yet"
                if still_old
                else "field has an unexpected value (neither before nor intended)"
            ),
        }

    now_str = _now()
    return repo.update(
        tenant, fix_id,
        result=new_result,
        observed_after_value=observed_stripped,
        remaining_evidence=remaining_evidence,
        verified_at=now_str if new_result == VerifyStatus.VERIFIED else fv.verified_at,
    )


def list_fix_verifications(
    tenant: str,
    issue_id: Optional[str] = None,
    site_id: Optional[str] = None,
) -> List[Tuple[str, FixVerification]]:
    """List fix verifications for the tenant, optionally filtered.

    When ``issue_id`` is provided, only rows matching that issue are returned.
    When ``site_id`` is provided (and ``issue_id`` is not), rows matching that
    site are returned.  With no filter, all tenant rows are returned.
    """
    repo = get_fix_verification_repository()
    if issue_id:
        return repo.list_where(tenant, issue_id=issue_id)
    if site_id:
        return repo.list_where(tenant, site_id=site_id)
    return repo.list(tenant)
