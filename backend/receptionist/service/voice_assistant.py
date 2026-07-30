"""Dynamic inbound assistant configuration (Parts 4/9). Bounded + tenant-safe.

Builds the assistant configuration returned to Vapi on an ``assistant-request`` from
the ACTIVE Pixie business configuration only. Secrets never appear in the prompt;
full customer history is never placed in the initial prompt (a bounded summary may
be added after caller resolution). Missing configuration never invents business
facts — the caller gets a safe generic greeting.
"""

from __future__ import annotations

import os
from typing import Optional

# Voice tools exposed to the provider assistant — all backed by the canonical
# action registry via voice_tools.execute_voice_tool (never direct side effects).
VOICE_TOOLS = [
    "get_business_hours", "get_service_information", "get_location_information",
    "search_knowledge", "identify_or_update_contact", "qualify_lead",
    "check_calendar_availability", "create_booking_request", "create_calendar_booking",
    "reschedule_booking", "cancel_booking", "create_task", "create_ticket",
    "create_quote_request", "request_human", "resolve_transfer_destination",
    "send_follow_up", "end_call",
]


def _voice_settings(tenant_id: str) -> dict:
    from . import config_repo
    cfg = config_repo.get_active(tenant_id) or {}
    return cfg.get("voice_settings") or {}


def build_assistant_config(tenant_id: str, *, caller_number: str = "") -> dict:
    """Bounded assistant configuration derived from active business config."""
    from . import config_repo, voice_policy
    cfg = config_repo.get_active_or_default(tenant_id)
    vs = _voice_settings(tenant_id)
    rec = voice_policy.recording_policy(tenant_id)

    business_name = cfg.get("business_name") or "our business"
    greeting = vs.get("greeting") or f"Thank you for calling {business_name}. How can I help you today?"
    languages = vs.get("supported_languages") or cfg.get("languages") or ["en"]

    # Bounded, speakable business facts only — no secrets, no full history.
    facts = {
        "business_name": business_name,
        "services": (cfg.get("services") or [])[:20],
        "hours": cfg.get("hours") or "",
        "locations": (cfg.get("locations") or [])[:10],
        "tone": cfg.get("tone") or "friendly and professional",
        "restricted_subjects": cfg.get("restricted_subjects") or [],
    }

    return {
        "name": vs.get("assistant_name") or f"{business_name} Receptionist",
        "greeting": greeting[:500],
        "language": (languages[0] if languages else "en"),
        "supported_languages": languages,
        "voice": {"provider": vs.get("voice_provider") or "vapi", "voice_id": vs.get("voice_id") or "",
                  "speaking_rate": vs.get("speaking_rate") or 1.0,
                  "fallback_voice_id": vs.get("fallback_voice_id") or ""},
        "model": {"provider": "pixie", "fallback_model": vs.get("fallback_model") or ""},
        "transcriber": {"fallback_transcriber": vs.get("fallback_transcriber") or ""},
        "max_duration_seconds": int(vs.get("max_call_seconds") or _max_seconds()),
        "silence_timeout_seconds": int(vs.get("silence_timeout_seconds") or 20),
        "end_call_on_silence": bool(vs.get("end_call_on_silence", True)),
        "recording": {"enabled": rec["enabled"], "consent_mode": rec["mode"],
                      "consent_version": rec["consent_version"]},
        "transfer_available": bool(voice_policy.transfer_destinations(tenant_id)),
        "restricted_subjects": facts["restricted_subjects"],
        "facts": facts,
        "tools": VOICE_TOOLS,
        # Pixie is authoritative for all business logic — the provider prompt carries
        # only bounded facts + tool declarations, no secrets, no raw history.
        "server_backed": True,
    }


def _max_seconds() -> int:
    try:
        return int(os.environ.get("AI_RECEPTIONIST_VOICE_MAX_CALL_SECONDS", "") or 900)
    except ValueError:
        return 900
