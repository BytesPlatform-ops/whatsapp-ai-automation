"""KeywordProject CRUD service.

Server-authoritative operations for creating, listing, getting, updating, and
archiving keyword projects. Limit enforcement is applied server-side before
creating new rows so the browser can never bypass plan caps.

Competitors are stored as a plain list on the project row (strings). This module
never touches credits code directly — it calls enforce_seo_limit from
seo.metering_search which itself short-circuits when the credit system is off.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from seo.metering_search import (
    LIMIT_KEYWORD_PROJECTS,
    SeoLimitExceeded,
    enforce_seo_limit,
)
from seo.search_stores import (
    DeviceType,
    KeywordProject,
    get_keyword_project_repository,
)


def _project_to_dict(project_id: str, project: KeywordProject) -> Dict[str, Any]:
    return {
        "id": project_id,
        "tenant_id": project.tenant_id,
        "site_id": project.site_id,
        "name": project.name,
        "country": project.country,
        "language": project.language,
        "search_engine": project.search_engine,
        "location": project.location,
        "device": project.device.value if hasattr(project.device, "value") else project.device,
        "default_domain": project.default_domain,
        "competitors": project.competitors,
        "archived": project.archived,
        "created_at": project.created_at,
        "updated_at": project.updated_at,
    }


def create_project(
    tenant_id: str,
    *,
    name: str,
    site_id: str = "",
    country: str = "us",
    language: str = "en",
    search_engine: str = "google",
    location: str = "",
    device: str = "desktop",
    default_domain: str = "",
    competitors: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Create a new keyword project after enforcing the per-tenant project cap.

    Raises SeoLimitExceeded when the plan cap is exceeded and enforcement is on.
    """
    repo = get_keyword_project_repository()

    # Count existing non-archived projects for this tenant.
    existing = repo.list(tenant_id)
    active_count = sum(1 for _, p in existing if not p.archived)
    enforce_seo_limit(tenant_id, LIMIT_KEYWORD_PROJECTS, active_count)

    # Normalise device string to enum.
    try:
        dev_enum = DeviceType(device)
    except ValueError:
        dev_enum = DeviceType.DESKTOP

    project = KeywordProject(
        tenant_id=tenant_id,
        site_id=site_id,
        name=(name or "").strip(),
        country=country,
        language=language,
        search_engine=search_engine,
        location=location,
        device=dev_enum,
        default_domain=default_domain,
        competitors=list(competitors or []),
    )
    project_id, saved = repo.create(project)
    return {"project": _project_to_dict(project_id, saved)}


def list_projects(
    tenant_id: str,
    include_archived: bool = False,
) -> Dict[str, Any]:
    """List keyword projects for a tenant.

    By default only active (non-archived) projects are returned. Pass
    ``include_archived=True`` to include archived ones.
    """
    repo = get_keyword_project_repository()
    pairs = repo.list(tenant_id)
    results = []
    for pid, p in pairs:
        if not include_archived and p.archived:
            continue
        results.append(_project_to_dict(pid, p))
    return {"projects": results}


def get_project(tenant_id: str, project_id: str) -> Dict[str, Any]:
    """Get a single project by ID (tenant-scoped). Returns None when not found."""
    repo = get_keyword_project_repository()
    result = repo.get(tenant_id, project_id)
    if not result:
        return {}
    pid, project = result
    return {"project": _project_to_dict(pid, project)}


def update_project(
    tenant_id: str,
    project_id: str,
    *,
    name: Optional[str] = None,
    site_id: Optional[str] = None,
    country: Optional[str] = None,
    language: Optional[str] = None,
    search_engine: Optional[str] = None,
    location: Optional[str] = None,
    device: Optional[str] = None,
    default_domain: Optional[str] = None,
    competitors: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Update mutable fields of a keyword project. Unknown keys are ignored."""
    repo = get_keyword_project_repository()
    result = repo.get(tenant_id, project_id)
    if not result:
        return {}

    fields: Dict[str, Any] = {}
    if name is not None:
        fields["name"] = name.strip()
    if site_id is not None:
        fields["site_id"] = site_id
    if country is not None:
        fields["country"] = country
    if language is not None:
        fields["language"] = language
    if search_engine is not None:
        fields["search_engine"] = search_engine
    if location is not None:
        fields["location"] = location
    if device is not None:
        try:
            fields["device"] = DeviceType(device)
        except ValueError:
            pass
    if default_domain is not None:
        fields["default_domain"] = default_domain
    if competitors is not None:
        fields["competitors"] = list(competitors)

    updated = repo.update(tenant_id, project_id, **fields)
    if not updated:
        return {}
    pid, project = updated
    return {"project": _project_to_dict(pid, project)}


def archive_project(tenant_id: str, project_id: str) -> Dict[str, Any]:
    """Soft-archive a keyword project (sets archived=True). Reversible."""
    repo = get_keyword_project_repository()
    result = repo.get(tenant_id, project_id)
    if not result:
        return {}
    updated = repo.update(tenant_id, project_id, archived=True)
    if not updated:
        return {}
    pid, project = updated
    return {"project": _project_to_dict(pid, project)}


def unarchive_project(tenant_id: str, project_id: str) -> Dict[str, Any]:
    """Restore an archived project (sets archived=False)."""
    repo = get_keyword_project_repository()
    result = repo.get(tenant_id, project_id)
    if not result:
        return {}
    updated = repo.update(tenant_id, project_id, archived=False)
    if not updated:
        return {}
    pid, project = updated
    return {"project": _project_to_dict(pid, project)}
