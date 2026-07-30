"""Campaign analytics from persisted data only (Part 32).

Never fabricates delivery/read/revenue. Counts real recipient/execution/attribution
records; unknown attribution stays unknown; empty data returns zero.
"""

from __future__ import annotations

from . import stores


def rollup(tenant_id: str, campaign_id: str) -> dict:
    recipients = [r for r in stores.cmp_recipients().list(tenant_id) if r.get("campaign_id") == campaign_id]
    execs = [e for e in stores.cmp_executions().list(tenant_id) if e.get("campaign_id") == campaign_id]
    attr = [a for a in stores.cmp_attribution().list(tenant_id) if a.get("campaign_id") == campaign_id]

    def count_state(items, key, *states):
        return sum(1 for i in items if i.get(key) in states)

    channel_breakdown: dict[str, int] = {}
    for e in execs:
        if e.get("state") in ("provider_pending", "sent", "delivered", "completed"):
            channel_breakdown[e.get("channel", "")] = channel_breakdown.get(e.get("channel", ""), 0) + 1

    conversions = count_state(attr, "attribution", "booking_conversion", "lead_conversion", "human_conversion")
    return {
        "audience": len(recipients),
        "eligible": count_state(recipients, "state", "pending", "scheduled", "provider_pending", "sent",
                                "completed", "answered"),
        "excluded": count_state(recipients, "state", "eligibility_blocked", "suppressed", "opted_out"),
        "sent": count_state(execs, "state", "provider_pending", "sent", "delivered", "completed"),
        "provider_confirmed": count_state(execs, "state", "provider_pending", "sent", "delivered", "completed"),
        "replied": count_state(recipients, "state", "answered"),
        "opted_out": count_state(recipients, "state", "opted_out"),
        "failed": count_state(execs, "state", "failed"),
        "suppressed": count_state(recipients, "state", "suppressed"),
        "eligibility_blocked": count_state(recipients, "state", "eligibility_blocked"),
        "send_disabled": count_state(execs, "state", "send_disabled"),
        "conversions": conversions,
        "attribution_breakdown": _attr_breakdown(attr),
        "channel_breakdown": channel_breakdown,
        "completion_rate": round(
            count_state(recipients, "state", "completed") / len(recipients), 3) if recipients else 0.0,
    }


def _attr_breakdown(attr: list) -> dict:
    out: dict[str, int] = {}
    for a in attr:
        out[a.get("attribution", "uncertain")] = out.get(a.get("attribution", "uncertain"), 0) + 1
    return out
