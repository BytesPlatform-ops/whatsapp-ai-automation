"""Meta inbox — comments + DMs, AI triage, approval-gated replies (persistent).

Demo mode seeds realistic comments/DMs so the whole flow works with no Meta app.
`analyze` classifies intent/sentiment/route via OpenAI; `prepare_reply` files an
approval (public replies always need approval); `route_to_receptionist` hands a
service/pricing message to the receptionist as an internal signal. Inbox items
persist through the same layer (meta_inbox_items). No token is ever returned.
"""

from __future__ import annotations

import json
import secrets
from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

import persistence
from activity.router import log_activity
from approvals.router import create_approval
from integrations import resolve_connector
from models import ModelRequest, get_router
from schemas import ModelTier

from .inbox_prompt import INBOX_AGENT_PROMPT
from .oauth import META_CAPABILITIES
from .store import get_meta_store

AGENT_SLUG = "marketing-agent"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class MetaInboxItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = ""
    tenant_id: str
    asset_id: str = ""
    platform: str = "instagram"
    interaction_type: str = "comment"      # comment | dm
    external_id: str = ""                   # meta comment/message id
    sender_name: str = ""
    sender_id: str = ""
    message_text: str = ""
    intent: str = "unknown"
    sentiment: str = "neutral"
    risk_level: str = "low"
    status: str = "new"                     # new|analyzed|reply_prepared|pending_approval|replied|skipped|routed|blocked|failed
    recommended_route: str = "marketing-agent"
    prepared_reply: str = ""
    internal_notes: str = ""
    source_content_id: str = ""
    approval_id: str = ""
    metadata_json: dict = Field(default_factory=dict)
    created_at: str = ""
    updated_at: str = ""


_DEMO = [
    {"interaction_type": "comment", "platform": "instagram", "external_id": "c_demo_1",
     "sender_name": "priya_k", "message_text": "How much for a custom cake and do you deliver Friday?"},
    {"interaction_type": "comment", "platform": "instagram", "external_id": "c_demo_2",
     "sender_name": "mike.r", "message_text": "This reel is amazing 😍 keep it up!"},
    {"interaction_type": "comment", "platform": "facebook", "external_id": "c_demo_3",
     "sender_name": "Anon", "message_text": "FREE FOLLOWERS click my link!!!"},
    {"interaction_type": "dm", "platform": "instagram", "external_id": "d_demo_1",
     "sender_name": "sara_lee", "message_text": "Hi, are you open on Sunday and what are your prices?"},
    {"interaction_type": "comment", "platform": "instagram", "external_id": "c_demo_4",
     "sender_name": "j_torres", "message_text": "Waited 40 min and my order was cold. Not happy."},
]


class _Store:
    def __init__(self) -> None:
        self._repo = persistence.table("meta_inbox_items")

    def save(self, item: MetaInboxItem) -> MetaInboxItem:
        item.updated_at = _now()
        self._repo.upsert(persistence.envelope(item.id, item.tenant_id, item.model_dump(), item.created_at))
        return item

    def create(self, item: MetaInboxItem) -> MetaInboxItem:
        item.id = f"inbox_{secrets.token_hex(6)}"
        item.created_at = _now()
        return self.save(item)

    def get(self, tenant_id: str, item_id: str) -> Optional[MetaInboxItem]:
        row = self._repo.get(tenant_id, item_id)
        return MetaInboxItem(**row["data"]) if row else None

    def list(self, tenant_id: str) -> list[MetaInboxItem]:
        return [MetaInboxItem(**r["data"]) for r in reversed(self._repo.list_by_tenant(tenant_id))]


_store: Optional[_Store] = None


def get_inbox_store() -> _Store:
    global _store
    if _store is None:
        _store = _Store()
    return _store


def _seed_demo_if_empty(tenant_id: str) -> None:
    store = get_inbox_store()
    if store.list(tenant_id):
        return
    defaults = get_meta_store().defaults(tenant_id)
    for d in _DEMO:
        asset_id = defaults.get("instagram_id" if d["platform"] == "instagram" else "page_id", "")
        store.create(MetaInboxItem(tenant_id=tenant_id, asset_id=asset_id, sender_id=f"u_{secrets.token_hex(3)}",
                                   **d))


def list_inbox(tenant_id: str, interaction_type: str = "") -> list[MetaInboxItem]:
    if get_meta_store().mode(tenant_id) is not None:
        _seed_demo_if_empty(tenant_id)
    items = get_inbox_store().list(tenant_id)
    if interaction_type:
        items = [i for i in items if i.interaction_type == interaction_type]
    return items


def _provider(mode: str) -> str:
    return "openai" if mode == "openai" else "mock"


async def analyze(tenant_id: str, item_id: str) -> dict:
    store = get_inbox_store()
    item = store.get(tenant_id, item_id)
    if not item:
        return {"status": "not_found", "message": "Inbox item not found."}
    router = get_router()
    result = await router.complete(ModelRequest(
        tier=ModelTier.SMALL, task="inbox", system=INBOX_AGENT_PROMPT,
        user=f"interaction_type: {item.interaction_type}\nplatform: {item.platform}\n"
             f"from: {item.sender_name}\nmessage: {item.message_text}",
        expects_json=True, context={"tenant_id": tenant_id, "agent": AGENT_SLUG},
    ))
    try:
        data = json.loads(result.text)
    except (ValueError, TypeError) as exc:
        return {"status": "error", "message": f"model returned non-JSON: {exc}"}
    item.intent = data.get("intent", item.intent)
    item.sentiment = data.get("sentiment", item.sentiment)
    item.risk_level = data.get("risk_level", "low")
    item.recommended_route = data.get("recommended_route", "marketing-agent")
    item.prepared_reply = data.get("prepared_reply", "")
    item.internal_notes = data.get("internal_notes", "")
    item.status = "analyzed"
    store.save(item)
    log_activity(tenant_id, "inbox_analyzed", title=f"Analyzed {item.interaction_type} from {item.sender_name}",
                 agent=AGENT_SLUG)
    return {"status": "analyzed", "llm_provider": _provider(router.mode),
            "model": router.model_for(ModelTier.SMALL), "item": item.model_dump(), "analysis": data}


def _reply_capability(item: MetaInboxItem) -> str:
    return "meta_dm_reply" if item.interaction_type == "dm" else "meta_comment_reply"


def prepare_reply(tenant_id: str, item_id: str, reply: str = "", now: str = "") -> dict:
    store = get_inbox_store()
    item = store.get(tenant_id, item_id)
    if not item:
        return {"status": "not_found", "message": "Inbox item not found."}
    text = reply or item.prepared_reply
    if not text:
        return {"status": "no_reply", "message": "Analyze first or provide a reply."}
    capability = _reply_capability(item)
    payload = {"asset_id": item.asset_id, "reply": text}
    if item.interaction_type == "dm":
        payload["recipient_id"] = item.sender_id
    else:
        payload["comment_id"] = item.external_id
    tool = resolve_connector(tenant_id, capability).provider
    approval = create_approval(
        tenant_id, AGENT_SLUG,
        title=f"Reply to {item.interaction_type} from {item.sender_name}",
        action_type=capability, description=text[:140], created_at=now,
        risk_level=item.risk_level or "medium", capability=capability, tool=tool,
        prepared_output={"reply": text, "in_reply_to": item.message_text,
                         "platform": item.platform, "sender": item.sender_name,
                         "inbox_item_id": item.id,
                         "execution_actions": [{"capability": capability, "payload": payload}]},
        preview=text[:120],
    )
    item.status = "pending_approval"
    item.approval_id = approval.id
    item.prepared_reply = text
    store.save(item)
    return {"status": "approval_required", "agent_slug": AGENT_SLUG, "approval_id": approval.id,
            "capability": capability, "item": item.model_dump()}


def prepare_hide(tenant_id: str, item_id: str, now: str = "") -> dict:
    store = get_inbox_store()
    item = store.get(tenant_id, item_id)
    if not item:
        return {"status": "not_found", "message": "Inbox item not found."}
    tool = resolve_connector(tenant_id, "meta_comment_hide").provider
    approval = create_approval(
        tenant_id, AGENT_SLUG, title=f"Hide comment from {item.sender_name}",
        action_type="meta_comment_hide", description="hide spam/abuse", created_at=now,
        risk_level="medium", capability="meta_comment_hide", tool=tool,
        prepared_output={"platform": item.platform, "sender": item.sender_name,
                         "in_reply_to": item.message_text, "inbox_item_id": item.id,
                         "execution_actions": [{"capability": "meta_comment_hide",
                                                "payload": {"asset_id": item.asset_id,
                                                            "comment_id": item.external_id}}]},
        preview=f"Hide: {item.message_text[:80]}",
    )
    item.status = "pending_approval"
    item.approval_id = approval.id
    store.save(item)
    return {"status": "approval_required", "approval_id": approval.id, "item": item.model_dump()}


def route_to_receptionist(tenant_id: str, item_id: str, now: str = "") -> dict:
    """Hand a service/pricing message to the receptionist as an internal signal.
    Internal only — no public action, so no approval needed."""
    store = get_inbox_store()
    item = store.get(tenant_id, item_id)
    if not item:
        return {"status": "not_found", "message": "Inbox item not found."}
    item.status = "routed"
    item.recommended_route = "ai-receptionist"
    store.save(item)
    log_activity(tenant_id, "routed_to_receptionist",
                 title=f"Routed {item.interaction_type} from {item.sender_name} → AI Receptionist",
                 agent=AGENT_SLUG, created_at=now)
    return {"status": "routed", "route": "ai-receptionist", "item": item.model_dump()}


def mark_reply_result(tenant_id: str, item_id: str, result: dict) -> None:
    """Called by the approvals executor after an inbox reply/hide runs."""
    store = get_inbox_store()
    item = store.get(tenant_id, item_id)
    if not item:
        return
    status = result.get("status")
    if status == "success":
        item.status = "replied"
    elif status == "blocked":
        item.status = "blocked"
    else:
        item.status = "failed"
    store.save(item)


def permissions(tenant_id: str) -> dict:
    """Comment/DM permission status derived from granted scopes (token-safe)."""
    from . import token_service as ts
    safe = ts.safe_status(tenant_id)
    scopes = safe.get("scopes", []) if safe.get("connected") else []
    connected = safe.get("connected", False)

    def state(needed: list[str]) -> str:
        if not connected:
            return "missing"
        return "available" if any(s in scopes for s in needed) else "app_review_needed"

    return {
        "comments": state(["pages_manage_engagement", "instagram_manage_comments"]),
        "dms": state(["instagram_manage_messages", "pages_messaging"]),
    }
