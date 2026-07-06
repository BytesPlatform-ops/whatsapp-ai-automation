"""Content asset HTTP surface.

  POST   /api/content/assets           upload media (base64 JSON — proxy-friendly)
  GET    /api/content/assets           list a tenant's assets
  GET    /api/content/assets/{id}      one asset
  DELETE /api/content/assets/{id}      remove asset + stored bytes
  GET    /api/content/assets/file/{n}  serve a local-fallback file (demo/mock only)
  GET    /api/content/storage/status   storage provider + Meta-reachability
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field

import persistence
import storage
from content import service as svc

router = APIRouter(prefix="/api/content", tags=["content"])


class UploadBody(BaseModel):
    tenant_id: str = "demo_tenant"
    uploaded_by: str = ""
    filename: str = Field(..., min_length=1)
    content_type: str = Field(..., min_length=1)
    data_base64: str = Field(..., min_length=1)
    metadata: dict = Field(default_factory=dict)


@router.post("/assets")
def upload(body: UploadBody) -> dict:
    try:
        asset = svc.create_asset_from_base64(
            body.tenant_id, filename=body.filename, content_type=body.content_type,
            data_base64=body.data_base64, uploaded_by=body.uploaded_by, metadata=body.metadata,
        )
    except storage.StorageNotConfigured as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except storage.StorageError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"status": "uploaded", "asset": asset.model_dump(),
            "meta_reachable": asset.meta_reachable()}


@router.get("/assets")
def list_assets(tenant_id: str = Query(...)) -> dict:
    return {"assets": [a.model_dump() for a in svc.list_assets(tenant_id)]}


@router.get("/assets/{asset_id}")
def get_asset(asset_id: str, tenant_id: str = Query(...)) -> dict:
    asset = svc.get_asset(tenant_id, asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="asset not found")
    return asset.model_dump()


@router.delete("/assets/{asset_id}")
def delete_asset(asset_id: str, tenant_id: str = Query(...)) -> dict:
    if not svc.delete_asset(tenant_id, asset_id):
        raise HTTPException(status_code=404, detail="asset not found")
    return {"ok": True, "deleted": asset_id}


@router.get("/assets/file/{name}")
def serve_local(name: str):
    data = storage.read_local(name)
    if data is None:
        raise HTTPException(status_code=404, detail="file not found")
    return Response(content=data, media_type="application/octet-stream")


@router.get("/storage/status")
def storage_status() -> dict:
    return {**storage.status(), "persistence": persistence.status()}
