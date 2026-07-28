"""Usage metering for the SEO *search-intelligence* operations.

Same contract + guarantees as ``seo/metering.py`` (record-only, enforcement OFF
by default, mock/zero → 0 credits, never crashes the caller). Kept in a separate
module so the search-intelligence verticals (Google sync, keywords, rank,
opportunities, briefs, page-optimise) can meter without editing the original.

All operations attribute to product ``seo_agent`` by reusing the three
operation_types that ``credits/products.py`` already maps to it —
``seo_keyword_research`` (data/provider pulls), ``seo_fix`` (AI analysis) — so we
do NOT need to touch the shared product catalog. The ``created_by`` +
``operation_id`` fields keep the audit trail granular per sub-operation.

Rules
-----
- ``is_mock=True`` (mock providers, offline tests) ALWAYS records 0 credits.
- A count of 0 records nothing.
- The credit master switch (CREDIT_SYSTEM_ENABLED, default False) short-circuits.
- Metering NEVER raises into the caller — failures return recorded=False.
- Idempotency: ``operation_id`` is stable per (job, unit) so a duplicate/replayed
  job does not double-charge (enforce() dedupes on operation_id).
"""

from __future__ import annotations

import logging
from typing import Optional

from credits import config as credit_config
from credits.estimate import build_estimate

_log = logging.getLogger("pixie.seo.metering_search")

# ── Per-unit provider-cost ceilings in µUSD (conservative ceilings) ─────────────
MICRO_USD_PER_KEYWORD_CALL      = 3_000    # $0.003 per keyword-provider API call
MICRO_USD_PER_RANK_CHECK        = 5_000    # $0.005 per SERP/rank check (per keyword)
MICRO_USD_PER_GSC_SYNC          = 2_000    # $0.002 per property per GSC sync run
MICRO_USD_PER_GA4_SYNC          = 2_000    # $0.002 per property per GA4 sync run
MICRO_USD_PER_AI_CLUSTERING     = 4_000    # $0.004 per clustering run (LLM assist)
MICRO_USD_PER_AI_INTENT         = 2_000    # $0.002 per intent-refinement batch
MICRO_USD_PER_OPP_EXPLANATION   = 1_500    # $0.0015 per AI opportunity explanation
MICRO_USD_PER_BRIEF             = 8_000    # $0.008 per content brief (LLM)
MICRO_USD_PER_PAGE_OPTIMISE     = 8_000    # $0.008 per page-optimisation generation

_SEO_PRODUCT = "seo_agent"


def _is_credit_system_on() -> bool:
    return credit_config.credit_system_enabled()


def _record(
    tenant_id: str,
    *,
    operation_type: str,
    micro_usd: int,
    operation_id: str,
    source_object_id: str,
    created_by: str,
    is_mock: bool,
    units: int,
    meter: str,
) -> dict:
    """Shared reserve→settle recorder. Returns a small result dict; never raises."""
    if not _is_credit_system_on():
        return {"recorded": False, "reason": "credit_system_disabled", "credits_mc": 0, "meter": meter}
    if is_mock or units <= 0 or micro_usd <= 0:
        return {"recorded": False, "reason": "mock_or_zero", "credits_mc": 0, "meter": meter}

    from credits.enforcement import enforce

    est = build_estimate(
        tenant_id,
        operation_type=operation_type,
        max_provider_micro_usd=micro_usd,
        is_mock=False,
        authorized_balance=False,
    )
    try:
        with enforce(
            tenant_id,
            operation_type=operation_type,
            source_product=_SEO_PRODUCT,
            source_object_id=source_object_id,
            operation_id=operation_id,
            estimate=est,
            is_mock=False,
            created_by=created_by,
        ) as op:
            op.provider_succeeded(actual_provider_micro_usd=micro_usd)
        return {
            "recorded": True,
            "meter": meter,
            "operation_type": operation_type,
            "units": units,
            "credits_mc": est.get("estimated_credits_mc", 0),
        }
    except Exception as exc:  # metering must never crash the caller
        _log.warning("seo metering_search: %s record failed (obj=%s): %s", meter, source_object_id, exc)
        return {"recorded": False, "reason": str(exc), "credits_mc": 0, "meter": meter}


# ── Public recorders ────────────────────────────────────────────────────────────

def record_keyword_provider_call(tenant_id: str, *, call_count: int, job_id: str, is_mock: bool) -> dict:
    return _record(
        tenant_id, operation_type="seo_keyword_research",
        micro_usd=MICRO_USD_PER_KEYWORD_CALL * max(1, call_count),
        operation_id=f"seo_kwcall:{job_id}:{call_count}", source_object_id=job_id,
        created_by="seo_keyword_provider", is_mock=is_mock, units=call_count, meter="keyword_provider_call",
    )


def record_rank_check(tenant_id: str, *, keyword_count: int, job_id: str, is_mock: bool) -> dict:
    return _record(
        tenant_id, operation_type="seo_keyword_research",
        micro_usd=MICRO_USD_PER_RANK_CHECK * max(1, keyword_count),
        operation_id=f"seo_rank:{job_id}:{keyword_count}", source_object_id=job_id,
        created_by="seo_rank_provider", is_mock=is_mock, units=keyword_count, meter="rank_check",
    )


def record_gsc_sync(tenant_id: str, *, property_count: int, job_id: str, is_mock: bool) -> dict:
    return _record(
        tenant_id, operation_type="seo_keyword_research",
        micro_usd=MICRO_USD_PER_GSC_SYNC * max(1, property_count),
        operation_id=f"seo_gsc:{job_id}", source_object_id=job_id,
        created_by="seo_gsc_sync", is_mock=is_mock, units=property_count, meter="gsc_sync",
    )


def record_ga4_sync(tenant_id: str, *, property_count: int, job_id: str, is_mock: bool) -> dict:
    return _record(
        tenant_id, operation_type="seo_keyword_research",
        micro_usd=MICRO_USD_PER_GA4_SYNC * max(1, property_count),
        operation_id=f"seo_ga4:{job_id}", source_object_id=job_id,
        created_by="seo_ga4_sync", is_mock=is_mock, units=property_count, meter="ga4_sync",
    )


def record_ai_clustering(tenant_id: str, *, project_id: str, keyword_count: int, is_mock: bool) -> dict:
    return _record(
        tenant_id, operation_type="seo_fix",
        micro_usd=MICRO_USD_PER_AI_CLUSTERING,
        operation_id=f"seo_cluster:{project_id}:{keyword_count}", source_object_id=project_id,
        created_by="seo_ai_clustering", is_mock=is_mock, units=1 if keyword_count > 0 else 0,
        meter="ai_clustering",
    )


def record_ai_intent(tenant_id: str, *, project_id: str, keyword_count: int, is_mock: bool) -> dict:
    return _record(
        tenant_id, operation_type="seo_fix",
        micro_usd=MICRO_USD_PER_AI_INTENT,
        operation_id=f"seo_intent:{project_id}:{keyword_count}", source_object_id=project_id,
        created_by="seo_ai_intent", is_mock=is_mock, units=1 if keyword_count > 0 else 0,
        meter="ai_intent",
    )


def record_opportunity_explanation(tenant_id: str, *, opportunity_id: str, is_mock: bool) -> dict:
    return _record(
        tenant_id, operation_type="seo_fix",
        micro_usd=MICRO_USD_PER_OPP_EXPLANATION,
        operation_id=f"seo_oppexp:{opportunity_id}", source_object_id=opportunity_id,
        created_by="seo_ai_opportunity", is_mock=is_mock, units=1, meter="opportunity_explanation",
    )


def record_brief_generation(tenant_id: str, *, brief_id: str, is_mock: bool) -> dict:
    return _record(
        tenant_id, operation_type="seo_fix",
        micro_usd=MICRO_USD_PER_BRIEF,
        operation_id=f"seo_brief:{brief_id}", source_object_id=brief_id,
        created_by="seo_content_brief", is_mock=is_mock, units=1, meter="brief_generation",
    )


def record_page_optimisation(tenant_id: str, *, page_ref: str, is_mock: bool) -> dict:
    return _record(
        tenant_id, operation_type="seo_fix",
        micro_usd=MICRO_USD_PER_PAGE_OPTIMISE,
        operation_id=f"seo_pageopt:{page_ref}", source_object_id=page_ref,
        created_by="seo_page_optimise", is_mock=is_mock, units=1, meter="page_optimisation",
    )


# ── Server-authoritative plan limits ────────────────────────────────────────────
# Reuses credits.plans.check_limit so admins define caps in the plan catalog. When
# a key has no cap the check returns UNLIMITED/allowed; enforcement only blocks
# when BILLING_ENFORCEMENT_ENABLED is on. Never trusts a browser-supplied count.

# Canonical SEO limit keys (advisory names; caps live in credits/plans.py limits).
LIMIT_SITES              = "seo_sites"
LIMIT_KEYWORD_PROJECTS   = "seo_keyword_projects"
LIMIT_KEYWORDS_PER_PROJECT = "seo_keywords_per_project"
LIMIT_TRACKED_KEYWORDS   = "seo_tracked_keywords"
LIMIT_COMPETITORS        = "seo_competitors"
LIMIT_GSC_PROPERTIES     = "seo_gsc_properties"
LIMIT_GA4_PROPERTIES     = "seo_ga4_properties"
LIMIT_CONTENT_BRIEFS     = "seo_content_briefs"
LIMIT_REPORTS            = "seo_reports"
LIMIT_AI_RECOMMENDATIONS = "seo_ai_recommendations"


def check_seo_limit(tenant_id: str, key: str, used: int) -> dict:
    """Return the plan-limit check for a SEO resource (server-authoritative).

    Result dict: {limit_key, limit, used, within_limit, allowed, reason}. When the
    plan defines no cap the resource is UNLIMITED and allowed. Callers should
    treat allowed=False as a hard block (respect it before any paid operation)."""
    try:
        from credits.plans import check_limit
        return check_limit(tenant_id, key, used)
    except Exception as exc:  # never crash the caller on a limit lookup
        _log.warning("seo limit check failed (%s): %s", key, exc)
        return {"limit_key": key, "limit": -1, "used": used, "within_limit": True,
                "allowed": True, "reason": "limit_check_unavailable"}


class SeoLimitExceeded(Exception):
    """Raised when a server-side SEO plan limit is exceeded and enforcement is on."""

    def __init__(self, result: dict):
        self.result = result
        super().__init__(result.get("reason") or "seo_limit_exceeded")


def enforce_seo_limit(tenant_id: str, key: str, used: int) -> dict:
    """Check + raise SeoLimitExceeded when not allowed. Returns the check on success."""
    result = check_seo_limit(tenant_id, key, used)
    if not result.get("allowed", True):
        raise SeoLimitExceeded(result)
    return result
