"""AI Receptionist agent — the real prepare-for-approval vertical slice.

Flow (spec §1):
    customer message
      → OpenAI understands + classifies + drafts (structured JSON)
      → lead is created/updated (internal, no approval needed)
      → an approval item is filed with the prepared reply + execution actions
      → on approve, the registered executor resolves each action to a connector
        (mock unless production+real + connected) and runs it
      → activity is logged (by the approvals router)

The AI brain is REAL OpenAI. Execution stays mock until a real connection exists
AND real_execution_allowed(). No canned template is ever the main path: if the
model call fails we raise, we do not fabricate a reply.
"""

from __future__ import annotations

import json

from activity.router import log_activity
from approvals.router import ApprovalItem, create_approval, register_executor_for
from integrations import execute_action, resolve_connector
from leads import upsert_lead
from models import ModelRequest, get_router
from schemas import ModelTier

from .agent_prompt import AI_RECEPTIONIST_SYSTEM_PROMPT, build_user_message
from .agent_schemas import ReceptionistOutput, ReceptionSignal, RunResponse

AGENT_SLUG = "ai-receptionist"


def _provider_label(mode: str) -> str:
    return "openai" if mode == "openai" else "mock"


async def _generate(signal: ReceptionSignal) -> tuple[ReceptionistOutput, str, str]:
    """Call the model for structured output. Returns (parsed, provider, model)."""
    router = get_router()
    model_id = router.model_for(ModelTier.SMALL)
    user_msg = build_user_message(
        from_name=signal.from_name, from_email=signal.from_email,
        subject=signal.subject, body=signal.body,
    )
    result = await router.complete(ModelRequest(
        tier=ModelTier.SMALL, task="reception",
        system=AI_RECEPTIONIST_SYSTEM_PROMPT, user=user_msg,
        expects_json=True,
        context={"tenant_id": signal.tenant_id, "agent": AGENT_SLUG},
    ))
    try:
        data = json.loads(result.text)
    except (ValueError, TypeError) as exc:
        raise ValueError(f"AI Receptionist model returned non-JSON output: {exc}") from exc
    parsed = ReceptionistOutput(**data)
    return parsed, _provider_label(router.mode), result.model


def _build_execution_actions(signal: ReceptionSignal, out: ReceptionistOutput) -> list[dict]:
    """Concrete, executable actions derived from the model's draft.

    Always include the customer reply as an email_send action (so approval has a
    real action to run); add a calendar event when the model flags a booking.
    """
    actions: list[dict] = []
    to = signal.from_email or out.lead.email
    if out.prepared_reply:
        actions.append({
            "capability": "email_send",
            "payload": {
                "to": to,
                "subject": f"Re: {signal.subject}" if signal.subject else "Re: your enquiry",
                "body": out.prepared_reply,
            },
        })
    if out.booking.needed:
        actions.append({
            "capability": "calendar_create_event",
            "payload": {
                "event_title": out.booking.event_title or "Appointment",
                "event_description": out.booking.event_description,
                "suggested_slots": out.booking.suggested_slots,
                "attendee": to,
            },
        })
    return actions


def run_receptionist_sync_wrapper():  # pragma: no cover - convenience placeholder
    raise NotImplementedError("Use `await run_receptionist(signal)`.")


async def run_receptionist(signal: ReceptionSignal) -> RunResponse:
    tenant = signal.tenant_id
    out, provider, model_id = await _generate(signal)

    # 1) Lead upsert — internal, no approval needed.
    lead = upsert_lead(
        tenant,
        name=out.lead.name or signal.from_name,
        email=out.lead.email or signal.from_email,
        phone=out.lead.phone,
        source=out.lead.source or signal.source,
        source_message_id=None,
        intent=out.intent,
        status=out.lead.status or "reply_prepared",
        last_message_summary=out.summary,
        metadata_json={"internal_notes": out.internal_notes} if out.internal_notes else {},
        now=signal.now,
    )
    log_activity(tenant, "lead_captured", title=f"Lead: {lead.name or lead.email or 'customer'}",
                 agent=AGENT_SLUG, created_at=signal.now)

    # 2) Build the approval item (customer-facing → must be approved first).
    execution_actions = _build_execution_actions(signal, out)
    primary_cap = execution_actions[0]["capability"] if execution_actions else "follow_up"
    tool = resolve_connector(tenant, primary_cap).provider

    prepared_output = {
        "summary": out.summary,
        "reply": out.prepared_reply,
        "internal_notes": out.internal_notes,
        "recommended_actions": [a.model_dump() for a in out.recommended_actions],
        "lead": {"id": lead.id, "name": lead.name, "email": lead.email},
        "booking": out.booking.model_dump(),
        "execution_actions": execution_actions,
    }
    who = out.lead.name or signal.from_name or out.lead.email or signal.from_email or "customer"
    approval = create_approval(
        tenant, AGENT_SLUG,
        title=f"Reply to {who} about {out.intent.replace('_', ' ')}",
        action_type=primary_cap,
        description=out.summary,
        created_at=signal.now,
        risk_level=out.risk_level or "medium",
        capability=primary_cap,
        tool=tool,
        prepared_output=prepared_output,
        preview=(out.prepared_reply or out.summary)[:120],
    )

    return RunResponse(
        status="approval_required",
        agent_slug=AGENT_SLUG,
        intent=out.intent,
        lead_id=lead.id,
        approval_id=approval.id,
        prepared_output=prepared_output,
        llm_provider=provider,
        model=model_id,
    )


def _execute_receptionist(item: ApprovalItem) -> dict:
    """Approvals executor for AI Receptionist items. Runs each prepared action
    through the integration router — mock unless production+real + connected."""
    actions = (item.prepared_output or {}).get("execution_actions", [])
    results = []
    any_real = False
    all_ok = True
    for action in actions:
        cap = action.get("capability", "follow_up")
        res = execute_action(item.tenant_id, cap, action.get("payload", {}))
        results.append(res)
        if res.get("status") not in ("success",):
            if res.get("status") == "blocked":
                all_ok = False
        if res.get("mode") == "real" and res.get("status") == "success":
            any_real = True
    return {
        "ok": all_ok,
        "mode": "real" if any_real else "mock",
        "executed": any_real,   # True only if a real connector actually ran
        "results": results,
        "detail": (
            "Approved actions ran through mock connectors — no real customer action taken."
            if not any_real else "Approved actions executed through connected tools."
        ),
    }


# Own the execution path for AI Receptionist items without clobbering Omni's.
register_executor_for(AGENT_SLUG, _execute_receptionist)
