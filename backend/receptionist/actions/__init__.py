"""Action dispatcher — maps a parsed [ACTION] type to its real handler.

`run_action(action, request)` runs the handler and returns a result dict. Types
without a handler yet return {handled: False} (parsed, but no side-effect). This
is where the receptionist stops being "just chat" and DOES things.
"""

from __future__ import annotations

from ..schemas import Action, ActionType, ReceptionRequest
from .calendar import handle_booking
from .crm import handle_escalation, handle_lead

_HANDLERS = {
    ActionType.BOOKING: handle_booking,
    ActionType.RESCHEDULE: handle_booking,
    ActionType.LEAD: handle_lead,
    ActionType.FOLLOW_UP: handle_lead,
    ActionType.COMPLAINT: handle_escalation,
    ActionType.ESCALATION: handle_escalation,
}


def run_action(action: Action, request: ReceptionRequest) -> dict:
    handler = _HANDLERS.get(action.type)
    if handler is None:
        return {"handled": False, "type": action.type.value}
    try:
        return handler(action, request)
    except Exception as exc:  # never let a handler failure break the reply
        return {"handled": False, "type": action.type.value, "error": str(exc)[:300]}


__all__ = ["run_action"]
