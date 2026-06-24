"""Campaign executor — runs the gate over every target and reports what WOULD be
sent. It NEVER performs a real send: real channel adapters (whatsapp/sms/email/
voice) are key-gated and added later. Until then, allowed targets resolve to
'would_send'. A live send requires campaign.dry_run == False AND confirm_live.
"""

from __future__ import annotations

from collections import Counter

from billing import get_recorder
from schemas import ModelTier, UsageEvent, UsageEventType

from . import store
from .gate import contact_for, evaluate_gate, idempotency_key
from .schemas import Campaign


def run(campaign: Campaign, *, confirm_live: bool = False) -> dict:
    """Evaluate the gate for all targets; return a per-target + rollup report."""
    # Real send only when explicitly live AND confirmed. No real adapter yet → always simulate.
    live = (not campaign.dry_run) and confirm_live
    targets = store.list_targets(campaign.tenant_id, campaign.id)

    results, blocked_reasons = [], Counter()
    would_send = skipped = 0

    for t in targets:
        gate = evaluate_gate(campaign, t)
        if gate.allowed:
            would_send += 1
            # COMMIT only on a live run — a dry-run preview MUST be side-effect-free
            # (no log_send / no target mutation), or repeated previews pollute the
            # idempotency + frequency-cap ledgers. No real adapter yet → 'would_send'.
            if live:
                channel = gate.resolved_channel
                t.send_status = "would_send"
                store.update_target(t)
                store.log_send(campaign.tenant_id, campaign_id=campaign.id,
                               idempotency_key=idempotency_key(campaign, t, channel),
                               contact=contact_for(t, channel), status="would_send")
        else:
            blocked_reasons[gate.blocked_by or "unknown"] += 1
            skipped += 1
        results.append(gate.model_dump(mode="json"))

    # Meter the run (no model call → tier NONE, cost 0; plumbing for billing).
    get_recorder().record(UsageEvent(
        tenant_id=campaign.tenant_id, event_type=UsageEventType.CAMPAIGN,
        tier=ModelTier.NONE, success=True,
    ))

    return {
        "campaign_id": campaign.id,
        "mode": "live" if live else "dry_run",
        "actually_sent": False,  # no real adapter yet — always true once adapters land + live
        "rollup": {"total": len(targets), "would_send": would_send, "skipped": skipped,
                   "blocked_by_reason": dict(blocked_reasons)},
        "targets": results,
    }
