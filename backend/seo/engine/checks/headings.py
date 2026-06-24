from __future__ import annotations

from typing import List

from ...schemas import Category, CheckResult, Mode, SeoPage, Severity, Status


def run(page: SeoPage, mode: Mode) -> list:
    results = []  # type: List[CheckResult]

    levels = []
    for h in page.headings:
        try:
            lvl = int(h.get("level"))
        except (TypeError, ValueError, AttributeError):
            continue
        if lvl >= 1:
            levels.append(lvl)

    h1_count = sum(1 for l in levels if l == 1)

    # --- exactly one H1 ---
    if h1_count == 0:
        results.append(CheckResult(
            id="headings.h1.missing",
            category=Category.HEADINGS,
            title="H1 heading",
            description="The page has no H1 heading.",
            severity=Severity.HIGH,
            status=Status.FAIL,
            weight=8,
            passed=False,
            recommendation="Add exactly one H1 heading describing the page topic.",
            evidence={"h1_count": 0},
        ))
    elif h1_count > 1:
        results.append(CheckResult(
            id="headings.h1.multiple",
            category=Category.HEADINGS,
            title="H1 heading",
            description="The page has more than one H1 heading.",
            severity=Severity.MEDIUM,
            status=Status.FAIL,
            weight=8,
            passed=False,
            recommendation="Use exactly one H1 heading per page.",
            evidence={"h1_count": h1_count},
        ))
    else:
        results.append(CheckResult(
            id="headings.h1.ok",
            category=Category.HEADINGS,
            title="H1 heading",
            description="The page has exactly one H1 heading.",
            severity=Severity.INFO,
            status=Status.PASS,
            weight=8,
            passed=True,
            recommendation="",
            evidence={"h1_count": 1},
        ))

    # --- no skipped levels ---
    skips = []
    prev = None
    for lvl in levels:
        if prev is not None and lvl > prev + 1:
            skips.append({"from": prev, "to": lvl})
        prev = lvl

    if skips:
        results.append(CheckResult(
            id="headings.skipped_levels",
            category=Category.HEADINGS,
            title="Heading hierarchy",
            description="One or more heading levels are skipped.",
            severity=Severity.MEDIUM,
            status=Status.WARN,
            weight=4,
            passed=False,
            recommendation="Do not skip heading levels (e.g. H2 followed by H4).",
            evidence={"skips": skips},
        ))
    else:
        results.append(CheckResult(
            id="headings.hierarchy.ok",
            category=Category.HEADINGS,
            title="Heading hierarchy",
            description="Heading levels are not skipped.",
            severity=Severity.INFO,
            status=Status.PASS,
            weight=4,
            passed=True,
            recommendation="",
            evidence={},
        ))

    return results
