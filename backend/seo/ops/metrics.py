"""Lightweight in-process structured metrics registry for SEO operations.

Provides:
  incr(name, **labels)          — increment a named counter by 1.
  observe(name, ms, **labels)   — record a latency observation (ms).
  snapshot()                    — return a tenant-safe point-in-time snapshot.
  reset()                       — reset all metrics (test use only).

Labels are tenant-safe: tenant values are HASHED (sha1 prefix) before storage.
NEVER record content, token text, emails, review text, or raw domain names.

Gated by SEO_METRICS_ENABLED env var: when "0"/"false"/"no"/"off" the module
records nothing and snapshot() returns empty dicts. Defaults to enabled.

Supported metric names (canonical set — callers may add others):
  Crawl:
    seo.crawl.jobs, seo.crawl.pages, seo.crawl.failures
  Provider:
    seo.provider.calls, seo.provider.errors, seo.provider.latency_ms
  Scheduler:
    seo.scheduler.backlog, seo.scheduler.job_duration_ms,
    seo.scheduler.lock_recoveries
  Rank/Google/Backlinks/Citations:
    seo.rank.jobs, seo.google.sync.jobs, seo.backlinks.jobs, seo.citations.jobs
  Outreach:
    seo.outreach.sends, seo.outreach.bounces
  PDF:
    seo.pdf.generations, seo.pdf.failures
  Billing:
    seo.billing.reservations, seo.billing.settlements, seo.billing.releases
  Rate limiting / security:
    seo.rate_limit.blocks, seo.ssrf.blocks, seo.tenant_access.denials
"""

from __future__ import annotations

import hashlib
import os
import threading
import time
from collections import defaultdict
from typing import Any, Dict, List, Optional


# ── Enabled gate ──────────────────────────────────────────────────────────────

def _enabled() -> bool:
    val = os.getenv("SEO_METRICS_ENABLED", "1").strip().lower()
    return val not in ("0", "false", "no", "off")


# ── Tenant hashing ────────────────────────────────────────────────────────────

def _hash_tenant(tenant_id: str) -> str:
    """Return a short sha1-based hash of the tenant id — never the raw value."""
    if not tenant_id:
        return "unknown"
    h = hashlib.sha1(tenant_id.encode("utf-8")).hexdigest()
    return "t_" + h[:12]


def _safe_labels(labels: Dict[str, Any]) -> Dict[str, str]:
    """Return a copy of labels with any 'tenant' key hashed and all values str-ified."""
    safe: Dict[str, str] = {}
    for k, v in labels.items():
        if k in ("tenant", "tenant_id"):
            safe[k] = _hash_tenant(str(v))
        else:
            safe[k] = str(v)
    return safe


def _label_key(labels: Dict[str, str]) -> str:
    return ",".join(f"{k}={v}" for k, v in sorted(labels.items()))


# ── Registry ──────────────────────────────────────────────────────────────────

class _Registry:
    """Thread-safe in-process metrics store."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        # counters: name -> label_key -> int
        self._counters: Dict[str, Dict[str, int]] = defaultdict(lambda: defaultdict(int))
        # histograms: name -> label_key -> list[float]
        self._histograms: Dict[str, Dict[str, List[float]]] = defaultdict(lambda: defaultdict(list))

    def incr(self, name: str, **labels: Any) -> None:
        if not _enabled():
            return
        safe = _safe_labels(dict(labels))
        key = _label_key(safe)
        with self._lock:
            self._counters[name][key] += 1

    def observe(self, name: str, ms: float, **labels: Any) -> None:
        if not _enabled():
            return
        safe = _safe_labels(dict(labels))
        key = _label_key(safe)
        with self._lock:
            self._histograms[name][key].append(float(ms))

    def snapshot(self) -> Dict[str, Any]:
        """Return a JSON-serializable point-in-time snapshot.

        Counters: {"name": {"labels_string": count, ...}, ...}
        Histograms (latency): summarised to count/sum/min/max/p50/p95/p99.
        """
        with self._lock:
            counters = {
                name: dict(series)
                for name, series in self._counters.items()
            }
            histograms = {}
            for name, series in self._histograms.items():
                hist_series: Dict[str, Any] = {}
                for label_key, values in series.items():
                    if not values:
                        continue
                    sorted_v = sorted(values)
                    n = len(sorted_v)
                    hist_series[label_key] = {
                        "count": n,
                        "sum_ms": round(sum(sorted_v), 3),
                        "min_ms": round(sorted_v[0], 3),
                        "max_ms": round(sorted_v[-1], 3),
                        "p50_ms": round(sorted_v[int(n * 0.50)], 3),
                        "p95_ms": round(sorted_v[int(n * 0.95)], 3),
                        "p99_ms": round(sorted_v[min(int(n * 0.99), n - 1)], 3),
                    }
                if hist_series:
                    histograms[name] = hist_series

        return {
            "enabled": _enabled(),
            "counters": counters,
            "histograms": histograms,
        }

    def reset(self) -> None:
        """Reset all metrics. Intended for test teardown only."""
        with self._lock:
            self._counters.clear()
            self._histograms.clear()


# Module-level singleton
_registry = _Registry()


# ── Public API ────────────────────────────────────────────────────────────────

def incr(name: str, **labels: Any) -> None:
    """Increment a counter.

    Args:
        name:    Metric name (e.g. "seo.crawl.jobs").
        **labels: Arbitrary key=value labels. ``tenant``/``tenant_id`` are hashed.
    """
    _registry.incr(name, **labels)


def observe(name: str, ms: float, **labels: Any) -> None:
    """Record a latency observation in milliseconds.

    Args:
        name:    Histogram name (e.g. "seo.provider.latency_ms").
        ms:      Duration in milliseconds.
        **labels: Arbitrary key=value labels. ``tenant``/``tenant_id`` are hashed.
    """
    _registry.observe(name, ms, **labels)


def snapshot() -> Dict[str, Any]:
    """Return a tenant-safe point-in-time metrics snapshot."""
    return _registry.snapshot()


def reset() -> None:
    """Reset all metrics. Test use only."""
    _registry.reset()


# ── Context manager for timing ────────────────────────────────────────────────

class _Timer:
    """Context manager that records elapsed time as a histogram observation."""

    def __init__(self, name: str, labels: Dict[str, Any]) -> None:
        self._name = name
        self._labels = labels
        self._start: Optional[float] = None

    def __enter__(self) -> "_Timer":
        self._start = time.monotonic()
        return self

    def __exit__(self, *_: Any) -> None:
        if self._start is not None:
            elapsed_ms = (time.monotonic() - self._start) * 1000.0
            observe(self._name, elapsed_ms, **self._labels)


def timer(name: str, **labels: Any) -> _Timer:
    """Return a context manager that records elapsed time as a histogram.

    Usage:
        with metrics.timer("seo.provider.latency_ms", provider="gsc", tenant="t1"):
            result = provider.call()
    """
    return _Timer(name, labels)
