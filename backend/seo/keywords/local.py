"""Local SEO helpers: NAP consistency + Google Business Profile hints. Stdlib."""

from __future__ import annotations

import re
from typing import Dict, List

_PHONE_DIGITS = re.compile(r"\d+")
_NON_ALNUM = re.compile(r"[^a-z0-9]+")


def _norm_text(value: str) -> str:
    """Lowercase, strip punctuation, collapse whitespace."""
    value = (value or "").lower()
    value = _NON_ALNUM.sub(" ", value)
    return " ".join(value.split())


def _norm_phone(value: str) -> str:
    """Reduce a phone to its digit string (last 10 digits to ignore country code)."""
    digits = "".join(_PHONE_DIGITS.findall(value or ""))
    return digits[-10:] if len(digits) > 10 else digits


def nap_consistency(records: list) -> Dict[str, object]:
    """Detect Name/Address/Phone inconsistencies across citation sources.

    Each record is ``{"name", "address", "phone"}``. Comparison normalizes
    whitespace/case/punctuation. Deterministic; never raises.
    """
    recs = [r for r in (records or []) if isinstance(r, dict)]
    issues: List[str] = []

    if len(recs) < 2:
        return {"consistent": True, "issues": [], "records_checked": len(recs)}

    fields = (
        ("name", _norm_text),
        ("address", _norm_text),
        ("phone", _norm_phone),
    )

    for field, normalizer in fields:
        variants: Dict[str, List[int]] = {}
        for idx, rec in enumerate(recs):
            raw = str(rec.get(field, "") or "")
            key = normalizer(raw)
            variants.setdefault(key, []).append(idx)
        if len(variants) > 1:
            distinct = [str(recs[idxs[0]].get(field, "")) for idxs in variants.values()]
            issues.append(
                "Inconsistent {0} across sources: {1}".format(
                    field, " | ".join(repr(v) for v in distinct)
                )
            )

    return {
        "consistent": len(issues) == 0,
        "issues": issues,
        "records_checked": len(recs),
    }


def gbp_hint() -> List[str]:
    """Static, actionable Google Business Profile suggestions."""
    return [
        "Claim and verify your Google Business Profile so the listing shows in Maps and local pack.",
        "Pick the most specific primary category, then add relevant secondary categories.",
        "Ensure your name, address, and phone (NAP) exactly match your website and citations.",
        "Add real business hours, including holiday hours, and keep them current.",
        "Upload at least 10 high-quality photos (exterior, interior, team, products).",
        "Request reviews from happy customers and reply to every review, positive or negative.",
        "Post weekly Updates/Offers to keep the profile active and signal freshness.",
        "Fill in the services/products list and a keyword-rich business description.",
        "Add your service area or storefront pin precisely if you serve specific locations.",
        "Enable messaging and the Q&A section, and seed common questions with answers.",
    ]
