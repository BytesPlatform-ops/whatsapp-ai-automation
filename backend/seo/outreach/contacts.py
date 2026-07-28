"""Contact CRUD, CSV import/export, suppression enforcement for SEO outreach.

Rules:
- Dedup by normalised email on import (skip rows whose email already exists).
- Suppression is enforced at add time and on export (do_not_contact + suppression list).
- Email validation is a lightweight format check only (no live DNS/SMTP call).
- CSV export is formula-injection-safe (reuses seo/keywords/csv_io escape logic).
- No scraping of personal emails from prohibited sources.
"""

from __future__ import annotations

import csv
import io
import logging
import re
from typing import Any, Dict, List, Optional, Tuple

from seo.metering_search import LIMIT_OUTREACH_CONTACTS, enforce_seo_limit

from .stores import (
    BounceStatus,
    Contact,
    RelationshipStatus,
    SuppressionEntry,
    SuppressionReason,
    VerificationStatus,
    get_contact_repository,
    get_suppression_repository,
    reset_repositories,  # noqa: F401 — re-exported for tests
)

_log = logging.getLogger("pixie.seo.outreach.contacts")

# ── CSV column definitions ────────────────────────────────────────────────────

EXPORT_COLUMNS = [
    "domain",
    "website",
    "name",
    "role",
    "email",
    "source",
    "verification_status",
    "relationship_status",
    "tags",
    "notes",
    "last_contacted",
    "consent_notes",
    "do_not_contact",
    "bounce_status",
    "created_at",
]

_IMPORT_ALIASES: Dict[str, str] = {
    "domain": "domain",
    "website": "website",
    "url": "website",
    "name": "name",
    "contact_name": "name",
    "role": "role",
    "title": "role",
    "position": "role",
    "email": "email",
    "email_address": "email",
    "source": "source",
    "tags": "tags",
    "notes": "notes",
    "consent_notes": "consent_notes",
}

# Characters that trigger formula-injection escaping.
_INJECTION_CHARS = frozenset("=+-@\t\r")


def _escape_cell(value: str) -> str:
    if value and value[0] in _INJECTION_CHARS:
        return "'" + value
    return value


# ── Email validation ──────────────────────────────────────────────────────────

_EMAIL_RE = re.compile(r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$")


def _is_valid_email(email: str) -> bool:
    return bool(_EMAIL_RE.match(email.strip()))


def _normalise_email(email: str) -> str:
    return email.strip().lower()


def _normalise_domain(domain: str) -> str:
    """Strip scheme and trailing slash from a domain/URL."""
    d = domain.strip().lower()
    for prefix in ("https://", "http://"):
        if d.startswith(prefix):
            d = d[len(prefix):]
    return d.rstrip("/").split("/")[0]


# ── CRUD ──────────────────────────────────────────────────────────────────────

def add_contact(
    tenant_id: str,
    domain: str,
    *,
    website: str = "",
    name: str = "",
    role: str = "",
    email: str = "",
    source: str = "manual",
    tags: Optional[List[str]] = None,
    notes: str = "",
    consent_notes: str = "",
) -> Tuple[str, Contact]:
    """Add a new contact. Enforces suppression + plan limits.

    Raises:
        ValueError: if email is invalid (when provided), or suppressed.
        RuntimeError: if the plan limit is exceeded.
    """
    repo = get_contact_repository()
    supp_repo = get_suppression_repository()

    norm_email = _normalise_email(email) if email else ""
    if norm_email and not _is_valid_email(norm_email):
        raise ValueError(f"invalid_email: {norm_email!r}")

    if norm_email and supp_repo.is_suppressed(tenant_id, norm_email):
        raise ValueError(f"email_suppressed: {norm_email!r}")

    # Plan limit check
    current_contacts = repo.list(tenant_id)
    enforce_seo_limit(tenant_id, LIMIT_OUTREACH_CONTACTS, len(current_contacts))

    contact = Contact(
        tenant_id=tenant_id,
        domain=_normalise_domain(domain),
        website=website,
        name=name,
        role=role,
        email=norm_email,
        source=source,
        tags=tags or [],
        notes=notes,
        consent_notes=consent_notes,
    )
    return repo.create(contact)


def get_contact(tenant_id: str, contact_id: str) -> Optional[Tuple[str, Contact]]:
    return get_contact_repository().get(tenant_id, contact_id)


def update_contact(
    tenant_id: str,
    contact_id: str,
    **fields,
) -> Optional[Tuple[str, Contact]]:
    """Update contact fields. Normalises email/domain if provided."""
    if "email" in fields and fields["email"]:
        fields["email"] = _normalise_email(fields["email"])
        if not _is_valid_email(fields["email"]):
            raise ValueError(f"invalid_email: {fields['email']!r}")
    if "domain" in fields and fields["domain"]:
        fields["domain"] = _normalise_domain(fields["domain"])
    return get_contact_repository().update(tenant_id, contact_id, **fields)


def delete_contact(tenant_id: str, contact_id: str) -> bool:
    return get_contact_repository().delete(tenant_id, contact_id)


def list_contacts(tenant_id: str) -> List[Tuple[str, Contact]]:
    return get_contact_repository().list(tenant_id)


def mark_do_not_contact(tenant_id: str, contact_id: str) -> Optional[Tuple[str, Contact]]:
    return get_contact_repository().update(
        tenant_id, contact_id,
        do_not_contact=True,
        relationship_status=RelationshipStatus.DO_NOT_CONTACT,
    )


# ── Suppression ───────────────────────────────────────────────────────────────

def suppress_email(
    tenant_id: str,
    email: str,
    *,
    reason: SuppressionReason = SuppressionReason.MANUAL,
    notes: str = "",
) -> Tuple[str, SuppressionEntry]:
    """Add an email to the suppression list. Idempotent."""
    supp_repo = get_suppression_repository()
    norm_email = _normalise_email(email)
    existing = supp_repo.find_by_email(tenant_id, norm_email)
    if existing:
        return existing
    domain = norm_email.split("@")[-1] if "@" in norm_email else ""
    entry = SuppressionEntry(
        tenant_id=tenant_id,
        email=norm_email,
        domain=domain,
        reason=reason,
        notes=notes,
    )
    return supp_repo.create(entry)


def suppress_domain(
    tenant_id: str,
    domain: str,
    *,
    reason: SuppressionReason = SuppressionReason.MANUAL,
    notes: str = "",
) -> Tuple[str, SuppressionEntry]:
    """Suppress all emails for a domain."""
    supp_repo = get_suppression_repository()
    norm_domain = _normalise_domain(domain)
    # Check existing domain-wide entry
    for _, entry in supp_repo.list(tenant_id):
        if entry.domain == norm_domain and not entry.email:
            return _, entry
    entry = SuppressionEntry(
        tenant_id=tenant_id,
        email="",
        domain=norm_domain,
        reason=reason,
        notes=notes,
    )
    return supp_repo.create(entry)


def is_suppressed(tenant_id: str, email: str) -> bool:
    return get_suppression_repository().is_suppressed(tenant_id, email)


def list_suppression(tenant_id: str):
    return get_suppression_repository().list(tenant_id)


# ── CSV import ────────────────────────────────────────────────────────────────

def import_contacts_csv(
    tenant_id: str,
    text: str,
    *,
    source: str = "csv",
) -> Dict[str, Any]:
    """Parse and import contacts from CSV. Returns a result summary.

    Dedup: rows whose normalised email already exists for the tenant are skipped.
    Suppression: rows whose email is suppressed are skipped.
    Invalid emails: skipped.

    Returns:
        {imported: int, skipped_dupe: int, skipped_suppressed: int,
         skipped_invalid: int, errors: List[str]}
    """
    text = (text or "").strip()
    if not text:
        return {"imported": 0, "skipped_dupe": 0, "skipped_suppressed": 0,
                "skipped_invalid": 0, "errors": []}

    reader = csv.reader(io.StringIO(text))
    rows = list(reader)
    if not rows:
        return {"imported": 0, "skipped_dupe": 0, "skipped_suppressed": 0,
                "skipped_invalid": 0, "errors": []}

    first_row_lower = [c.strip().lower() for c in rows[0]]
    has_header = any(col in _IMPORT_ALIASES for col in first_row_lower)
    if has_header:
        header = first_row_lower
        data_rows = rows[1:]
    else:
        header = ["domain"] + [f"_col{i}" for i in range(1, len(rows[0]))]
        data_rows = rows

    repo = get_contact_repository()
    supp_repo = get_suppression_repository()

    # Build existing email set for dedup
    existing_emails = {
        c.email for _, c in repo.list(tenant_id) if c.email
    }

    imported = skipped_dupe = skipped_suppressed = skipped_invalid = 0
    errors: List[str] = []

    for row_idx, row in enumerate(data_rows, start=2):
        record: Dict[str, str] = {}
        for i, cell in enumerate(row):
            if i >= len(header):
                break
            col = header[i]
            canonical = _IMPORT_ALIASES.get(col)
            if not canonical:
                continue
            record[canonical] = cell.strip()

        domain = record.get("domain", "").strip()
        if not domain:
            continue

        email = _normalise_email(record.get("email", ""))
        if email and not _is_valid_email(email):
            skipped_invalid += 1
            continue

        if email and email in existing_emails:
            skipped_dupe += 1
            continue

        if email and supp_repo.is_suppressed(tenant_id, email):
            skipped_suppressed += 1
            continue

        tags_raw = record.get("tags", "")
        tags = [t.strip() for t in re.split(r"[|;]", tags_raw) if t.strip()] if tags_raw else []

        try:
            contact = Contact(
                tenant_id=tenant_id,
                domain=_normalise_domain(domain),
                website=record.get("website", ""),
                name=record.get("name", ""),
                role=record.get("role", ""),
                email=email,
                source=source,
                tags=tags,
                notes=record.get("notes", ""),
                consent_notes=record.get("consent_notes", ""),
            )
            repo.create(contact)
            if email:
                existing_emails.add(email)
            imported += 1
        except Exception as exc:
            errors.append(f"row {row_idx}: {exc}")

    return {
        "imported": imported,
        "skipped_dupe": skipped_dupe,
        "skipped_suppressed": skipped_suppressed,
        "skipped_invalid": skipped_invalid,
        "errors": errors,
    }


# ── CSV export ────────────────────────────────────────────────────────────────

def export_contacts_csv(tenant_id: str) -> str:
    """Export all contacts (excluding do_not_contact) as formula-injection-safe CSV."""
    contacts = [
        (cid, c) for cid, c in get_contact_repository().list(tenant_id)
        if not c.do_not_contact
    ]
    out = io.StringIO()
    writer = csv.writer(out, quoting=csv.QUOTE_MINIMAL, lineterminator="\n")
    writer.writerow(EXPORT_COLUMNS)
    for _, c in contacts:
        row_data = {
            "domain": c.domain,
            "website": c.website,
            "name": c.name,
            "role": c.role,
            "email": c.email,
            "source": c.source,
            "verification_status": c.verification_status.value if hasattr(c.verification_status, "value") else str(c.verification_status),
            "relationship_status": c.relationship_status.value if hasattr(c.relationship_status, "value") else str(c.relationship_status),
            "tags": "|".join(c.tags) if c.tags else "",
            "notes": c.notes,
            "last_contacted": c.last_contacted,
            "consent_notes": c.consent_notes,
            "do_not_contact": str(c.do_not_contact),
            "bounce_status": c.bounce_status.value if hasattr(c.bounce_status, "value") else str(c.bounce_status),
            "created_at": c.created_at,
        }
        csv_row = []
        for col in EXPORT_COLUMNS:
            val = row_data.get(col, "")
            if isinstance(val, list):
                csv_row.append(_escape_cell("|".join(str(v) for v in val)))
            elif isinstance(val, (int, float)):
                csv_row.append(val)
            else:
                csv_row.append(_escape_cell(str(val)))
        writer.writerow(csv_row)
    return out.getvalue()


import re  # noqa: E402
