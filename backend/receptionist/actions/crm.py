"""Lead / complaint / escalation handlers — append to per-tenant JSON stores.

Demo-grade real: writes to local JSON (a stand-in CRM + escalation queue). Swap
for a real CRM/Slack/email ping later; the handler surface stays the same.
"""

from __future__ import annotations

import json
import uuid
from pathlib import Path

_DATA = Path(__file__).resolve().parent.parent / "data"


def _append(filename: str, record: dict) -> str:
    _DATA.mkdir(parents=True, exist_ok=True)
    path = _DATA / filename
    rows = json.loads(path.read_text()) if path.exists() else []
    rows.append(record)
    path.write_text(json.dumps(rows, indent=2))
    return str(path)


def _record(action, request) -> dict:
    return {
        "id": uuid.uuid4().hex,
        "tenant_id": request.tenant_id,
        "type": action.type.value,
        "name": action.name,
        "contact": action.contact,
        "details": action.details,
        "urgency": action.urgency.value,
        "needs_human": action.needs_human,
        "channel": request.channel.value,
    }


def handle_lead(action, request) -> dict:
    store = _append(f"leads_{request.tenant_id}.json", _record(action, request))
    return {"handled": True, "saved_to": store, "kind": "lead"}


def handle_escalation(action, request) -> dict:
    """Complaints / escalations → human queue (would ping a human in prod)."""
    store = _append(f"escalations_{request.tenant_id}.json", _record(action, request))
    return {"handled": True, "saved_to": store, "kind": "escalation", "human_notified": True}
