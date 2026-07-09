"""Handler contract + registry.

A handler takes a `HandlerContext` (the message, tenant, resolved contact, and
the brain's extracted `fields`) and returns a `HandlerResult` (customer-facing
reply + the durable record it created/updated + status). Handlers must:

  - be pure-ish: create/update records via `service.stores`, call providers via
    `receptionist.providers`, and NEVER perform a real outward side effect that
    the provider layer hasn't gated,
  - never raise for expected-missing data — ask for it in the reply instead,
  - set `status="pending"` (not "failed") when a real integration is absent and
    the record is parked for the team (honest degraded mode, no fake success).

`fields` (all optional, strings unless noted) the brain may populate:
    name, email, phone, company, service, service_interest, date, time,
    timezone, budget, quantity, scope, location, timeline, urgency (low|normal|
    high|emergency), preferred_time, reason, amount (number|str), currency,
    reference / order_ref, remind_at, due_at, question, campaign_id, sentiment,
    notes, consent (bool), unsubscribe_scope (marketing|all).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Optional

from ..ids import now_iso


@dataclass
class HandlerContext:
    tenant_id: str
    message: str
    intent: str
    fields: dict
    profile: dict
    conversation_id: str = ""
    contact_id: Optional[str] = None
    channel: str = "web_chat"
    confidence: float = 0.0
    degraded: bool = False
    campaign_id: str = ""
    now: str = field(default_factory=now_iso)

    def f(self, key: str, default: str = "") -> str:
        v = self.fields.get(key)
        return v if v not in (None, "") else default


@dataclass
class HandlerResult:
    reply: str = ""
    action: str = "none"
    status: str = "executed"           # executed | pending | failed | noop | blocked
    record_type: str = ""
    record_id: str = ""
    record: Optional[dict] = None
    detail: str = ""
    degraded: bool = False
    escalate: bool = False
    provider_status: Optional[dict] = None
    extra: dict = field(default_factory=dict)


Handler = Callable[[HandlerContext], HandlerResult]

_REGISTRY: dict[str, Handler] = {}


def register(*intents: str) -> Callable[[Handler], Handler]:
    def deco(fn: Handler) -> Handler:
        for intent in intents:
            _REGISTRY[intent] = fn
        return fn
    return deco


def get_handler(intent: str) -> Optional[Handler]:
    return _REGISTRY.get(intent)


def registered_intents() -> list[str]:
    return sorted(_REGISTRY.keys())
