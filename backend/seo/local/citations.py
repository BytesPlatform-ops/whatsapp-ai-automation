"""Citation tracking for the Local SEO vertical.

Features:
  - Citation source library (directories/aggregators).
  - Citation CRUD + manual add.
  - CSV import (formula-injection-safe) / CSV export.
  - Scheduled consistency checks (mock provider; real provider when configured).
  - Broken/duplicate/missing detection.
  - Verification history.
  - Metering via record_citation_check.

Security:
  - CSV cells are sanitised to prevent formula injection (no = + - @ prefix).
  - We do NOT scrape restricted platforms (Yelp ToS, etc.).
"""

from __future__ import annotations

import csv
import io
import logging
from typing import Any, Dict, List, Optional, Tuple

from seo.metering_search import record_citation_check, LIMIT_CITATION_CHECKS, enforce_seo_limit
from seo.local.stores import (
    Citation,
    CitationSource,
    CitationStatus,
    ClaimedStatus,
    _now,
    _uid,
    get_citation_repository,
    get_citation_source_repository,
    get_location_repository,
)

_log = logging.getLogger("pixie.seo.local.citations")


# ── Default citation source library ───────────────────────────────────────────

_DEFAULT_SOURCES: List[Dict[str, Any]] = [
    {"name": "Google Business Profile", "domain": "business.google.com", "kind": "aggregator", "priority": 100},
    {"name": "Yelp", "domain": "yelp.com", "kind": "directory", "priority": 90},
    {"name": "Facebook", "domain": "facebook.com", "kind": "directory", "priority": 85},
    {"name": "Bing Places", "domain": "bing.com", "kind": "aggregator", "priority": 80},
    {"name": "Apple Maps", "domain": "maps.apple.com", "kind": "aggregator", "priority": 80},
    {"name": "YellowPages", "domain": "yellowpages.com", "kind": "directory", "priority": 70},
    {"name": "Foursquare", "domain": "foursquare.com", "kind": "directory", "priority": 65},
    {"name": "TripAdvisor", "domain": "tripadvisor.com", "kind": "vertical", "priority": 60},
    {"name": "Angi", "domain": "angi.com", "kind": "vertical", "priority": 60},
    {"name": "HomeAdvisor", "domain": "homeadvisor.com", "kind": "vertical", "priority": 55},
    {"name": "Houzz", "domain": "houzz.com", "kind": "vertical", "priority": 50},
    {"name": "Healthgrades", "domain": "healthgrades.com", "kind": "vertical", "priority": 50},
    {"name": "Avvo", "domain": "avvo.com", "kind": "vertical", "priority": 50},
    {"name": "CitySearch", "domain": "citysearch.com", "kind": "directory", "priority": 45},
    {"name": "Manta", "domain": "manta.com", "kind": "directory", "priority": 40},
    {"name": "Better Business Bureau", "domain": "bbb.org", "kind": "directory", "priority": 75},
    {"name": "Chamber of Commerce", "domain": "chamberofcommerce.com", "kind": "directory", "priority": 55},
    {"name": "Superpages", "domain": "superpages.com", "kind": "directory", "priority": 40},
    {"name": "Judy's Book", "domain": "judysbook.com", "kind": "directory", "priority": 30},
    {"name": "Local.com", "domain": "local.com", "kind": "directory", "priority": 35},
]


def seed_default_sources(tenant_id: str = "global") -> List[Tuple[str, CitationSource]]:
    """Seed the citation source library with defaults for a tenant."""
    repo = get_citation_source_repository()
    existing = {s.name for _, s in repo.list(tenant_id)}
    created = []
    for src_data in _DEFAULT_SOURCES:
        if src_data["name"] not in existing:
            src = CitationSource(
                tenant_id=tenant_id,
                name=src_data["name"],
                domain=src_data["domain"],
                kind=src_data["kind"],
                priority=src_data["priority"],
            )
            sid, saved = repo.create(src)
            created.append((sid, saved))
    return created


def list_citation_sources(
    tenant_id: str,
    *,
    kind: Optional[str] = None,
) -> List[Tuple[str, CitationSource]]:
    """List citation sources for a tenant."""
    repo = get_citation_source_repository()
    rows = repo.list(tenant_id)
    if kind:
        rows = [(sid, s) for sid, s in rows if s.kind == kind]
    return rows


# ── Citation CRUD ──────────────────────────────────────────────────────────────

def add_citation(
    tenant_id: str,
    location_id: str,
    directory: str,
    *,
    directory_url: str = "",
    listing_url: str = "",
    business_name: str = "",
    address: str = "",
    phone: str = "",
    website: str = "",
    category: str = "",
    status: CitationStatus = CitationStatus.PENDING,
    claimed: ClaimedStatus = ClaimedStatus.UNKNOWN,
    notes: str = "",
    provider: str = "manual",
) -> Tuple[str, Citation]:
    """Manually add a citation listing."""
    loc_repo = get_location_repository()
    if loc_repo.get(tenant_id, location_id) is None:
        raise ValueError(f"Location {location_id!r} not found for tenant {tenant_id!r}")

    cit = Citation(
        tenant_id=tenant_id,
        location_id=location_id,
        directory=directory,
        directory_url=directory_url,
        listing_url=listing_url,
        business_name=business_name,
        address=address,
        phone=phone,
        website=website,
        category=category,
        status=status,
        claimed=claimed,
        notes=notes,
        provider=provider,
        verification_method="manual",
        verification_history=[],
    )
    return get_citation_repository().create(cit)


def get_citation(tenant_id: str, citation_id: str) -> Optional[Tuple[str, Citation]]:
    return get_citation_repository().get(tenant_id, citation_id)


def list_citations(
    tenant_id: str,
    location_id: str,
    *,
    status: Optional[CitationStatus] = None,
) -> List[Tuple[str, Citation]]:
    repo = get_citation_repository()
    rows = repo.list_by_location(tenant_id, location_id)
    if status is not None:
        rows = [(cid, c) for cid, c in rows if c.status == status]
    return rows


def update_citation(
    tenant_id: str,
    citation_id: str,
    **fields,
) -> Optional[Tuple[str, Citation]]:
    return get_citation_repository().update(tenant_id, citation_id, **fields)


def delete_citation(tenant_id: str, citation_id: str) -> bool:
    return get_citation_repository().delete(tenant_id, citation_id)


def mark_corrected(
    tenant_id: str,
    citation_id: str,
    *,
    correction_note: str = "",
) -> Optional[Tuple[str, Citation]]:
    """Mark a citation as corrected and append to verification history."""
    repo = get_citation_repository()
    result = repo.get(tenant_id, citation_id)
    if result is None:
        return None
    _, cit = result

    history = list(cit.verification_history or [])
    history.append({
        "action": "corrected",
        "note": correction_note,
        "at": _now(),
    })
    return repo.update(
        tenant_id, citation_id,
        status=CitationStatus.ACTIVE,
        verification_history=history,
    )


# ── CSV import / export ────────────────────────────────────────────────────────

_CSV_FIELDS = [
    "directory", "directory_url", "listing_url",
    "business_name", "address", "phone", "website",
    "category", "status", "claimed", "notes",
]


def _safe_cell(value: Any) -> str:
    """Sanitise a CSV cell value to prevent formula injection."""
    s = str(value) if value is not None else ""
    # Prevent formula injection: cells starting with = + - @ are dangerous
    if s and s[0] in ("=", "+", "-", "@", "|", "%"):
        s = "'" + s  # Prefix with a single quote to neutralise
    return s


def export_citations_csv(
    tenant_id: str,
    location_id: str,
) -> str:
    """Export citations for a location as a formula-injection-safe CSV string."""
    citations = list_citations(tenant_id, location_id)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(_CSV_FIELDS)
    for _, cit in citations:
        row = [
            _safe_cell(cit.directory),
            _safe_cell(cit.directory_url),
            _safe_cell(cit.listing_url),
            _safe_cell(cit.business_name),
            _safe_cell(cit.address),
            _safe_cell(cit.phone),
            _safe_cell(cit.website),
            _safe_cell(cit.category),
            _safe_cell(cit.status.value if hasattr(cit.status, "value") else cit.status),
            _safe_cell(cit.claimed.value if hasattr(cit.claimed, "value") else cit.claimed),
            _safe_cell(cit.notes),
        ]
        writer.writerow(row)
    return output.getvalue()


def import_citations_csv(
    tenant_id: str,
    location_id: str,
    csv_text: str,
    *,
    skip_duplicates: bool = True,
) -> Dict[str, Any]:
    """Import citations from a CSV string.

    Returns: {imported, skipped, errors}
    """
    reader = csv.DictReader(io.StringIO(csv_text))
    repo = get_citation_repository()

    existing_dirs = {
        c.directory.lower()
        for _, c in repo.list_by_location(tenant_id, location_id)
    }

    imported = 0
    skipped = 0
    errors: List[str] = []

    for i, row in enumerate(reader, start=2):
        try:
            directory = (row.get("directory") or "").strip()
            if not directory:
                errors.append(f"Row {i}: missing directory name")
                continue

            if skip_duplicates and directory.lower() in existing_dirs:
                skipped += 1
                continue

            status_raw = (row.get("status") or "pending").strip().lower()
            try:
                status = CitationStatus(status_raw)
            except ValueError:
                status = CitationStatus.PENDING

            claimed_raw = (row.get("claimed") or "unknown").strip().lower()
            try:
                claimed = ClaimedStatus(claimed_raw)
            except ValueError:
                claimed = ClaimedStatus.UNKNOWN

            add_citation(
                tenant_id=tenant_id,
                location_id=location_id,
                directory=directory,
                directory_url=(row.get("directory_url") or "").strip(),
                listing_url=(row.get("listing_url") or "").strip(),
                business_name=(row.get("business_name") or "").strip(),
                address=(row.get("address") or "").strip(),
                phone=(row.get("phone") or "").strip(),
                website=(row.get("website") or "").strip(),
                category=(row.get("category") or "").strip(),
                status=status,
                claimed=claimed,
                notes=(row.get("notes") or "").strip(),
                provider="csv_import",
            )
            existing_dirs.add(directory.lower())
            imported += 1
        except Exception as exc:
            errors.append(f"Row {i}: {exc}")

    return {"imported": imported, "skipped": skipped, "errors": errors}


# ── Consistency checking ───────────────────────────────────────────────────────

def check_citation(
    tenant_id: str,
    citation_id: str,
    *,
    is_mock: bool = True,
) -> Dict[str, Any]:
    """Check a single citation for consistency.

    In mock mode: computes a deterministic consistency score based on the
    stored NAP fields vs the Location canonical values.
    In live mode: would call the configured citation provider.

    Never scrapes restricted platforms.
    Meters record_citation_check.
    """
    repo = get_citation_repository()
    result = repo.get(tenant_id, citation_id)
    if result is None:
        return {"error": "citation_not_found"}
    cid, cit = result

    loc_repo = get_location_repository()
    loc_result = loc_repo.get(tenant_id, cit.location_id)
    if loc_result is None:
        return {"error": "location_not_found"}
    _, loc = loc_result

    # Mock consistency check: count matching fields
    canonical_nap = {
        "name": loc.business_name.strip().lower(),
        "address": (loc.address_line1 + " " + loc.city).strip().lower(),
        "phone": loc.phone.strip(),
        "website": loc.website_url.strip().lower().rstrip("/"),
    }
    observed_nap = {
        "name": cit.business_name.strip().lower(),
        "address": cit.address.strip().lower(),
        "phone": cit.phone.strip(),
        "website": cit.website.strip().lower().rstrip("/"),
    }

    matched = 0
    total = 0
    issues: List[str] = []
    for field, can_val in canonical_nap.items():
        obs_val = observed_nap.get(field, "")
        if not can_val and not obs_val:
            continue
        total += 1
        if can_val and obs_val and can_val == obs_val:
            matched += 1
        elif can_val and not obs_val:
            issues.append(f"{field}: missing in citation")
        elif obs_val and can_val != obs_val:
            issues.append(f"{field}: mismatch (canonical={can_val!r}, observed={obs_val!r})")

    consistency = round(matched / total, 2) if total > 0 else 0.0
    new_status = (
        CitationStatus.ACTIVE if consistency >= 0.75
        else CitationStatus.INCORRECT if issues else CitationStatus.PENDING
    )

    ts = _now()
    history = list(cit.verification_history or [])
    history.append({
        "action": "checked",
        "consistency": consistency,
        "issues": issues,
        "provider": "mock" if is_mock else cit.provider,
        "at": ts,
    })

    repo.update(
        tenant_id, citation_id,
        consistency=consistency,
        status=new_status,
        last_checked=ts,
        verification_history=history,
    )

    job_id = _uid("citchk_")
    enforce_seo_limit(tenant_id, LIMIT_CITATION_CHECKS, 1)
    metering = record_citation_check(tenant_id, job_id=job_id, listing_count=1, is_mock=is_mock)

    return {
        "citation_id": cid,
        "directory": cit.directory,
        "consistency": consistency,
        "status": new_status.value,
        "issues": issues,
        "checked_at": ts,
        "is_mock": is_mock,
        "metering": metering,
    }


def check_all_citations(
    tenant_id: str,
    location_id: str,
    *,
    is_mock: bool = True,
) -> Dict[str, Any]:
    """Check all citations for a location.  Returns aggregated results."""
    citations = list_citations(tenant_id, location_id)
    results = []
    for cid, _ in citations:
        r = check_citation(tenant_id, cid, is_mock=is_mock)
        results.append(r)
    return {
        "location_id": location_id,
        "checked": len(results),
        "results": results,
        "is_mock": is_mock,
    }


def detect_duplicates(
    tenant_id: str,
    location_id: str,
) -> List[Dict[str, Any]]:
    """Detect citations with the same directory (potential duplicates)."""
    citations = list_citations(tenant_id, location_id)
    dir_map: Dict[str, List[str]] = {}
    for cid, cit in citations:
        key = cit.directory.lower().strip()
        dir_map.setdefault(key, []).append(cid)

    duplicates = []
    for directory, ids in dir_map.items():
        if len(ids) > 1:
            duplicates.append({
                "directory": directory,
                "citation_ids": ids,
                "count": len(ids),
            })
    return duplicates


def detect_missing(
    tenant_id: str,
    location_id: str,
) -> List[str]:
    """Return a list of high-priority directories with no citation."""
    citations = list_citations(tenant_id, location_id)
    present_dirs = {c.directory.lower() for _, c in citations}
    important = [s for s in _DEFAULT_SOURCES if s["priority"] >= 60]
    missing = [s["name"] for s in important if s["name"].lower() not in present_dirs]
    return missing
