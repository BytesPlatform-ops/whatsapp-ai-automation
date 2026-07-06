"""SEO one-tap optimize — prepare (approval) → apply (executor).

Only content issues on a CONNECTED, supported platform become one-tap approvals;
everything else returns copy-ready / manual / unsupported honestly (no fake fix).
On approve, the seo-agent executor applies the change through the real connector,
records a SeoOptimizationAction (old + new value), and marks the issue done.
"""

from __future__ import annotations

import secrets
from datetime import datetime, timezone

import persistence
from approvals.router import ApprovalItem, create_approval, register_executor_for

from . import audit_agent as aa
from . import website_connections as wc
from . import wp_connector

AGENT_SLUG = "seo-agent"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _actions():
    return aa.repos().actions


def suggest_value(issue: dict) -> str:
    """A heuristic starting value for the fix (the user can edit before approving)."""
    ev = (issue.get("recommended_fix_json") or {}).get("evidence") or {}
    engine_id = (issue.get("recommended_fix_json") or {}).get("engine_id", "") or ""
    if engine_id.startswith("meta.title"):
        title = (ev.get("title") or "").strip()
        return (title[:57] + "…") if len(title) > 60 else (title or "Your page title")
    if engine_id.startswith("meta.description"):
        return "Add a clear 150–160 character description with your main service keyword."
    if issue.get("category") == "images":
        return "Descriptive alt text for this image."
    return issue.get("fix_one_liner", "")


def prepare(tenant_id: str, audit_id: str, issue_id: str, new_value: str = "", now: str = "") -> dict:
    issue = aa.get_issue(tenant_id, issue_id)
    if not issue:
        return {"status": "not_found", "message": "Issue not found."}

    fix_mode = issue.get("fix_mode")
    suggestion = new_value or suggest_value(issue)

    # Nothing to apply for these — hand back copy-ready text.
    if fix_mode in ("copy_ready", "manual_only", "unsupported"):
        return {"status": fix_mode, "issue_id": issue_id, "copy_text": suggestion,
                "message": {
                    "copy_ready": "Connect this website to apply with one tap. For now, copy this fix.",
                    "manual_only": "This change is manual/risky — apply it yourself in your site settings.",
                    "unsupported": "This platform's API can't apply this field — copy the fix instead.",
                }.get(fix_mode, "")}

    # auto_fix / approval_required → file an approval (all live changes are gated).
    platform = issue.get("platform")
    approval = create_approval(
        tenant_id, AGENT_SLUG,
        title=f"SEO fix: {issue.get('issue')} on {issue.get('page_url')}",
        action_type="seo_optimize", description=issue.get("fix_one_liner", "")[:140], created_at=now,
        risk_level="medium" if fix_mode == "approval_required" else "low",
        capability="seo_optimize", tool=f"{platform}_connector",
        prepared_output={
            "issue_id": issue_id, "audit_id": audit_id, "platform": platform,
            "page_url": issue.get("page_url"), "field": issue.get("category"),
            "old_value": ((issue.get("recommended_fix_json") or {}).get("evidence") or {}).get("title", ""),
            "new_value": suggestion, "will_apply_to": issue.get("page_url"),
            "as_pull_request": platform == "custom",
            "execution_actions": [{"capability": "seo_optimize", "payload": {
                "platform": platform, "issue_id": issue_id, "audit_id": audit_id,
                "page_url": issue.get("page_url"), "new_value": suggestion}}],
        },
        preview=suggestion[:120],
    )
    issue["status"] = "pending_approval"
    issue["approval_id"] = approval.id
    aa.save_issue(tenant_id, issue)
    return {"status": "approval_required", "approval_id": approval.id, "fix_mode": fix_mode,
            "new_value": suggestion, "platform": platform}


def apply_now(tenant_id: str, approval_id: str, now: str = "") -> dict:
    """Convenience: approve an SEO optimize approval (executor applies it)."""
    from approvals.router import approve, ResolveBody
    return approve(approval_id, ResolveBody(tenant_id=tenant_id, now=now)).model_dump()


def _execute_seo(item: ApprovalItem) -> dict:
    """seo-agent executor — apply the approved fix through the real connector."""
    action = ((item.prepared_output or {}).get("execution_actions") or [{}])[0]
    payload = action.get("payload", {})
    tenant = item.tenant_id
    platform = payload.get("platform")
    issue = aa.get_issue(tenant, payload.get("issue_id", ""))
    new_value = payload.get("new_value", "")

    conn = wc.get_connection(tenant, platform)
    if not conn:
        result = {"status": "blocked", "error": "missing_connection",
                  "message": f"{platform} is not connected — cannot apply for real."}
    elif platform == "wordpress":
        result = wp_connector.apply_fix(conn, issue or {}, new_value)
    elif platform == "custom":
        result = {"status": "unsupported", "error": "pr_not_wired",
                  "message": "GitHub PR creation lands with the custom-site connector."}
    else:
        result = {"status": "unsupported", "error": "connector_pending",
                  "message": f"The {platform} apply connector is not wired yet — copy the fix for now."}

    # Record the optimization action (old → new) + update the issue.
    aid = f"opt_{secrets.token_hex(6)}"
    _actions().upsert(persistence.envelope(aid, tenant, {
        "id": aid, "tenant_id": tenant, "audit_id": payload.get("audit_id"),
        "issue_id": payload.get("issue_id"), "platform": platform, "provider": result.get("provider", platform),
        "page_url": payload.get("page_url"), "field": result.get("field", issue.get("category") if issue else ""),
        "old_value": result.get("old_value", ""), "new_value": new_value,
        "status": result.get("status"), "verified": result.get("status") == "success",
        "approval_id": item.id, "created_at": _now(),
    }))
    if issue:
        issue["status"] = "done" if result.get("status") == "success" else (
            "blocked" if result.get("status") == "blocked" else "failed")
        aa.save_issue(tenant, issue)

    ok = result.get("status") == "success"
    detail = ("SEO fix applied to your live site." if ok else
              f"Fix not applied: {result.get('message') or result.get('status')}")
    return {"ok": ok, "mode": "real" if ok else "mock", "executed": ok, "results": [result], "detail": detail}


register_executor_for(AGENT_SLUG, _execute_seo)
