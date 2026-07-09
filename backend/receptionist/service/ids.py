"""Id + time helpers for the durable receptionist service.

`new_id` uses secrets so ids are unique across instances (matches approvals'
`ap_<hex>` scheme). `now_iso` is the single timestamp source so ordering keys
are consistent everywhere.
"""

from __future__ import annotations

import secrets
from datetime import datetime, timezone


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def new_id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_hex(6)}"
