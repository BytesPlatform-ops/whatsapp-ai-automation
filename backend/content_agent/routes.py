"""Production HTTP surface for the General Content Agent.

One ``APIRouter(prefix="/api/content-agent")``, registered in app.py and reached
from Pixie Lab through the ``/api/lab/content-agent`` proxy. A router-level
``require_internal`` dependency enforces the internal shared secret when
configured. Every endpoint is tenant-scoped: the ``tenant_id`` is carried on the
body (writes) or query (reads), and every repository read is tenant-scoped, so a
client can never reach another workspace's rows by changing that value — the
trusted proxy is the only thing that sets it (see ``security.require_internal``).

Generation runs through the provider-independent service (``content_agent.generator``)
which is $0 under ``PIXIE_MODEL_MODE=fake`` (the default). Real mode reuses the
shared ``models`` layer and raises :class:`ProviderUnavailable` rather than
silently faking — mapped here to a safe 503 body.

Persistence is the store seam (``content_agent.store``) — in-memory for tests,
durable (``ca_*`` tables) under ``PIXIE_PERSIST=file|supabase``. Saves/gets return
``(id, model)`` tuples since the schemas carry no id field.
"""

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from security import require_internal

from .enums import ContentStatus, ContentType, JobStatus
from .generator import ProviderUnavailable, generate, is_mock, model_mode
from .prompts import PROMPT_VERSION
from .schemas import (
    ContentDocument,
    ContentVersion,
    DocumentPatch,
    GeneratedVariation,
    GenerationJob,
    GenerationRequest,
    ManualVersionBody,
    SaveGeneratedBody,
    SetCurrentVersionBody,
)
from .store import (
    get_document_repository,
    get_job_repository,
    get_version_repository,
    query_documents,
)
from .types import required_inputs, type_catalog

router = APIRouter(
    prefix="/api/content-agent",
    tags=["content_agent"],
    dependencies=[Depends(require_internal)],
)


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def _require_inputs(req: GenerationRequest) -> None:
    """422 when a required per-type field is blank — validated against the field
    registry (single source of truth). A required field may live on inputs
    (``topic``) or on the cross-cutting options (``platform``), so both are
    consulted."""
    missing = []
    data = {**req.options.model_dump(), **req.inputs.model_dump()}
    for name in required_inputs(req.content_type):
        val = data.get(name)
        if val in (None, "", [], {}):
            missing.append(name)
    if missing:
        raise HTTPException(
            status_code=422,
            detail={"error": "missing_inputs", "fields": missing,
                    "message": f"Missing required input(s): {', '.join(missing)}."},
        )


def _run_generation(req: GenerationRequest):
    """Run the provider-independent service, mapping a real-mode provider outage
    to a safe 503 (never a fake success)."""
    try:
        return generate(req.content_type, req.inputs, req.options)
    except ProviderUnavailable as exc:
        raise HTTPException(
            status_code=503,
            detail={"status": "provider_unavailable",
                    "message": "The content provider is not configured. "
                               "Enable mock mode or configure a model provider."},
        ) from exc


def _settings_snapshot(req: GenerationRequest) -> dict:
    """The generation request minus tenant — stored on the document so
    regeneration can reuse the exact inputs/options."""
    return {
        "content_type": req.content_type.value,
        "inputs": req.inputs.model_dump(),
        "options": req.options.model_dump(),
    }


def _version_from_variation(
    tenant_id: str,
    doc_id: str,
    variation: GeneratedVariation,
    *,
    number: int,
    created_by: str,
    provider: str,
    model: str,
    mock: bool,
    prompt_version: str,
    request_snapshot: dict,
    usage: Optional[dict] = None,
    parent_version_id: str = "",
) -> ContentVersion:
    return ContentVersion(
        tenant_id=tenant_id,
        document_id=doc_id,
        version_number=number,
        title=variation.title,
        text=variation.text,
        structured=variation.structured,
        prompt_version=prompt_version,
        request_snapshot=request_snapshot,
        provider=provider,
        model=model,
        mock=mock,
        usage=usage or {},
        created_by=created_by,
        parent_version_id=parent_version_id,
    )


def _get_doc_or_404(tenant_id: str, doc_id: str):
    found = get_document_repository().get(tenant_id, doc_id)
    if found is None:
        raise HTTPException(status_code=404, detail="document not found for tenant")
    return found


def _doc_out(doc_id: str, doc: ContentDocument) -> dict:
    return {"id": doc_id, "document": doc.model_dump()}


def _version_out(vid: str, ver: ContentVersion) -> dict:
    return {"id": vid, "version": ver.model_dump()}


def _record_job(req: GenerationRequest, result, version_ids: List[str],
                status: JobStatus = JobStatus.DONE, error: str = "") -> None:
    """Light audit row for a persisted generation (save/regenerate)."""
    job = GenerationJob(
        tenant_id=req.tenant_id,
        content_type=req.content_type,
        status=status,
        request=_settings_snapshot(req),
        error=error,
        provider=result.usage.provider if result else model_mode(),
        model=result.usage.model if result else "",
        result_version_ids=version_ids,
    )
    jid, stored = get_job_repository().create(job)
    get_job_repository().complete(req.tenant_id, jid, status=status,
                                  result_version_ids=version_ids, error=error)


# --------------------------------------------------------------------------- #
# Content-type registry
# --------------------------------------------------------------------------- #
@router.get("/content-types")
def content_types() -> dict:
    """Serializable catalog the frontend renders forms from."""
    return {"content_types": type_catalog()}


@router.get("/status")
def status() -> dict:
    """Frontend-safe generation-mode indicator (mock vs real). No secrets."""
    return {
        "mock": is_mock(),
        "mode": model_mode(),
        "prompt_version": PROMPT_VERSION,
        "provider": "mock" if is_mock() else model_mode(),
    }


# --------------------------------------------------------------------------- #
# Generation — preview (save=false) or generate-and-save (save=true)
# --------------------------------------------------------------------------- #
@router.post("/generate")
def generate_content(body: GenerationRequest) -> dict:
    """Generate variations.

    * ``save=false`` (default) → return variations for PREVIEW; nothing is
      persisted. The user edits/picks a variation and saves it explicitly.
    * ``save=true`` → also create a document whose version 1 is the first
      variation; the full result (all variations) is returned so the client can
      offer the others as extra versions.
    """
    _require_inputs(body)
    result = _run_generation(body)

    out: dict = {
        "content_type": body.content_type.value,
        "result": result.model_dump(),
        "saved": False,
    }
    if not body.save:
        return out

    if not result.variations:
        raise HTTPException(status_code=502, detail="generation produced no content")

    first = result.variations[0]
    snapshot = _settings_snapshot(body)
    doc = ContentDocument(
        tenant_id=body.tenant_id,
        content_type=body.content_type,
        title=body.title or first.title or body.content_type.value,
        status=ContentStatus.DRAFT,
        settings=snapshot,
    )
    doc_id, stored_doc = get_document_repository().create(doc)

    version = _version_from_variation(
        body.tenant_id, doc_id, first, number=1, created_by="generation",
        provider=result.usage.provider, model=result.usage.model, mock=result.usage.mock,
        prompt_version=result.usage.prompt_version, request_snapshot=snapshot,
        usage=result.usage.model_dump(),
    )
    vid, stored_ver = get_version_repository().create(version)
    _, stored_doc = get_document_repository().update(body.tenant_id, doc_id, current_version_id=vid)

    _record_job(body, result, [vid])

    out.update({"saved": True, **_doc_out(doc_id, stored_doc), "version": stored_ver.model_dump(), "version_id": vid})
    return out


# --------------------------------------------------------------------------- #
# Documents — list / create / read / update / delete
# --------------------------------------------------------------------------- #
@router.get("/documents")
def list_documents(
    tenant_id: str = Query(..., min_length=1),
    query: str = Query(default=""),
    content_type: str = Query(default=""),
    status: str = Query(default=""),
    tags: str = Query(default=""),
    include_archived: bool = Query(default=False),
    sort: str = Query(default="updated"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> dict:
    tag_list = [t.strip() for t in tags.split(",") if t.strip()]
    return query_documents(
        tenant_id, query=query, content_type=content_type, status=status,
        tags=tag_list, include_archived=include_archived, sort=sort,
        page=page, page_size=page_size,
    )


@router.post("/documents")
def save_generated(body: SaveGeneratedBody) -> dict:
    """Save a (previewed / edited) variation as a NEW document — version 1."""
    doc = ContentDocument(
        tenant_id=body.tenant_id,
        content_type=body.content_type,
        title=body.title or body.variation.title or body.content_type.value,
        status=ContentStatus.DRAFT,
        settings=body.settings,
    )
    doc_id, stored_doc = get_document_repository().create(doc)
    version = _version_from_variation(
        body.tenant_id, doc_id, body.variation, number=1, created_by="generation",
        provider=body.provider, model=body.model, mock=body.mock,
        prompt_version=body.prompt_version or PROMPT_VERSION, request_snapshot=body.settings,
    )
    vid, stored_ver = get_version_repository().create(version)
    _, stored_doc = get_document_repository().update(body.tenant_id, doc_id, current_version_id=vid)
    return {**_doc_out(doc_id, stored_doc), "version": stored_ver.model_dump(), "version_id": vid}


@router.get("/documents/{doc_id}")
def get_document(doc_id: str, tenant_id: str = Query(..., min_length=1)) -> dict:
    did, doc = _get_doc_or_404(tenant_id, doc_id)
    versions = get_version_repository().list_by_document(tenant_id, did)
    current = next((v for (vid, v) in versions if vid == doc.current_version_id), None)
    return {
        **_doc_out(did, doc),
        "current_version": current.model_dump() if current else None,
        "version_count": len(versions),
    }


@router.patch("/documents/{doc_id}")
def update_document(doc_id: str, body: DocumentPatch) -> dict:
    _get_doc_or_404(body.tenant_id, doc_id)
    # Pass raw attributes (status stays an enum) — the store uses model_copy which
    # does not re-validate, so a dumped string would corrupt the enum field.
    fields = {}
    for name in ("title", "status", "folder", "tags", "campaign_ref"):
        val = getattr(body, name)
        if val is not None:
            fields[name] = val
    updated = get_document_repository().update(body.tenant_id, doc_id, **fields)
    return _doc_out(updated[0], updated[1])


@router.delete("/documents/{doc_id}")
def delete_document(doc_id: str, tenant_id: str = Query(..., min_length=1)) -> dict:
    _get_doc_or_404(tenant_id, doc_id)
    ok = get_document_repository().delete(tenant_id, doc_id)
    return {"id": doc_id, "deleted": ok}


# --------------------------------------------------------------------------- #
# Lifecycle — archive / restore / duplicate
# --------------------------------------------------------------------------- #
@router.post("/documents/{doc_id}/archive")
def archive_document(doc_id: str, body: DocumentPatch) -> dict:
    from .store import now_iso
    _get_doc_or_404(body.tenant_id, doc_id)
    updated = get_document_repository().update(
        body.tenant_id, doc_id, status=ContentStatus.ARCHIVED, archived_at=now_iso())
    return _doc_out(updated[0], updated[1])


@router.post("/documents/{doc_id}/restore")
def restore_document(doc_id: str, body: DocumentPatch) -> dict:
    _get_doc_or_404(body.tenant_id, doc_id)
    updated = get_document_repository().update(
        body.tenant_id, doc_id, status=ContentStatus.DRAFT, archived_at="")
    return _doc_out(updated[0], updated[1])


@router.post("/documents/{doc_id}/duplicate")
def duplicate_document(doc_id: str, body: DocumentPatch) -> dict:
    """Copy a document + its CURRENT version content into a fresh document."""
    tenant_id = body.tenant_id
    did, doc = _get_doc_or_404(tenant_id, doc_id)
    versions = get_version_repository().list_by_document(tenant_id, did)
    current = next((v for (vid, v) in versions if vid == doc.current_version_id),
                   versions[-1][1] if versions else None)

    clone = ContentDocument(
        tenant_id=tenant_id,
        content_type=doc.content_type,
        title=(doc.title or doc.content_type.value) + " (copy)",
        status=ContentStatus.DRAFT,
        folder=doc.folder,
        tags=list(doc.tags),
        settings=dict(doc.settings),
    )
    clone_id, stored_clone = get_document_repository().create(clone)
    if current is not None:
        version = ContentVersion(
            tenant_id=tenant_id, document_id=clone_id, version_number=1,
            title=current.title, text=current.text, structured=current.structured,
            prompt_version=current.prompt_version, request_snapshot=current.request_snapshot,
            provider=current.provider, model=current.model, mock=current.mock,
            usage=current.usage, created_by="duplicate",
        )
        vid, _ = get_version_repository().create(version)
        _, stored_clone = get_document_repository().update(tenant_id, clone_id, current_version_id=vid)
    return {**_doc_out(clone_id, stored_clone), "source_id": did}


# --------------------------------------------------------------------------- #
# Versions — list / manual create / regenerate / set-current
# --------------------------------------------------------------------------- #
@router.get("/documents/{doc_id}/versions")
def list_versions(doc_id: str, tenant_id: str = Query(..., min_length=1)) -> dict:
    did, doc = _get_doc_or_404(tenant_id, doc_id)
    versions = get_version_repository().list_by_document(tenant_id, did)
    return {
        "document_id": did,
        "current_version_id": doc.current_version_id,
        "versions": [_version_out(vid, v) for (vid, v) in versions],
    }


@router.post("/documents/{doc_id}/versions")
def create_manual_version(doc_id: str, body: ManualVersionBody) -> dict:
    """Save an EDIT as a new version (never overwrites prior content). The new
    version becomes current; ``created_by='manual_edit'``."""
    did, doc = _get_doc_or_404(body.tenant_id, doc_id)
    vrepo = get_version_repository()
    number = vrepo.next_number(body.tenant_id, did)
    version = ContentVersion(
        tenant_id=body.tenant_id, document_id=did, version_number=number,
        title=body.title, text=body.text, structured=body.structured,
        prompt_version=PROMPT_VERSION, request_snapshot=doc.settings,
        provider="edit", model="", mock=True, created_by="manual_edit",
        parent_version_id=doc.current_version_id,
    )
    vid, stored_ver = vrepo.create(version)
    updated = get_document_repository().update(body.tenant_id, did, current_version_id=vid)
    return {**_doc_out(did, updated[1]), "version": stored_ver.model_dump(), "version_id": vid}


@router.post("/documents/{doc_id}/regenerate")
def regenerate_document(doc_id: str, body: DocumentPatch) -> dict:
    """Re-run generation from the document's stored settings → a NEW version
    (``created_by='regenerate'``) that becomes current. Prior versions are kept."""
    did, doc = _get_doc_or_404(body.tenant_id, doc_id)
    settings = doc.settings or {}
    try:
        req = GenerationRequest(
            tenant_id=body.tenant_id,
            content_type=ContentType(settings.get("content_type", doc.content_type.value)),
            inputs=settings.get("inputs", {}),
            options=settings.get("options", {}),
        )
    except Exception as exc:  # malformed stored settings
        raise HTTPException(status_code=409, detail="document has no re-runnable generation settings") from exc

    result = _run_generation(req)
    if not result.variations:
        raise HTTPException(status_code=502, detail="regeneration produced no content")
    first = result.variations[0]
    vrepo = get_version_repository()
    number = vrepo.next_number(body.tenant_id, did)
    version = _version_from_variation(
        body.tenant_id, did, first, number=number, created_by="regenerate",
        provider=result.usage.provider, model=result.usage.model, mock=result.usage.mock,
        prompt_version=result.usage.prompt_version, request_snapshot=_settings_snapshot(req),
        usage=result.usage.model_dump(), parent_version_id=doc.current_version_id,
    )
    vid, stored_ver = vrepo.create(version)
    updated = get_document_repository().update(body.tenant_id, did, current_version_id=vid)
    _record_job(req, result, [vid])
    return {**_doc_out(did, updated[1]), "version": stored_ver.model_dump(),
            "version_id": vid, "result": result.model_dump()}


@router.post("/documents/{doc_id}/set-current-version")
def set_current_version(doc_id: str, body: SetCurrentVersionBody) -> dict:
    """Restore a previous version by pointing the document at it. Validates the
    version belongs to this document + tenant."""
    did, doc = _get_doc_or_404(body.tenant_id, doc_id)
    found = get_version_repository().get(body.tenant_id, body.version_id)
    if found is None or found[1].document_id != did:
        raise HTTPException(status_code=404, detail="version not found for document")
    updated = get_document_repository().update(body.tenant_id, did, current_version_id=body.version_id)
    return {**_doc_out(did, updated[1]), "current_version_id": body.version_id}
