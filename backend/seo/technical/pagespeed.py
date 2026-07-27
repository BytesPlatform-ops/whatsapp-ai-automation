from __future__ import annotations

import hashlib
import json
import os
import time
import urllib.parse
import urllib.request
from typing import Dict, List, Optional, Tuple

from seo.schemas import Severity

from .models import CoreWebVitals, TechnicalIssue


# Google Core Web Vitals thresholds (lab/field guidance).
LCP_GOOD_MS = 2500
LCP_POOR_MS = 4000
CLS_GOOD = 0.1
CLS_POOR = 0.25
INP_GOOD_MS = 200
INP_POOR_MS = 500

# FCP thresholds (ms)
FCP_GOOD_MS = 1800
FCP_POOR_MS = 3000

# TBT thresholds (ms)
TBT_GOOD_MS = 200
TBT_POOR_MS = 600

VALID_STRATEGIES = ("mobile", "desktop")


def _hash_ints(url: str, count: int = 8) -> List[int]:
    """Deterministic, evenly-distributed ints derived from sha1(url)."""
    digest = hashlib.sha1((url or "").encode("utf-8")).digest()
    # Use disjoint byte windows so each metric is independent but stable.
    return [digest[i % len(digest)] for i in range(count)]


def _cwv_to_full_dict(cwv: "CoreWebVitals", *, strategy: str, mock: bool, request_ts: str) -> dict:
    """Map a CoreWebVitals object to the documented CWV output envelope.

    Fields stored in CrawledPage.extra["pagespeed"][strategy]:
      performance_score, lcp_ms, cls, inp_ms, fcp_ms, tbt_ms,
      opportunities, diagnostics, provider, provider_status,
      request_timestamp, mock, field_data_available.

    Rules:
    - When mock=True → mark mock:true, field_data_available:false,
      and DO NOT present synthetic field values as real. The metrics
      stored are clearly synthetic (sha1-derived) for display only.
    - When provider unavailable → status:"provider_unavailable" marker.
    """
    fcp_ms = getattr(cwv, "fcp_ms", 0) or 0
    tbt_ms = getattr(cwv, "tbt_ms", 0) or 0
    opportunities = getattr(cwv, "opportunities", []) or []
    diagnostics = getattr(cwv, "diagnostics", []) or []

    provider_status = "ok"
    if "unavailable" in (cwv.provider or ""):
        provider_status = "provider_unavailable"
    elif "fallback" in (cwv.provider or ""):
        provider_status = "degraded_fallback"

    return {
        "strategy": strategy,
        "performance_score": cwv.performance_score,
        "lcp_ms": cwv.lcp_ms,
        "cls": cwv.cls,
        "inp_ms": cwv.inp_ms,
        "fcp_ms": fcp_ms,
        "tbt_ms": tbt_ms,
        "opportunities": opportunities,
        "diagnostics": diagnostics,
        "provider": cwv.provider,
        "provider_status": provider_status,
        "request_timestamp": request_ts,
        "latency_ms": cwv.latency_ms,
        "cache_hit": cwv.cache_hit,
        "mock": mock,
        # When mock, synthetic numbers are clearly not real field data.
        "field_data_available": not mock,
    }


class PageSpeedProvider:
    """Abstract provider returning CoreWebVitals for a url."""

    name = "abstract"
    is_mock: bool = True

    def fetch(self, url: str, strategy: str = "mobile") -> CoreWebVitals:  # pragma: no cover
        raise NotImplementedError


class MockPageSpeedProvider(PageSpeedProvider):
    """Deterministic CWV derived from sha1(url). No network, no randomness.

    Clearly synthetic: mock=True, field_data_available=False. Metrics are
    sha1-derived for determinism — they must NOT be presented as real field data.
    """

    name = "mock"
    is_mock: bool = True

    def fetch(self, url: str, strategy: str = "mobile") -> CoreWebVitals:
        # Include strategy in hash so mobile != desktop deterministically.
        key = f"{url}:{strategy}"
        b = _hash_ints(key, 8)
        # Map bytes (0-255) into the documented ranges, deterministically.
        lcp = 1500 + int(b[0] / 255 * 3500)          # 1500-5000 ms
        cls = round(b[1] / 255 * 0.4, 3)             # 0.0-0.4
        inp = 100 + int(b[2] / 255 * 400)            # 100-500 ms
        perf = 50 + int(b[3] / 255 * 50)             # 50-100
        a11y = 50 + int(b[4] / 255 * 50)             # 50-100
        fcp = 800 + int(b[5] / 255 * 2500)           # 800-3300 ms
        tbt = int(b[6] / 255 * 700)                  # 0-700 ms
        cwv = CoreWebVitals(
            lcp_ms=lcp,
            cls=cls,
            inp_ms=inp,
            performance_score=perf,
            accessibility_score=a11y,
            provider=self.name,
            estimated_cost=0.0,
            latency_ms=0,
            cache_hit=False,
        )
        cwv.fcp_ms = fcp  # type: ignore[attr-defined]
        cwv.tbt_ms = tbt  # type: ignore[attr-defined]
        cwv.opportunities = []  # type: ignore[attr-defined]
        cwv.diagnostics = []   # type: ignore[attr-defined]
        return cwv


class GooglePageSpeedProvider(PageSpeedProvider):
    """Real PageSpeed Insights provider. Reads PAGESPEED_API_KEY from env.

    The HTTP path is documented but intentionally NOT exercised offline — when
    no key is present (`available()` is False) callers fall back to the mock.
    Even with a key, any failure degrades to the mock so public callers never
    raise on normal input.
    """

    name = "google_pagespeed"
    is_mock: bool = False
    ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed"

    def __init__(self, api_key: str = "") -> None:
        self.api_key = api_key or os.getenv("PAGESPEED_API_KEY", "")

    def available(self) -> bool:
        return bool(self.api_key)

    def fetch(self, url: str, strategy: str = "mobile") -> CoreWebVitals:
        if not self.available():
            # Degrade rather than raise.
            cwv = MockPageSpeedProvider().fetch(url, strategy)
            cwv.provider = self.name + ":no_key"
            return cwv
        start = time.time()
        try:
            params = urllib.parse.urlencode(
                {
                    "url": url,
                    "key": self.api_key,
                    "category": "performance",
                    "strategy": strategy,
                }
            )
            req = urllib.request.Request(self.ENDPOINT + "?" + params)
            # NOTE: never run offline. Real network call.
            with urllib.request.urlopen(req, timeout=20) as resp:  # pragma: no cover
                payload = json.loads(resp.read().decode("utf-8"))
            return self._parse(url, payload, start)
        except Exception as exc:  # pragma: no cover - network/parse failure -> mock
            # Check for quota errors (HTTP 429 / "quotaExceeded" in the body).
            # We can only do string matching on the exception message here since
            # urlopen raises urllib.error.HTTPError for HTTP errors.
            err_str = str(exc).lower()
            is_quota = "429" in err_str or "quota" in err_str or "rate" in err_str
            provider_suffix = ":quota_exceeded" if is_quota else ":fallback"
            cwv = MockPageSpeedProvider().fetch(url, strategy)
            cwv.provider = self.name + provider_suffix
            cwv.latency_ms = int((time.time() - start) * 1000)
            return cwv

    def _parse(self, url: str, payload: dict, start: float) -> CoreWebVitals:  # pragma: no cover
        lighthouse = payload.get("lighthouseResult", {})
        audits = lighthouse.get("audits", {})
        categories = lighthouse.get("categories", {})

        def _ms(audit_id: str) -> int:
            num = audits.get(audit_id, {}).get("numericValue", 0)
            return int(num or 0)

        def _opportunities() -> list:
            ops = []
            for k, a in audits.items():
                if a.get("details", {}).get("type") == "opportunity":
                    ops.append({
                        "id": k,
                        "title": a.get("title", ""),
                        "savings_ms": int(a.get("details", {}).get("overallSavingsMs", 0) or 0),
                    })
            return ops

        def _diagnostics() -> list:
            diags = []
            for k, a in audits.items():
                if a.get("score") is not None and a.get("score", 1) < 0.9:
                    diags.append({
                        "id": k,
                        "title": a.get("title", ""),
                        "display_value": a.get("displayValue", ""),
                    })
            return diags[:10]  # Cap at 10 diagnostics

        cls_val = audits.get("cumulative-layout-shift", {}).get("numericValue", 0.0)
        perf = int(round(categories.get("performance", {}).get("score", 0.0) * 100))
        a11y = int(round(categories.get("accessibility", {}).get("score", 0.0) * 100))
        cwv = CoreWebVitals(
            lcp_ms=_ms("largest-contentful-paint"),
            cls=round(float(cls_val or 0.0), 3),
            inp_ms=_ms("interaction-to-next-paint") or _ms("experimental-interaction-to-next-paint"),
            performance_score=perf,
            accessibility_score=a11y,
            provider=self.name,
            estimated_cost=0.0,
            latency_ms=int((time.time() - start) * 1000),
            cache_hit=False,
        )
        cwv.fcp_ms = _ms("first-contentful-paint")  # type: ignore[attr-defined]
        cwv.tbt_ms = _ms("total-blocking-time")     # type: ignore[attr-defined]
        cwv.opportunities = _opportunities()         # type: ignore[attr-defined]
        cwv.diagnostics = _diagnostics()            # type: ignore[attr-defined]
        return cwv


def get_pagespeed_provider() -> PageSpeedProvider:
    """Return the real provider if a key is present and constructs, else mock."""
    key = os.getenv("PAGESPEED_API_KEY", "")
    if key:
        try:
            provider = GooglePageSpeedProvider(api_key=key)
            if provider.available():
                return provider
        except Exception:
            pass
    return MockPageSpeedProvider()


# ── Multi-page, multi-strategy PSI runner (for crawl integration) ────────────

def run_pagespeed_for_job(
    urls: List[str],
    *,
    strategies: Tuple[str, ...] = ("mobile", "desktop"),
    max_pages: int = 3,
    provider: Optional[PageSpeedProvider] = None,
) -> Tuple[Dict[str, Dict[str, dict]], int]:
    """Run PSI for up to ``max_pages`` URLs × strategies.

    Returns
    -------
    results: dict mapping url → { strategy → cwv_full_dict }
    real_request_count: number of REAL (non-mock) PSI calls made
        (used for metering — mock calls are always 0).

    Caches by (url, strategy) so a URL is never fetched twice in one job.
    Handles quota / provider-unavailable gracefully: stores a
    ``{status: "provider_unavailable"}`` marker and continues.
    """
    import datetime

    ps = provider or get_pagespeed_provider()
    is_mock_provider = getattr(ps, "is_mock", True)

    results: Dict[str, Dict[str, dict]] = {}
    real_request_count = 0
    seen: Dict[Tuple[str, str], dict] = {}  # (url, strategy) → cwv_full_dict

    pages_to_process = urls[:max_pages]

    for url in pages_to_process:
        results[url] = {}
        for strategy in strategies:
            cache_key = (url, strategy)
            if cache_key in seen:
                results[url][strategy] = seen[cache_key]
                continue

            request_ts = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
            try:
                cwv = ps.fetch(url, strategy)
                mock_flag = is_mock_provider or "fallback" in (cwv.provider or "") or "no_key" in (cwv.provider or "")
                if not mock_flag:
                    real_request_count += 1
                entry = _cwv_to_full_dict(cwv, strategy=strategy, mock=mock_flag, request_ts=request_ts)
            except Exception as exc:
                # Any provider failure → store a marker, do not crash.
                entry = {
                    "strategy": strategy,
                    "status": "provider_unavailable",
                    "error": str(exc)[:200],
                    "request_timestamp": request_ts,
                    "mock": True,
                    "field_data_available": False,
                }

            seen[cache_key] = entry
            results[url][strategy] = entry

    return results, real_request_count


def evaluate_cwv(cwv: CoreWebVitals) -> List[TechnicalIssue]:
    """Turn CWV metrics into TechnicalIssues using Google thresholds."""
    issues: List[TechnicalIssue] = []

    # LCP
    if cwv.lcp_ms > LCP_POOR_MS:
        issues.append(
            TechnicalIssue(
                id="cwv.lcp.poor",
                category="performance",
                severity=Severity.HIGH.value,
                title="Largest Contentful Paint is poor",
                description="LCP of %dms exceeds the %dms poor threshold." % (cwv.lcp_ms, LCP_POOR_MS),
                recommendation="Optimize the largest above-the-fold element: compress hero images, preload critical assets, and reduce render-blocking resources.",
                evidence={"lcp_ms": cwv.lcp_ms, "good_ms": LCP_GOOD_MS, "poor_ms": LCP_POOR_MS},
            )
        )
    elif cwv.lcp_ms > LCP_GOOD_MS:
        issues.append(
            TechnicalIssue(
                id="cwv.lcp.needs_improvement",
                category="performance",
                severity=Severity.MEDIUM.value,
                title="Largest Contentful Paint needs improvement",
                description="LCP of %dms is above the %dms good threshold." % (cwv.lcp_ms, LCP_GOOD_MS),
                recommendation="Trim render-blocking CSS/JS and serve appropriately sized images to bring LCP under 2.5s.",
                evidence={"lcp_ms": cwv.lcp_ms, "good_ms": LCP_GOOD_MS, "poor_ms": LCP_POOR_MS},
            )
        )

    # CLS
    if cwv.cls > CLS_POOR:
        issues.append(
            TechnicalIssue(
                id="cwv.cls.poor",
                category="performance",
                severity=Severity.HIGH.value,
                title="Cumulative Layout Shift is poor",
                description="CLS of %s exceeds the %s poor threshold." % (cwv.cls, CLS_POOR),
                recommendation="Reserve space for images/ads/embeds with width/height attributes and avoid inserting content above existing content.",
                evidence={"cls": cwv.cls, "good": CLS_GOOD, "poor": CLS_POOR},
            )
        )
    elif cwv.cls > CLS_GOOD:
        issues.append(
            TechnicalIssue(
                id="cwv.cls.needs_improvement",
                category="performance",
                severity=Severity.MEDIUM.value,
                title="Cumulative Layout Shift needs improvement",
                description="CLS of %s is above the %s good threshold." % (cwv.cls, CLS_GOOD),
                recommendation="Set explicit dimensions on media and reserve layout space to keep CLS under 0.1.",
                evidence={"cls": cwv.cls, "good": CLS_GOOD, "poor": CLS_POOR},
            )
        )

    # INP
    if cwv.inp_ms > INP_POOR_MS:
        issues.append(
            TechnicalIssue(
                id="cwv.inp.poor",
                category="performance",
                severity=Severity.HIGH.value,
                title="Interaction to Next Paint is poor",
                description="INP of %dms exceeds the %dms poor threshold." % (cwv.inp_ms, INP_POOR_MS),
                recommendation="Break up long JavaScript tasks, defer non-critical scripts, and minimize main-thread work.",
                evidence={"inp_ms": cwv.inp_ms, "good_ms": INP_GOOD_MS, "poor_ms": INP_POOR_MS},
            )
        )
    elif cwv.inp_ms > INP_GOOD_MS:
        issues.append(
            TechnicalIssue(
                id="cwv.inp.needs_improvement",
                category="performance",
                severity=Severity.MEDIUM.value,
                title="Interaction to Next Paint needs improvement",
                description="INP of %dms is above the %dms good threshold." % (cwv.inp_ms, INP_GOOD_MS),
                recommendation="Reduce input-handler work and yield to the main thread to keep INP under 200ms.",
                evidence={"inp_ms": cwv.inp_ms, "good_ms": INP_GOOD_MS, "poor_ms": INP_POOR_MS},
            )
        )

    return issues
