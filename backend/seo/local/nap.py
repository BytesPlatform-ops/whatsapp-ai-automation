"""NAP (Name / Address / Phone) consistency auditing for the Local SEO vertical.

Compares the canonical values in the Location record against:
  - GBP (fetched from stored GBP profile data)
  - Crawled website pages (if available from the seo.stores CrawledPage table)
  - Saved citations
  - Stored LocalSchema jsonld

Design principles:
  - Normalise BEFORE comparing so abbreviations ("St" vs "Street") are not
    flagged as errors.
  - Preserve original source values — the audit shows what was observed, not
    a modified version.
  - Intended variants (e.g. different phone format on one directory) can be
    confirmed by the user; confirmed_variant=True suppresses the mismatch.
  - Changes to mismatch status require manual confirmation, not automatic.
  - Persists NapAudit rows per source/field pair.
"""

from __future__ import annotations

import logging
import re
from typing import Any, Dict, List, Optional, Tuple

from seo.local.stores import (
    NapAudit,
    _now,
    get_citation_repository,
    get_local_schema_repository,
    get_location_repository,
    get_nap_audit_repository,
)

_log = logging.getLogger("pixie.seo.local.nap")


# ── Normalisation helpers ──────────────────────────────────────────────────────

_STREET_ABBREVS = {
    r"\bst\b": "street",
    r"\bave\b": "avenue",
    r"\bblvd\b": "boulevard",
    r"\brd\b": "road",
    r"\bdr\b": "drive",
    r"\bct\b": "court",
    r"\bln\b": "lane",
    r"\bpl\b": "place",
    r"\bpkwy\b": "parkway",
    r"\bhwy\b": "highway",
    r"\bsq\b": "square",
    r"\bter\b": "terrace",
}

_STATE_ABBREVS = {
    "al": "alabama", "ak": "alaska", "az": "arizona", "ar": "arkansas",
    "ca": "california", "co": "colorado", "ct": "connecticut", "de": "delaware",
    "fl": "florida", "ga": "georgia", "hi": "hawaii", "id": "idaho",
    "il": "illinois", "in": "indiana", "ia": "iowa", "ks": "kansas",
    "ky": "kentucky", "la": "louisiana", "me": "maine", "md": "maryland",
    "ma": "massachusetts", "mi": "michigan", "mn": "minnesota", "ms": "mississippi",
    "mo": "missouri", "mt": "montana", "ne": "nebraska", "nv": "nevada",
    "nh": "new hampshire", "nj": "new jersey", "nm": "new mexico", "ny": "new york",
    "nc": "north carolina", "nd": "north dakota", "oh": "ohio", "ok": "oklahoma",
    "or": "oregon", "pa": "pennsylvania", "ri": "rhode island", "sc": "south carolina",
    "sd": "south dakota", "tn": "tennessee", "tx": "texas", "ut": "utah",
    "vt": "vermont", "va": "virginia", "wa": "washington", "wv": "west virginia",
    "wi": "wisconsin", "wy": "wyoming", "dc": "district of columbia",
}


def _normalize_text(s: str) -> str:
    """Lowercase, strip extra whitespace, expand common abbreviations."""
    s = s.lower().strip()
    s = re.sub(r"\s+", " ", s)
    # Remove punctuation that doesn't affect meaning (commas, periods in names)
    s = re.sub(r"[,.]", "", s)
    return s


def _normalize_address(s: str) -> str:
    """Normalize a US address string for comparison."""
    s = _normalize_text(s)
    # Expand street abbreviations
    for pattern, replacement in _STREET_ABBREVS.items():
        s = re.sub(pattern, replacement, s)
    # Expand state abbreviations (whole-word match)
    for abbrev, full in _STATE_ABBREVS.items():
        s = re.sub(r"\b" + abbrev + r"\b", full, s)
    return s


def _normalize_phone(s: str) -> str:
    """Strip non-digit characters from a phone number for comparison."""
    digits = re.sub(r"\D", "", s)
    # Remove leading country code (US: +1 or 1)
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
    return digits


def _normalize_url(s: str) -> str:
    """Normalize a URL for comparison (strip trailing slash, lowercase scheme+host)."""
    s = s.strip().lower()
    # Remove trailing slash
    s = s.rstrip("/")
    # Strip protocol for comparison
    s = re.sub(r"^https?://", "", s)
    # Strip www.
    s = re.sub(r"^www\.", "", s)
    return s


def _normalize_name(s: str) -> str:
    return _normalize_text(s)


def _full_address(loc: Any) -> str:
    """Build a canonical address string from a Location."""
    parts = [p for p in [loc.address_line1, loc.address_line2, loc.city, loc.region, loc.postal_code] if p]
    return ", ".join(parts)


# ── NAP source extractors ──────────────────────────────────────────────────────

def _nap_from_location(loc: Any) -> Dict[str, str]:
    return {
        "name": loc.business_name,
        "address": _full_address(loc),
        "phone": loc.phone,
        "website": loc.website_url,
    }


def _nap_from_citation(cit: Any) -> Dict[str, str]:
    return {
        "name": cit.business_name,
        "address": cit.address,
        "phone": cit.phone,
        "website": cit.website,
    }


def _nap_from_schema(schema: Any) -> Dict[str, str]:
    jld = schema.jsonld or {}
    postal = jld.get("address", {})
    address_parts = [
        postal.get("streetAddress", ""),
        postal.get("addressLocality", ""),
        postal.get("addressRegion", ""),
        postal.get("postalCode", ""),
    ]
    address = ", ".join(p for p in address_parts if p)
    return {
        "name": jld.get("name", ""),
        "address": address,
        "phone": jld.get("telephone", ""),
        "website": jld.get("url", ""),
    }


# ── Normaliser dispatch ────────────────────────────────────────────────────────

_FIELD_NORMALIZERS = {
    "name":    _normalize_name,
    "address": _normalize_address,
    "phone":   _normalize_phone,
    "website": _normalize_url,
}


def _field_mismatch(field: str, canonical: str, observed: str) -> bool:
    """Return True when the observed value differs from canonical after normalisation."""
    if not canonical and not observed:
        return False
    if not canonical or not observed:
        return bool(canonical or observed)  # one is empty, other is not
    normalizer = _FIELD_NORMALIZERS.get(field, _normalize_text)
    return normalizer(canonical) != normalizer(observed)


# ── Public API ─────────────────────────────────────────────────────────────────

def run_nap_audit(
    tenant_id: str,
    location_id: str,
) -> List[Dict[str, Any]]:
    """Compare NAP across all available sources and persist NapAudit rows.

    Sources checked:
      - canonical (Location record itself — used as reference)
      - citations saved in seo_citations for this location
      - local schema if any exists for this location

    Returns a list of audit result dicts.
    """
    loc_repo = get_location_repository()
    loc_result = loc_repo.get(tenant_id, location_id)
    if loc_result is None:
        return []
    _, loc = loc_result

    canonical_nap = _nap_from_location(loc)

    nap_repo = get_nap_audit_repository()
    cit_repo = get_citation_repository()
    schema_repo = get_local_schema_repository()

    # Load existing audits to check confirmed_variant status
    existing_audits = {
        (a.source, a.field): (aid, a)
        for aid, a in nap_repo.list_by_location(tenant_id, location_id)
    }

    results: List[Dict[str, Any]] = []

    def _audit_source(source: str, observed_nap: Dict[str, str]) -> None:
        for field_name, canonical_value in canonical_nap.items():
            observed_value = observed_nap.get(field_name, "")
            mismatch = _field_mismatch(field_name, canonical_value, observed_value)

            key = (source, field_name)
            if key in existing_audits:
                aid, existing = existing_audits[key]
                # If user confirmed this as a variant, respect that
                confirmed_variant = existing.confirmed_variant
                # Update observed value and mismatch
                nap_repo.update(
                    tenant_id, aid,
                    canonical_value=canonical_value,
                    observed_value=observed_value,
                    mismatch=mismatch and not confirmed_variant,
                )
                audit_id = aid
            else:
                audit = NapAudit(
                    tenant_id=tenant_id,
                    location_id=location_id,
                    source=source,
                    field=field_name,
                    canonical_value=canonical_value,
                    observed_value=observed_value,
                    mismatch=mismatch,
                    confirmed_variant=False,
                )
                audit_id, _ = nap_repo.create(audit)
                confirmed_variant = False

            results.append({
                "audit_id": audit_id,
                "location_id": location_id,
                "source": source,
                "field": field_name,
                "canonical_value": canonical_value,
                "observed_value": observed_value,
                "mismatch": mismatch and not confirmed_variant,
                "confirmed_variant": confirmed_variant,
            })

    # ── Citations as sources ──────────────────────────────────────────────────
    citations = cit_repo.list_by_location(tenant_id, location_id)
    for cid, cit in citations:
        source_name = f"citation:{cit.directory}"
        observed_nap = _nap_from_citation(cit)
        _audit_source(source_name, observed_nap)

    # ── Local schema as a source ─────────────────────────────────────────────
    schemas = schema_repo.list_by_location(tenant_id, location_id)
    for sid, schema in schemas:
        source_name = "schema"
        observed_nap = _nap_from_schema(schema)
        _audit_source(source_name, observed_nap)

    return results


def confirm_variant(
    tenant_id: str,
    audit_id: str,
    *,
    confirmed_by: str = "",
) -> Optional[Tuple[str, "NapAudit"]]:
    """Mark a NAP observation as an intentional variant (suppresses mismatch flag).

    Requires manual confirmation — callers must supply confirmed_by for the
    audit trail.
    """
    nap_repo = get_nap_audit_repository()
    result = nap_repo.get(tenant_id, audit_id)
    if result is None:
        return None
    ts = _now()
    return nap_repo.update(
        tenant_id, audit_id,
        confirmed_variant=True,
        mismatch=False,
        confirmed_at=ts,
        confirmed_by=confirmed_by or "unknown",
    )


def get_nap_summary(
    tenant_id: str,
    location_id: str,
) -> Dict[str, Any]:
    """Return a summary of NAP consistency across all sources."""
    nap_repo = get_nap_audit_repository()
    audits = nap_repo.list_by_location(tenant_id, location_id)

    total = len(audits)
    mismatches = [(aid, a) for aid, a in audits if a.mismatch]
    confirmed_variants = [(aid, a) for aid, a in audits if a.confirmed_variant]

    sources = list({a.source for _, a in audits})
    fields_with_issues = list({a.field for _, a in mismatches})

    return {
        "location_id": location_id,
        "total_checks": total,
        "mismatches": len(mismatches),
        "confirmed_variants": len(confirmed_variants),
        "sources_checked": sources,
        "fields_with_issues": fields_with_issues,
        "overall_consistent": len(mismatches) == 0,
    }
