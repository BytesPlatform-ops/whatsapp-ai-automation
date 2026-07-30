"""Channel-typed campaign content validation + safe personalisation (Parts 11/12/13).

Content is validated per channel (no single raw text block bypasses provider-specific
rules). Personalisation uses a fixed, typed variable allowlist rendered server-side —
no arbitrary template expressions, no secret/internal field access, no model-generated
hidden variables. A missing required variable blocks the recipient step.
"""

from __future__ import annotations

import re
from typing import Optional

# Typed, allowlisted personalisation variables only.
ALLOWED_VARIABLES = {
    "first_name", "last_name", "business_name", "service", "booking_date", "booking_time",
    "assigned_rep", "location",
}
_VAR_RE = re.compile(r"\{\{\s*([a-z_]+)\s*\}\}")


def validate_content(channel: str, content: dict) -> dict:
    """Return {ok, errors, warnings, variables} for a channel content block."""
    errors: list[str] = []
    warnings: list[str] = []
    body = (content.get("body") or "").strip()
    subject = (content.get("subject") or "").strip()
    template_ref = content.get("template_ref") or ""
    interactive = content.get("interactive") or {}

    used = set(_VAR_RE.findall(body + " " + subject))
    unknown = used - ALLOWED_VARIABLES
    if unknown:
        errors.append("unknown_variables:" + ",".join(sorted(unknown)))

    if channel == "email":
        if not subject:
            errors.append("missing_subject")
        if not body:
            errors.append("missing_body")
    elif channel == "whatsapp":
        # outside a 24h window a template is required — the WhatsApp handler enforces
        # this at send time; here we just require either a template or in-window body.
        if not (template_ref or body):
            errors.append("missing_template_or_body")
    elif channel in ("instagram", "messenger", "sms", "telegram"):
        if not body:
            errors.append("missing_body")
        if channel == "messenger" and interactive:
            qrs = interactive.get("quick_replies") or interactive.get("buttons") or []
            if any(not (q.get("title") and q.get("payload")) for q in qrs):
                errors.append("interactive_needs_title_and_payload")
    elif channel in ("voice_call", "voice_callback"):
        if not body:
            warnings.append("no_call_script")
    else:
        errors.append("unsupported_channel")

    return {"ok": len(errors) == 0, "errors": errors, "warnings": warnings, "variables": sorted(used)}


def required_variables(content: dict) -> list[str]:
    text = (content.get("body") or "") + " " + (content.get("subject") or "")
    return sorted(set(_VAR_RE.findall(text)) & ALLOWED_VARIABLES)


def build_variable_map(contact: dict, *, business_name: str = "", extra: Optional[dict] = None) -> dict:
    extra = extra or {}
    name = (contact.get("name") or "").strip()
    first, _, last = name.partition(" ")
    return {
        "first_name": first, "last_name": last, "business_name": business_name,
        "service": contact.get("service_interest", "") or extra.get("service", ""),
        "booking_date": extra.get("booking_date", ""), "booking_time": extra.get("booking_time", ""),
        "assigned_rep": extra.get("assigned_rep", ""),
        "location": contact.get("location", "") or extra.get("location", ""),
    }


def render(content: dict, variables: dict) -> dict:
    """Render a content block server-side. Returns {ok, subject, body, unresolved[]}.
    A missing required variable is reported as unresolved (caller blocks the step)."""
    unresolved: list[str] = []

    def _sub(text: str) -> str:
        def repl(m):
            key = m.group(1)
            val = variables.get(key, "")
            if key in ALLOWED_VARIABLES and not val:
                unresolved.append(key)
            return str(val)
        return _VAR_RE.sub(repl, text or "")

    subject = _sub(content.get("subject", ""))
    body = _sub(content.get("body", ""))
    return {"ok": len(unresolved) == 0, "subject": subject, "body": body,
            "unresolved": sorted(set(unresolved))}
