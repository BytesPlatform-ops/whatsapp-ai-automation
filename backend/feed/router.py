"""Feed API — the FastAPI surface the Pixie Lab For You + per-agent feeds drive.

Endpoints (tenant-scoped; deterministic rules engine, no AI/network):
  GET  /api/feed/for-you            global proactive feed + health score
  GET  /api/feed/agent/{agent}      that agent's cards only
  POST /api/feed/cards/{id}/action  approve/skip/etc → update card status

Self-contained: one `include_router` line in app.py wires `/api/feed`.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from .rules import generate_cards, health_score
from .schemas import ActionResult, FeedAgent, FeedCard, FeedResponse
from .store import get_feed_store

router = APIRouter(prefix="/api/feed", tags=["feed"])

# action types that remove a card from the feed
_DISMISS = {"skip", "not_relevant"}
_RESOLVE = {"approve", "do_this"}


def _visible_cards(tenant_id: str, agent: FeedAgent | None = None) -> list[FeedCard]:
    store = get_feed_store()
    signals = store.get_signals(tenant_id)
    statuses = store.get_statuses(tenant_id)
    out: list[FeedCard] = []
    for card in generate_cards(signals):
        st = statuses.get(card.id)
        if st in ("skipped", "completed", "dismissed", "approved", "needs_approval"):
            continue  # resolved / dismissed / pending-approval cards drop out of the live feed
        if agent is not None and card.primary_agent != agent.value:
            continue
        out.append(card)
    return out


@router.get("/for-you", response_model=FeedResponse)
def for_you(tenant_id: str = Query(...)) -> FeedResponse:
    store = get_feed_store()
    return FeedResponse(
        tenant_id=tenant_id,
        health=health_score(store.get_signals(tenant_id)),
        cards=_visible_cards(tenant_id),
    )


@router.get("/agent/{agent}", response_model=FeedResponse)
def agent_feed(agent: str, tenant_id: str = Query(...)) -> FeedResponse:
    try:
        ag = FeedAgent(agent)
    except ValueError:
        raise HTTPException(status_code=404, detail=f"unknown agent: {agent}")
    store = get_feed_store()
    return FeedResponse(
        tenant_id=tenant_id,
        health=health_score(store.get_signals(tenant_id)),
        cards=_visible_cards(tenant_id, ag),
    )


class ActionBody(BaseModel):
    tenant_id: str
    action_type: str
    # optional context so risky actions create meaningful approvals + activity
    heading: str = ""
    agent: str = "pixie"
    requires_confirmation: bool = False
    now: str = ""


@router.post("/cards/{card_id}/action", response_model=ActionResult)
def card_action(card_id: str, body: ActionBody) -> ActionResult:
    # Import lazily to keep the feed module independent of the other services.
    from activity.router import log_activity
    from approvals.router import create_approval

    store = get_feed_store()
    at = body.action_type
    title = body.heading or card_id

    if at in _DISMISS:
        store.set_status(body.tenant_id, card_id, "skipped")
        log_activity(body.tenant_id, "feed_card_skipped", title=title, agent=body.agent, created_at=body.now)
        return ActionResult(ok=True, card_id=card_id, status="skipped", note=f"{at} recorded")

    if at in _RESOLVE:
        if body.requires_confirmation:
            # Risky → gate behind an explicit approval rather than executing.
            create_approval(body.tenant_id, body.agent, title, at, created_at=body.now)
            store.set_status(body.tenant_id, card_id, "needs_approval")
            return ActionResult(ok=True, card_id=card_id, status="needs_approval", note="approval created")
        store.set_status(body.tenant_id, card_id, "completed")
        log_activity(body.tenant_id, "feed_card_completed", title=title, agent=body.agent, created_at=body.now)
        return ActionResult(ok=True, card_id=card_id, status="completed", note=f"{at} recorded")

    # preview/edit/connect/remind_later etc. don't change visibility
    return ActionResult(ok=True, card_id=card_id, status="new", note=f"{at} acknowledged")
