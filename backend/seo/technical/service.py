from __future__ import annotations

import time
from typing import Dict, List

from .console import get_console_provider
from .crawlability import check_crawlability
from .models import TechnicalIssue
from .pagespeed import evaluate_cwv, get_pagespeed_provider
from .validators import detect_failed_resources, validate_html, validate_jsonld


def _group(issues: List[TechnicalIssue]) -> Dict[str, list]:
    grouped: Dict[str, list] = {}
    for issue in issues:
        grouped.setdefault(issue.category, []).append(issue.to_dict())
    return grouped


def technical_audit(
    url: str,
    *,
    html: str = "",
    page: dict = None,
    resources=None,
    redirects=None,
    internal_link_status=None,
) -> Dict:
    """Orchestrate pagespeed + console + validators + crawlability.

    Returns a single report dict with provider/cost/latency metadata and
    issues grouped by category. Never raises on normal input.
    """
    start = time.time()
    page = page or {"url": url}
    jsonld_blocks = (page or {}).get("jsonld", []) if isinstance(page, dict) else []

    issues: List[TechnicalIssue] = []
    console_errors = []
    cwv_dict: Dict = {}
    providers_meta: Dict = {}

    # PageSpeed / Core Web Vitals
    try:
        ps_provider = get_pagespeed_provider()
        cwv = ps_provider.fetch(url)
        cwv_dict = cwv.to_dict()
        issues.extend(evaluate_cwv(cwv))
        providers_meta["pagespeed"] = {
            "provider": cwv.provider,
            "estimated_cost": cwv.estimated_cost,
            "latency_ms": cwv.latency_ms,
            "cache_hit": cwv.cache_hit,
        }
    except Exception:
        providers_meta["pagespeed"] = {"provider": "unavailable", "error": True}

    # Console errors
    try:
        console_provider = get_console_provider()
        captured = console_provider.capture(url)
        console_errors = [e.to_dict() for e in captured]
        providers_meta["console"] = {
            "provider": console_provider.name,
            "estimated_cost": 0.0,
            "error_count": sum(1 for e in captured if e.level == "error"),
            "warning_count": sum(1 for e in captured if e.level == "warning"),
        }
        for e in captured:
            if e.level == "error":
                issues.append(
                    TechnicalIssue(
                        id="console.error",
                        category="technical",
                        severity="high",
                        title="Browser console error",
                        description=e.text,
                        recommendation="Resolve the JavaScript/console error to avoid broken functionality and SEO signals.",
                        evidence={"source": e.source, "text": e.text},
                    )
                )
    except Exception:
        providers_meta["console"] = {"provider": "unavailable", "error": True}

    # HTML validators
    try:
        issues.extend(validate_html(html))
    except Exception:
        pass

    # JSON-LD validators
    try:
        issues.extend(validate_jsonld(jsonld_blocks))
    except Exception:
        pass

    # Failed resources
    try:
        issues.extend(detect_failed_resources(resources or []))
    except Exception:
        pass

    # Crawlability
    try:
        issues.extend(
            check_crawlability(
                page,
                redirects=redirects,
                internal_link_status=internal_link_status,
            )
        )
    except Exception:
        pass

    grouped = _group(issues)
    severity_counts: Dict[str, int] = {}
    for issue in issues:
        severity_counts[issue.severity] = severity_counts.get(issue.severity, 0) + 1

    return {
        "url": url,
        "core_web_vitals": cwv_dict,
        "console_errors": console_errors,
        "issues": [i.to_dict() for i in issues],
        "issues_by_category": grouped,
        "issue_count": len(issues),
        "severity_counts": severity_counts,
        "providers": providers_meta,
        "latency_ms": int((time.time() - start) * 1000),
    }
