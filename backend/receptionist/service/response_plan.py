"""ResponsePlan builder and validator for the AI Receptionist (Wave 4).

`build_plan_from_classification` adapts the deterministic engine's
classifier+handler output into a validated `ResponsePlan` — so the engine
always produces a schema-checked plan without requiring a full LLM generation.

`validate_plan` validates a raw dict against the `ResponsePlan` schema with one
bounded repair attempt (coerce/prune unknown/bad fields), then falls back to a
safe deterministic plan on failure. Invalid plans never yield executable actions.

Plan persistence: the final validated plan is stored on the action record and
conversation via `persist_plan` to aid debugging and audit.
"""

from __future__ import annotations

import logging
from typing import Optional

from pydantic import ValidationError

from .schemas import ProposedAction, ResponsePlan

log = logging.getLogger(__name__)

PLAN_VERSION = "1.0"
PROMPT_VERSION = "wave4-deterministic"

# Sensitive action types that always require approval
_APPROVAL_REQUIRED_ACTIONS = frozenset({
    "create_payment_link",
    "gmail_send",
    "calendar_create_event",
    "calendar_update_event",
    "record_pending_email_request",
    "create_callback",
    "assign",
    "change_lead_stage",
    "create_reminder",
    "create_follow_up",
})


def build_plan_from_classification(
    intent: str,
    fields: dict,
    reply: str,
    *,
    confidence: float = 0.0,
    handler_action: str = "",
    handler_status: str = "executed",
    record_type: str = "",
    record_id: str = "",
    provider: str = "mock",
    model: str = "",
    missing_fields: Optional[list[str]] = None,
    knowledge_source_ids: Optional[list[str]] = None,
    escalation_recommendation: bool = False,
    safety_flags: Optional[list[str]] = None,
    follow_up_recommendation: str = "",
) -> ResponsePlan:
    """Build a validated `ResponsePlan` from the engine's deterministic output.

    This adapts classifier+handler output into the Wave-4 plan schema.
    The resulting plan is always valid because it is constructed from
    already-validated components.
    """
    proposed_actions: list[ProposedAction] = []
    approval_requirement = "none"

    # Map the handler action → a proposed action
    if handler_action and handler_action != "none":
        needs_approval = handler_action in _APPROVAL_REQUIRED_ACTIONS
        if needs_approval:
            approval_requirement = "required"

        # If the handler produced a real record, reflect it as a proposed action
        idempotency_key = f"{intent}:{record_id}" if record_id else ""
        proposed_actions.append(ProposedAction(
            action_type=handler_action,
            arguments={k: v for k, v in fields.items() if v},
            reason=f"Handler for intent '{intent}' produced action '{handler_action}'",
            requires_approval=needs_approval,
            estimated_cost=0.0,
            idempotency_key=idempotency_key,
        ))

    plan = ResponsePlan(
        intent=intent,
        confidence=round(float(confidence), 4),
        reply=reply,
        missing_fields=missing_fields or [],
        knowledge_source_ids=knowledge_source_ids or [],
        proposed_actions=proposed_actions,
        approval_requirement=approval_requirement,
        escalation_recommendation=escalation_recommendation,
        safety_flags=safety_flags or [],
        conversation_updates={
            "last_intent": intent,
            "last_action": handler_action,
        } if handler_action else {},
        follow_up_recommendation=follow_up_recommendation,
        plan_version=PLAN_VERSION,
        prompt_version=PROMPT_VERSION,
        model=model,
        provider=provider,
    )
    return plan


def _repair_raw(raw: dict) -> dict:
    """Attempt one bounded repair pass on a raw plan dict.

    Repairs applied:
    - Remove fields unknown to ResponsePlan
    - Coerce numeric types to str where str is expected
    - Strip invalid proposed_actions entries
    - Ensure list fields are actually lists
    """
    from pydantic import BaseModel

    # Known ResponsePlan fields
    known_top = {
        "intent", "confidence", "reply", "missing_fields", "knowledge_source_ids",
        "proposed_actions", "approval_requirement", "escalation_recommendation",
        "safety_flags", "conversation_updates", "follow_up_recommendation",
        "plan_version", "prompt_version", "model", "provider",
    }
    known_action = {
        "action_type", "arguments", "reason", "requires_approval",
        "estimated_cost", "idempotency_key",
    }

    repaired = {k: v for k, v in raw.items() if k in known_top}

    # Coerce list fields
    for list_field in ("missing_fields", "knowledge_source_ids", "safety_flags"):
        if list_field in repaired and not isinstance(repaired[list_field], list):
            repaired[list_field] = []

    # Coerce dict fields
    for dict_field in ("conversation_updates",):
        if dict_field in repaired and not isinstance(repaired[dict_field], dict):
            repaired[dict_field] = {}

    # Coerce str fields
    for str_field in ("intent", "reply", "approval_requirement", "plan_version",
                      "prompt_version", "model", "provider", "follow_up_recommendation"):
        if str_field in repaired:
            repaired[str_field] = str(repaired[str_field])

    # Coerce bool
    if "escalation_recommendation" in repaired:
        repaired["escalation_recommendation"] = bool(repaired["escalation_recommendation"])

    # Coerce float
    if "confidence" in repaired:
        try:
            repaired["confidence"] = float(repaired["confidence"])
        except (TypeError, ValueError):
            repaired["confidence"] = 0.0

    # Repair proposed_actions
    raw_actions = repaired.get("proposed_actions", [])
    if isinstance(raw_actions, list):
        clean_actions = []
        for act in raw_actions:
            if not isinstance(act, dict):
                continue
            clean_act = {k: v for k, v in act.items() if k in known_action}
            # Ensure required field
            if not clean_act.get("action_type"):
                continue
            clean_actions.append(clean_act)
        repaired["proposed_actions"] = clean_actions
    else:
        repaired["proposed_actions"] = []

    return repaired


def _safe_fallback_plan(intent: str = "fallback", reply: str = "") -> ResponsePlan:
    """Return a safe, inert plan with no executable actions."""
    return ResponsePlan(
        intent=intent,
        confidence=0.0,
        reply=reply or "I'm sorry — something went wrong processing your request. Please try again.",
        missing_fields=[],
        knowledge_source_ids=[],
        proposed_actions=[],   # NO actions on fallback
        approval_requirement="none",
        escalation_recommendation=False,
        safety_flags=["plan_validation_failed"],
        conversation_updates={},
        follow_up_recommendation="",
        plan_version=PLAN_VERSION,
        prompt_version=PROMPT_VERSION,
        model="",
        provider="",
    )


def validate_plan(raw: dict) -> Optional[ResponsePlan]:
    """Validate a raw dict into a `ResponsePlan`.

    Attempt 1: direct validation.
    Attempt 2 (repair): prune unknown fields, coerce types, retry.
    On any failure: return `_safe_fallback_plan()` (never None, never has executable actions).

    Invalid plans MUST NOT yield executable actions — the fallback plan has
    `proposed_actions=[]` to enforce this.
    """
    if not isinstance(raw, dict):
        log.warning("validate_plan: received non-dict input, using fallback plan")
        return _safe_fallback_plan()

    # Attempt 1: direct validation
    try:
        return ResponsePlan(**raw)
    except (ValidationError, TypeError, ValueError):
        pass

    # Attempt 2: repair then re-validate
    try:
        repaired = _repair_raw(raw)
        return ResponsePlan(**repaired)
    except (ValidationError, TypeError, ValueError) as exc:
        log.warning("validate_plan: repair failed (%s), using fallback plan", exc)
        intent = str(raw.get("intent", "fallback"))
        reply = str(raw.get("reply", ""))
        return _safe_fallback_plan(intent=intent, reply=reply)


def persist_plan(plan: ResponsePlan, *, action_record: dict, conversation: dict) -> None:
    """Persist the validated plan's metadata onto the action record and conversation.

    Mutates both dicts in-place — caller must re-save them to the store.
    """
    plan_meta = {
        "plan_version": plan.plan_version,
        "prompt_version": plan.prompt_version,
        "model": plan.model,
        "provider": plan.provider,
        "approval_requirement": plan.approval_requirement,
        "escalation_recommendation": plan.escalation_recommendation,
        "safety_flags": plan.safety_flags,
        "proposed_actions_count": len(plan.proposed_actions),
    }
    action_record["plan_meta"] = plan_meta
    conversation.setdefault("plan_versions", [])
    conversation["plan_versions"].append({
        "at": action_record.get("created_at", ""),
        "plan_version": plan.plan_version,
        "intent": plan.intent,
        "approval_requirement": plan.approval_requirement,
    })
