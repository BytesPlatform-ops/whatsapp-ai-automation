"""Canonical voice-call session lifecycle (Parts 5/8/21/22/23).

A durable call session linked to the canonical Receptionist conversation. Handles
contact/conversation mapping, honest call statuses, incremental transcripts
(partial → final), idempotent tool-call execution (via the canonical registry),
transfers, and idempotent end-of-call processing + post-call summary. Provider
metadata stays separate from canonical messages; channel="voice".
"""

from __future__ import annotations

from typing import Optional

from . import stores
from .ids import new_id, now_iso

# Honest internal statuses (Part 21).
STATUSES = ("requested", "scheduled", "queued", "starting", "ringing", "in_progress",
            "transferring", "transferred", "voicemail", "completed", "no_answer",
            "busy", "rejected", "failed", "cancelled", "provider_unknown", "reconciliation_required")

_STATUS_RANK = {s: i for i, s in enumerate(
    ["requested", "scheduled", "queued", "starting", "ringing", "in_progress",
     "transferring", "transferred", "voicemail", "completed", "no_answer", "busy",
     "rejected", "failed", "cancelled"])}


def _norm(number: str) -> str:
    from ..providers.sms_adapter import normalise_e164
    return normalise_e164(number)


# ── session CRUD + mapping ────────────────────────────────────────────────────

def session_for_call(tenant_id: str, call_id: str) -> Optional[dict]:
    return stores.voice_sessions().get(tenant_id, f"vs::{tenant_id}::{call_id}")


def create_session(tenant_id: str, *, call_id: str, direction: str, caller_number: str = "",
                   recipient_number: str = "", phone_number_id: str = "", assistant_id: str = "",
                   status: str = "requested") -> dict:
    existing = session_for_call(tenant_id, call_id)
    if existing is not None:
        return existing
    contact_id = _resolve_contact(tenant_id, caller_number) if caller_number else ""
    conv = stores.conversations().put(tenant_id, _conversation(tenant_id, contact_id))
    rec = {
        "id": f"vs::{tenant_id}::{call_id}", "tenant_id": tenant_id, "call_id": call_id,
        "direction": direction, "caller_number": _norm(caller_number),
        "recipient_number": _norm(recipient_number), "phone_number_id": phone_number_id,
        "assistant_id": assistant_id, "contact_id": contact_id, "conversation_id": conv["id"],
        "status": status, "ai_paused": False, "consent_state": "not_requested",
        "recording_state": "off", "transfer_state": "", "last_transcript_seq": -1,
        "created_at": now_iso(), "updated_at": now_iso()}
    return stores.voice_sessions().put(tenant_id, rec)


def _conversation(tenant_id: str, contact_id: str) -> dict:
    from .schemas import Conversation
    return Conversation(tenant_id=tenant_id, channel="voice", contact_id=contact_id or None).model_dump()


def _resolve_contact(tenant_id: str, caller_number: str) -> str:
    try:
        c = stores.find_or_create_contact(tenant_id, phone=_norm(caller_number), source="voice")
        return c.get("id", "") if c else ""
    except Exception:
        return ""


def _save(tenant_id: str, session: dict) -> dict:
    session["updated_at"] = now_iso()
    return stores.voice_sessions().put(tenant_id, session)


# ── status (Part 21: honest, monotonic) ───────────────────────────────────────

def update_status(tenant_id: str, call_id: str, *, status: str, ended_reason: str = "",
                  provider: dict = None) -> dict:
    s = session_for_call(tenant_id, call_id)
    if s is None:
        return {"status": "no_session"}
    cur = _STATUS_RANK.get(s.get("status", ""), -1)
    nxt = _STATUS_RANK.get(status, -1)
    # terminal states + forward-only transitions; duplicate/older events are harmless
    if status in STATUSES and (nxt >= cur or status in ("failed", "no_answer", "busy", "rejected", "voicemail")):
        s["status"] = status
    if ended_reason:
        s["ended_reason"] = ended_reason
    if provider:
        s["provider_meta"] = {k: provider.get(k) for k in ("duration_seconds", "provider_cost",
                                                            "telephony_cost", "model_cost", "voice_cost",
                                                            "transcript_cost") if k in provider}
    _save(tenant_id, s)
    return {"status": "updated", "call_status": s["status"]}


# ── transcript (Part 8: partial → final, dedup, ordered) ──────────────────────

def record_transcript(tenant_id: str, call_id: str, *, sequence: int, speaker: str, text: str,
                      final: bool, language: str = "") -> dict:
    s = session_for_call(tenant_id, call_id)
    if s is None:
        return {"status": "no_session"}
    seg_id = f"vts::{tenant_id}::{call_id}::{sequence}"
    prev = stores.voice_transcripts().get(tenant_id, seg_id)
    # duplicate final is harmless; a later final replaces an earlier partial
    if prev is not None and prev.get("final") and final:
        return {"status": "duplicate"}
    stores.voice_transcripts().put(tenant_id, {
        "id": seg_id, "tenant_id": tenant_id, "call_id": call_id, "sequence": sequence,
        "speaker": speaker, "text": text, "final": bool(final), "language": language,
        "created_at": now_iso()})
    if final:
        # finalised turns enter the canonical conversation (customer + assistant)
        _persist_turn(tenant_id, s, speaker, text)
        if sequence > s.get("last_transcript_seq", -1):
            s["last_transcript_seq"] = sequence
            _save(tenant_id, s)
    return {"status": "recorded", "final": bool(final)}


def _persist_turn(tenant_id, session, speaker, text):
    from .schemas import Message
    role = "assistant" if speaker in ("assistant", "bot") else "customer"
    stores.messages().put(tenant_id, Message(
        tenant_id=tenant_id, conversation_id=session.get("conversation_id", ""), role=role,
        text=text, channel="voice", intent="unknown").model_dump())


# ── tool calls (Part 11: idempotent, canonical registry) ──────────────────────

def process_tool_call(tenant_id: str, call_id: str, *, tool_call_id: str, tool_name: str,
                      arguments: dict) -> dict:
    """Execute a voice tool through the canonical action registry. Idempotent on
    tool_call_id — a replay returns the original result."""
    rec_id = f"vtc::{tenant_id}::{tool_call_id}"
    prev = stores.voice_toolcalls().get(tenant_id, rec_id)
    if prev is not None:
        return {"status": "duplicate", "result": prev.get("result", {})}
    s = session_for_call(tenant_id, call_id)
    from . import voice_tools
    result = voice_tools.execute_voice_tool(tenant_id, tool_name, arguments,
                                            session=s, call_id=call_id)
    stores.voice_toolcalls().put(tenant_id, {
        "id": rec_id, "tenant_id": tenant_id, "call_id": call_id, "tool_call_id": tool_call_id,
        "tool_name": tool_name, "result": result, "created_at": now_iso()})
    return {"status": "executed", "result": result}


# ── transfer (Part 17) ────────────────────────────────────────────────────────

def process_transfer(tenant_id: str, call_id: str, *, department: str = "", outcome: str = "requested") -> dict:
    from . import voice_policy
    s = session_for_call(tenant_id, call_id)
    dest = voice_policy.resolve_transfer_destination(tenant_id, department)
    if dest is None:
        # do not claim a human is available when destinations are offline
        stores.voice_transfers().put(tenant_id, {
            "id": new_id("vxfer"), "tenant_id": tenant_id, "call_id": call_id,
            "department": department, "outcome": "no_destination", "created_at": now_iso()})
        return {"status": "no_destination"}
    if s is not None:
        s["ai_paused"] = True
        s["transfer_state"] = outcome
        _save(tenant_id, s)
    stores.voice_transfers().put(tenant_id, {
        "id": new_id("vxfer"), "tenant_id": tenant_id, "call_id": call_id, "department": department,
        "destination_id": dest.get("id", ""), "outcome": outcome, "created_at": now_iso()})
    # destination resolved server-side — the model never sees the raw number
    return {"status": outcome, "destination_label": dest.get("label", dest.get("department", "team"))}


# ── end-of-call (Parts 22/23: idempotent, settle once) ────────────────────────

def process_end_report(tenant_id: str, call_id: str, *, report: dict) -> dict:
    rec_id = f"ver::{tenant_id}::{call_id}"
    if stores.voice_reports().get(tenant_id, rec_id) is not None:
        return {"status": "duplicate"}
    s = session_for_call(tenant_id, call_id)
    normalised = report if isinstance(report, dict) else {}
    duration = int(normalised.get("duration_seconds", 0) or 0)
    ended_reason = normalised.get("ended_reason", "")
    if s is not None:
        s["status"] = _end_status(s.get("status", ""), ended_reason)
        s["ended_reason"] = ended_reason
        s["ended_at"] = now_iso()
        s["duration_seconds"] = duration
        _save(tenant_id, s)
    stores.voice_reports().put(tenant_id, {
        "id": rec_id, "tenant_id": tenant_id, "call_id": call_id, "duration_seconds": duration,
        "ended_reason": ended_reason, "provider_cost": normalised.get("provider_cost", 0),
        "telephony_cost": normalised.get("telephony_cost", 0), "model_cost": normalised.get("model_cost", 0),
        "created_at": now_iso()})
    # settle billing ONCE using actual duration
    _settle_billing(tenant_id, call_id, duration, s)
    summary = build_summary(tenant_id, call_id, provider_summary=normalised.get("summary", ""))
    return {"status": "processed", "summary_id": summary.get("id", ""), "duration_seconds": duration}


def _end_status(current: str, ended_reason: str) -> str:
    from ..providers.voice_adapter import _ENDED_REASON_MAP
    mapped = _ENDED_REASON_MAP.get(ended_reason, "")
    return mapped or ("completed" if current in ("in_progress", "transferred") else current or "completed")


def _settle_billing(tenant_id, call_id, duration, session):
    try:
        from . import usage
        minutes = max(1, -(-duration // 60)) if duration else 0
        if minutes:
            usage.increment(tenant_id, "voice_minutes", amount=minutes, idempotency_key=f"vmin:{call_id}")
        direction = (session or {}).get("direction", "inbound")
        usage.increment(tenant_id, f"voice_{direction}_calls", idempotency_key=f"vcall:{call_id}")
    except Exception:
        pass


# ── post-call summary (Part 23: structured, validated) ────────────────────────

def build_summary(tenant_id: str, call_id: str, *, provider_summary: str = "") -> dict:
    """Structured post-call summary. The provider summary is UNTRUSTED input — kept
    as a hint; structured outcomes are reconciled against persisted action records."""
    s = session_for_call(tenant_id, call_id)
    toolcalls = [t for t in stores.voice_toolcalls().list(tenant_id) if t.get("call_id") == call_id]
    transfers = [t for t in stores.voice_transfers().list(tenant_id) if t.get("call_id") == call_id]
    booking_done = any(t.get("tool_name") in ("create_calendar_booking",) and
                       (t.get("result") or {}).get("status") in ("confirmed", "provider_pending")
                       for t in toolcalls)
    handoff_done = any(t.get("outcome") in ("transferred", "requested") for t in transfers)
    rec = {
        "id": f"vsum::{tenant_id}::{call_id}", "tenant_id": tenant_id, "call_id": call_id,
        "conversation_id": (s or {}).get("conversation_id", ""),
        "provider_summary": (provider_summary or "")[:2000],
        "tool_calls": [t.get("tool_name") for t in toolcalls],
        "booking_outcome": "booked" if booking_done else "none",
        "handoff_outcome": "transferred" if handoff_done else "none",
        "resolved": bool(toolcalls) and not handoff_done,
        "next_action": "human_follow_up" if handoff_done else ("none"),
        "edited": False, "created_at": now_iso()}
    return stores.voice_reports().put(tenant_id, {**rec, "id": rec["id"]})  # summaries stored in reports table


def edit_summary(tenant_id: str, call_id: str, *, text: str) -> Optional[dict]:
    rec = stores.voice_reports().get(tenant_id, f"vsum::{tenant_id}::{call_id}")
    if rec is None:
        return None
    rec.setdefault("edit_history", []).append({"at": now_iso(), "text": rec.get("provider_summary", "")})
    rec["provider_summary"] = text[:2000]
    rec["edited"] = True
    return stores.voice_reports().put(tenant_id, rec)


def list_calls(tenant_id: str, *, limit: int = 100) -> list[dict]:
    rows = sorted(stores.voice_sessions().list(tenant_id), key=lambda r: r.get("created_at", ""), reverse=True)
    return rows[:limit]
