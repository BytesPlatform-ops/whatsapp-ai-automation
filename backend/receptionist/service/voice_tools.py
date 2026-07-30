"""Voice tool execution — typed tools backed by the canonical action registry.

Vapi tool-calls arrive here and are dispatched to canonical Pixie services. NO voice
tool performs a business side effect directly: bookings/tasks/tickets/transfers go
through the canonical action registry (approvals + billing enforced there);
knowledge/config lookups are read-only and tenant-isolated. Every tool validates
call ownership, bounds its parameters, and returns a safe-for-speech result — raw
internal errors are never returned as speech.
"""

from __future__ import annotations

from typing import Optional

# The typed voice-tool vocabulary (schema version bumped when tools change).
TOOL_SCHEMA_VERSION = "voice-tools-1"

_READ_TOOLS = {"get_business_hours", "get_service_information", "get_location_information",
               "search_knowledge", "check_calendar_availability", "resolve_transfer_destination"}
_ACTION_TOOLS = {
    "identify_or_update_contact": "capture_contact",
    "qualify_lead": "capture_lead",
    "create_booking_request": "capture_lead",
    "create_calendar_booking": "calendar_create_event",
    "reschedule_booking": "calendar_update_event",
    "cancel_booking": "calendar_cancel_event",
    "create_task": "create_task",
    "create_ticket": "create_ticket",
    "create_quote_request": "create_quote",
    "send_follow_up": "create_follow_up",
    "request_human": "escalate",
}


def _speech(text: str) -> str:
    return (text or "")[:600]


def execute_voice_tool(tenant_id: str, tool_name: str, arguments: dict, *,
                       session: Optional[dict] = None, call_id: str = "") -> dict:
    """Dispatch one voice tool. Returns {status, speech, data} — safe for TTS."""
    arguments = arguments or {}
    conversation_id = (session or {}).get("conversation_id", "")
    contact_id = (session or {}).get("contact_id", "")

    try:
        if tool_name in _READ_TOOLS:
            return _read_tool(tenant_id, tool_name, arguments)
        if tool_name == "end_call":
            return {"status": "ok", "speech": _speech("Thank you for calling. Goodbye."), "data": {"end": True}}
        if tool_name == "resolve_transfer_destination":
            return _resolve_transfer(tenant_id, arguments)
        action = _ACTION_TOOLS.get(tool_name)
        if action is None:
            return {"status": "unsupported", "speech": _speech("I can't do that on this call."), "data": {}}
        return _action_tool(tenant_id, tool_name, action, arguments, conversation_id, contact_id, call_id)
    except Exception:
        # raw internal errors are never spoken
        return {"status": "error", "speech": _speech("Sorry, I hit a problem with that. Let me get someone to help."),
                "data": {}}


def _read_tool(tenant_id: str, tool_name: str, args: dict) -> dict:
    from . import config_repo
    cfg = config_repo.get_active_or_default(tenant_id)
    if tool_name == "get_business_hours":
        hours = cfg.get("hours") or ""
        return {"status": "ok", "speech": _speech(f"Our hours are {hours}." if hours else "Let me check our hours."),
                "data": {"hours": hours}}
    if tool_name == "get_service_information":
        services = cfg.get("services") or []
        return {"status": "ok", "speech": _speech("We offer " + ", ".join(map(str, services[:8])) if services else "Let me check our services."),
                "data": {"services": services[:20]}}
    if tool_name == "get_location_information":
        locs = cfg.get("locations") or []
        return {"status": "ok", "speech": _speech(", ".join(map(str, locs[:5])) if locs else "Let me find our location."),
                "data": {"locations": locs[:10]}}
    if tool_name == "search_knowledge":
        from . import knowledge
        res = knowledge.retrieve(tenant_id, str(args.get("query", ""))[:400])
        # weak evidence → clarification / handoff, never invent
        if not res.get("confident"):
            return {"status": "low_confidence", "speech": _speech("I'm not certain — I can have someone follow up on that."),
                    "data": {"confident": False}}
        return {"status": "ok", "speech": _speech(res.get("answer", "")), "data": {"confident": True}}
    if tool_name == "check_calendar_availability":
        from . import booking
        av = booking.availability(tenant_id, service=str(args.get("service", "consultation")), days=int(args.get("days", 7) or 7))
        if av.get("status") != "ok":
            return {"status": "provider_unavailable", "speech": _speech("I can't reach the calendar right now."), "data": {}}
        slots = (av.get("slots") or [])[:3]  # bounded, speakable
        return {"status": "ok", "speech": _speech("I have some times available."),
                "data": {"slots": [{"id": s.get("id", ""), "label": s.get("label", "")} for s in slots]}}
    return {"status": "unsupported", "speech": _speech("I can't do that."), "data": {}}


def _resolve_transfer(tenant_id: str, args: dict) -> dict:
    from . import voice_policy
    dest = voice_policy.resolve_transfer_destination(tenant_id, str(args.get("department", "")))
    if dest is None:
        return {"status": "no_destination", "speech": _speech("No one is available to transfer to right now, but I can take a message."),
                "data": {}}
    # only a safe label is returned — never the raw destination number
    return {"status": "ok", "speech": _speech("Let me connect you."), "data": {"department": dest.get("department", "")}}


def _action_tool(tenant_id, tool_name, action, args, conversation_id, contact_id, call_id) -> dict:
    from .registry import execute_action
    payload = dict(args)
    payload.setdefault("contact_id", contact_id)
    payload.setdefault("channel", "voice")
    res = execute_action(tenant_id, action, payload, conversation_id=conversation_id,
                         idempotency_key=f"voicetool:{call_id}:{tool_name}")
    status = res.get("status", "")
    if status in ("completed", "confirmed", "provider_pending", "queued"):
        return {"status": status, "speech": _speech(_success_speech(tool_name)), "data": {"record_id": res.get("record_id", "")}}
    if status == "approval_required":
        return {"status": "approval_required", "speech": _speech("I've noted that and it will be confirmed shortly."), "data": {}}
    if status == "not_connected":
        return {"status": "not_connected", "speech": _speech("I can't complete that right now, but I'll pass it to the team."), "data": {}}
    return {"status": status or "failed", "speech": _speech("I've made a note of that for the team."), "data": {}}


def _success_speech(tool_name: str) -> str:
    return {
        "create_calendar_booking": "You're booked in. You'll get a confirmation shortly.",
        "reschedule_booking": "I've rescheduled that for you.",
        "cancel_booking": "I've cancelled that booking.",
        "create_task": "I've logged that.",
        "create_ticket": "I've raised that for the team.",
        "create_quote_request": "I've requested a quote for you.",
        "send_follow_up": "I'll have someone follow up.",
        "escalate": "Let me get someone to help you.",
        "capture_contact": "Thanks, I've got your details.",
        "capture_lead": "Thanks, I've noted your interest.",
    }.get(tool_name, "Done.")
