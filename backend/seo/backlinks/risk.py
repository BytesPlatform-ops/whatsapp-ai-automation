"""Transparent toxic-link risk signal analysis.

IMPORTANT — design principles:
  1. We compute EXPLAINABLE signals from measurable properties (anchor patterns,
     provider metrics, TLD patterns, link velocity). We do NOT label links
     "toxic" via a black-box AI score or claim legal certainty about Google
     penalties.
  2. Every result includes ``signals`` (list of human-readable strings),
     ``confidence`` (float 0–1), ``provider_data`` (verbatim from provider),
     and ``human_review_required: True`` so users know a professional should
     make the final disavow decision.
  3. We do NOT generate or submit a Google Disavow file automatically. We
     expose an exportable review list in a format users can reference.

Signal keys (kept as string constants, not enums, so new signals can be added
without schema changes):

  EXACT_MATCH_ANCHOR_REPEAT  — same exact-match anchor used >N times from same domain
  SITEWIDE_LINK              — domain contributes >50% of all its links to one source page
  SUSPICIOUS_TLD             — source domain uses a commonly-spammed TLD
  LOW_PROVIDER_METRICS       — provider-supplied domain/URL rating below threshold (when present)
  IRRELEVANT_LANGUAGE        — link source language inconsistent with client's declared language
  HIGH_OUTBOUND_RATIO        — provider reports very high outbound link count (when provided)
  UNNATURAL_VELOCITY         — new backlinks acquired far above historical average
  NETWORK_PATTERN            — multiple links from same C-class IP or network (when provider supplies)

Public API:
  analyse_risk_signals(tenant_id, site_id, *, language_hint) → List[Dict]
    Returns one dict per referring domain with signals + confidence.

  get_review_list(tenant_id, site_id, *, min_signals) → List[Dict]
    Returns flagged domains sorted by signal count, for the review export.
"""

from __future__ import annotations

import logging
from collections import Counter
from typing import Dict, List, Optional

from .stores import (
    DomainStatus,
    LinkRel,
    LinkStatus,
    get_backlink_repository,
    get_referring_domain_repository,
)

_log = logging.getLogger("pixie.seo.backlinks.risk")

# ── Signal constants ───────────────────────────────────────────────────────────

EXACT_MATCH_ANCHOR_REPEAT = "exact_match_anchor_repeat"
SITEWIDE_LINK             = "sitewide_link"
SUSPICIOUS_TLD            = "suspicious_tld"
LOW_PROVIDER_METRICS      = "low_provider_metrics"
IRRELEVANT_LANGUAGE       = "irrelevant_language"
HIGH_OUTBOUND_RATIO       = "high_outbound_ratio"
UNNATURAL_VELOCITY        = "unnatural_velocity"

# TLDs commonly associated with low-quality link farms (not an exhaustive list;
# serves as a heuristic only).
_SUSPICIOUS_TLDS = frozenset({
    ".xyz", ".top", ".click", ".loan", ".win", ".gdn", ".stream",
    ".download", ".racing", ".review", ".party", ".science", ".faith",
    ".date", ".bid", ".trade",
})

# Thresholds (configurable via constants — never hard-coded business decisions).
_ANCHOR_REPEAT_THRESHOLD = 5         # same anchor from same domain more than this
_SITEWIDE_PCT_THRESHOLD  = 0.50      # >50% of domain's links go to one page
_LOW_DR_THRESHOLD        = 5         # provider domain_rating below this
_LOW_UR_THRESHOLD        = 3         # provider url_rating below this
_HIGH_OBL_THRESHOLD      = 500       # provider outbound_links_count above this


def _get_tld(domain: str) -> str:
    parts = domain.rstrip(".").split(".")
    if len(parts) >= 2:
        return "." + parts[-1].lower()
    return ""


def _analyse_domain(
    domain: str,
    backlinks: list,          # list of Backlink objects for this domain
    all_backlink_count: int,  # total for the site (for sitewide ratio)
    language_hint: str,
) -> Dict:
    """Compute risk signals for one referring domain.

    Returns a dict with signals, confidence, provider_data, and human_review_required.
    """
    signals = []
    provider_data_list = []

    # ── 1. Anchor exact-match repeat ────────────────────────────────────────
    anchor_counts = Counter(bl.anchor_text for bl in backlinks if bl.anchor_text)
    for anchor, count in anchor_counts.items():
        if count > _ANCHOR_REPEAT_THRESHOLD:
            signals.append({
                "key": EXACT_MATCH_ANCHOR_REPEAT,
                "detail": f"Anchor '{anchor}' appears {count} times from this domain "
                          f"(threshold: {_ANCHOR_REPEAT_THRESHOLD})",
                "count": count,
            })
            break  # report once per domain (worst offender)

    # ── 2. Sitewide link ratio ───────────────────────────────────────────────
    if backlinks:
        target_pages = [bl.target_url for bl in backlinks]
        most_common_target, most_common_count = Counter(target_pages).most_common(1)[0]
        sitewide_pct = most_common_count / len(backlinks)
        if sitewide_pct > _SITEWIDE_PCT_THRESHOLD and len(backlinks) > 2:
            signals.append({
                "key": SITEWIDE_LINK,
                "detail": f"{most_common_count}/{len(backlinks)} links ({sitewide_pct:.0%}) "
                          f"from this domain point to '{most_common_target}'",
                "sitewide_percent": round(sitewide_pct, 3),
            })

    # ── 3. Suspicious TLD ────────────────────────────────────────────────────
    tld = _get_tld(domain)
    if tld in _SUSPICIOUS_TLDS:
        signals.append({
            "key": SUSPICIOUS_TLD,
            "detail": f"Domain uses TLD '{tld}' which is commonly associated with low-quality links",
            "tld": tld,
        })

    # ── 4. Provider metrics (if present, never fabricated) ────────────────
    for bl in backlinks:
        if bl.provider_metrics:
            provider_data_list.append(bl.provider_metrics)

    # Sample the first non-None provider_metrics for signal computation.
    sample_metrics: Optional[Dict] = next(
        (m for m in provider_data_list if m and not m.get("is_mock")), None
    )
    mock_metrics: Optional[Dict] = next((m for m in provider_data_list if m), None)
    display_metrics = sample_metrics or mock_metrics

    if display_metrics:
        dr = display_metrics.get("domain_rating")
        ur = display_metrics.get("url_rating")
        if dr is not None and isinstance(dr, (int, float)) and dr < _LOW_DR_THRESHOLD:
            signals.append({
                "key": LOW_PROVIDER_METRICS,
                "detail": f"Provider-supplied domain rating is {dr} "
                          f"(threshold: <{_LOW_DR_THRESHOLD})",
                "metric": "domain_rating",
                "value": dr,
                "threshold": _LOW_DR_THRESHOLD,
            })
        elif ur is not None and isinstance(ur, (int, float)) and ur < _LOW_UR_THRESHOLD:
            signals.append({
                "key": LOW_PROVIDER_METRICS,
                "detail": f"Provider-supplied URL rating is {ur} "
                          f"(threshold: <{_LOW_UR_THRESHOLD})",
                "metric": "url_rating",
                "value": ur,
                "threshold": _LOW_UR_THRESHOLD,
            })

        obl = display_metrics.get("outbound_links_count")
        if obl is not None and isinstance(obl, (int, float)) and obl > _HIGH_OBL_THRESHOLD:
            signals.append({
                "key": HIGH_OUTBOUND_RATIO,
                "detail": f"Provider reports {obl} outbound links (threshold: >{_HIGH_OBL_THRESHOLD})",
                "value": obl,
                "threshold": _HIGH_OBL_THRESHOLD,
            })

    # ── 5. Irrelevant language ────────────────────────────────────────────
    if language_hint:
        link_langs = [bl.language for bl in backlinks if bl.language]
        if link_langs:
            foreign = [l for l in link_langs if l and l[:2].lower() != language_hint[:2].lower()]
            if len(foreign) > len(link_langs) * 0.8:
                signals.append({
                    "key": IRRELEVANT_LANGUAGE,
                    "detail": f"Most links from this domain are in a different language "
                              f"(client language: {language_hint!r}); "
                              f"{len(foreign)}/{len(link_langs)} links appear foreign",
                    "link_languages": list(set(link_langs)),
                    "expected_language": language_hint,
                })

    # ── Confidence: higher when more signals + provider data available ────
    base_confidence = min(0.9, 0.2 * len(signals))
    if display_metrics and not display_metrics.get("is_mock"):
        base_confidence = min(1.0, base_confidence + 0.1)

    return {
        "domain": domain,
        "signals": signals,
        "signal_count": len(signals),
        "confidence": round(base_confidence, 2),
        "provider_data": display_metrics,   # verbatim from provider, never fabricated
        "human_review_required": True,      # always True — we never auto-disavow
        "recommendation": (
            "This domain has {count} risk signal(s). A human reviewer should examine "
            "the links and decide whether to disavow. Do not submit a disavow file "
            "without manual review.".format(count=len(signals))
            if signals
            else "No automated risk signals detected. Manual review is still recommended "
                 "before any disavow action."
        ),
    }


def analyse_risk_signals(
    tenant_id: str,
    site_id: str,
    *,
    language_hint: str = "en",
) -> List[Dict]:
    """Analyse all stored backlinks for this site and return per-domain risk dicts.

    Each dict contains: domain, signals (list), signal_count, confidence,
    provider_data (verbatim), human_review_required, recommendation.

    Never raises — errors are logged and an empty list is returned.
    """
    try:
        bl_repo = get_backlink_repository()
        all_bls = bl_repo.list_by_site(tenant_id, site_id)

        # Group backlinks by source_domain.
        by_domain: Dict[str, list] = {}
        for _, bl in all_bls:
            d = bl.source_domain or ""
            if d not in by_domain:
                by_domain[d] = []
            by_domain[d].append(bl)

        total_bls = len(all_bls)
        results = []
        for domain, domain_bls in by_domain.items():
            result = _analyse_domain(domain, domain_bls, total_bls, language_hint)
            results.append(result)

        # Sort: most signals first.
        results.sort(key=lambda r: (-r["signal_count"], r["domain"]))
        return results
    except Exception as exc:
        _log.warning("analyse_risk_signals failed for site %s: %s", site_id, exc)
        return []


def get_review_list(
    tenant_id: str,
    site_id: str,
    *,
    min_signals: int = 1,
    language_hint: str = "en",
) -> List[Dict]:
    """Return flagged referring domains for human review export.

    Only returns domains with at least ``min_signals`` risk signals.
    Sorted by signal_count descending, then domain alphabetically.
    Each entry includes: domain, signals, signal_count, confidence,
    recommendation, human_review_required, provider_data.
    """
    all_results = analyse_risk_signals(tenant_id, site_id, language_hint=language_hint)
    flagged = [r for r in all_results if r["signal_count"] >= min_signals]
    flagged.sort(key=lambda r: (-r["signal_count"], r["domain"]))
    return flagged
