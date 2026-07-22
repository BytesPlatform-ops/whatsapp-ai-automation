"""Brand Brain HTTP surface.

  GET  /api/meta/brand-brain?tenant_id=            → the persisted Brand Brain (or exists:false)
  POST /api/meta/brand-brain/generate             → analyze old posts + (re)build it

Read-only over Meta: this only reads posts/media — it never publishes or changes
anything. Tokens are read server-side via token_service and never returned. Kept
in a NEW router file so it mounts without touching the existing Meta routers.
"""

from __future__ import annotations

from fastapi import APIRouter, Query
from pydantic import BaseModel

from . import brand_brain

router = APIRouter(prefix="/api/meta", tags=["meta-brand-brain"])


@router.get("/brand-brain")
def get_brand_brain(tenant_id: str = Query(...)) -> dict:
    return brand_brain.get_brand_brain(tenant_id)


class GenerateBody(BaseModel):
    tenant_id: str


@router.post("/brand-brain/generate")
async def generate_brand_brain(body: GenerateBody) -> dict:
    return await brand_brain.generate_brand_brain(body.tenant_id)
