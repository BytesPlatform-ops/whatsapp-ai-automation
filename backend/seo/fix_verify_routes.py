"""HTTP surface for Fix Verification (/api/agents/seo/fix-verify/*).

Routes
------
POST /fix-verify/record         — record a fix as applied (creates PENDING)
POST /fix-verify/{fix_id}/verify — re-fetch the page and verify the outcome
GET  /fix-verify                 — list verifications (?issue_id= | ?site_id=)

Tenant resolution mirrors agent_routes.py:
  - POST routes: X-Pixie-Tenant header wins; body/query fallback in non-strict mode.
  - GET routes:  X-Pixie-Tenant header wins; query tenant_id / "demo_tenant" fallback.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field

from .fix_verify import list_fix_verifications, record_fix, verify_fix
from .tenant import effective_tenant, resolve_tenant, resolve_tenant_header

router = APIRouter(prefix="/api/agents/seo", tags=["seo-fix-verify"])


# ── Request bodies ────────────────────────────────────────────────────────────

class RecordFixBody(BaseModel):
    """Body for POST /fix-verify/record."""
    model_config = ConfigDict(extra="ignore")
    tenant_id: Optional[str] = "demo_tenant"
    site_id: str = Field(..., min_length=1)
    issue_id: str = Field(..., min_length=1)
    page_id: str = Field(..., min_length=1)
    page_url: str = Field(..., min_length=4)
    rule_key: str = Field(..., min_length=1)
    applied_fix: str = ""
    field_name: str = Field(
        ...,
        description="Page field that was changed: title | meta_description | h1",
    )
    before_value: str = ""
    intended_after_value: str = ""


# ── Serialiser ────────────────────────────────────────────────────────────────

def _fv_to_dict(fix_id: str, fv) -> dict:
    return {
        "id": fix_id,
        "tenant_id": fv.tenant_id,
        "site_id": fv.site_id,
        "issue_id": fv.issue_id,
        "page_id": fv.page_id,
        "page_url": fv.page_url,
        "rule_key": fv.rule_key,
        "applied_fix": fv.applied_fix,
        "field_name": fv.field_name,
        "before_value": fv.before_value,
        "intended_after_value": fv.intended_after_value,
        "recrawl_job_id": fv.recrawl_job_id,
        "observed_after_value": fv.observed_after_value,
        "result": fv.result.value if hasattr(fv.result, "value") else fv.result,
        "remaining_evidence": fv.remaining_evidence,
        "verified_at": fv.verified_at,
        "created_at": fv.created_at,
        "updated_at": fv.updated_at,
    }


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/fix-verify/record")
def record_fix_endpoint(
    body: RecordFixBody,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
) -> dict:
    """Record that a fix has been applied for an SEO issue.

    Creates a ``FixVerification`` row with ``result=pending``.  Call
    ``POST /fix-verify/{fix_id}/verify`` to check the live outcome.
    """
    tenant = effective_tenant(_header_tenant, body.tenant_id)
    fix_id, fv = record_fix(
        tenant,
        site_id=body.site_id,
        issue_id=body.issue_id,
        page_id=body.page_id,
        page_url=body.page_url,
        rule_key=body.rule_key,
        applied_fix=body.applied_fix,
        field_name=body.field_name,
        before_value=body.before_value,
        intended_after_value=body.intended_after_value,
    )
    return {"fix_verification": _fv_to_dict(fix_id, fv)}


@router.post("/fix-verify/{fix_id}/verify")
def verify_fix_endpoint(
    fix_id: str,
    _header_tenant: Optional[str] = Depends(resolve_tenant_header),
    tenant_id: Optional[str] = Query(default=None),
) -> dict:
    """Re-fetch the page and update the fix verification result.

    VERIFIED  — observed value matches intended_after_value.
    FAILED    — observed value still shows before_value or a third value.

    Verification is based on the re-fetched live value ONLY.
    """
    tenant = effective_tenant(_header_tenant, tenant_id)
    result = verify_fix(tenant, fix_id)
    if result is None:
        raise HTTPException(status_code=404, detail={"error": "fix_verification_not_found"})
    fid, fv = result
    return {"fix_verification": _fv_to_dict(fid, fv)}


@router.get("/fix-verify")
def list_fix_verifications_endpoint(
    issue_id: Optional[str] = Query(default=None),
    site_id: Optional[str] = Query(default=None),
    tenant: str = Depends(resolve_tenant),
) -> dict:
    """List fix verifications, optionally filtered by issue_id or site_id."""
    pairs = list_fix_verifications(tenant, issue_id=issue_id, site_id=site_id)
    return {"fix_verifications": [_fv_to_dict(fid, fv) for fid, fv in pairs]}
