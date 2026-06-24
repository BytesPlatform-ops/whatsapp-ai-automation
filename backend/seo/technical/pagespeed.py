from __future__ import annotations

import hashlib
import json
import os
import time
import urllib.parse
import urllib.request
from typing import List

from seo.schemas import Severity

from .models import CoreWebVitals, TechnicalIssue


# Google Core Web Vitals thresholds (lab/field guidance).
LCP_GOOD_MS = 2500
LCP_POOR_MS = 4000
CLS_GOOD = 0.1
CLS_POOR = 0.25
INP_GOOD_MS = 200
INP_POOR_MS = 500


def _hash_ints(url: str, count: int = 6) -> List[int]:
    """Deterministic, evenly-distributed ints derived from sha1(url)."""
    digest = hashlib.sha1((url or "").encode("utf-8")).digest()
    # Use disjoint byte windows so each metric is independent but stable.
    return [digest[i % len(digest)] for i in range(count)]


class PageSpeedProvider:
    """Abstract provider returning CoreWebVitals for a url."""

    name = "abstract"

    def fetch(self, url: str) -> CoreWebVitals:  # pragma: no cover - abstract
        raise NotImplementedError


class MockPageSpeedProvider(PageSpeedProvider):
    """Deterministic CWV derived from sha1(url). No network, no randomness."""

    name = "mock"

    def fetch(self, url: str) -> CoreWebVitals:
        b = _hash_ints(url, 6)
        # Map bytes (0-255) into the documented ranges, deterministically.
        lcp = 1500 + int(b[0] / 255 * 3500)          # 1500-5000 ms
        cls = round(b[1] / 255 * 0.4, 3)             # 0.0-0.4
        inp = 100 + int(b[2] / 255 * 400)            # 100-500 ms
        perf = 50 + int(b[3] / 255 * 50)             # 50-100
        a11y = 50 + int(b[4] / 255 * 50)             # 50-100
        return CoreWebVitals(
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


class GooglePageSpeedProvider(PageSpeedProvider):
    """Real PageSpeed Insights provider. Reads PAGESPEED_API_KEY from env.

    The HTTP path is documented but intentionally NOT exercised offline — when
    no key is present (`available()` is False) callers fall back to the mock.
    Even with a key, any failure degrades to the mock so public callers never
    raise on normal input.
    """

    name = "google_pagespeed"
    ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed"

    def __init__(self, api_key: str = "") -> None:
        self.api_key = api_key or os.getenv("PAGESPEED_API_KEY", "")

    def available(self) -> bool:
        return bool(self.api_key)

    def fetch(self, url: str) -> CoreWebVitals:
        if not self.available():
            # Degrade rather than raise.
            return MockPageSpeedProvider().fetch(url)
        start = time.time()
        try:
            params = urllib.parse.urlencode(
                {
                    "url": url,
                    "key": self.api_key,
                    "category": "performance",
                    "strategy": "mobile",
                }
            )
            req = urllib.request.Request(self.ENDPOINT + "?" + params)
            # NOTE: never run offline. Real network call.
            with urllib.request.urlopen(req, timeout=20) as resp:  # pragma: no cover
                payload = json.loads(resp.read().decode("utf-8"))
            return self._parse(url, payload, start)
        except Exception:  # pragma: no cover - network/parse failure -> mock
            cwv = MockPageSpeedProvider().fetch(url)
            cwv.provider = self.name + ":fallback"
            cwv.latency_ms = int((time.time() - start) * 1000)
            return cwv

    def _parse(self, url: str, payload: dict, start: float) -> CoreWebVitals:  # pragma: no cover
        lighthouse = payload.get("lighthouseResult", {})
        audits = lighthouse.get("audits", {})
        categories = lighthouse.get("categories", {})

        def _ms(audit_id: str) -> int:
            num = audits.get(audit_id, {}).get("numericValue", 0)
            return int(num or 0)

        cls_val = audits.get("cumulative-layout-shift", {}).get("numericValue", 0.0)
        perf = int(round(categories.get("performance", {}).get("score", 0.0) * 100))
        a11y = int(round(categories.get("accessibility", {}).get("score", 0.0) * 100))
        return CoreWebVitals(
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
