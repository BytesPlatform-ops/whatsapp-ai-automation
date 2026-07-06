"""Platform-aware SEO audit agent — real crawl, real checks, no mock.

Fetches the public page (httpx), detects the platform, runs the EXISTING SEO
engine (`seo.mode_external.audit_url` with an injected working fetcher), then
turns each finding into a one-line issue + one-line fix with a `fix_mode` that
depends on the platform and whether the site is connected:

    manual_only     — risky/technical (robots, canonical, redirects) — never auto
    copy_ready      — fixable content, but the site isn't connected yet
    auto_fix        — connected + platform supports it → one-tap (approval-gated)
    approval_required — custom site → prepared as a GitHub PR
    unsupported     — connected but the platform's API can't touch this field

Everything persists (seo_audits / seo_pages / seo_issues) through the shared
layer, so audits + issues survive restart and appear in History.
"""

from __future__ import annotations

import secrets
from datetime import datetime, timezone
from typing import Optional

import persistence
from activity.router import log_activity
from seo.mode_external.ssrf import is_safe_url

from . import website_connections as wc
from .agent_schemas import AuditStartBody
from .httpx_fetch import fetch_full, html_fetcher
from .mode_external import audit_url
from .platform_detector import detect_platform

MANUAL_CATEGORIES = {"technical", "canonical", "mobile", "links"}
CONTENT_CATEGORIES = {"meta", "social", "images", "schema", "headings"}

_IMPACT = {"critical": "high", "high": "high", "medium": "medium", "low": "low", "info": "low"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _normalize(url: str) -> str:
    url = url.strip()
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    return url


def _classify(category: str, platform: str, connected: bool) -> str:
    if category in MANUAL_CATEGORIES or category not in CONTENT_CATEGORIES:
        return "manual_only"
    if not connected:
        return "copy_ready"
    if platform == "custom":
        return "approval_required"  # prepared as a PR, never a live push
    return "auto_fix" if wc.platform_supports(platform, category) else "unsupported"


def _difficulty(fix_mode: str) -> str:
    return {"auto_fix": "easy", "copy_ready": "medium", "approval_required": "medium",
            "manual_only": "hard", "unsupported": "hard"}.get(fix_mode, "medium")


class _Repos:
    """Holds the SEO row repos for the process. One instance so memory-mode data
    persists within a run (mirrors the other stores); reset to None in tests."""

    def __init__(self) -> None:
        self.audits = persistence.table("seo_audits")
        self.issues = persistence.table("seo_issues")
        self.pages = persistence.table("seo_pages")
        self.actions = persistence.table("seo_optimization_actions")


_repos: Optional["_Repos"] = None


def repos() -> "_Repos":
    global _repos
    if _repos is None:
        _repos = _Repos()
    return _repos


def _audits():
    return repos().audits


def _issues():
    return repos().issues


def _pages():
    return repos().pages


async def run_audit(body: AuditStartBody) -> dict:
    tenant = body.tenant_id
    url = _normalize(body.website_url)
    ok, reason = is_safe_url(url)
    if not ok:
        return {"status": "blocked", "reason": reason, "url": url}

    try:
        fetched = fetch_full(url)
    except Exception as exc:  # real network error, surfaced honestly
        return {"status": "fetch_failed", "reason": str(exc)[:200], "url": url}

    platform = detect_platform(fetched["html"], fetched["headers"], fetched["final_url"])
    p = platform["detected_platform"]
    connected = wc.is_connected(tenant, p)

    report = audit_url(fetched["final_url"], fetcher=html_fetcher(fetched["html"]), skip_dns=True)
    if report.get("error"):
        return {"status": report["error"], "reason": report.get("reason"), "url": url}

    score = report["score"]
    audit_id = f"audit_{secrets.token_hex(6)}"

    # Flatten issues (grouped by severity) and structure each one.
    counts = {"auto_fix": 0, "copy_ready": 0, "approval_required": 0, "manual_only": 0, "unsupported": 0}
    issue_rows = []
    for sev_bucket in report["issues"].values():
        for i in sev_bucket:
            cat = i.get("category", "technical")
            fix_mode = _classify(cat, p, connected)
            counts[fix_mode] = counts.get(fix_mode, 0) + 1
            rec = {
                "id": f"iss_{secrets.token_hex(6)}", "tenant_id": tenant, "audit_id": audit_id,
                "page_url": fetched["final_url"], "platform": p, "category": cat,
                "severity": i.get("severity", "low"),
                "issue": i.get("title", i.get("id", "SEO issue")),
                "one_liner": i.get("description", ""),
                "fix_one_liner": i.get("recommendation", "Review and fix this issue."),
                "impact": _IMPACT.get(i.get("severity", "low"), "low"),
                "difficulty": _difficulty(fix_mode),
                "fix_mode": fix_mode,
                "auto_fix_available": fix_mode in ("auto_fix", "approval_required"),
                "connection_required": cat in CONTENT_CATEGORIES and cat not in MANUAL_CATEGORIES,
                "status": "open",
                "recommended_fix_json": {"engine_id": i.get("id"), "evidence": i.get("evidence"),
                                          "suggested": i.get("fix")},
                "created_at": _now(),
            }
            issue_rows.append(rec)
            _issues().upsert(persistence.envelope(rec["id"], tenant, rec, rec["created_at"]))

    audit = {
        "id": audit_id, "tenant_id": tenant, "website_url": url, "final_url": fetched["final_url"],
        "platform": p, "platform_confidence": platform["confidence"], "platform_evidence": platform["evidence"],
        "connected": connected, "score": score.get("score"), "max_score": score.get("max_score", 100),
        "category_scores": score.get("by_category", {}), "counts": counts,
        "issue_count": len(issue_rows), "created_at": _now(),
    }
    _audits().upsert(persistence.envelope(audit_id, tenant, audit, audit["created_at"]))
    _pages().upsert(persistence.envelope(f"page_{secrets.token_hex(6)}", tenant,
                                         {"audit_id": audit_id, "url": fetched["final_url"],
                                          "score": score.get("score"), "issue_count": len(issue_rows)}))
    log_activity(tenant, "seo_audit", title=f"Audited {url} ({p}, score {score.get('score')})",
                 agent="seo-agent", created_at=body.now)

    return {"status": "complete", "audit": audit, "platform": platform, "issues": issue_rows}


def get_audit(tenant_id: str, audit_id: str) -> Optional[dict]:
    row = _audits().get(tenant_id, audit_id)
    return row["data"] if row else None


def list_issues(tenant_id: str, audit_id: str) -> list[dict]:
    return [r["data"] for r in _issues().list_by_tenant(tenant_id) if r["data"].get("audit_id") == audit_id]


def get_issue(tenant_id: str, issue_id: str) -> Optional[dict]:
    row = _issues().get(tenant_id, issue_id)
    return row["data"] if row else None


def save_issue(tenant_id: str, issue: dict) -> None:
    _issues().upsert(persistence.envelope(issue["id"], tenant_id, issue, issue.get("created_at")))


def list_pages(tenant_id: str, audit_id: str) -> list[dict]:
    return [r["data"] for r in _pages().list_by_tenant(tenant_id) if r["data"].get("audit_id") == audit_id]


def list_history(tenant_id: str) -> list[dict]:
    return [r["data"] for r in reversed(_audits().list_by_tenant(tenant_id))]
