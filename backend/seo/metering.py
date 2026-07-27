"""SEO usage metering — record-only, enforcement stays OFF.

All counts are derived from SERVER-SIDE trusted values (never a browser-
supplied count). The credit system master switch is CREDIT_SYSTEM_ENABLED
(default False); this module safely no-ops when the switch is off.

Operations metered under product ``seo_agent``:
  seo_crawl_pages  — one credit per page actually crawled (real crawl only;
                     mock/in-memory fetchers → 0 credits because is_mock=True).
  seo_pagespeed    — one credit per real PSI request (strategy × page);
                     mock provider → 0 credits.
  seo_audit        — one credit per completed report generation.

Rules
-----
- Local / mock / heuristic ops consume ZERO credits (enforced via is_mock).
- A blocked SSRF / validation-failure / failed op consumes ZERO.
- Enforcement remains OFF by default — usage is RECORDED but never blocked.
- ``estimate_crawl`` returns a forward estimate for the UI to preview cost.
"""

from __future__ import annotations

import logging
import secrets
from typing import Optional

from credits import config as credit_config
from credits.estimate import build_estimate
from credits.money import CURRENT_PRICING_VERSION, provider_micro_usd_to_mc
from credits.products import PRODUCT_CATALOG

_log = logging.getLogger("pixie.seo.metering")

# ── Per-unit provider-cost ceilings in µUSD ─────────────────────────────────
# These are the MAX reservation inputs; actual charges settle at real cost.
# Chosen to be conservative ceilings, not averages.
_MICRO_USD_PER_PAGE_CRAWL = 500        # $0.0005 / page (bandwidth + CPU)
_MICRO_USD_PER_PSI_REQUEST = 1_000     # $0.001 / PSI call (API quota cost)
_MICRO_USD_PER_AUDIT = 5_000           # $0.005 / full audit/report

# How many representative pages to run PSI on per job (homepage + up to N more).
MAX_PSI_PAGES = 3
# Strategies evaluated for each page.
PSI_STRATEGIES = ("mobile", "desktop")


def _seo_product() -> str:
    return "seo_agent"


def _is_credit_system_on() -> bool:
    return credit_config.credit_system_enabled()


def _new_op_id() -> str:
    return "seo_" + secrets.token_hex(8)


def record_crawl_pages(
    tenant_id: str,
    *,
    crawled_count: int,
    job_id: str,
    is_mock: bool,
) -> dict:
    """Record usage for a completed crawl (crawled_count real pages).

    Parameters
    ----------
    tenant_id:
        Workspace that owns the crawl.
    crawled_count:
        Actual number of pages successfully crawled — ALWAYS server-side.
    job_id:
        The CrawlJob id used as the idempotency anchor.
    is_mock:
        True when the crawl used an injected / offline fetcher (tests, dry-runs).
        Mock crawls ALWAYS record 0 credits.
    """
    if not _is_credit_system_on():
        return {"recorded": False, "reason": "credit_system_disabled", "credits_mc": 0}

    if is_mock or crawled_count <= 0:
        return {"recorded": False, "reason": "mock_or_zero", "credits_mc": 0}

    # Use enforce() from enforcement module for proper reserve→settle lifecycle.
    # We build a minimal estimate for the page-crawl operation.
    from credits.enforcement import enforce

    operation_id = f"seo_crawl:{job_id}"
    micro_usd = _MICRO_USD_PER_PAGE_CRAWL * max(1, crawled_count)
    est = build_estimate(
        tenant_id,
        operation_type="seo_audit",   # maps to seo_agent in products.py
        max_provider_micro_usd=micro_usd,
        is_mock=False,
        authorized_balance=False,      # don't hit wallet; just compute
    )

    try:
        with enforce(
            tenant_id,
            operation_type="seo_audit",
            source_product=_seo_product(),
            source_object_id=job_id,
            operation_id=operation_id,
            estimate=est,
            is_mock=False,
            created_by="seo_worker",
        ) as op:
            # Crawl already happened (server-side fact); signal immediate success.
            op.provider_succeeded(actual_provider_micro_usd=micro_usd)
        return {
            "recorded": True,
            "operation_type": "seo_audit",
            "crawled_count": crawled_count,
            "credits_mc": est.get("estimated_credits_mc", 0),
        }
    except Exception as exc:
        # Metering must NEVER crash the crawl pipeline.
        _log.warning("seo metering: crawl pages record failed (job=%s): %s", job_id, exc)
        return {"recorded": False, "reason": str(exc), "credits_mc": 0}


def record_pagespeed_requests(
    tenant_id: str,
    *,
    real_request_count: int,
    job_id: str,
    is_mock: bool,
) -> dict:
    """Record usage for real PSI requests made during a crawl or on-demand call.

    Parameters
    ----------
    real_request_count:
        Number of REAL (non-mock) PSI HTTP calls made — always server-side.
    is_mock:
        True when the PSI provider is the MockPageSpeedProvider → 0 credits.
    """
    if not _is_credit_system_on():
        return {"recorded": False, "reason": "credit_system_disabled", "credits_mc": 0}

    if is_mock or real_request_count <= 0:
        return {"recorded": False, "reason": "mock_or_zero", "credits_mc": 0}

    from credits.enforcement import enforce

    operation_id = f"seo_psi:{job_id}:{real_request_count}"
    micro_usd = _MICRO_USD_PER_PSI_REQUEST * max(1, real_request_count)
    est = build_estimate(
        tenant_id,
        operation_type="seo_keyword_research",  # maps to seo_agent
        max_provider_micro_usd=micro_usd,
        is_mock=False,
        authorized_balance=False,
    )

    try:
        with enforce(
            tenant_id,
            operation_type="seo_keyword_research",
            source_product=_seo_product(),
            source_object_id=job_id,
            operation_id=operation_id,
            estimate=est,
            is_mock=False,
            created_by="seo_pagespeed",
        ) as op:
            op.provider_succeeded(actual_provider_micro_usd=micro_usd)
        return {
            "recorded": True,
            "operation_type": "seo_keyword_research",
            "real_request_count": real_request_count,
            "credits_mc": est.get("estimated_credits_mc", 0),
        }
    except Exception as exc:
        _log.warning("seo metering: pagespeed record failed (job=%s): %s", job_id, exc)
        return {"recorded": False, "reason": str(exc), "credits_mc": 0}


def record_report_generated(
    tenant_id: str,
    *,
    job_id: str,
    is_mock: bool,
) -> dict:
    """Record usage for a completed SEO report (one per job)."""
    if not _is_credit_system_on():
        return {"recorded": False, "reason": "credit_system_disabled", "credits_mc": 0}

    if is_mock:
        return {"recorded": False, "reason": "mock", "credits_mc": 0}

    from credits.enforcement import enforce

    operation_id = f"seo_report:{job_id}"
    micro_usd = _MICRO_USD_PER_AUDIT
    est = build_estimate(
        tenant_id,
        operation_type="seo_fix",   # maps to seo_agent
        max_provider_micro_usd=micro_usd,
        is_mock=False,
        authorized_balance=False,
    )

    try:
        with enforce(
            tenant_id,
            operation_type="seo_fix",
            source_product=_seo_product(),
            source_object_id=job_id,
            operation_id=operation_id,
            estimate=est,
            is_mock=False,
            created_by="seo_analysis",
        ) as op:
            op.provider_succeeded(actual_provider_micro_usd=micro_usd)
        return {
            "recorded": True,
            "operation_type": "seo_fix",
            "credits_mc": est.get("estimated_credits_mc", 0),
        }
    except Exception as exc:
        _log.warning("seo metering: report record failed (job=%s): %s", job_id, exc)
        return {"recorded": False, "reason": str(exc), "credits_mc": 0}


def estimate_crawl(
    tenant_id: str,
    requested_limit: int,
    *,
    include_pagespeed: bool = False,
) -> dict:
    """Forward cost estimate for a crawl — used by POST /crawl/estimate.

    Always uses is_mock=False so the estimate reflects what a REAL crawl would
    cost. The caller decides whether to display this to the user.

    Returns
    -------
    dict with:
      estimated_credits_mc  — total milli-credits
      breakdown             — per-operation breakdown
      needs_paid_providers  — True if PSI key would be required for full value
      pricing_version       — the pricing version used
    """
    n_pages = max(1, int(requested_limit or 1))
    psi_pages = min(MAX_PSI_PAGES, n_pages) if include_pagespeed else 0
    psi_requests = psi_pages * len(PSI_STRATEGIES)

    crawl_micro = _MICRO_USD_PER_PAGE_CRAWL * n_pages
    psi_micro = _MICRO_USD_PER_PSI_REQUEST * psi_requests
    report_micro = _MICRO_USD_PER_AUDIT

    total_micro = crawl_micro + psi_micro + report_micro

    # Convert to mc using current pricing (no markup for this estimate — advisory).
    crawl_mc = provider_micro_usd_to_mc(crawl_micro, apply_markup=True)
    psi_mc = provider_micro_usd_to_mc(psi_micro, apply_markup=True)
    report_mc = provider_micro_usd_to_mc(report_micro, apply_markup=True)
    total_mc = crawl_mc + psi_mc + report_mc

    return {
        "estimated_credits_mc": total_mc,
        "breakdown": {
            "crawl_pages": {
                "pages": n_pages,
                "credits_mc": crawl_mc,
                "provider_micro_usd": crawl_micro,
            },
            "pagespeed": {
                "psi_requests": psi_requests,
                "psi_pages": psi_pages,
                "strategies": list(PSI_STRATEGIES) if include_pagespeed else [],
                "credits_mc": psi_mc,
                "provider_micro_usd": psi_micro,
            },
            "report": {
                "credits_mc": report_mc,
                "provider_micro_usd": report_micro,
            },
        },
        "needs_paid_providers": include_pagespeed,  # PSI needs a real API key
        "pricing_version": CURRENT_PRICING_VERSION,
        "credit_system_enabled": _is_credit_system_on(),
        "enforcement_enabled": credit_config.billing_enforcement_enabled(),
    }
