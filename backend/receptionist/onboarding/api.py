"""Onboarding HTTP surface.

GET  /onboarding               → the setup wizard page
GET  /onboarding/api/industries → list industries + core fields
GET  /onboarding/api/questions  → core fields + lean question subset for an industry
POST /onboarding/api/submit     → save answers, return the new tenant_id + chat URL
GET  /onboarding/api/tenant/{id}→ business name/industry (for the chat header)
"""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from . import bank, store

router = APIRouter(prefix="/onboarding", tags=["onboarding"])
_STATIC = Path(__file__).resolve().parent.parent / "static"


class SubmitIn(BaseModel):
    business_name: str = Field(..., min_length=1, max_length=120)
    industry: str
    core: dict = Field(default_factory=dict)
    answers: list[dict] = Field(default_factory=list)  # [{id, value}]


@router.get("")
async def page() -> FileResponse:
    return FileResponse(_STATIC / "onboarding.html")


@router.get("/api/industries")
async def list_industries() -> dict:
    return {"industries": bank.industries(), "core_fields": store.CORE_FIELDS}


@router.get("/api/questions")
async def get_questions(industry: str) -> dict:
    if industry not in bank.industries():
        raise HTTPException(404, "unknown industry")
    return {"core_fields": store.CORE_FIELDS, "questions": bank.questions_for(industry)}


@router.post("/api/submit")
async def submit(body: SubmitIn) -> dict:
    if body.industry not in bank.industries():
        raise HTTPException(422, "unknown industry")
    core = dict(body.core)
    core.setdefault("BUSINESS_NAME", body.business_name)
    tenant_id = store.save_tenant(
        business_name=body.business_name, industry=body.industry, core=core, answers=body.answers
    )
    return {"tenant_id": tenant_id, "chat_url": f"/receptionist?tenant={tenant_id}"}


@router.get("/api/tenant/{tenant_id}")
async def tenant_info(tenant_id: str) -> dict:
    profile = store.load_profile(tenant_id)
    if not profile:
        raise HTTPException(404, "unknown tenant")
    return {
        "tenant_id": tenant_id,
        "business_name": profile.get("core", {}).get("BUSINESS_NAME", tenant_id),
        "industry": profile.get("industry"),
    }
