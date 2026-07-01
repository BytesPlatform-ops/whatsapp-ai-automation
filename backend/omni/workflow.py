"""Omni workflow — the uniform detect → decide → prepare → approve → execute → log path.

`prepare()` produces a deterministic draft per agent (clearly a test-mode draft,
$0, no network). `run()` files a rich approval for it. The executor registered
with the approvals router runs when the item is approved — and stays mock unless
runtime.real_execution_allowed() (production + real, off by default).
"""

from __future__ import annotations

from activity.router import log_activity
from approvals.router import ApprovalItem, create_approval, register_executor
from pixie_units.registry import get_pixie_unit
from runtime.mode import real_execution_allowed, require_approval

from .signals import Route, Signal, route_for


def _agent_name(slug: str) -> str:
    unit = get_pixie_unit(slug)
    return unit["name"] if unit else slug


def prepare(signal: Signal, route: Route) -> dict:
    """Draft the agent would produce for this signal. Deterministic, mock, $0."""
    cap = route.capability
    if cap == "customer_messaging":
        prepared = {
            "reply": (
                "Hi! Thanks for reaching out. We'd be happy to help with that — "
                "here's a quick summary and next steps..."
            ),
            "channel": "email",
        }
        preview = prepared["reply"][:80]
    elif cap == "calendar_booking":
        prepared = {
            "reply": "We have Friday 2pm, 3pm and 4:30pm open — which works best?",
            "proposed_slots": ["Fri 14:00", "Fri 15:00", "Fri 16:30"],
        }
        preview = "Offer 3 Friday slots"
    elif cap == "campaign_sender":
        prepared = {
            "campaign_type": "slow-weekday offer" if signal.type == "slow_weekday" else "reactivation",
            "subject": "A little something for midweek 👋",
            "body": "Book Tue/Wed this week and get 15% off. Reply YES to grab it.",
            "audience_hint": "inactive 45d+" if signal.type == "inactive_customer" else "local list",
        }
        preview = prepared["subject"]
    elif cap == "content_generation":
        prepared = {
            "format": "instagram_reel",
            "hook": "3 things nobody tells you about <your service>",
            "script": "Shot 1 ... Shot 2 ... Shot 3 ... CTA: DM us 'START'.",
            "caption": "Save this for later 📌 #smallbusiness",
            "higgsfield_prompt": "15s vertical reel, upbeat, 3 quick cuts, bold captions",
        }
        preview = prepared["hook"]
    elif cap == "website_editing":
        prepared = {
            "section": "homepage_hero",
            "headline": "Websites that win you customers — live in days, not months.",
            "subhead": "Clear message, fast load, built to convert.",
            "cta": "See a live preview",
        }
        preview = prepared["headline"]
    elif cap == "seo_audit":
        prepared = {
            "issues": ["missing meta title", "weak H1", "no FAQ section", "no local keywords"],
            "fixes": ["Add a 55-char meta title", "Rewrite H1 with primary keyword", "Add 4-item FAQ"],
        }
        preview = f"{len(prepared['issues'])} SEO issues, fixes drafted"
    elif cap == "social_publishing":
        prepared = {
            "post": "Thank you for the kind words! ⭐️⭐️⭐️⭐️⭐️ Reviews like this make our day.",
            "source_signal": signal.message,
        }
        preview = "Turn 5-star review into a post"
    else:
        prepared = {"note": f"prepared draft for {route.agent}", "signal": signal.message}
        preview = signal.message[:80]
    return {"prepared_output": prepared, "preview": preview}


def run(tenant_id: str, signal: Signal, now: str = "") -> dict:
    """Route the signal, prepare a draft, and file a rich approval for it."""
    route = route_for(signal.type)
    signal.recommended_agent = route.agent
    drafted = prepare(signal, route)
    agent_name = _agent_name(route.agent)
    title = f"{agent_name}: {signal.type.replace('_', ' ')}"

    log_activity(tenant_id, "signal_routed", title=f"{signal.type} → {agent_name}",
                 agent=route.agent, created_at=now)

    if not require_approval():
        # Non-gated path (only when explicitly opted out in production) — execute now.
        item = create_approval(
            tenant_id, route.agent, title, action_type=route.capability,
            description=route.note, created_at=now, risk_level=route.risk_level,
            capability=route.capability, tool=route.tool,
            prepared_output=drafted["prepared_output"], preview=drafted["preview"],
        )
        result = execute(item)
        item.status = "executed"
        item.execution_result = result
        return {"status": "executed", "agent": route.agent, "approval_id": item.id,
                "prepared_output": item.prepared_output, "execution_result": result, "note": route.note}

    item = create_approval(
        tenant_id, route.agent, title, action_type=route.capability,
        description=route.note, created_at=now, risk_level=route.risk_level,
        capability=route.capability, tool=route.tool,
        prepared_output=drafted["prepared_output"], preview=drafted["preview"],
    )
    return {
        "status": "approval_required",
        "agent": route.agent,
        "approval_id": item.id,
        "capability": route.capability,
        "tool": route.tool,
        "risk_level": route.risk_level,
        "prepared_output": item.prepared_output,
        "preview": item.preview,
        "note": route.note,
    }


def execute(item: ApprovalItem) -> dict:
    """Run the approved action. Mock unless production+real is explicitly enabled."""
    if not real_execution_allowed():
        return {
            "ok": True,
            "mode": "mock",
            "executed": False,          # nothing left the box
            "tool": item.tool,
            "capability": item.capability,
            "detail": f"Mock {item.tool} ran; no real action taken (test mode).",
            "would_have_sent": item.prepared_output,
        }
    # Production + real: this is where a concrete connector would be dispatched.
    # Not wired in this phase — fail closed rather than pretend.
    return {
        "ok": False,
        "mode": "real",
        "executed": False,
        "tool": item.tool,
        "capability": item.capability,
        "detail": "Real execution requested but no live connector is wired yet.",
    }


# Register with the approvals router so approve() runs execute() for Omni items.
register_executor(execute)
