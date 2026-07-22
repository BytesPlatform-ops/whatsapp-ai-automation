"""Content planning HTTP surface — Idea Curator + Content Calendar.

  POST /api/meta/ideas/generate            → fresh ideas (not persisted)
  GET  /api/meta/ideas                     → saved idea library
  POST /api/meta/ideas/save                → save an idea to the library
  DELETE /api/meta/ideas?id=               → remove a saved idea

  POST /api/meta/calendar/generate         → build a 7/30-day calendar (replaces current)
  GET  /api/meta/calendar                  → the current calendar
  PATCH /api/meta/calendar                 → edit one item (status/fields)
  DELETE /api/meta/calendar?id=            → remove one item

Read-only over Meta — this never publishes anything. Persistence is pixie_kv.
New router file so it mounts without touching the existing Meta routers.
"""

from __future__ import annotations

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from . import calendar as cal
from . import idea_curator as ideas

router = APIRouter(prefix="/api/meta", tags=["meta-planner"])


# ── Ideas ─────────────────────────────────────────────────────────────────────

class GenerateIdeasBody(BaseModel):
    tenant_id: str
    types: list[str] = Field(default_factory=list)
    per_type: int = 2


@router.post("/ideas/generate")
async def generate_ideas(body: GenerateIdeasBody) -> dict:
    return await ideas.generate_ideas(body.tenant_id, body.types, body.per_type)


@router.get("/ideas")
def list_ideas(tenant_id: str = Query(...)) -> dict:
    return ideas.list_ideas(tenant_id)


class SaveIdeaBody(BaseModel):
    tenant_id: str
    idea: dict = Field(default_factory=dict)


@router.post("/ideas/save")
def save_idea(body: SaveIdeaBody) -> dict:
    return ideas.save_idea(body.tenant_id, body.idea)


@router.delete("/ideas")
def delete_idea(tenant_id: str = Query(...), id: str = Query(...)) -> dict:
    return ideas.delete_idea(tenant_id, id)


# ── Calendar ──────────────────────────────────────────────────────────────────

class GenerateCalendarBody(BaseModel):
    tenant_id: str
    horizon: int = 7
    start_date: str = ""


@router.post("/calendar/generate")
async def generate_calendar(body: GenerateCalendarBody) -> dict:
    return await cal.generate_calendar(body.tenant_id, body.horizon, body.start_date)


@router.get("/calendar")
def get_calendar(tenant_id: str = Query(...)) -> dict:
    return cal.get_calendar(tenant_id)


class UpdateCalendarBody(BaseModel):
    tenant_id: str
    id: str
    patch: dict = Field(default_factory=dict)


@router.patch("/calendar")
def update_calendar(body: UpdateCalendarBody) -> dict:
    return cal.update_item(body.tenant_id, body.id, body.patch)


@router.delete("/calendar")
def delete_calendar(tenant_id: str = Query(...), id: str = Query(...)) -> dict:
    return cal.delete_item(tenant_id, id)


# Per-item approval-workflow actions (Part 5).

class ItemActionBody(BaseModel):
    tenant_id: str
    id: str
    now: str = ""


@router.post("/calendar/regenerate")
async def calendar_regenerate(body: ItemActionBody) -> dict:
    return await cal.regenerate_item(body.tenant_id, body.id)


@router.post("/calendar/save-to-library")
def calendar_save_to_library(body: ItemActionBody) -> dict:
    return cal.save_item_to_library(body.tenant_id, body.id)


@router.post("/calendar/request-publish")
def calendar_request_publish(body: ItemActionBody) -> dict:
    return cal.request_publish(body.tenant_id, body.id, body.now)
