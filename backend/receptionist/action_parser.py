"""Parse the model's output into (customer reply, [ACTION]).

The runtime prompt instructs the model to reply naturally FIRST, then output
exactly one [ACTION]...[/ACTION] block. This module:
  1. extracts that block (wherever it sits),
  2. returns the customer-facing text with the block REMOVED (customer never
     sees the action),
  3. validates/coerces the fields into a typed `Action`.

It is defensive: malformed or missing blocks never raise — they degrade to
`type=none` so a reply is always deliverable.
"""

from __future__ import annotations

import re

from .schemas import Action, ActionType, ReceptionReply, Urgency

_BLOCK_RE = re.compile(r"\[ACTION\](.*?)\[/ACTION\]", re.IGNORECASE | re.DOTALL)
_FENCE_RE = re.compile(r"^```[a-zA-Z]*\n?|\n?```$")

# Values that mean "empty" for string fields.
_EMPTY = {"", "-", "—", "unknown", "n/a", "na", "none", "null", "tbd"}

_ACTION_VALUES = {t.value for t in ActionType}
_URGENCY_VALUES = {u.value for u in Urgency}


def _clean(value: str) -> str | None:
    v = value.strip().strip("<>").strip()
    return None if v.lower() in _EMPTY else v


def _parse_fields(block: str) -> dict[str, str]:
    fields: dict[str, str] = {}
    for line in block.splitlines():
        if ":" not in line:
            continue
        key, _, val = line.partition(":")
        key = key.strip().lower()
        if key:
            fields[key] = val.strip()
    return fields


def parse_reply(raw_text: str) -> ReceptionReply:
    """Split model output → customer reply_text + validated Action."""
    raw = raw_text or ""
    match = _BLOCK_RE.search(raw)

    if not match:
        # No action block — whole output is the reply.
        return ReceptionReply(reply_text=_strip(raw), action=Action(type=ActionType.NONE))

    block = match.group(1)
    reply_text = _strip(raw[: match.start()] + raw[match.end():])
    fields = _parse_fields(block)

    # type
    type_raw = (fields.get("type") or "").strip().lower().split("|")[0].split()[0] if fields.get("type") else ""
    action_type = ActionType(type_raw) if type_raw in _ACTION_VALUES else ActionType.NONE

    # urgency
    urg_raw = (fields.get("urgency") or "").strip().lower().split("|")[0].split()[0] if fields.get("urgency") else ""
    urgency = Urgency(urg_raw) if urg_raw in _URGENCY_VALUES else Urgency.UNKNOWN

    # needs_human
    needs_human = (fields.get("needs_human") or "").strip().lower() in {"yes", "true", "y", "1"}

    return ReceptionReply(
        reply_text=reply_text,
        action=Action(
            type=action_type,
            name=_clean(fields.get("name", "")),
            contact=_clean(fields.get("contact", "")),
            datetime=_clean(fields.get("datetime", "")),
            department_or_staff=_clean(fields.get("department_or_staff", "")),
            urgency=urgency,
            details=_clean(fields.get("details", "")),
            quote_total=_clean(fields.get("quote_total", "")),
            needs_human=needs_human,
        ),
    )


def _strip(text: str) -> str:
    """Trim whitespace + any stray markdown code fences from the reply."""
    return _FENCE_RE.sub("", (text or "").strip()).strip()
