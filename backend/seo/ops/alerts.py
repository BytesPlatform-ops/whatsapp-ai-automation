"""SEO operational alert definitions and evaluation.

Alert conditions evaluated from metrics state (no live provider calls):

  SCHEDULER_HEARTBEAT_MISSING    — scheduler enabled but last heartbeat too old.
  SCHEDULER_BACKLOG_STALE        — oldest due job older than threshold.
  PROVIDER_REPEATED_FAILURES     — repeated provider errors in metrics.
  SUPABASE_UNAVAILABLE           — persistence backend is supabase but not durable.
  MIGRATION_MISMATCH             — migrations required but not applied.
  ENCRYPTION_NOT_READY           — token encryption required but not active.
  HIGH_CRAWL_FAILURE_RATE        — crawl failure counter too high vs total.
  HIGH_BILLING_RECON_COUNT       — billing reconciliation counter exceeded.
  DUPLICATE_JOB_CLAIM            — stale-lock-recovery count too high.
  OUTREACH_SEND_FAILURE_SPIKE    — outreach bounce rate exceeded.
  PDF_FAILURE_SPIKE              — PDF failure rate exceeded.
  OAUTH_REFRESH_FAILURE_SPIKE    — OAuth-related provider errors too high.
  GBP_DISCONNECTED_SPIKE         — GBP provider errors spike.

Thresholds are env-configurable (SEO_ALERT_THRESHOLD_*).
Emits structured event dicts — no external network calls.

If receptionist/providers/notify.py exists it is noted in the docstring below;
this module only produces structured dicts. Sending them to a notification
channel is the caller's responsibility.
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


# ── Thresholds (env-overridable) ──────────────────────────────────────────────

def _threshold(name: str, default: float) -> float:
    try:
        return float(os.getenv(f"SEO_ALERT_THRESHOLD_{name}", str(default)))
    except (ValueError, TypeError):
        return default


# Scheduler heartbeat: how many seconds without a heartbeat triggers an alert.
SCHEDULER_HEARTBEAT_MAX_AGE_S = lambda: _threshold("SCHEDULER_HEARTBEAT_MAX_AGE_S", 300)

# Backlog: how many seconds old the oldest job may be before alerting.
SCHEDULER_BACKLOG_MAX_AGE_S = lambda: _threshold("SCHEDULER_BACKLOG_MAX_AGE_S", 600)

# Provider: minimum error count to trigger repeated-failure alert.
PROVIDER_FAILURE_COUNT_MIN = lambda: int(_threshold("PROVIDER_FAILURE_COUNT_MIN", 5))

# Crawl failure rate: fraction of failures / total crawl jobs.
CRAWL_FAILURE_RATE_MAX = lambda: _threshold("CRAWL_FAILURE_RATE_MAX", 0.5)

# Billing recon: absolute count of reconciliation events.
BILLING_RECON_COUNT_MAX = lambda: int(_threshold("BILLING_RECON_COUNT_MAX", 100))

# Duplicate job claim: stale lock recoveries above this threshold.
DUPLICATE_JOB_CLAIM_MAX = lambda: int(_threshold("DUPLICATE_JOB_CLAIM_MAX", 10))

# Outreach bounce rate fraction.
OUTREACH_BOUNCE_RATE_MAX = lambda: _threshold("OUTREACH_BOUNCE_RATE_MAX", 0.2)

# PDF failure: fraction of failures vs generations.
PDF_FAILURE_RATE_MAX = lambda: _threshold("PDF_FAILURE_RATE_MAX", 0.3)

# OAuth refresh failures (provider errors).
OAUTH_FAILURE_COUNT_MAX = lambda: int(_threshold("OAUTH_FAILURE_COUNT_MAX", 5))

# GBP errors.
GBP_FAILURE_COUNT_MAX = lambda: int(_threshold("GBP_FAILURE_COUNT_MAX", 5))


# ── Alert event builder ───────────────────────────────────────────────────────

def _alert(
    code: str,
    severity: str,
    message: str,
    detail: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    return {
        "code": code,
        "severity": severity,
        "message": message,
        "fired_at": datetime.now(timezone.utc).isoformat(timespec="microseconds"),
        "detail": detail or {},
    }


# ── Helpers ───────────────────────────────────────────────────────────────────

def _seconds_since_iso(iso_str: Optional[str]) -> Optional[float]:
    """Return seconds elapsed since an ISO timestamp, or None if unparseable."""
    if not iso_str:
        return None
    try:
        dt = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
        now = datetime.now(timezone.utc)
        return (now - dt).total_seconds()
    except Exception:
        return None


def _counter_total(counters: Dict[str, Any], metric: str) -> int:
    """Sum all label-series for a metric name."""
    series = counters.get(metric, {})
    return sum(int(v) for v in series.values()) if isinstance(series, dict) else 0


def _counter_for_label(
    counters: Dict[str, Any], metric: str, label_key: str, label_val: str
) -> int:
    """Sum series whose label_key=label_val substring matches."""
    series = counters.get(metric, {})
    total = 0
    if isinstance(series, dict):
        for k, v in series.items():
            if f"{label_key}={label_val}" in k:
                total += int(v)
    return total


# ── Individual alert evaluators ───────────────────────────────────────────────

def _check_scheduler_heartbeat(sched_health: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if not sched_health.get("enabled"):
        return None
    hb = sched_health.get("last_heartbeat")
    age = _seconds_since_iso(hb)
    if age is None or age > SCHEDULER_HEARTBEAT_MAX_AGE_S():
        return _alert(
            "SCHEDULER_HEARTBEAT_MISSING",
            "critical",
            f"SEO scheduler heartbeat missing or too old ({age}s ago).",
            {"last_heartbeat": hb, "age_s": age, "threshold_s": SCHEDULER_HEARTBEAT_MAX_AGE_S()},
        )
    return None


def _check_scheduler_backlog(sched_health: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    oldest = sched_health.get("oldest_due")
    if not oldest:
        return None
    age = _seconds_since_iso(oldest)
    if age is not None and age > SCHEDULER_BACKLOG_MAX_AGE_S():
        return _alert(
            "SCHEDULER_BACKLOG_STALE",
            "warning",
            f"Oldest scheduled job is {age:.0f}s old (threshold {SCHEDULER_BACKLOG_MAX_AGE_S()}s).",
            {"oldest_due": oldest, "age_s": age, "threshold_s": SCHEDULER_BACKLOG_MAX_AGE_S()},
        )
    return None


def _check_provider_failures(counters: Dict[str, Any]) -> List[Dict[str, Any]]:
    alerts: List[Dict[str, Any]] = []
    series = counters.get("seo.provider.errors", {})
    if not isinstance(series, dict):
        return alerts
    # Aggregate by provider label
    provider_counts: Dict[str, int] = {}
    for label_key, count in series.items():
        for part in label_key.split(","):
            if part.startswith("provider="):
                prov = part.split("=", 1)[1]
                provider_counts[prov] = provider_counts.get(prov, 0) + int(count)
    threshold = PROVIDER_FAILURE_COUNT_MIN()
    for prov, count in provider_counts.items():
        if count >= threshold:
            alerts.append(_alert(
                "PROVIDER_REPEATED_FAILURES",
                "warning",
                f"Provider '{prov}' has {count} errors (threshold {threshold}).",
                {"provider": prov, "error_count": count, "threshold": threshold},
            ))
    return alerts


def _check_supabase_unavailable() -> Optional[Dict[str, Any]]:
    try:
        import persistence
        status = persistence.status()
        if status.get("backend") == "supabase" and not status.get("durable", False):
            return _alert(
                "SUPABASE_UNAVAILABLE",
                "critical",
                "PIXIE_PERSIST=supabase but Supabase is not reachable or configured.",
                {"persistence_status": status},
            )
    except Exception as exc:
        return _alert(
            "SUPABASE_UNAVAILABLE",
            "warning",
            f"Could not check Supabase availability: {exc}",
            {},
        )
    return None


def _check_migration_mismatch() -> Optional[Dict[str, Any]]:
    if not os.getenv("SEO_HEALTH_REQUIRE_MIGRATIONS", "").strip().lower() in ("1", "true", "yes", "on"):
        return None
    applied = os.getenv("SEO_MIGRATIONS_APPLIED", "").strip()
    if applied not in ("1", "true", "yes", "ok"):
        return _alert(
            "MIGRATION_MISMATCH",
            "critical",
            "SEO_HEALTH_REQUIRE_MIGRATIONS is set but SEO_MIGRATIONS_APPLIED is not '1'.",
            {"SEO_MIGRATIONS_APPLIED": applied or "<unset>"},
        )
    return None


def _check_encryption_not_ready() -> Optional[Dict[str, Any]]:
    try:
        from seo.google.crypto import encryption_status
        enc = encryption_status()
        if enc.get("required") and not enc.get("active"):
            return _alert(
                "ENCRYPTION_NOT_READY",
                "critical",
                "Token encryption is required (SEO_REQUIRE_TOKEN_ENCRYPTION=1) but not active.",
                {"encryption": enc},
            )
    except Exception as exc:
        return _alert(
            "ENCRYPTION_NOT_READY",
            "warning",
            f"Could not check encryption status: {exc}",
            {},
        )
    return None


def _check_crawl_failure_rate(counters: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    total = _counter_total(counters, "seo.crawl.jobs")
    failures = _counter_total(counters, "seo.crawl.failures")
    if total == 0:
        return None
    rate = failures / total
    threshold = CRAWL_FAILURE_RATE_MAX()
    if rate > threshold:
        return _alert(
            "HIGH_CRAWL_FAILURE_RATE",
            "warning",
            f"Crawl failure rate {rate:.1%} exceeds threshold {threshold:.1%}.",
            {"failures": failures, "total": total, "rate": round(rate, 4), "threshold": threshold},
        )
    return None


def _check_billing_recon(counters: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    count = _counter_total(counters, "seo.billing.settlements")
    threshold = BILLING_RECON_COUNT_MAX()
    if count >= threshold:
        return _alert(
            "HIGH_BILLING_RECON_COUNT",
            "warning",
            f"Billing reconciliation count {count} exceeds threshold {threshold}.",
            {"count": count, "threshold": threshold},
        )
    return None


def _check_duplicate_job_claim(sched_health: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    count = sched_health.get("stale_lock_recoveries", 0)
    threshold = DUPLICATE_JOB_CLAIM_MAX()
    if count >= threshold:
        return _alert(
            "DUPLICATE_JOB_CLAIM",
            "warning",
            f"Stale-lock recoveries ({count}) exceed threshold ({threshold}), indicating duplicate job claims.",
            {"stale_lock_recoveries": count, "threshold": threshold},
        )
    return None


def _check_outreach_send_failure(counters: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    sends = _counter_total(counters, "seo.outreach.sends")
    bounces = _counter_total(counters, "seo.outreach.bounces")
    if sends == 0:
        return None
    rate = bounces / sends
    threshold = OUTREACH_BOUNCE_RATE_MAX()
    if rate > threshold:
        return _alert(
            "OUTREACH_SEND_FAILURE_SPIKE",
            "warning",
            f"Outreach bounce rate {rate:.1%} exceeds threshold {threshold:.1%}.",
            {"sends": sends, "bounces": bounces, "rate": round(rate, 4), "threshold": threshold},
        )
    return None


def _check_pdf_failure(counters: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    total = _counter_total(counters, "seo.pdf.generations")
    failures = _counter_total(counters, "seo.pdf.failures")
    if total == 0:
        return None
    rate = failures / total
    threshold = PDF_FAILURE_RATE_MAX()
    if rate > threshold:
        return _alert(
            "PDF_FAILURE_SPIKE",
            "warning",
            f"PDF failure rate {rate:.1%} exceeds threshold {threshold:.1%}.",
            {"failures": failures, "total": total, "rate": round(rate, 4), "threshold": threshold},
        )
    return None


def _check_oauth_refresh_failure(counters: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    # OAuth errors manifest as provider errors with provider=google_oauth or provider=gbp
    oauth_errors = (
        _counter_for_label(counters, "seo.provider.errors", "provider", "google_oauth")
        + _counter_for_label(counters, "seo.provider.errors", "provider", "gsc")
        + _counter_for_label(counters, "seo.provider.errors", "provider", "ga4")
    )
    threshold = OAUTH_FAILURE_COUNT_MAX()
    if oauth_errors >= threshold:
        return _alert(
            "OAUTH_REFRESH_FAILURE_SPIKE",
            "warning",
            f"OAuth-related provider errors ({oauth_errors}) exceed threshold ({threshold}).",
            {"oauth_errors": oauth_errors, "threshold": threshold},
        )
    return None


def _check_gbp_disconnected(counters: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    gbp_errors = _counter_for_label(counters, "seo.provider.errors", "provider", "gbp")
    threshold = GBP_FAILURE_COUNT_MAX()
    if gbp_errors >= threshold:
        return _alert(
            "GBP_DISCONNECTED_SPIKE",
            "warning",
            f"GBP provider errors ({gbp_errors}) exceed threshold ({threshold}).",
            {"gbp_errors": gbp_errors, "threshold": threshold},
        )
    return None


# ── Main evaluation ───────────────────────────────────────────────────────────

def evaluate_alerts() -> List[Dict[str, Any]]:
    """Evaluate all alert conditions from current metrics state.

    Returns a list of fired alert event dicts (may be empty).
    No external network calls are made.

    Note: receptionist/providers/notify.py handles actual alert delivery;
    this module only produces structured events for the /alerts endpoint
    and for callers that want to forward events to a notification channel.
    """
    from seo.ops.metrics import snapshot as metrics_snapshot

    snap = metrics_snapshot()
    counters: Dict[str, Any] = snap.get("counters", {})

    # Get scheduler health (non-blocking)
    sched_health: Dict[str, Any] = {}
    try:
        from seo.scheduler.runtime import _get_active_instance
        inst = _get_active_instance()
        if inst is not None:
            sched_health = inst.health()
        else:
            # Scheduler not running — check if it should be
            from seo.scheduler.runtime import _scheduler_enabled
            sched_health = {"enabled": _scheduler_enabled(), "running_thread": False}
    except Exception:
        sched_health = {}

    fired: List[Dict[str, Any]] = []

    def _add(result) -> None:
        if result is not None:
            fired.append(result)

    def _add_list(results) -> None:
        for r in results:
            _add(r)

    _add(_check_scheduler_heartbeat(sched_health))
    _add(_check_scheduler_backlog(sched_health))
    _add_list(_check_provider_failures(counters))
    _add(_check_supabase_unavailable())
    _add(_check_migration_mismatch())
    _add(_check_encryption_not_ready())
    _add(_check_crawl_failure_rate(counters))
    _add(_check_billing_recon(counters))
    _add(_check_duplicate_job_claim(sched_health))
    _add(_check_outreach_send_failure(counters))
    _add(_check_pdf_failure(counters))
    _add(_check_oauth_refresh_failure(counters))
    _add(_check_gbp_disconnected(counters))

    return fired
