"""Metrics providers + sync — PURE STDLIB.

A :class:`MetricsProvider` fetches engagement metrics for a published post.
:class:`MockMetricsProvider` derives a full, plausible metric set deterministically
from ``sha1(tenant_id|post_ref)`` — no randomness, no clock — so the analytics
pipeline and its tests are fully reproducible and cost $0.

:class:`HttpMetricsProvider` is env-gated (``META_INSIGHTS_TOKEN``). The real
urllib call is marked ``# pragma: no cover`` and, on ANY failure (or when the
token is absent), it degrades to the mock so the pipeline never stalls. The
token is read via :func:`os.getenv` and is NEVER logged or echoed.

Every public function NEVER raises.
"""

from __future__ import annotations

import hashlib
import os
from abc import ABC, abstractmethod
from typing import Dict, List, Optional


# ----------------------------------------------------------------------
# Deterministic seeding
# ----------------------------------------------------------------------
def _seed(text: str) -> int:
    """Stable, deterministic 160-bit seed from text."""
    return int(hashlib.sha1((text or "").encode("utf-8")).hexdigest(), 16)


def _scale(seed: int, lo: int, hi: int) -> int:
    """Map a seed into the inclusive integer range [lo, hi]."""
    if hi <= lo:
        return lo
    span = hi - lo + 1
    return lo + (seed % span)


def _ratio(seed: int, lo: float, hi: float) -> float:
    """Map a seed into the inclusive float range [lo, hi], rounded to 4 dp."""
    if hi <= lo:
        return round(lo, 4)
    # 0..9999 resolution keeps it deterministic and bounded.
    frac = (seed % 10000) / 9999.0
    return round(lo + frac * (hi - lo), 4)


# ----------------------------------------------------------------------
# Provider interface
# ----------------------------------------------------------------------
class MetricsProvider(ABC):
    """Fetches engagement metrics for a single published post."""

    name = "base"

    @abstractmethod
    def fetch(self, tenant_id: str, post_ref: str) -> Dict[str, object]:
        """Return a dict of metric fields for ``post_ref`` under ``tenant_id``."""
        raise NotImplementedError


# ----------------------------------------------------------------------
# Mock provider — deterministic, plausible ranges
# ----------------------------------------------------------------------
class MockMetricsProvider(MetricsProvider):
    """Deterministic metrics derived from ``sha1(tenant_id|post_ref)``.

    All fields are pure functions of the inputs — no randomness, no time — so a
    given ``(tenant_id, post_ref)`` always yields the same numbers. Counts are
    kept internally consistent (likes <= views, etc.) and within plausible
    social-engagement ranges.
    """

    name = "mock"

    def fetch(self, tenant_id: str, post_ref: str) -> Dict[str, object]:
        base = _seed("{0}|{1}".format(tenant_id or "", post_ref or ""))

        views = _scale(base, 100, 50000)

        # Engagement counts are bounded fractions of views so they stay coherent.
        likes = min(views, int(views * _ratio(base // 3, 0.02, 0.18)))
        comments = min(likes, int(views * _ratio(base // 7, 0.001, 0.03)))
        shares = min(likes, int(views * _ratio(base // 11, 0.001, 0.04)))
        saves = min(likes, int(views * _ratio(base // 13, 0.002, 0.06)))
        clicks = min(views, int(views * _ratio(base // 17, 0.005, 0.09)))
        follows = min(clicks, int(views * _ratio(base // 19, 0.0005, 0.02)))
        leads = min(clicks, int(clicks * _ratio(base // 23, 0.0, 0.25)))

        completion_rate = _ratio(base // 29, 0.2, 0.95)
        # Watch time (seconds) scales with completion on a ~15-45s short.
        length_s = _scale(base // 31, 12, 45)
        watch_time = round(length_s * completion_rate, 2)

        return {
            "provider": self.name,
            "views": views,
            "likes": likes,
            "comments": comments,
            "shares": shares,
            "saves": saves,
            "watch_time": watch_time,
            "completion_rate": completion_rate,
            "clicks": clicks,
            "follows": follows,
            "leads": leads,
        }


# ----------------------------------------------------------------------
# HTTP provider — env-gated, degrades to mock
# ----------------------------------------------------------------------
class HttpMetricsProvider(MetricsProvider):
    """Real Meta Insights provider, gated on ``META_INSIGHTS_TOKEN``.

    When the token is absent the provider is *unavailable* and :meth:`fetch`
    transparently returns mock metrics. The live HTTP path is excluded from
    coverage and is itself wrapped so any network/parse failure falls back to
    mock. The token is never logged.
    """

    name = "http"

    def __init__(self, token: Optional[str] = None) -> None:
        # Read lazily via os.getenv; store only a presence flag's worth of state.
        self._token = token if token is not None else os.getenv("META_INSIGHTS_TOKEN")
        self._mock = MockMetricsProvider()

    def available(self) -> bool:
        """True only when an insights token is configured."""
        return bool(self._token)

    def fetch(self, tenant_id: str, post_ref: str) -> Dict[str, object]:
        if not self.available():
            return self._mock.fetch(tenant_id, post_ref)
        try:
            live = self._fetch_live(tenant_id, post_ref)  # pragma: no cover
            if isinstance(live, dict) and live:  # pragma: no cover
                return live  # pragma: no cover
        except Exception:  # pragma: no cover
            pass  # pragma: no cover
        # Any failure (or empty payload) degrades to deterministic mock.
        return self._mock.fetch(tenant_id, post_ref)

    def _fetch_live(self, tenant_id: str, post_ref: str) -> Dict[str, object]:  # pragma: no cover
        """Live Meta Insights call. Never logs the token. Excluded from coverage."""
        import json
        import urllib.parse
        import urllib.request

        fields = "impressions,reactions,comments,shares,saved,video_views,clips_replays_count"
        query = urllib.parse.urlencode({
            "metric": fields,
            "access_token": self._token,
        })
        url = "https://graph.facebook.com/v19.0/{0}/insights?{1}".format(
            urllib.parse.quote(str(post_ref)), query
        )
        req = urllib.request.Request(url, headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=10) as resp:  # noqa: S310
            payload = json.loads(resp.read().decode("utf-8"))
        return self._coerce_live(tenant_id, post_ref, payload)

    def _coerce_live(self, tenant_id, post_ref, payload):  # pragma: no cover
        """Normalize a Graph Insights payload into our metric schema."""
        values: Dict[str, int] = {}
        for item in (payload or {}).get("data", []):
            name = item.get("name")
            series = item.get("values") or []
            if name and series:
                try:
                    values[name] = int(series[-1].get("value", 0))
                except Exception:
                    values[name] = 0
        views = values.get("video_views", values.get("impressions", 0))
        return {
            "provider": self.name,
            "views": views,
            "likes": values.get("reactions", 0),
            "comments": values.get("comments", 0),
            "shares": values.get("shares", 0),
            "saves": values.get("saved", 0),
            "watch_time": 0.0,
            "completion_rate": 0.0,
            "clicks": 0,
            "follows": 0,
            "leads": 0,
        }


# ----------------------------------------------------------------------
# Provider selection + sync
# ----------------------------------------------------------------------
def get_metrics_provider() -> MetricsProvider:
    """Return the active metrics provider.

    Mock by default. When ``META_INSIGHTS_TOKEN`` is set, the HTTP provider is
    returned (it still degrades to mock on any live failure). Never raises.
    """
    try:
        http = HttpMetricsProvider()
        if http.available():
            return http
    except Exception:
        pass
    return MockMetricsProvider()


def sync_metrics(tenant_id: str, post_refs: List[str]) -> List[Dict[str, object]]:
    """Fetch metrics for each ``post_ref`` via the active provider.

    Returns a list of metric dicts, each carrying ``tenant_id`` and ``post_ref``.
    Deterministic (mock path) and NEVER raises — a per-post failure yields a
    mock-backed row so the result length always matches the input.
    """
    out: List[Dict[str, object]] = []
    refs = post_refs if isinstance(post_refs, (list, tuple)) else []
    try:
        provider = get_metrics_provider()
    except Exception:
        provider = MockMetricsProvider()
    fallback = MockMetricsProvider()
    for post_ref in refs:
        ref = "" if post_ref is None else str(post_ref)
        try:
            metrics = provider.fetch(tenant_id, ref)
            if not isinstance(metrics, dict):
                metrics = fallback.fetch(tenant_id, ref)
        except Exception:
            try:
                metrics = fallback.fetch(tenant_id, ref)
            except Exception:
                metrics = {}
        row: Dict[str, object] = dict(metrics)
        row["tenant_id"] = tenant_id
        row["post_ref"] = ref
        out.append(row)
    return out
