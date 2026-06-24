from __future__ import annotations

import re
from typing import List

from ...schemas import Category, CheckResult, Mode, SeoPage, Severity, Status


def _describe_from_src(src: str) -> str:
    src = (src or "").strip()
    if not src:
        return "[placeholder: describe image]"
    # take last path segment, drop query/fragment and extension
    tail = re.split(r"[?#]", src)[0]
    tail = tail.rstrip("/").split("/")[-1]
    tail = re.sub(r"\.[a-zA-Z0-9]{1,5}$", "", tail)
    tail = re.sub(r"[-_]+", " ", tail).strip()
    if not tail:
        return "[placeholder: describe image]"
    return "[placeholder: describe image of %s]" % tail


def run(page: SeoPage, mode: Mode) -> list:
    results = []  # type: List[CheckResult]
    is_pixie = (mode == Mode.PIXIE)

    if not page.images:
        results.append(CheckResult(
            id="images.alt.none",
            category=Category.IMAGES,
            title="Image alt text",
            description="The page has no images.",
            severity=Severity.INFO,
            status=Status.NOT_APPLICABLE,
            weight=6,
            passed=False,
            recommendation="",
            evidence={"image_count": 0},
        ))
        return results

    missing_alt = []   # missing key or alt is None
    empty_alt = []     # present but empty/whitespace
    for img in page.images:
        src = img.get("src", "") if isinstance(img, dict) else ""
        has_key = isinstance(img, dict) and ("alt" in img)
        alt = img.get("alt") if isinstance(img, dict) else None
        if (not has_key) or alt is None:
            missing_alt.append(src)
        elif isinstance(alt, str) and not alt.strip():
            empty_alt.append(src)

    total = len(page.images)

    if missing_alt:
        c = CheckResult(
            id="images.alt.missing",
            category=Category.IMAGES,
            title="Image alt text",
            description="One or more images have no alt attribute.",
            severity=Severity.MEDIUM,
            status=Status.FAIL,
            weight=6,
            passed=False,
            recommendation="Add descriptive alt text to every image.",
            evidence={"missing": missing_alt, "count": len(missing_alt), "total": total},
        )
        if is_pixie:
            c.fix = {"alt_suggestions": {s: _describe_from_src(s) for s in missing_alt}}
        results.append(c)

    if empty_alt:
        c = CheckResult(
            id="images.alt.empty",
            category=Category.IMAGES,
            title="Image alt text",
            description="One or more images have empty alt text.",
            severity=Severity.LOW,
            status=Status.WARN,
            weight=6,
            passed=False,
            recommendation="Replace empty alt text with a meaningful description (or keep empty only for decorative images).",
            evidence={"empty": empty_alt, "count": len(empty_alt), "total": total},
        )
        if is_pixie:
            c.fix = {"alt_suggestions": {s: _describe_from_src(s) for s in empty_alt}}
        results.append(c)

    if not missing_alt and not empty_alt:
        results.append(CheckResult(
            id="images.alt.ok",
            category=Category.IMAGES,
            title="Image alt text",
            description="All images have non-empty alt text.",
            severity=Severity.INFO,
            status=Status.PASS,
            weight=6,
            passed=True,
            recommendation="",
            evidence={"total": total},
        ))

    return results
